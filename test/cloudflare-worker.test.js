import test from 'node:test'
import assert from 'node:assert/strict'
import { canCheckout, approvedProduct, publicProduct, normalizeOrder, transitionAllowed,originAllowed,csvCell } from '../worker/src/helpers.js'

test('Cloudflare checkout is disabled by default and only opens with two explicit flags',()=>{
 assert.equal(canCheckout({}),false)
 assert.equal(canCheckout({STORE_DEMO:'0',STORE_READY:'1'}),true)
})
test('Cloudflare worker order form rejects duplicates and bad phone',()=>{
 const valid={customer:'Nguyen Van A',phone:'0901234567',address:'123 Duong ABC, Ho Chi Minh City',items:[{id:'a',qty:2}]}
 assert.ok(normalizeOrder(valid))
 assert.equal(normalizeOrder({...valid,phone:'invalid'}),null)
 assert.equal(normalizeOrder({...valid,items:[{id:'a',qty:2},{id:'a',qty:1}]}),null)
})
test('Worker filters unapproved source media and source metadata',()=>{
 const p={source_id:'cuktech:example',image_url:'https://cdn.shopify.com/a.jpg',source_images:'["https://cdn.shopify.com/a.jpg"]',media_approved:0,source_url:'https://cuktech.com/products/a'}
 assert.equal(approvedProduct(p),false)
 const pub=publicProduct(p)
 assert.equal(pub.image_url,'')
 assert.equal(pub.source_images,'[]')
 assert.equal(pub.source_url,undefined)
})
test('Orders cannot be reopened after completion/cancellation',()=>{
 assert.equal(transitionAllowed('new','confirmed'),true)
 assert.equal(transitionAllowed('completed','cancelled'),false)
 assert.equal(transitionAllowed('cancelled','shipping'),false)
})
test('Only the real storefront origin is allowed for cookies/CORS',()=>{
 assert.equal(originAllowed('https://cuktech.vn'),true)
 assert.equal(originAllowed('https://malicious.example'),false)
})
test('CSV output protects spreadsheet cells',()=>{assert.match(csvCell('=HYPERLINK("x")'),/^"'/)})
