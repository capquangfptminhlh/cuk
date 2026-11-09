import express from 'express'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { db, sha256, verifyPassword, newOrderId } from './db.js'
import { runCatalogSync, isCatalogSyncRunning } from './catalog-sync.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '24kb' }))
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); next() })
function rejectCrossOrigin(req,res,next) {
 if (!['POST','PATCH','PUT','DELETE'].includes(req.method)) return next()
 const origin = req.get('origin'); const host = req.get('host')
 if (origin && new URL(origin).host !== host) return res.status(403).json({error:'Yêu cầu không hợp lệ'})
 return next()
}
app.use('/api', rejectCrossOrigin)
const selectProducts = db.prepare('SELECT * FROM products WHERE published = 1 ORDER BY featured DESC, created_at DESC, name ASC')
const selectProduct = db.prepare('SELECT * FROM products WHERE slug = ? AND published = 1')
const selectForOrder = db.prepare('SELECT id,name,price,stock,published FROM products WHERE id = ?')
const ipHits = new Map()
function rateLimit(req,res,next) {
 const key = `${req.ip}:${req.path}`, now=Date.now(); const item=ipHits.get(key) || {count:0,until:now+60000}
 if (now>item.until) { item.count=0; item.until=now+60000 }
 item.count++; ipHits.set(key,item)
 if (item.count>12) return res.status(429).json({error:'Thử lại sau một phút'})
 next()
}
app.get('/api/config', (req,res) => res.json({ demo: process.env.STORE_DEMO !== '0', currency: 'VND', shopName: 'CUKTECH VN' }))
app.get('/api/products', (req,res) => res.json(selectProducts.all()))
app.get('/api/products/:slug', (req,res) => { const p=selectProduct.get(req.params.slug); p?res.json(p):res.status(404).json({error:'Không tìm thấy sản phẩm'}) })
app.post('/api/orders',rateLimit,(req,res)=>{
 const {customer,phone,address,note='',items}=req.body || {}
 if (typeof customer!=='string'||customer.trim().length<2||customer.length>100 ||
     typeof phone!=='string'|| !/^(\+?84|0)\d{9}$/.test(phone.replace(/[ .-]/g,'')) ||
     typeof address!=='string'||address.trim().length<12||address.length>500 ||
     typeof note!=='string'||note.length>1000 || !Array.isArray(items)||items.length<1||items.length>40) {
  return res.status(400).json({error:'Vui lòng kiểm tra tên, điện thoại, địa chỉ và sản phẩm'})
 }
 let validItems=[], total=0
 for (const item of items) {
  if(typeof item.id!=='string' || !Number.isInteger(item.qty)||item.qty<1||item.qty>99) return res.status(400).json({error:'Số lượng không hợp lệ'})
  const p=selectForOrder.get(item.id)
  if(!p||!p.published||p.price<=0||p.stock<item.qty) return res.status(400).json({error:'Sản phẩm hết hàng hoặc chưa có giá'})
  if(validItems.some(x=>x.id===p.id)) return res.status(400).json({error:'Sản phẩm bị lặp'})
  total+=p.price*item.qty
  validItems.push({id:p.id,name:p.name,price:p.price,qty:item.qty})
 }
 const id=newOrderId()
 try {
  db.exec('BEGIN IMMEDIATE')
  for(const item of validItems) {
   const result=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(item.qty,item.id,item.qty)
   if(result.changes!==1) throw new Error('Không đủ tồn kho')
  }
  db.prepare('INSERT INTO orders (id,customer,phone,address,note,items,total) VALUES (?,?,?,?,?,?,?)')
   .run(id,customer.trim(),phone.trim(),address.trim(),note.trim(),JSON.stringify(validItems),total)
  db.exec('COMMIT')
  return res.status(201).json({id,total})
 } catch(e) {db.exec('ROLLBACK');return res.status(409).json({error:e.message})}
})
app.post('/api/newsletter',rateLimit,(req,res)=>{
 const email=req.body?.email
 if (typeof email!=='string'||email.length>180||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Email không hợp lệ'})
 db.prepare('INSERT OR IGNORE INTO newsletter(email) VALUES (?)').run(email.toLowerCase())
 res.json({ok:true})
})
function cookies(req) {return Object.fromEntries((req.get('cookie')||'').split(';').map(c=>c.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2))}
function requireAdmin(req,res,next) {
 const token=cookies(req).cuk_session
 if(!token) return res.status(401).json({error:'Chưa đăng nhập'})
 const session=db.prepare('SELECT admin_id FROM sessions WHERE token_hash=? AND expires_at>?').get(sha256(token),Date.now())
 if(!session) return res.status(401).json({error:'Phiên đã hết hạn'})
 req.adminId=session.admin_id; next()
}
app.post('/api/admin/login',rateLimit,(req,res)=>{
 const {email,password}=req.body||{}
 if(typeof email!=='string'||typeof password!=='string'||password.length>200) return res.status(400).json({error:'Thông tin không hợp lệ'})
 const admin=db.prepare('SELECT * FROM admins WHERE email=?').get(email.trim().toLowerCase())
 if(!admin||!verifyPassword(password,admin.password_hash)) return res.status(401).json({error:'Sai email hoặc mật khẩu'})
 const token=randomBytes(32).toString('hex'), ttl=7*24*3600*1000
 db.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES (?,?,?)').run(sha256(token),admin.id,Date.now()+ttl)
 res.cookie('cuk_session', token, {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:ttl,path:'/'})
 res.json({ok:true})
})
app.post('/api/admin/logout',requireAdmin,(req,res)=>{db.prepare('DELETE FROM sessions WHERE admin_id=?').run(req.adminId);res.clearCookie('cuk_session',{path:'/'});res.json({ok:true})})
app.get('/api/admin/me',requireAdmin,(_,res)=>res.json({ok:true}))
app.get('/api/admin/products',requireAdmin,(_,res)=>res.json(db.prepare('SELECT * FROM products ORDER BY name').all()))
app.get('/api/admin/orders',requireAdmin,(_,res)=>res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500').all().map(o=>({...o,items:JSON.parse(o.items)}))))
app.patch('/api/admin/products/:id',requireAdmin,(req,res)=>{
 const p=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id)
 if(!p)return res.status(404).json({error:'Không tìm thấy'})
 const allowed=['name','category','description','capacity','wattage','badge','art','slug','price','old_price','stock','featured','published']
 const fields=Object.entries(req.body||{}).filter(([key])=>allowed.includes(key))
 if(!fields.length)return res.status(400).json({error:'Không có dữ liệu'})
 for(const [key,value] of fields){
  if(['price','old_price','stock','featured','published'].includes(key)){if(!Number.isInteger(value)||value<0||value>1e9)return res.status(400).json({error:`${key} không hợp lệ`})}
  else if(typeof value!=='string'||value.length>1000)return res.status(400).json({error:`${key} không hợp lệ`})
 }
 const keys=fields.map(([k])=>`${k}=?`).join(',')
 try{db.prepare(`UPDATE products SET ${keys} WHERE id=?`).run(...fields.map(([,v])=>v),p.id)}catch{return res.status(409).json({error:'Slug trùng'})}
 res.json(db.prepare('SELECT * FROM products WHERE id=?').get(p.id))
})
app.post('/api/admin/products',requireAdmin,(req,res)=>{
 const {slug,name,category,price=0,stock=0,description='',art='powerbank',capacity='',wattage='',badge=''}=req.body||{}
 if(typeof slug!=='string'||!/^[a-z0-9-]{3,80}$/.test(slug)||typeof name!=='string'||name.length<3||name.length>160||
 !['powerbank','charger','cable','other'].includes(category)||!Number.isInteger(price)||price<0||!Number.isInteger(stock)||stock<0) return res.status(400).json({error:'Thông tin sản phẩm không hợp lệ'})
 const id=randomBytes(12).toString('hex')
 try{ db.prepare('INSERT INTO products(id,slug,name,category,price,stock,description,art,capacity,wattage,badge) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
 .run(id,slug,name,category,price,stock,String(description).slice(0,1000),String(art).slice(0,30),String(capacity).slice(0,60),String(wattage).slice(0,60),String(badge).slice(0,40))
 res.status(201).json({id}) }catch{return res.status(409).json({error:'Slug đã tồn tại'})}
})
app.get('/api/admin/catalog/status',requireAdmin,(_,res)=>{
 const latest=db.prepare('SELECT started_at,status,summary FROM catalog_sync_runs ORDER BY id DESC LIMIT 1').get() || null
 const imported=db.prepare("SELECT count(*) as total, sum(CASE WHEN published=1 THEN 1 ELSE 0 END) as visible FROM products WHERE source_id LIKE 'cuktech:%'").get()
 res.json({running:isCatalogSyncRunning(), latest, imported, autoEnabled:process.env.CATALOG_SYNC_ENABLED === '1'})
})
app.post('/api/admin/catalog/sync',requireAdmin,(req,res)=>{
 if(isCatalogSyncRunning()) return res.status(409).json({error:'Đang đồng bộ'})
 void runCatalogSync().catch(error=>console.error('[catalog-sync]',error.message))
 res.status(202).json({ok:true,started:true})
})
app.patch('/api/admin/orders/:id',requireAdmin,(req,res)=>{
 const statuses=['new','confirmed','shipping','completed','cancelled']
 if(!statuses.includes(req.body?.status))return res.status(400).json({error:'Trạng thái không hợp lệ'})
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id)
 if(!order)return res.status(404).json({error:'Không có đơn hàng'})
 if(order.status==='cancelled'&&req.body.status!=='cancelled')return res.status(400).json({error:'Không thể mở lại đơn đã hủy'})
 if(req.body.status==='cancelled' && order.status!=='cancelled'){
  db.exec('BEGIN IMMEDIATE')
  try{for(const item of JSON.parse(order.items)) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.qty,item.id)
   db.prepare('UPDATE orders SET status=? WHERE id=?').run('cancelled',order.id);db.exec('COMMIT')}
  catch(e){db.exec('ROLLBACK');return res.status(500).json({error:'Không thể hủy đơn'})}
 } else db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status,order.id)
 res.json({ok:true})
})
const here=dirname(fileURLToPath(import.meta.url))
const dist=join(here,'..','dist')
app.use(express.static(dist,{maxAge:'1h'}))
app.get('*',(req,res)=>res.sendFile(join(dist,'index.html')))
const port=Number(process.env.PORT||3001)
app.listen(port,()=>console.log(`CUKTECH VN running at :${port}`))
// Only the running Node server performs scheduled sync. GitHub Actions builds do not mutate the database.
if (process.env.CATALOG_SYNC_ENABLED === '1') {
 const startSync=()=>{ if (!isCatalogSyncRunning()) void runCatalogSync().catch(error=>console.error('[catalog-sync]',error.message)) }
 setTimeout(startSync,20_000).unref()
 setInterval(startSync,Math.max(60,Number(process.env.CATALOG_SYNC_HOURS||12))*60*60*1000).unref()
}
