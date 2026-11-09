/**
 * Import every publicly exposed CUKTECH Shopify product, including Unicode handles.
 * Compares /products.json against the live collection's published count before any writes.
 * Never infers Vietnam price/stock or republishes third-party imagery without approval.
 */
import {catalogIdentity,robotsAllows,assertCatalogComplete,collectionProductCount} from './catalog-core.js'

const BASE='https://cuktech.com'
const USER_AGENT='CUKTECHVN-PublicCatalog/1.0 (+https://cuktech.vn)'
const MAX_PAGES=20
const WAIT_MS=1250
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const clean=(value,max=3000)=>String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0,max)
const safeImage=value=>{
 try {const u=new URL(typeof value==='string'?value:value?.src||'',BASE);return u.protocol==='https:'?u.href:''}
 catch{return ''}
}
const classify=p=>{
 const text=(p.title+' '+p.product_type+' '+(Array.isArray(p.tags)?p.tags.join(' '):p.tags||'')).toLowerCase()
 if(/cable|cord|usb-c to|cáp/.test(text))return 'cable'
 if(/charger|adapter|gan|charging station|củ sạc/.test(text))return 'charger'
 if(/power bank|battery|magnetic power|pin sạc/.test(text))return 'powerbank'
 return 'other'
}
async function fetchText(url,fetchImpl){
 const result=await fetchImpl(url,{headers:{'User-Agent':USER_AGENT,Accept:'application/json,text/html;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(18000)})
 if(result.status===403||result.status===429)throw new Error('CUKTECH_SOURCE_BLOCKED: HTTP '+result.status+' (stop without bypass)')
 if(result.ok&&new URL(result.url||url).origin!==BASE)throw new Error('CUKTECH_SOURCE_REDIRECTED: refusing outside-domain data')
 return {ok:result.ok,status:result.status,text:result.ok?await result.text():''}
}
/** A complete fetch is validated against the live collection count when available. */
export async function fetchCompleteCatalog({fetchImpl=fetch,delay=sleep,maxPages=MAX_PAGES}={}){
 const robotsResponse=await fetchText(BASE+'/robots.txt',fetchImpl)
 if(!robotsResponse.ok)throw new Error('Cannot check robots.txt; catalog sync is disabled safely')
 const robots=robotsResponse.text
 const request=async path=>{
  if(!robotsAllows(robots,path,USER_AGENT))throw new Error('robots.txt disallows '+path)
  return fetchText(BASE+path,fetchImpl)
 }
 let products=null,usedEndpoint=null
 let requests=1
 for(const endpoint of ['/products.json','/collections/all/products.json']){
  if(!robotsAllows(robots,endpoint,USER_AGENT))continue
  const list=[]
  let available=true
  for(let page=1;page<=maxPages;page++){
   if(requests>1)await delay(WAIT_MS)
   const path=endpoint+'?limit=250&page='+page
   const response=await request(path);requests++
   if(!response.ok){
    if(page===1){available=false;break}
    throw new Error('JSON pagination incomplete at page '+page+'; no import')
   }
   let parsed
   try{parsed=JSON.parse(response.text)}catch{
    if(page===1){available=false;break}
    throw new Error('Invalid product JSON page '+page+'; no import')
   }
   if(!Array.isArray(parsed.products)){
    if(page===1){available=false;break}
    throw new Error('No products array at page '+page+'; no import')
   }
   list.push(...parsed.products)
   if(parsed.products.length<250)break
   if(page===maxPages)throw new Error('Public JSON exceeds maximum page count; no incomplete import')
  }
  if(available&&list.length){products=list;usedEndpoint=endpoint;break}
 }
 if(!products)throw new Error('No readable public Shopify JSON catalog. Never guess product count or bypass access controls.')
 let expected=null
 if(robotsAllows(robots,'/collections/all',USER_AGENT)){
  if(requests>1)await delay(WAIT_MS)
  const collection=await request('/collections/all');requests++
  if(collection.ok)expected=collectionProductCount(collection.text)
 }
 const audited=assertCatalogComplete(products,expected)
 return {...audited,mode:usedEndpoint==='/'?'other':usedEndpoint,requests}
}
function productPayload(p,identity,started){
 const description=clean(p.body_html,3000)
 const images=[...new Set((p.images||[]).map(safeImage).filter(Boolean))]
 if(p.image?.src)images.push(...[safeImage(p.image)].filter(x=>x&&!images.includes(x)))
 const variants=(p.variants||[]).map(v=>({
  id:String(v.id??''),sku:clean(v.sku,100),title:clean(v.title,150),
  option1:v.option1??'',option2:v.option2??'',option3:v.option3??'',
  available:v.available===true,source_price:v.price==null?null:String(v.price)
 }))
 const type=classify(p)
 const text=p.title+' '+description
 const capacity=text.match(/\d[\d,.]*\s*mAh/i)?.[0]||''
 const wattage=text.match(/\d{1,3}\s*W\b/i)?.[0]||''
 const tags=Array.isArray(p.tags)?p.tags.join(', '):String(p.tags||'')
 return [
  identity.id,identity.slug,clean(p.title,160),type,capacity,wattage,description,
  type==='charger'?'charger':type==='cable'?'cable':'powerbank',
  0,0,0,0,identity.sourceId,identity.sourceUrl,clean(p.title,160),description,
  tags.slice(0,2000),JSON.stringify(images),JSON.stringify(variants),
  String(p.updated_at||'').slice(0,60),started,'active',images[0]||''
 ]
}
const cols=['id','slug','name','category','capacity','wattage','description','art','featured','published','price','stock','source_id','source_url','source_title','source_description','source_tags','source_images','source_variants','source_updated_at','source_synced_at','source_status','image_url']
const updatable=['source_url','source_title','source_description','source_tags','source_images','source_variants','source_updated_at','source_synced_at','source_status']
const updateSql=updatable.map(k=>k+'=excluded.'+k).join(',')
const insertSql='INSERT INTO products('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+') ON CONFLICT(source_id) DO UPDATE SET '+updateSql+',image_url=CASE WHEN products.media_approved=0 THEN excluded.image_url ELSE products.image_url END'

/** Batches are idempotent. Never mark missing until every batch succeeds. */
export async function syncCatalog(env,{fetchImpl=fetch,delay=sleep}={}){
 const started=new Date().toISOString()
 try{
  const catalog=await fetchCompleteCatalog({fetchImpl,delay})
  if(!catalog.verified)throw new Error('Cannot read source product count, refusing to claim complete import')
  const statements=[]
  for(const p of catalog.products){
   const identity=await catalogIdentity(p.handle)
   statements.push(env.DB.prepare(insertSql).bind(...productPayload(p,identity,started)))
  }
  // D1 limits transaction size. Retry remains safe if a later batch fails.
  for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40))
  await env.DB.prepare("UPDATE products SET source_status='missing' WHERE source_id LIKE 'cuktech:%' AND source_synced_at<>?").bind(started).run()
  const stored=await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN published=1 THEN 1 ELSE 0 END) AS visible, SUM(CASE WHEN published=0 THEN 1 ELSE 0 END) AS drafts FROM products WHERE source_id LIKE 'cuktech:%' AND source_status='active'").first()
  if(Number(stored.total)!==catalog.products.length)throw new Error('D1_RECONCILIATION_FAILED: '+stored.total+' active products; expected '+catalog.products.length)
  const summary={sourceCount:catalog.sourceCount,fetched:catalog.products.length,stored:stored.total,visible:stored.visible||0,drafts:stored.drafts||0,verified:true,mode:catalog.mode,requests:catalog.requests,syncedAt:started}
  await env.DB.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').bind(started,'success',JSON.stringify(summary)).run()
  return summary
 }catch(error){
  await env.DB.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').bind(started,'failed',String(error.message).slice(0,500)).run()
  throw error
 }
}
