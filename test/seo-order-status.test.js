import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSitemap, buildRobotsTxt, renderSeoHtml } from '../server/seo.js'
import { canTransitionOrder } from '../server/order-status.js'

test('demo store is never indexed and sitemap has no fake products', () => {
 assert.match(buildRobotsTxt({ready:false}), /Disallow: \//)
 assert.doesNotMatch(buildSitemap([{slug:'demo',published:1,price:900,stock:1}],{ready:false}), /demo/)
 const html=renderSeoHtml('<html><head><title>Old</title><meta name="description" content="old"></head></html>',{ready:false})
 assert.match(html,/noindex,nofollow/)
 assert.doesNotMatch(html,/application\/ld\+json/)
})
test('sitemap includes approved published goods, excluding draft and unapproved source media',()=>{
 const products=[
  {slug:'approved-source',price:390000,published:1,source_id:'cuktech:a',media_approved:1},
  {slug:'not-approved',price:100000,published:1,source_id:'cuktech:b',media_approved:0},
  {slug:'hidden',price:100000,published:0},
  {slug:'own-product',price:200000,published:1,source_id:''}
 ]
 const xml=buildSitemap(products,{ready:true,origin:'https://cuktech.vn'})
 assert.match(xml,/\/product\/approved-source/)
 assert.match(xml,/\/product\/own-product/)
 assert.doesNotMatch(xml,/\/product\/not-approved/)
 assert.doesNotMatch(xml,/\/product\/hidden/)
 assert.match(buildRobotsTxt({ready:true}),/Sitemap: https:\/\/cuktech.vn\/sitemap.xml/)
})
test('product metadata properly escapes markup and emits VND structured data only when live',()=>{
 const product={slug:'safe',name:'CUKTECH <test>',description:'Output "test" & durable',price:100000,stock:2,image_url:'https://example.com/a.jpg'}
 const html=renderSeoHtml('<head><title>Default</title></head>',{product,path:'/product/safe',ready:true})
 assert.match(html,/CUKTECH &lt;test&gt;/)
 assert.match(html,/application\/ld\+json/)
 assert.match(html,/"priceCurrency":"VND"/)
 assert.match(html,/\\u003ctest>/)
 assert.doesNotMatch(html,/<test>/)
})
test('completed/cancelled orders cannot be reopened',()=>{
 assert.equal(canTransitionOrder('new','cancelled'),true)
 assert.equal(canTransitionOrder('confirmed','shipping'),true)
 assert.equal(canTransitionOrder('shipping','completed'),true)
 assert.equal(canTransitionOrder('completed','cancelled'),false)
 assert.equal(canTransitionOrder('cancelled','new'),false)
 assert.equal(canTransitionOrder('new','completed'),false)
})
