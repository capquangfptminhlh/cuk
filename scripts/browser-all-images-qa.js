/**
 * Exhaustive *live* photo regression: open all 40 product detail pages in a
 * real Chromium browser and decode every image in the Shopify-backed public
 * catalog. Only first-party WebP assets may appear in a mirrored gallery.
 *
 * Unlike a build-time files-exist assertion, this checks the CDN actually
 * serves decodable pictures and verifies the rendered React gallery for all
 * products, not just one sample.
 */
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'

const BASE=new URL(process.env.CUKTECH_SITE_URL||'https://cuktech.vn/')
const OUT='qa-screenshots'
const issues=[]
const report={site:BASE.href,sourceProducts:0,uniqueImages:0,decodedImages:0,
  checkedProductPages:0,checkedThumbnails:0,mobileProducts:0,
  firstPassDecodeFailures:0,retriesRecovered:0,issues}
const add=(kind,data)=>issues.push({kind,...data})
const distinct=a=>[...new Set(a)]
const localPattern=/^media\/products\/[a-f0-9]{32}\.webp$/
await mkdir(OUT,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const context=await browser.newContext({viewport:{width:1365,height:900},deviceScaleFactor:1})

async function getCatalog(){
 const page=await context.newPage()
 try{
  const url=new URL('catalog.snapshot.json',BASE)
  const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:50000})
  if(!response?.ok())throw Error('Catalog not available: '+response?.status())
  const data=JSON.parse(await response.text())
  if(data?.verified!==true||data.products?.length!==data.sourceCount)
   throw Error('Catalog failed completeness validation')
  if(data.mediaAudit?.coveredProducts!==data.sourceCount)
   throw Error('Missing image covers in media audit')
  return data
 }finally{await page.close()}
}
async function openDetails(page,product,device='desktop'){
 const url=new URL('product/'+encodeURIComponent(product.slug),BASE)
 try {
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000})
  const heading=page.locator('.product-details h1')
  await heading.waitFor({state:'visible',timeout:18000})
  const name=await heading.innerText()
  if(name.trim()!==product.name.trim())
   add('product-name-mismatch',{slug:product.slug,expected:product.name,actual:name})
  const expected=JSON.parse(product.source_images||'[]')
  if(!expected.length)add('no-source-gallery',{slug:product.slug})
  const main=page.locator('.product-photo img.detail-real-photo')
  await main.waitFor({state:'visible',timeout:18000})
  const mainData=await main.evaluate(async img=>{
   img.loading='eager'
   try{await Promise.race([img.decode(),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),16000))])}
   catch(e){return {ok:false,error:String(e),src:img.currentSrc||img.src}}
   const rect=img.getBoundingClientRect()
   return {ok:img.naturalWidth>0&&img.naturalHeight>0&&rect.width>0&&rect.height>0,
    width:img.naturalWidth,height:img.naturalHeight,src:img.currentSrc||img.src}
  })
  if(!mainData.ok)add('product-main-photo-failed',{slug:product.slug,device,details:mainData})
  else if(new URL(mainData.src).pathname!=='/'+expected[0])
   add('wrong-primary-photo',{slug:product.slug,expected:expected[0],actual:mainData.src})

  const thumbnails=page.locator('.gallery-thumbs img')
  const seen=await thumbnails.evaluateAll(imgs=>imgs.map(img=>({
   url:new URL(img.getAttribute('src')||'',document.baseURI).pathname,
   hidden:getComputedStyle(img.closest('button')).display==='none'
  })))
  report.checkedThumbnails+=seen.length
  if(seen.length!==expected.length)
   add('gallery-count',{slug:product.slug,device,expected:expected.length,actual:seen.length})
  if(distinct(seen.map(x=>x.url)).length!==seen.length)
   add('duplicated-thumbnails',{slug:product.slug,device})
  for(let i=0;i<Math.min(expected.length,seen.length);i++){
   if(seen[i].url!=='/'+expected[i])
    add('thumbnail-wrong-photo',{slug:product.slug,device,index:i,expected:expected[i],actual:seen[i].url})
   if(seen[i].hidden)add('thumbnail-hidden',{slug:product.slug,device,index:i})
  }
  const expanded=page.locator('.full-gallery-images img')
  const full=await expanded.evaluateAll(imgs=>imgs.map(img=>new URL(img.getAttribute('src')||'',document.baseURI).pathname))
  if(expected.length>1 && full.length!==expected.length)
   add('full-gallery-count',{slug:product.slug,device,expected:expected.length,actual:full.length})
  if(distinct(full).length!==full.length)
   add('duplicated-full-gallery',{slug:product.slug,device})
  if(device==='mobile')report.mobileProducts++
  else report.checkedProductPages++
 }catch(err){add('product-page-error',{slug:product.slug,device,error:err.message})}
}

async function decodeAllAssets(products){
 const urlList=distinct(products.flatMap(p=>JSON.parse(p.source_images||'[]')))
 report.uniqueImages=urlList.length
 const page=await context.newPage()
 try{
  await page.goto(BASE.href,{waitUntil:'domcontentloaded',timeout:50000})
  // Executed in the real browser: checks each photo's actual decode after
  // loading it, rather than confusing offscreen loading=lazy with failures.
  const result=await page.evaluate(async urls=>{
   let index=0,success=0,firstPassFailures=0,recovered=0
   const bad=[]
   async function decode(relative,attempt){
    const url=new URL(relative,document.baseURI)
    if(attempt)url.searchParams.set('cuktech_photo_retry',String(attempt))
    const img=new Image()
    img.decoding='async'
    img.src=url.href
    try{
     await Promise.race([
      img.decode(),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('image decode timeout')),18000))
     ])
     if(img.naturalWidth<=0||img.naturalHeight<=0)throw Error('zero image dimensions')
     return true
    }finally{img.src=''}
   }
   async function worker(){
    while(index<urls.length){
     const relative=urls[index++]
     try{
      await decode(relative,0)
      success++
     }catch(e){
      firstPassFailures++
      // A transient browser/network failure must be tried again using
      // the same real source photo, at a modest request rate.
      await new Promise(resolve=>setTimeout(resolve,160))
      try{
       await decode(relative,1)
       success++
       recovered++
      }catch(error){bad.push({path:relative,message:String(error.message)})}
     }
    }
   }
   // Do not artificially pressure mobile-class decoders with 8 full-resolution
   // images at once. On a real shop, photos are lazy-loaded as users scroll.
   await Promise.all(Array.from({length:2},worker))
   return {success,bad,firstPassFailures,recovered}
  },urlList)
  report.decodedImages=result.success
  report.firstPassDecodeFailures=result.firstPassFailures
  report.retriesRecovered=result.recovered
  result.bad.forEach(x=>add('undecodable-public-webp',x))
 }catch(e){add('bulk-image-decode-error',{message:e.message})}
 finally{await page.close()}
}
try{
 const catalog=await getCatalog()
 report.sourceProducts=catalog.products.length
 if(catalog.products.length!==40)add('unexpected-source-count',{expected:40,actual:catalog.products.length})
 for(const p of catalog.products){
  const list=JSON.parse(p.source_images||'[]')
  if(!list.length)add('missing-album',{slug:p.slug})
  if(list.some(src=>!localPattern.test(src)))add('external-or-unsafe-gallery',{slug:p.slug})
  if(distinct(list).length!==list.length)add('duplicated-source-gallery',{slug:p.slug})
  if(p.image_url!==list[0])add('wrong-cover-reference',{slug:p.slug})
 }
 await decodeAllAssets(catalog.products)
 let cursor=0
 const work=async()=>{
  const page=await context.newPage()
  page.on('pageerror',err=>add('react-page-error',{message:err.message}))
  try {
   while(cursor<catalog.products.length)await openDetails(page,catalog.products[cursor++])
  }finally{await page.close()}
 }
 await Promise.all(Array.from({length:3},work))
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true})
 const page=await mobile.newPage()
 try{
  for(const category of ['powerbank','charger','cable']){
   const p=catalog.products.find(x=>x.category===category)
   if(p)await openDetails(page,p,'mobile')
  }
 }finally{await mobile.close()}
 console.log('CUKTECH EXHAUSTIVE LIVE PHOTO QA',issues.length?'FAIL':'PASS',
  JSON.stringify({sourceProducts:report.sourceProducts,uniqueImages:report.uniqueImages,
   decodedImages:report.decodedImages,checkedProductPages:report.checkedProductPages,
   checkedThumbnails:report.checkedThumbnails,mobileProducts:report.mobileProducts,
   issueCount:issues.length,examples:issues.slice(0,15)}))
}catch(e){add('fatal',{message:e.message,stack:e.stack})}
finally{
 report.passed=issues.length===0
 await writeFile(OUT+'/all-product-photos.json',JSON.stringify(report,null,2))
 await browser.close()
}
if(issues.length)process.exitCode=1
