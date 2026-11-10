/**
 * Generate a factual, non-purchasable 100%-audited catalog for static GitHub Pages.
 * References source-hosted product images (does not download or rehost them).
 * Confirm appropriate manufacturer image-use rights before commercial promotion.
 * Fails closed rather than deploying an incomplete inventory snapshot.
 */
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {fetchCompleteCatalog} from '../worker/src/sync.js'
import {catalogIdentity} from '../worker/src/catalog-core.js'

const clean=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
/** Shopify sends image objects with src fields and sometimes protocol-relative URLs. */
export function sourceImages(product) {
 const candidates=[product?.image,...(Array.isArray(product?.images)?product.images:[]),
   ...(Array.isArray(product?.variants)?product.variants.map(v=>v?.featured_image):[])]
 const unique=new Set()
 for(const entry of candidates){
  const value=typeof entry==='string'?entry:entry?.src
  if(typeof value!=='string'||!value.trim())continue
  try{
   const u=new URL(value.trim(),'https://cuktech.com')
   if(u.protocol!=='https:' || !['cdn.shopify.com','cuktech.com','www.cuktech.com'].includes(u.hostname.toLowerCase()))continue
   if(!/\.(?:jpe?g|png|webp|avif)$/i.test(u.pathname))continue
   unique.add(u.href)
  }catch{/* ignore malformed source URL */}
 }
 return [...unique]
}
const CODE=/^[a-z]{1,5}\d{2,6}[a-z0-9]{0,6}$/i
/** Only explicit model identifiers, never guess a SKU from marketing wording.
 * Handles of the form p23-description are reliable; special/award variants
 * must not be treated as the ordinary base model.
 */
export function sourceModelCodes(product) {
 const found=new Set()
 const title=String(product?.title||'')
 const handle=String(product?.handle||'').toLowerCase()
 const special=/\b(?:award|edition|limited|red[- ]?dot|epda|idea|special|holiday|new[- ]?year)\b|红点|限量|新年|三体|奖项/i.test(title+' '+handle)
 const add=value=>{const s=String(value||'').trim().toLowerCase();if(CODE.test(s))found.add(s)}
 const first=handle.split('-')[0]
 if(!special&&CODE.test(first))add(first)
 for(const variant of product?.variants||[]) {
  const sku=String(variant?.sku||'').trim()
  // A merchant variant identifier with a size/colour suffix is not an exact model.
  if(!special)add(sku)
 }
 if(!special) {
  const titleTokens=title.matchAll(/(?:^|[^a-z0-9_-])([a-z]{1,5}\d{2,6}[a-z0-9]{0,6})(?![a-z0-9_-])/gi)
  for(const m of titleTokens)add(m[1])
 }
 const body=String(product?.body_html||'')
   .replace(/<[^>]*>/g,' ')
   .replace(/&nbsp;|&#160;/gi,' ')
   .replace(/&colon;/gi,':')
 const model=body.match(/(?:\bmodel(?:\s*(?:no\.?|number))?\b|型号)\s*[:：]\s*(?:CUKTECH\s*)?([a-z]{1,5}\d{2,6}[a-z0-9]{0,6})(?![a-z0-9_-])/i)
 if(!special&&model)add(model[1])
 return [...found].sort()
}
const categoryOf=p=>{
 const s=(p.title+' '+p.product_type+' '+(Array.isArray(p.tags)?p.tags.join(' '):p.tags||'')).toLowerCase()
 if(/cable|cord|usb-c to|cáp/.test(s))return 'cable'
 if(/charger|adapter|gan|charging station/.test(s))return 'charger'
 if(/power bank|battery|magnetic power/.test(s))return 'powerbank'
 return 'other'
}
export async function previewFromCatalog(products) {
 const records=[]
 for(const item of products){
  const key=await catalogIdentity(item.handle)
  const category=categoryOf(item)
  const title=clean(item.title).slice(0,160)
  const photos=sourceImages(item)
  const capacity=title.match(/\d[\d,.]*\s*mAh/i)?.[0]||''
  const wattage=title.match(/\d{1,3}\s*W\b/i)?.[0]||''
  records.push({
   id:key.id,slug:key.slug,name:title,category,
   price:0,old_price:0,stock:0,published:1,featured:category!=='other'?1:0,
   badge:'Danh mục tham khảo',
   description:'Mặt hàng trong danh mục công khai CUKTECH. Giá bán và tồn kho Việt Nam đang được cập nhật.',
   art:category==='cable'?'cable':category==='charger'?'charger':'powerbank',
   capacity,wattage,source_model_codes:sourceModelCodes(item),
   source_site:key.sourceUrl,image_url:photos[0]||'',source_images:JSON.stringify(photos)
  })
 }
 return records
}
export async function buildSnapshot({fetchImpl=fetch,delay}={}){
 const scan=await fetchCompleteCatalog({fetchImpl,delay})
 if(!scan.verified || scan.sourceCount!==scan.products.length)throw new Error('Refusing to publish an incomplete public catalog preview')
 const products=await previewFromCatalog(scan.products)
 if(products.length!==scan.sourceCount || new Set(products.map(p=>p.slug)).size!==products.length){
  throw new Error('Product IDs are not unique; refusing to publish snapshot')
 }
 const productsWithImages=products.filter(p=>p.image_url).length
 const totalImages=products.reduce((n,p)=>n+JSON.parse(p.source_images).length,0)
 return {source:'https://cuktech.com/collections/all',sourceCount:scan.sourceCount,verified:true,
  productsWithImages,totalImages,generatedAt:new Date().toISOString(),products}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 buildSnapshot().then(async data=>{
  const path=resolve('public/catalog.snapshot.json')
  await mkdir(dirname(path),{recursive:true})
  await writeFile(path,JSON.stringify(data,null,2)+'\n','utf8')
  console.log('VERIFIED CATALOG SNAPSHOT',data.sourceCount,'products;',data.productsWithImages,'with image galleries;',data.totalImages,'source-hosted photos; no stock or price published')
 }).catch(e=>{console.error('CATALOG SNAPSHOT FAILED:',e.message);process.exitCode=1})
}
