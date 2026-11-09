import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { CheckoutError, placeOrder } from '../server/checkout.js'

function fixture() {
  const db=new DatabaseSync(':memory:')
  db.exec([
    'CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,price INTEGER,stock INTEGER,published INTEGER,source_id TEXT DEFAULT "",media_approved INTEGER DEFAULT 0)',
    'CREATE TABLE orders(id TEXT PRIMARY KEY,customer TEXT,phone TEXT,address TEXT,note TEXT,items TEXT,total INTEGER)',
    'CREATE TABLE checkout_requests(request_key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,order_id TEXT NOT NULL)'
  ].join(';')+';')
  db.prepare('INSERT INTO products(id,name,price,stock,published,source_id,media_approved) VALUES (?,?,?,?,?,?,?)')
    .run('item-1','CUKTECH Power Bank',490000,3,1,'',0)
  return db
}
const body={customer:'Nguyen Van A',phone:'0901234567',address:'123 Nguyen Van A, Quan 1, HCMC',items:[{id:'item-1',qty:2}]}
test('checkout validates customer data and requires valid quantities',()=>{
 const db=fixture()
 assert.throws(()=>placeOrder(db,{...body,phone:'invalid'},'',()=> 'CK1'),CheckoutError)
 assert.throws(()=>placeOrder(db,{...body,items:[{id:'item-1',qty:-1}]},'',()=> 'CK1'),CheckoutError)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0)
 db.close()
})
test('double submit with same key returns the same order and reserves inventory once',()=>{
 const db=fixture()
 const key='ck-example-transaction-0001'
 const first=placeOrder(db,body,key,()=> 'CK1')
 const replay=placeOrder(db,body,key,()=> 'CK2')
 assert.equal(first.id,'CK1')
 assert.equal(first.replayed,false)
 assert.equal(replay.id,'CK1')
 assert.equal(replay.replayed,true)
 assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('item-1').stock,1)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1)
 db.close()
})
test('changed order under same key is rejected and stock remains intact',()=>{
 const db=fixture(),key='ck-example-transaction-0002'
 placeOrder(db,body,key,()=> 'CK1')
 assert.throws(()=>placeOrder(db,{...body,items:[{id:'item-1',qty:1}]},key,()=> 'CK2'),e=>e instanceof CheckoutError&&e.status===409)
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,1)
 assert.throws(()=>placeOrder(db,body,'ck-example-transaction-0003',()=> 'CK2'),e=>e.status===409)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1)
 db.close()
})
test('imported product without media approval cannot be ordered even if accidentally published',()=>{
 const db=fixture()
 db.prepare('UPDATE products SET source_id=?,media_approved=?,published=? WHERE id=?').run('cuktech:a',0,1,'item-1')
 assert.throws(()=>placeOrder(db,body,'ck-example-transaction-0004',()=> 'CK1'),e=>e.status===409)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0)
 db.close()
})
