/**
 * Static catalog and product-image URL resolution.
 * Neither catalog loading nor product photography depends on the unfinished
 * Cloudflare order API. GitHub Pages and the custom apex domain both work.
 */
const LOCAL=/^media\/products\/[a-f0-9]{32}\.webp$/i
const SOURCE_HOSTS=new Set(['cdn.shopify.com','cuktech.com','www.cuktech.com'])
function baseHref(value) {
 if(value)return value
 return typeof document!=='undefined' ? document.baseURI : 'https://cuktech.vn/'
}
export function staticAssetUrl(relative,base) {
 if(!LOCAL.test(relative)&&relative!=='catalog.snapshot.json')
  throw new Error('Unexpected static asset name')
 return new URL(relative,baseHref(base)).href
}
export function safePhotoUrl(source,base) {
 if(typeof source!=='string')return null
 if(LOCAL.test(source))return staticAssetUrl(source,base)
 try {
  const u=new URL(source)
  if(u.protocol==='https:'&&SOURCE_HOSTS.has(u.hostname.toLowerCase())&&
     /\.(?:jpe?g|png|webp|avif)$/i.test(u.pathname))return u.href
 }catch{/* unavailable or invalid image */}
 return null
}
function photosFromField(field) {
 if(Array.isArray(field))return field
 try {
  const a=JSON.parse(field||'[]')
  return Array.isArray(a)?a:[]
 }catch{return []}
}
/** Do not mix the locally mirrored gallery with the original CDN gallery.
 * Both sets represent the exact SAME photos, and mixing doubled every album
 * (e.g. 11 original product pictures became 22 images on the detail page).
 * When any verified local asset is available, use ONLY the source's local
 * gallery. Remote originals are a compatibility fallback for a catalog
 * snapshot which has not yet been mirrored at all.
 */
export function photoCandidates(product,base) {
 if(!product)return []
 const primary=[product.image_url,...photosFromField(product.source_images)]
 const local=primary.filter(src=>typeof src==='string'&&LOCAL.test(src))
 const sources=local.length?local:[
  ...primary,
  product.original_image_url,
  ...photosFromField(product.original_source_images)
 ]
 const result=new Set()
 for(const src of sources) {
  const url=safePhotoUrl(src,base)
  if(url)result.add(url)
 }
 return [...result]
}
export function checkedSnapshot(raw) {
 if(raw?.verified!==true||!Number.isInteger(raw.sourceCount)||
    raw.sourceCount<1||!Array.isArray(raw.products)||
    raw.products.length!==raw.sourceCount||
    new Set(raw.products.map(p=>p.slug)).size!==raw.sourceCount)
  throw new Error('Source catalog is missing or incomplete')
 return raw.products.map(p=>({...p,source_market:'global'}))
}
export async function loadStaticCatalog({fetchImpl=fetch,base}={}) {
 const url=staticAssetUrl('catalog.snapshot.json',base)
 const response=await fetchImpl(url,{cache:'no-store'})
 if(!response.ok)throw new Error('Catalog HTTP '+response.status)
 return checkedSnapshot(await response.json())
}

/** Retry a failed photo once with a fresh CDN request. Only call on already
 * validated source URLs (photoCandidates returns absolute HTTPS).
 */
export function retriedPhotoUrl(source,attempt=0) {
 if(!source||!attempt)return source
 const url=new URL(source)
 if(url.protocol!=='https:')throw new Error('Photo retry accepts HTTPS sources only')
 url.searchParams.set('cuktech_photo_retry',String(Math.min(2,Math.max(1,attempt))))
 return url.href
}
