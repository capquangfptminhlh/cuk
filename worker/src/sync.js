/** Read public product metadata only, comply with robots.txt and stop on blocks. */
const BASE='https://cuktech.com'
const UA='CUKTECHVN-PublicCatalog/1.0 (+https://cuktech.vn)'
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
function permitted(robots,path) {
  let agents=[],rules=[],group=[]
  for(const raw of String(robots).split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(),idx=line.indexOf(':')
    if(idx<0)continue
    const key=line.slice(0,idx).trim().toLowerCase(),value=line.slice(idx+1).trim()
    if(key==='user-agent') {
      if(group.length) { agents.push({group,rules});rules=[];group=[] }
      group.push(value.toLowerCase())
    } else if((key==='disallow'||key==='allow')&&group.length) {
      if(value)rules.push({path:value,allow:key==='allow'})
    }
  }
  if(group.length)agents.push({group,rules})
  const matched=agents.filter(g=>g.group.some(a=>a==='*'||UA.toLowerCase().includes(a)))
  const all=matched.flatMap(g=>g.rules)
  let best=null
  for(const r of all) {
    let pattern
    try {
      const escaped=r.path.replace(/[.*+?^$()|[\]{}]/g,'\\$&').replace(/\\\*/g,'.*')
      pattern=new RegExp('^'+escaped)
    } catch {return false}
    if(pattern.test(path)) {
      const len=r.path.replace(/[*$]/g,'').length
      if(!best||len>best.len||(len===best.len&&r.allow))best={len,allow:r.allow}
    }
  }
  return best?.allow??true
}
const text=(v,n=2000)=>String(v||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,n)
function image(src) {try{const u=new URL(src,BASE);return u.protocol==='https:'?u.href:''}catch{return''}}
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,85)
function classify(p) {
 const title=(p.title+' '+p.product_type+' '+(Array.isArray(p.tags)?p.tags.join(' '):p.tags||'')).toLowerCase()
 return /cable|cord|usb-c to/.test(title)?'cable':/gan|charger|adapter/.test(title)?'charger':/power|battery|bank/.test(title)?'powerbank':'other'
}
export async function syncCatalog(env) {
 const started=new Date().toISOString()
 try {
  const rr=await fetch(BASE+'/robots.txt',{headers:{'User-Agent':UA},signal:AbortSignal.timeout(15000)})
  if(!rr.ok)throw new Error('Không đọc được robots.txt')
  const robots=await rr.text()
  const products=[]
  for(let page=1;page<=20;page++) {
   const path='/products.json?limit=250&page='+page
   if(!permitted(robots,path))throw new Error('robots.txt từ chối danh mục JSON')
   if(page>1)await pause(1500)
   const r=await fetch(BASE+path,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(20000)})
   if(r.status===403||r.status===429)throw new Error('Nguồn từ chối truy cập hoặc giới hạn tần suất')
   if(!r.ok||new URL(r.url).origin!==BASE)throw new Error('Không đọc được toàn bộ danh mục nguồn')
   const data=await r.json()
   if(!Array.isArray(data.products))throw new Error('Danh mục JSON không hợp lệ')
   products.push(...data.products)
   if(data.products.length<250)break
   if(page===20)throw new Error('Danh mục quá lớn; không đồng bộ thiếu')
  }
  const unique=[...new Map(products.filter(p=>p.handle&&p.title).map(p=>[slug(p.handle),p])).values()]
  if(!unique.length)throw new Error('Danh mục rỗng')
  const cols=['id','slug','name','category','capacity','wattage','description','art','featured','published','price','stock','source_id','source_url','source_title','source_description','source_tags','source_images','source_variants','source_updated_at','source_synced_at','source_status','image_url']
  const update=['source_url','source_title','source_description','source_tags','source_images','source_variants','source_updated_at','source_synced_at','source_status']
    .map(k=>k+'=excluded.'+k).join(',')
  const sql='INSERT INTO products('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+') ON CONFLICT(source_id) DO UPDATE SET '+update+',image_url=CASE WHEN products.media_approved=0 THEN excluded.image_url ELSE products.image_url END'
  const stmts=[]
  for(const p of unique) {
   const handle=slug(p.handle)
   if(!handle)continue
   const type=classify(p)
   const desc=text(p.body_html,3000)
   const images=[...new Set((p.images||[]).map(v=>image(typeof v==='string'?v:v?.src)).filter(Boolean))]
   const variants=(p.variants||[]).slice(0,50).map(v=>({id:String(v.id||''),sku:text(v.sku,100),title:text(v.title,150),available:v.available===true,source_price:v.price==null?null:String(v.price)}))
   const tags=Array.isArray(p.tags)?p.tags.join(', '):String(p.tags||'')
   const capacity=(p.title+' '+desc).match(/\d[\d,.]*\s*mAh/i)?.[0]||''
   const wattage=(p.title+' '+desc).match(/\d{1,3}\s*W\b/i)?.[0]||''
   const values=['source-'+handle,'imported-'+handle,text(p.title,160),type,capacity,wattage,desc,type==='charger'?'charger':type==='cable'?'cable':'powerbank',0,0,0,0,'cuktech:'+handle,BASE+'/products/'+handle,text(p.title,160),desc,tags.slice(0,2000),JSON.stringify(images),JSON.stringify(variants),String(p.updated_at||'').slice(0,60),started,'active',images[0]||'']
   stmts.push(env.DB.prepare(sql).bind(...values))
  }
  await env.DB.batch(stmts)
  await env.DB.prepare("UPDATE products SET source_status='missing' WHERE source_id LIKE 'cuktech:%' AND source_synced_at<>?").bind(started).run()
  await env.DB.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').bind(started,'success',JSON.stringify({total:unique.length,mode:'public-json'})).run()
  return {total:unique.length}
 } catch(e) {
  await env.DB.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').bind(started,'failed',String(e.message).slice(0,400)).run()
  throw e
 }
}
