/**
 * Reconcile manufacturer China product SKUs with the official international
 * cuktech.com Shopify feed. Copies image references ONLY for an exact, unique
 * manufacturer model identifier (never fuzzy title/image similarity).
 */
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export const MODEL=/^[a-z]{1,5}\d{2,6}[a-z0-9]{0,6}$/i
function reliableGlobalImages(product) {
 let photos=[]
 try{photos=JSON.parse(product.source_images||'[]')}catch{return []}
 const list=[product.image_url,...(Array.isArray(photos)?photos:[])]
 const safe=new Set()
 for(const entry of list){
  if(typeof entry!=='string')continue
  try{
   const url=new URL(entry)
   if(url.protocol!=='https:'||!['cdn.shopify.com','cuktech.com','www.cuktech.com'].includes(url.hostname.toLowerCase()))continue
   if(!/\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname))continue
   safe.add(url.href)
  }catch{/* no untrusted image */}
 }
 return [...safe]
}
export function reconcileGlobalPhotos(globalProducts, chinaProducts){
 if(!Array.isArray(globalProducts)||!Array.isArray(chinaProducts))throw new Error('Catalog arrays required')
 const index=new Map()
 for(const item of globalProducts){
  const images=reliableGlobalImages(item)
  if(!images.length)continue
  for(const original of item.source_model_codes||[]){
   const model=String(original||'').toLowerCase()
   if(!MODEL.test(model))continue
   if(!index.has(model))index.set(model,[])
   index.get(model).push({product:item,images})
  }
 }
 const matches=[]
 const updated=chinaProducts.map(p=>{
  const matchId=String(p.id||'').toLowerCase().replace(/^china-/,'')
  if(!MODEL.test(matchId)||p.media_delivery==='optimized-first-party-webp')return p
  const refs=index.get(matchId)||[]
  // Never use a photo if two Shopify records claim the same SKU.
  if(refs.length!==1)return p
  const {product,images}=refs[0]
  if(product.category&&p.category&&product.category!==p.category)return p
  const saved=p.source_images||'[]'
  matches.push({
   china_model:matchId,china_title:p.source_original_title||p.name,
   international_product:product.name,international_url:product.source_site,
   photos:images.length,method:'unique-explicit-model-code'
  })
  return {...p,
   official_china_images:saved,
   image_url:images[0],source_images:JSON.stringify(images),
   media_delivery:'global-shopify-exact-model',
   media_verified:false,
   photo_match_method:'unique-explicit-model-code',
   photo_source_site:product.source_site
  }
 })
 return {products:updated,matches,matchedModels:matches.length,
  unmatchedModels:chinaProducts.length-matches.length}
}
export async function buildMatchedPhotoCatalog({
 globalFile='public/catalog.snapshot.json',
 chinaFile='public/catalog.china.json'
}={}){
 const [global,china]=await Promise.all([
  readFile(resolve(globalFile),'utf8').then(JSON.parse),
  readFile(resolve(chinaFile),'utf8').then(JSON.parse)
 ])
 if(!global.verified||!china.discovered||global.products.length!==global.sourceCount||china.products.length!==china.discovered){
  throw new Error('Both public catalogs must be complete before image reconciliation')
 }
 const data=reconcileGlobalPhotos(global.products,china.products)
 china.products=data.products
 china.internationalPhotoMatches=data.matchedModels
 china.internationalPhotoUnmatched=data.unmatchedModels
 china.internationalPhotoAudit=data.matches
 china.originalManufacturerImageCount=china.totalImages
 china.totalImages=china.products.reduce((n,p)=>{
  try{return n+JSON.parse(p.source_images||'[]').length}catch{return n}
 },0)
 await writeFile(resolve(chinaFile),JSON.stringify(china,null,2)+'\n')
 return data
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 buildMatchedPhotoCatalog().then(x=>{
  console.log('INTERNATIONAL CUKTECH PHOTO MATCH',x.matchedModels,'of',
    x.products.length,'China models matched by exact SKU; no inferred photos')
  for(const p of x.matches)console.log('PHOTO_MATCH',p.china_model,'<-',p.international_product,p.photos+' photos')
 }).catch(e=>{console.error('PHOTO MATCH FAILED:',e.message);process.exitCode=1})
}
