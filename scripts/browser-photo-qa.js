/**
 * Run inside GitHub Actions after the Pages deployment.
 * Checks images in an actual Chromium browser, rather than assuming that
 * valid WebP bytes mean the React UI displays them correctly.
 */
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'

const SITE=process.env.CUKTECH_SITE_URL||'https://cuktech.vn'
const DIR='qa-screenshots'
const issues=[]
await mkdir(DIR,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})

async function awaitRealImage(page,selector,label,{scroll=true}={}){
 const loc=page.locator(selector).first()
 await loc.waitFor({state:'visible',timeout:25000})
 if(scroll)await loc.scrollIntoViewIfNeeded()
 try {
  await page.waitForFunction(sel=>{
   const im=document.querySelector(sel)
   return !!im&&im.complete&&im.naturalWidth>0&&im.naturalHeight>0
  },selector,{timeout:18000})
 }catch(err){
  const d=await loc.evaluate(img=>({
   src:img.currentSrc||img.src,complete:img.complete,
   width:img.naturalWidth,height:img.naturalHeight,
   box:img.getBoundingClientRect().toJSON()
  })).catch(e=>({error:String(e)}))
  issues.push({label,message:'Image not loaded or not visible',details:d})
  return
 }
 const d=await loc.evaluate(img=>({src:img.currentSrc||img.src,loaded:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}))
 if(!new URL(d.src).pathname.includes('/media/products/'))issues.push({label,message:'Expected first-party WebP product photo',details:d})
 console.log('BROWSER PHOTO PASS:',label,d.naturalWidth+'x'+d.naturalHeight,d.src)
}
async function checkHome({width,height,tag}){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1})
 page.on('pageerror',e=>issues.push({label:'pageerror '+tag,message:e.message}))
 try{
  await page.goto(SITE+'/',{waitUntil:'domcontentloaded',timeout:50000})
  await awaitRealImage(page,'.home-real-photo-hero img.home-real-img','homepage hero '+tag)
  await awaitRealImage(page,'.split-source-photo img.home-real-img','secondary hero '+tag)
  await awaitRealImage(page,'.home-category-real img.home-real-img','category tile '+tag)
  await page.screenshot({path:DIR+'/cuktech-home-'+tag+'.png',fullPage:true})
 }finally{await page.close()}
}
async function verifyVisibleImage(page,locator,label,{expectLocal=true}={}) {
 try {
  await locator.scrollIntoViewIfNeeded({timeout:15000})
  await locator.evaluate(el=>{el.loading='eager'})
  await locator.evaluate(async img=>{
   if(img.complete&&img.naturalWidth>0)return
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Image did not load within 15s')),15000)
    const onDone=()=>{clearTimeout(timer);resolve()}
    img.addEventListener('load',onDone,{once:true})
    img.addEventListener('error',onDone,{once:true})
   })
  },{timeout:20000})
  const status=await locator.evaluate(img=>({src:img.currentSrc||img.src,complete:img.complete,
   naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,visible:img.getBoundingClientRect().width>0}))
  if(!status.complete||status.naturalWidth<=0||status.naturalHeight<=0||!status.visible)
   issues.push({label,message:'Broken or invisible photo after scrolling into view',details:status})
  else if(expectLocal&&!new URL(status.src).pathname.startsWith('/media/products/'))
   issues.push({label,message:'External photo where verified local media was expected',details:status})
  return status
 }catch(e){issues.push({label,message:'Photo validation failed: '+e.message});return null}
}
async function checkProductPage(){
 const page=await browser.newPage({viewport:{width:1365,height:900}})
 page.on('pageerror',e=>issues.push({label:'pageerror shop',message:e.message}))
 try{
  await page.goto(SITE+'/shop',{waitUntil:'domcontentloaded',timeout:50000})
  await page.locator('.product-card .catalog-photo').first().waitFor({state:'visible',timeout:30000})
  const all=page.locator('.product-card .catalog-photo')
  const covers=await all.count()
  if(covers!==40)issues.push({label:'all product covers',message:'Expected 40 source products, found '+covers})
  for(let i=0;i<covers;i++){
   await verifyVisibleImage(page,all.nth(i),'shop product cover '+(i+1))
  }
  console.log('SHOP COVERS QA:',covers,'source product photos scrolled into view')
  await page.screenshot({path:DIR+'/cuktech-shop-desktop.png',fullPage:true})
  const href=await page.locator('.product-card a.product-visual').first().getAttribute('href')
  if(!href)throw Error('Product card missing product-detail URL')
  const catalog=await page.evaluate(async()=>{
   const response=await fetch('/catalog.snapshot.json',{cache:'no-store'})
   if(!response.ok)throw Error('Catalog JSON HTTP '+response.status)
   return response.json()
  })
  const slug=href.split('/product/')[1]?.split(/[?#]/)[0]
  const entry=catalog.products.find(p=>p.slug===decodeURIComponent(slug))
  if(!entry)throw Error('Cannot find product from shop in verified source catalog')
  const galleryExpected=JSON.parse(entry.source_images||'[]').length
  await page.goto(new URL(href,SITE).href,{waitUntil:'domcontentloaded',timeout:50000})
  await awaitRealImage(page,'.product-photo img.detail-real-photo','product detail primary photo')
  const thumbs=page.locator('.gallery-thumbs img')
  const thumbCount=await thumbs.count()
  if(thumbCount!==galleryExpected){
   issues.push({label:'product gallery',message:'Repeated/missing gallery photos: expected '+galleryExpected+', found '+thumbCount})
  }
  for(let i=0;i<thumbCount;i++){
   await verifyVisibleImage(page,thumbs.nth(i),'detail thumbnail '+(i+1))
  }
  const full=page.locator('.full-gallery summary')
  if(galleryExpected>1){
   if(!await full.count()){
    issues.push({label:'product full gallery',message:'Expected expandable product gallery'})
   }else{
    await full.click()
    const gallery=page.locator('.full-gallery-images img')
    const n=await gallery.count()
    if(n!==galleryExpected)issues.push({label:'full gallery',message:'Expected '+galleryExpected+' photos, found '+n})
    for(let i=0;i<n;i++){
     await verifyVisibleImage(page,gallery.nth(i),'full gallery photo '+(i+1))
    }
   }
  }
  console.log('PRODUCT GALLERY QA:',galleryExpected,'original product photos, no duplicated CDN URLs')
  await page.screenshot({path:DIR+'/cuktech-detail.png',fullPage:true})
 }finally{await page.close()}
}

try{
 await checkHome({width:1365,height:900,tag:'desktop'})
 await checkHome({width:390,height:844,tag:'mobile'})
 await checkProductPage()
 console.log('CUKTECH BROWSER PHOTO QA',issues.length?'FAILED':'PASS',JSON.stringify(issues))
 await writeFile(DIR+'/result.json',JSON.stringify({site:SITE,issues,passed:issues.length===0},null,2))
 if(issues.length)process.exitCode=1
}catch(e){
 issues.push({label:'fatal',message:e.message})
 console.error('CUKTECH BROWSER QA FAILED:',e.stack)
 await writeFile(DIR+'/result.json',JSON.stringify({site:SITE,issues,passed:false},null,2))
 process.exitCode=1
}finally{
 await browser.close()
}
