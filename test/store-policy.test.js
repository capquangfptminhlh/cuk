import test from 'node:test'
import assert from 'node:assert/strict'
import { isDemoMode, isCheckoutEnabled, publicProduct, validateAdminProductUpdate } from '../server/store-policy.js'

test('production checkout needs two explicit flags', () => {
  assert.equal(isDemoMode({}), true)
  assert.equal(isCheckoutEnabled({}), false)
  assert.equal(isCheckoutEnabled({STORE_READY:'1'}), false)
  assert.equal(isCheckoutEnabled({STORE_DEMO:'0'}), false)
  assert.equal(isCheckoutEnabled({STORE_DEMO:'0',STORE_READY:'1'}), true)
})
test('does not leak third-party product images or source metadata without rights confirmation', () => {
  const original={id:'abc',source_id:'cuktech:abc',source_url:'https://cuktech.com/products/abc',image_url:'https://cdn.shopify.com/product.jpg',source_images:'["https://cdn.shopify.com/product.jpg"]',media_approved:0,name:'Sample'}
  const result=publicProduct(original)
  assert.equal(result.image_url, '')
  assert.equal(result.source_images, '[]')
  assert.equal(result.source_url, undefined)
  assert.equal(original.image_url, 'https://cdn.shopify.com/product.jpg')
  assert.equal(publicProduct({...original,media_approved:1}).image_url, original.image_url)
})
test('cannot publish an imported product without price and media confirmation',()=>{
 const p={source_id:'cuktech:a',image_url:'https://cdn.shopify.com/a.jpg',media_approved:0,price:0,published:0}
 assert.match(validateAdminProductUpdate(p,{published:1}), /quyền sử dụng ảnh/)
 assert.match(validateAdminProductUpdate(p,{published:1,media_approved:1}), /giá VND/)
 assert.equal(validateAdminProductUpdate(p,{published:1,media_approved:1,price:320000}),null)
 assert.equal(validateAdminProductUpdate(p,{price:320000}),null)
})
