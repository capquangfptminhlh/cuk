import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import worker from '../worker/src/index.js'

const migration=readFileSync(new URL('../worker/migrations/0001_init.sql',import.meta.url),'utf8')
test('D1 migration creates tables, demo catalog and stock reserve/return triggers',()=>{
 const db=new DatabaseSync(':memory:')
 db.exec('PRAGMA foreign_keys=ON;')
 db.exec(migration)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,4)
 db.prepare('UPDATE products SET price=490000,stock=3,published=1 WHERE id=?').run('demo-10')
 db.prepare('INSERT INTO orders(id,customer,phone,address,note,items,total) VALUES(?,?,?,?,?,?,?)')
   .run('ck1','Customer','0901234567','123 Test Street','','[]',980000)
 db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(?,?,?,?)')
   .run('ck1','demo-10',2,490000)
 assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('demo-10').stock,1)
 db.prepare('INSERT INTO inventory_returns(order_id) VALUES(?)').run('ck1')
 assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('demo-10').stock,3)
 assert.throws(()=>db.prepare('INSERT INTO inventory_returns(order_id) VALUES(?)').run('ck1'))
 assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('demo-10').stock,3)
 db.close()
})
test('D1 inventory trigger prevents overselling and pricing changes',()=>{
 const db=new DatabaseSync(':memory:')
 db.exec('PRAGMA foreign_keys=ON;'); db.exec(migration)
 db.prepare('UPDATE products SET price=99000,stock=1,published=1 WHERE id=?').run('demo-15')
 db.prepare('INSERT INTO orders(id,customer,phone,address,note,items,total) VALUES(?,?,?,?,?,?,?)')
   .run('ck2','Customer','0901234567','123 Test Street','','[]',198000)
 assert.throws(()=>db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(?,?,?,?)').run('ck2','demo-15',2,99000))
 assert.throws(()=>db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(?,?,?,?)').run('ck2','demo-15',1,49000))
 assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('demo-15').stock,1)
 db.close()
})
test('Worker exposes demo config to storefront but denies cross-origin mutation',async()=>{
 const env={DB:{},FRONTEND_ORIGIN:'https://cuktech.vn',STORE_DEMO:'1',STORE_READY:'0'}
 const ctx={waitUntil(){}}
 const ok=await worker.fetch(new Request('https://api.cuktech.vn/api/config',{headers:{Origin:'https://cuktech.vn'}}),env,ctx)
 assert.equal(ok.status,200)
 assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'https://cuktech.vn')
 const config=await ok.json()
 assert.equal(config.checkoutEnabled,false)
 const bad=await worker.fetch(new Request('https://api.cuktech.vn/api/orders',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),env,ctx)
 assert.equal(bad.status,403)
})
