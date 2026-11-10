/**
 * Optional first-party static image cache for authorized manufacturer media.
 * Takes the verified China catalog JSON and produces normalized WebP files
 * under public/media/cn/, so browsers don't depend on cross-site hotlinking.
 * Never cache from arbitrary URLs; only https://www.cuktech.com.cn/uploads/image/.
 */
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import sharp from 'sharp'

export function mediaSourceAllowed(src) {
 try {
  const u=new URL(src)
  return u.protocol==='https:'&&u.hostname==='www.cuktech.com.cn'&&
    u.pathname.startsWith('/uploads/image/')&&/\.(?:webp|png|jpe?g|avif)$/i.test(u.pathname)
 }catch{return false}
}
export function mediaPath(src) {
 if(!mediaSourceAllowed(src))throw new Error('Untrusted manufacturer image URL')
 const hash=createHash('sha256').update(src).digest('hex').slice(0,32)
 return 'media/cn/'+hash+'.webp'
}
const sleep=t=>new Promise(r=>setTimeout(r,t))
export async function cacheChinaMedia({
 inputPath='public/catalog.china.json',outputDir='public',
 cacheDir='.image-cache/cn',fetchImpl=fetch,
 concurrency=6,strict=true
}={}){
 const original=JSON.parse(await readFile(resolve(inputPath),'utf8'))
 if(original.discovered<40||original.products?.length!==original.discovered)throw Error('Incomplete China source catalog; refuse image cache')
 const sourceUrls=[...new Set(original.products.flatMap(p=>{
  let images=[]
  try{images=JSON.parse(p.source_images||'[]')}catch{throw Error('Invalid photo list for '+p.slug)}
  return [p.image_url,...images].filter(mediaSourceAllowed)
 }))]
 if(!sourceUrls.length)throw Error('No authorized manufacturer image URLs')
 await mkdir(resolve(cacheDir),{recursive:true})
 const failures=[],cached=new Map()
 let next=0,bytesTotal=0
 async function job(){
  while(next<sourceUrls.length){
   const src=sourceUrls[next++],asset=mediaPath(src)
   const cache=resolve(cacheDir,asset.split('/').at(-1)),publicFile=resolve(outputDir,asset)
   try{
    let size
    try {size=(await stat(cache)).size}catch{size=0}
    if(!size){
     let response
     for(let attempt=0;attempt<2;attempt++){
      await sleep(100)
      try{
       response=await fetchImpl(src,{
        headers:{'User-Agent':'CUKTECHVN-CatalogPreview/1.0 (+https://cuktech.vn)',Accept:'image/webp,image/*;q=0.9'},
        signal:AbortSignal.timeout(25000),redirect:'follow'
       })
       if(response.status===403||response.status===429)throw new Error('Source denied image access: HTTP '+response.status)
       if(response.ok)break
       if(response.status<500||attempt===1)throw new Error('HTTP '+response.status)
      }catch(e){if(attempt===1||/denied image access/.test(String(e.message)))throw e}
     }
     if(!response?.ok)throw Error('Empty manufacturer response')
     const final=new URL(response.url||src)
     if(final.hostname!=='www.cuktech.com.cn')throw Error('Source image redirected off manufacturer')
     const type=response.headers.get('content-type')||''
     if(!type.startsWith('image/'))throw Error('Not an image: '+type)
     const raw=Buffer.from(await response.arrayBuffer())
     if(raw.length>16*1024*1024||raw.length<80)throw Error('Invalid image size')
     const transformed=await sharp(raw,{limitInputPixels:50_000_000})
       .rotate().resize({width:1200,height:9000,fit:'inside',withoutEnlargement:true})
       .webp({quality:76,effort:4}).toBuffer()
     await writeFile(cache,transformed)
     size=transformed.length
    }
    await mkdir(dirname(publicFile),{recursive:true})
    await copyFile(cache,publicFile)
    bytesTotal+=size
    cached.set(src,asset)
   }catch(e){failures.push({url:src,error:String(e.message).slice(0,130)})}
  }
 }
 await Promise.all(Array.from({length:Math.max(1,Math.min(10,concurrency))},job))
 if(strict&&failures.length)throw new Error('China image cache incomplete: '+failures.length+'/'+sourceUrls.length+' failures. First: '+failures[0].error)
 for(const p of original.products){
  const images=JSON.parse(p.source_images||'[]')
  p.image_url=cached.get(p.image_url)||p.image_url||''
  p.source_images=JSON.stringify(images.map(src=>cached.get(src)||src))
 }
 original.mediaDelivery='optimized-first-party-webp'
 original.cachedImages=cached.size
 original.cacheFailures=failures.length
 original.cacheBytes=bytesTotal
 await writeFile(resolve(inputPath),JSON.stringify(original,null,2)+'\n')
 return {records:original.products.length,sourceImages:sourceUrls.length,cached:cached.size,failed:failures.length,bytes:bytesTotal,failures}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 cacheChinaMedia().then(x=>console.log('CACHED CHINA MEDIA',x.cached,'/',x.sourceImages,'images;',Math.round(x.bytes/1e6),'MB',x.failed,'failed'))
 .catch(e=>{console.error('CHINA MEDIA CACHE FAILED:',e.message);process.exitCode=1})
}
