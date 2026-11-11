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
async function checkProductPage(){
 const page=await browser.newPage({viewport:{width:1365,height:900}})
 page.on('pageerror',e=>issues.push({label:'pageerror shop',message:e.message}))
 try{
  await page.goto(SITE+'/shop',{waitUntil:'domcontentloaded',timeout:50000})
  await awaitRealImage(page,'.product-card .catalog-photo','shop product card')
  const href=await page.locator('.product-card a.product-visual').first().getAttribute('href')
  if(!href)throw Error('Product card missing product-detail URL')
  await page.goto(new URL(href,SITE).href,{waitUntil:'domcontentloaded',timeout:50000})
  await awaitRealImage(page,'.product-photo img.detail-real-photo','product detail primary photo')
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
