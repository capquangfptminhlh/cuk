/**
 * Generate a factual, non-purchasable 100%-audited catalog for static GitHub Pages.
 * Does NOT copy third-party product images or source descriptions to the public web.
 * Fails closed rather than deploying an incomplete inventory snapshot.
 */
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {fetchCompleteCatalog} from '../worker/src/sync.js'
import {catalogIdentity} from '../worker/src/catalog-core.js'

const clean=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
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
  const capacity=title.match(/\d[\d,.]*\s*mAh/i)?.[0]||''
  const wattage=title.match(/\d{1,3}\s*W\b/i)?.[0]||''
  records.push({
   id:key.id,slug:key.slug,name:title,category,
   price:0,old_price:0,stock:0,published:1,featured:category!=='other'?1:0,
   badge:'Danh mục tham khảo',
   description:'Mặt hàng trong danh mục công khai CUKTECH. Giá bán và tồn kho Việt Nam đang được cập nhật.',
   art:category==='cable'?'cable':category==='charger'?'charger':'powerbank',
   capacity,wattage,image_url:'',source_images:'[]'
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
 return {source:'https://cuktech.com/collections/all',sourceCount:scan.sourceCount,verified:true,
  generatedAt:new Date().toISOString(),products}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 buildSnapshot().then(async data=>{
  const path=resolve('public/catalog.snapshot.json')
  await mkdir(dirname(path),{recursive:true})
  await writeFile(path,JSON.stringify(data,null,2)+'\n','utf8')
  console.log('VERIFIED CATALOG SNAPSHOT',data.sourceCount,'products; no stock, price or third-party media published')
 }).catch(e=>{console.error('CATALOG SNAPSHOT FAILED:',e.message);process.exitCode=1})
}
