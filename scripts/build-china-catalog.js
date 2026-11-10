/**
 * Catalog preview from CUKTECH's public Chinese manufacturer site.
 * This source is distinct from cuktech.com Shopify's international catalog.
 * Source photos are referenced, never copied to GitHub Pages. Neither prices
 * nor inventory are inferred. Verify commercial image-use rights separately.
 */
import {writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT='https://www.cuktech.com.cn'
const HEADERS={'Accept':'text/html,application/xhtml+xml','User-Agent':'CUKTECHVN-PublicCatalog/1.0 (+https://cuktech.vn)'}
const CATEGORIES=[
 '/',
 '/products-lists/power-bank.html',
 '/products-lists/charger.html',
 '/products-lists/high-speed-fan.html',
 '/products-lists/data-cable-and-accessories.html',
 '/products-lists/limited-edition-product.html'
]
const pause=ms=>new Promise(done=>setTimeout(done,ms))
const titleText=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim()
export function officialImage(value) {
 if(typeof value!=='string'||!value.trim())return ''
 try {
  const url=new URL(value.trim(),ROOT)
  if(url.protocol!=='https:' || !['www.cuktech.com.cn','cuktech.com.cn'].includes(url.hostname))return ''
  if(!/\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname))return ''
  return url.href
 } catch {return ''}
}
/** Product detail links are embedded in SSR navigation and category grids. */
export function discoverProducts(html) {
 const products=new Map()
 const re=/<a\b[^>]*href=["'](?:https:\/\/(?:www\.)?cuktech\.com\.cn)?\/products\/([a-z0-9-]+)\.html(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi
 for(const match of String(html??'').matchAll(re)) {
  const sku=match[1].toLowerCase(),body=match[2]
  const rawName=body.match(/<div\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ||body.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i)?.[1]||''
  const name=titleText(rawName)
  const photo=officialImage(body.match(/<img\b[^>]*\bsrc=["']([^"']+)/i)?.[1]||'')
  const prev=products.get(sku)
  if(!prev || (name.length>prev.originalName.length && photo)) {
   products.set(sku,{sku,originalName:name||prev?.originalName||'',cover:photo||prev?.cover||''})
  } else if(prev) {
   if(!prev.cover&&photo)prev.cover=photo
   if(!prev.originalName&&name)prev.originalName=name
  }
 }
 return [...products.values()]
}
/** Photo strips on official product detail pages contain the full marketing gallery. */
export function detailFromHtml(html) {
 const src=String(html??'')
 const name=titleText(src.match(/<div\b[^>]*class=["'][^"']*\bproduct-name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1])
 const gallery=src.match(/<div\b[^>]*class=["'][^"']*\bpic-list\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||''
 const images=[...new Set([...gallery.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)/gi)]
   .map(m=>officialImage(m[1])).filter(Boolean))]
 return {name,images}
}
function translatedTitle(original,sku){
 let s=titleText(original)
 const words=[
  [/(\d+)号/g,'số $1 '],
  [/移动电源/g,'pin sạc dự phòng'],
  [/电能柱/g,'pin sạc dự phòng'],
  [/电能棒/g,'pin sạc dự phòng'],
  [/电能块/g,'pin sạc dự phòng'],
  [/电能卡片/g,'pin sạc dạng thẻ'],
  [/电能卡/g,'pin sạc dạng thẻ'],
  [/电能仓/g,'trạm năng lượng'],
  [/氮化镓/g,'GaN '],
  [/充电器/g,'củ sạc'],
  [/桌面充/g,'bộ sạc để bàn'],
  [/充电站/g,'trạm sạc'],
  [/数显/g,'màn hình số'],
  [/数据线/g,'cáp dữ liệu'],
  [/快充线/g,'cáp sạc nhanh'],
  [/充电线/g,'cáp sạc'],
  [/编织/g,'bện'],
  [/磁吸/g,'từ tính'],
  [/自带双线/g,'tích hợp hai dây'],
  [/自带线/g,'tích hợp dây'],
  [/新年版/g,'phiên bản Tết'],
  [/三体版/g,'phiên bản Tam Thể'],
  [/模块风扇/g,'quạt mô-đun'],
  [/电池/g,'pin'],
  [/车载/g,'trên ô tô'],
  [/苹果/g,'Apple'],
  [/认证/g,'chứng nhận'],
  [/随身/g,'bỏ túi'],
  [/小巧/g,'nhỏ gọn'],
  [/柔光/g,'ánh sáng dịu'],
  [/限定/g,'phiên bản giới hạn'],
  [/超薄/g,'siêu mỏng'],
  [/电源/g,'nguồn điện'],
  [/转接头/g,'đầu chuyển'],
  [/数码/g,'kỹ thuật số'],
  [/彩虹/g,'cầu vồng'],
  [/普通版/g,'bản tiêu chuẩn'],
  [/充电/g,'sạc'],
  [/套装/g,'bộ sản phẩm']
 ]
 for(const [pattern,out] of words)s=s.replace(pattern,out)
 s=s.replace(/\s+/g,' ').trim()
 if(!s) s=original||sku
 // Explicit original label is retained for searching/validation.
 return 'CUKTECH '+s+' · '+sku.toUpperCase()
}
function categoryFor(sku,title){
 const text=sku+' '+title
 if(/^(?:c2c|ctc|cmc|ctl|klc|al003)/i.test(sku)||/数据线|快充线|编织线|磁吸线|挂绳|转接头|一分二|一拖二/i.test(text))return 'cable'
 if(/^(?:pb|wpb|lpb|bp|p23|p01|ps600|p\d{2,3})/i.test(sku)||/电能棒|电能柱|电能块|磁吸电能|移动电源|电能卡|电能仓/i.test(text))return 'powerbank'
 if(/^(?:ad|ac|ta|cc|wcj|ba|a18)/i.test(sku)||/充电器|氮化镓|桌面充|车充|充电站/i.test(text))return 'charger'
 return 'other'
}
function toProduct(row){
 const source='https://www.cuktech.com.cn/products/'+row.sku+'.html'
 const images=[...new Set([row.cover,...row.images].filter(Boolean))]
 const name=row.originalName||row.sku.toUpperCase()
 const text=name+' '+row.sku
 const capacity=text.match(/\d[\d,.]*\s*mAh/i)?.[0]||''
 const wattage=text.match(/\d{1,3}\s*W\b/i)?.[0]||''
 const category=categoryFor(row.sku,name)
 return {
  id:'china-'+row.sku,slug:'cn-'+row.sku,name:translatedTitle(name,row.sku),
  source_original_title:name,source_market:'china',source_site:source,
  media_delivery:'external-source-unverified',media_verified:false,
  category,art:category==='charger'?'charger':category==='cable'?'cable':'powerbank',
  price:0,old_price:0,stock:0,featured:0,published:1,
  badge:'Danh mục Trung Quốc',
  description:'Mã hãng '+row.sku.toUpperCase()+'. Tên nguồn: '+name+'. Sản phẩm trong danh mục CUKTECH Trung Quốc; chưa xác nhận phiên bản và tồn kho tại Việt Nam.',
  capacity,wattage,image_url:images[0]||'',source_images:JSON.stringify(images)
 }
}
async function fetchPublic(url,fetchImpl){
 const result=await fetchImpl(url,{headers:HEADERS,signal:AbortSignal.timeout(25000),redirect:'follow'})
 if(result.status===403||result.status===429)throw new Error('Manufacturer limits public catalog requests (HTTP '+result.status+'); stopping')
 if(!result.ok)throw new Error('Public source HTTP '+result.status+' for '+url)
 if(new URL(result.url||url).hostname!=='www.cuktech.com.cn')throw new Error('Unexpected redirect off manufacturer site')
 return result.text()
}
/**
 * Scan every official category; fetch each public detail at a conservative pace.
 * A failed detail leaves its catalog cover and is auditable; never invent galleries.
 */
export async function buildChinaCatalog({fetchImpl=fetch,delay=pause,categoryPaths=CATEGORIES}={}){
 const robot=await fetchPublic(ROOT+'/robots.txt',fetchImpl)
 const {robotsAllows}=await import('../worker/src/catalog-core.js')
 const allowed=path=>robotsAllows(robot,path,'CUKTECHVN-PublicCatalog')
 const found=new Map()
 let calls=1
 for(const path of categoryPaths) {
  if(!allowed(path))throw new Error('China manufacturer robots disallows '+path)
  if(calls>1)await delay(450)
  const html=await fetchPublic(ROOT+path,fetchImpl);calls++
  for(const p of discoverProducts(html)){
   const previous=found.get(p.sku)
   if(!previous)found.set(p.sku,p)
   else{
    if(!previous.originalName&&p.originalName)previous.originalName=p.originalName
    if(!previous.cover&&p.cover)previous.cover=p.cover
   }
  }
 }
 if(found.size<40)throw new Error('China manufacturer catalog unexpectedly small: '+found.size)
 const products=[...found.values()]
 const missingDetails=[]
 let totalPhotos=0
 let detailsFetched=0
 // 88 details at ~0.5 req/sec, keeps the official source load modest.
 for(const p of products) {
  const path='/products/'+p.sku+'.html'
  if(!allowed(path)){missingDetails.push({sku:p.sku,reason:'robots-disallowed'});p.images=[];continue}
  try{
   await delay(650)
   const html=await fetchPublic(ROOT+path,fetchImpl);calls++
   const detail=detailFromHtml(html)
   p.originalName=detail.name||p.originalName||p.sku
   p.images=detail.images
   if(!detail.images.length)missingDetails.push({sku:p.sku,reason:'no-images'})
   else detailsFetched++
  }catch(e){
   if(/limits public catalog requests|Unexpected redirect/.test(String(e.message)))throw e
   p.images=[]
   missingDetails.push({sku:p.sku,reason:String(e.message).slice(0,120)})
  }
  totalPhotos+=new Set([p.cover,...p.images].filter(Boolean)).size
 }
 const records=products.map(toProduct)
 if(new Set(records.map(x=>x.id)).size!==records.length)throw new Error('Duplicate manufacturer model IDs detected')
 return {
  source:ROOT,verifiedSource:'manufacturer-category-pages',
  discovered:records.length,detailsFetched,missingDetails,
  productsWithImages:records.filter(x=>x.image_url).length,
  totalImages:records.reduce((n,p)=>n+JSON.parse(p.source_images).length,0),
  requests:calls,generatedAt:new Date().toISOString(),products:records
 }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 buildChinaCatalog().then(async data=>{
  const path=resolve('public/catalog.china.json')
  await mkdir(dirname(path),{recursive:true})
  await writeFile(path,JSON.stringify(data,null,2)+'\n','utf8')
  console.log('CHINA MANUFACTURER CATALOG:',data.discovered,'models;',data.detailsFetched,'detail galleries;',data.productsWithImages,'with photos;',data.totalImages,'images;',data.missingDetails.length,'partial details')
 }).catch(e=>{console.error('CHINA CATALOG ERROR',e.message);process.exitCode=1})
}
