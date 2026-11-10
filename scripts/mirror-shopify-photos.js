/**
 * Build real first-party product photos from the verified, publicly accessible
 * cuktech.com Shopify catalog. Never use a fake device as a substitute.
 *
 * Public-source requests are ordinary HTTPS fetches, scoped to cuktech.com and
 * Shopify's CDN. Stop on source access denial; do not bypass 403/429 controls.
 * All successful files are checked and converted to compact WebP.
 */
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,stat,copyFile} from 'node:fs/promises'
import {resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'

export function allowedCatalogImage(input) {
 if(typeof input!=='string'||!input.trim())return false
 try {
  const url=new URL(input)
  return url.protocol==='https:' &&
   ['cdn.shopify.com','cuktech.com','www.cuktech.com'].includes(url.hostname.toLowerCase()) &&
   /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)
 }catch{return false}
}
export function localImagePath(input) {
 if(!allowedCatalogImage(input))throw new Error('Untrusted product image URL')
 return 'media/products/'+createHash('sha256').update(input).digest('hex').slice(0,32)+'.webp'
}
const wait=ms=>new Promise(done=>setTimeout(done,ms))
async function imageFetch(src,fetchImpl) {
 const response=await fetchImpl(src,{
  headers:{
   Accept:'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
   'User-Agent':'CUKTECHVN-PublicCatalog/1.0 (+https://cuktech.vn)'
  },
  redirect:'follow',signal:AbortSignal.timeout(24000)
 })
 if(response.status===403||response.status===429)
  throw new Error('SOURCE_IMAGE_ACCESS_DENIED: HTTP '+response.status)
 if(!response.ok)throw new Error('Image download HTTP '+response.status)
 const final=new URL(response.url||src)
 if(!allowedCatalogImage(final.href))throw new Error('Product image redirected to untrusted location')
 const kind=(response.headers.get('content-type')||'').toLowerCase()
 if(!kind.startsWith('image/'))throw new Error('Product image content type is not an image: '+kind)
 const raw=Buffer.from(await response.arrayBuffer())
 if(raw.length<80||raw.length>24*1024*1024)throw new Error('Unexpected image byte size '+raw.length)
 return await sharp(raw,{limitInputPixels:55_000_000})
  .rotate().resize({width:1300,height:4800,fit:'inside',withoutEnlargement:true})
  .webp({quality:80,effort:4}).toBuffer()
}
/**
 * @returns audit proof including which source image URLs converted.
 * On partial image failures, every product still retains its original source URL
 * for traceability, but publishes only independently validated local images.
 */
export async function mirrorShopifyCatalog({
 inputPath='public/catalog.snapshot.json',
 outputDir='public',
 cacheDir='.image-cache/shopify',
 fetchImpl=fetch,
 concurrency=5,
 delay=wait,
 requireAllCovers=true
}={}) {
 const input=JSON.parse(await readFile(resolve(inputPath),'utf8'))
 if(input.verified!==true||!Array.isArray(input.products)||!input.products.length||
    input.sourceCount!==input.products.length)
  throw new Error('Refuse photo export: source catalog not verified')
 const sourceImagesByProduct=new Map()
 const sourceUrls=new Set()
 for(const product of input.products){
  let gallery
  try {gallery=JSON.parse(product.source_images||'[]')}catch{throw new Error('Invalid product gallery: '+product.slug)}
  if(!Array.isArray(gallery))throw new Error('Invalid product gallery array')
  const urls=[...new Set([product.image_url,...gallery].filter(allowedCatalogImage))]
  if(!urls.length)throw new Error('Product has no valid original source image: '+product.slug)
  sourceImagesByProduct.set(product.id,urls)
  for(const src of urls)sourceUrls.add(src)
 }
 await mkdir(resolve(cacheDir),{recursive:true})
 const media=new Map(),failures=[]
 let cursor=0,bytes=0
 const all=[...sourceUrls]
 const denied={count:0}
 async function copyOne(source){
  const relative=localImagePath(source)
  const cacheFile=resolve(cacheDir,basename(relative))
  const outputFile=resolve(outputDir,relative)
  let size=0
  try{size=(await stat(cacheFile)).size}catch{/* no cache */}
  if(!size){
   let converted
   for(let attempt=0;attempt<2;attempt++){
    try {converted=await imageFetch(source,fetchImpl);break}
    catch(e) {
     if(String(e.message).includes('SOURCE_IMAGE_ACCESS_DENIED')){
      denied.count++
      throw e
     }
     if(attempt===1)throw e
     await delay(300)
    }
   }
   await writeFile(cacheFile,converted)
   size=converted.length
  }
  await mkdir(dirname(outputFile),{recursive:true})
  await copyFile(cacheFile,outputFile)
  media.set(source,relative)
  bytes+=size
 }
 async function work(){
  while(cursor<all.length && !denied.count){
   const url=all[cursor++]
   try {
    await copyOne(url)
   }catch(e) {
    failures.push({url,reason:String(e.message).slice(0,140)})
   }
   await delay(125)
  }
 }
 await Promise.all(Array.from({length:Math.max(1,Math.min(8,concurrency))},work))
 if(denied.count)throw new Error('Photo host denied downloads; no bypass attempted. '+failures[0]?.reason)
 let withLocalCover=0
 for(const product of input.products) {
  const originals=sourceImagesByProduct.get(product.id)
  const local=originals.map(src=>media.get(src)).filter(Boolean)
  product.original_image_url=product.image_url
  product.original_source_images=product.source_images
  product.image_url=local[0]||''
  product.source_images=JSON.stringify(local)
  product.media_delivery=local.length?'first-party-verified-webp':'source-photo-unavailable'
  product.media_verified=Boolean(local.length)
  if(local.length)withLocalCover++
 }
 const audit={
  sourceCount:input.sourceCount,
  coveredProducts:withLocalCover,
  requestedImages:all.length,
  cachedImages:media.size,
  failedImages:failures.length,
  optimizedBytes:bytes,
  source:'cuktech.com public Shopify media',
  failures:failures.slice(0,25),
  generatedAt:new Date().toISOString()
 }
 if(requireAllCovers&&withLocalCover!==input.products.length)
  throw new Error('Refusing to deploy broken photos: only '+withLocalCover+' / '+input.products.length+' products have verified local cover images')
 input.mediaAudit=audit
 input.productsWithImages=withLocalCover
 input.totalImages=input.products.reduce((n,p)=>n+JSON.parse(p.source_images).length,0)
 await writeFile(resolve(inputPath),JSON.stringify(input,null,2)+'\n')
 console.log('VERIFIED FIRST-PARTY SHOPIFY PHOTOS:',audit.coveredProducts+'/'+audit.sourceCount+' product covers;',
  audit.cachedImages+'/'+audit.requestedImages+' unique WebP files;',
  Math.round(audit.optimizedBytes/1024/1024)+' MB; failures:',audit.failedImages)
 return audit
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 mirrorShopifyCatalog().catch(e=>{console.error('SHOPIFY PHOTO MIRROR FAILED:',e.message);process.exitCode=1})
}
