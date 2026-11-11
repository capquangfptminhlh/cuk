/**
 * Read-only public HTTPS audit for every verified cuktech.vn WebP file.
 * This independently checks HTTP status, exact RIFF/WEBP bytes and image
 * metadata through Sharp rather than relying on a loaded <img> element.
 * Low concurrency and one bounded recheck distinguish flaky transport from
 * permanently broken assets. Never bypass HTTP 403 / 429.
 */
import sharp from 'sharp'
import {mkdir,writeFile} from 'node:fs/promises'

const ROOT='https://cuktech.vn/'
const wait=ms=>new Promise(done=>setTimeout(done,ms))
const report={url:ROOT,productCount:0,totalReferences:0,uniqueImages:0,initialFailures:0,
 retryRecovered:0,persistentFailures:0,bytes:0,failures:[],statusHistogram:{}}
const catalog=await fetch(new URL('catalog.snapshot.json',ROOT),{cache:'no-store',signal:AbortSignal.timeout(30000)}).then(r=>{
 if(!r.ok)throw Error('Catalog HTTP '+r.status)
 return r.json()
})
if(catalog.verified!==true||catalog.products.length!==catalog.sourceCount)throw Error('Catalog not verified')
report.productCount=catalog.products.length
const byPath=new Map()
for(const p of catalog.products){
 const gallery=JSON.parse(p.source_images||'[]')
 report.totalReferences+=gallery.length
 for(const image of gallery){
  if(!/^media\/products\/[a-f0-9]{32}\.webp$/i.test(image))throw Error('Unsafe or external gallery URL '+image)
  if(!byPath.has(image))byPath.set(image,[])
  byPath.get(image).push({slug:p.slug,name:p.name})
 }
}
report.uniqueImages=byPath.size
async function verify(image){
 const url=new URL(image,ROOT)
 try{
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)})
  report.statusHistogram[response.status]=(report.statusHistogram[response.status]||0)+1
  if(!response.ok)return {image,error:'HTTP '+response.status,status:response.status}
  const mime=response.headers.get('content-type')||''
  const bytes=Buffer.from(await response.arrayBuffer())
  const signature=bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP'
  if(!mime.startsWith('image/')||!signature)return {image,error:'Invalid MIME/signature',status:response.status,mime,bytes:bytes.length}
  const meta=await sharp(bytes,{failOn:'error'}).metadata()
  if(meta.format!=='webp'||meta.width<=0||meta.height<=0)
   return {image,error:'Invalid WebP dimensions',format:meta.format,w:meta.width,h:meta.height}
  return {image,ok:true,bytes:bytes.length}
 }catch(e){return {image,error:e.message}}
}
async function pass(images,concurrency){
 let cursor=0
 const results=[]
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<images.length){
   const next=images[cursor++]
   const result=await verify(next)
   results.push(result)
   await wait(65)
  }
 }))
 return results
}
const initial=await pass([...byPath.keys()],4)
report.bytes=initial.filter(p=>p.ok).reduce((sum,p)=>sum+p.bytes,0)
const failed=initial.filter(p=>!p.ok)
report.initialFailures=failed.length
let remaining=failed
if(failed.length){
 await wait(1500)
 const recovered=await pass(failed.map(x=>x.image),1)
 report.retryRecovered=recovered.filter(x=>x.ok).length
 remaining=recovered.filter(x=>!x.ok)
}
report.persistentFailures=remaining.length
report.failures=remaining.map(x=>({...x,products:byPath.get(x.image)})).slice(0,30)
await mkdir('qa-screenshots',{recursive:true})
await writeFile('qa-screenshots/media-origin-audit.json',JSON.stringify(report,null,2))
console.log('CUKTECH HTTPS WEBP AUDIT:',JSON.stringify(report))
if(report.persistentFailures>0)process.exitCode=1
