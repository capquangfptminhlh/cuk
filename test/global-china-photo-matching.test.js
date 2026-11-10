import test from 'node:test'
import assert from 'node:assert/strict'
import {sourceModelCodes,previewFromCatalog} from '../scripts/build-catalog-preview.js'
import {reconcileGlobalPhotos} from '../scripts/match-global-photos.js'

const realGlobal=(model,id='global-'+model)=>({
 id,name:'CUKTECH '+model+' Power Bank',category:'powerbank',
 source_model_codes:[model],source_site:'https://cuktech.com/products/'+model.toLowerCase(),
 image_url:'https://cdn.shopify.com/s/files/1/'+id+'.jpg?v=1',
 source_images:JSON.stringify(['https://cdn.shopify.com/s/files/1/'+id+'.jpg?v=1','https://cdn.shopify.com/s/files/1/'+id+'-detail.webp?v=2'])
})
const manufacturer=(code)=>({
 id:'china-'+code.toLowerCase(),slug:'cn-'+code.toLowerCase(),
 name:'CUKTECH '+code,category:'powerbank',source_market:'china',
 source_site:'https://www.cuktech.com.cn/products/'+code.toLowerCase()+'.html',
 source_images:'["https://www.cuktech.com.cn/uploads/image/real-source.webp"]',
 image_url:'https://www.cuktech.com.cn/uploads/image/real-source.webp',
 media_delivery:'external-source-unverified'
})
test('International Shopify importer extracts only explicit models from handle and manufacturer specification',()=>{
 assert.deepEqual(sourceModelCodes({
  handle:'p23-cuktech-p-series-25000mah-210w-power-bank',
  title:'CUKTECH 20 Power Bank 25000mAh 210W',
  body_html:'<div>Model:&nbsp;P23</div>'
 }),['p23'])
 assert.deepEqual(sourceModelCodes({
  handle:'cuktech-10-mini-power-bank',
  title:'CUKTECH 10 Mini Power Bank',
  variants:[{sku:'PB1055'}]
 }),['pb1055'])
 assert.deepEqual(sourceModelCodes({
  handle:'post10',title:'AD1203P-红点',variants:[{sku:'AD1203P'}]
 }),[])
 assert.deepEqual(sourceModelCodes({
  handle:'post12',title:'AD1204U-IDEA',variants:[{sku:'AD1204U'}]
 }),[])
})
test('Source import includes real Shopify photos, exact SKU provenance and keeps no fake stock',async()=>{
 const row=(await previewFromCatalog([{
  handle:'p23-something',title:'CUKTECH P23 Power Bank',variants:[{sku:'P23'}],
  images:[{src:'https://cdn.shopify.com/example.webp'}]
 }]))[0]
 assert.deepEqual(row.source_model_codes,['p23'])
 assert.equal(row.image_url,'https://cdn.shopify.com/example.webp')
 assert.equal(row.price,0)
 assert.equal(row.stock,0)
 assert.equal(row.source_site,'https://cuktech.com/products/p23-something')
})
test('Exactly one matching manufacturer SKU reuses Shopify image gallery and preserves manufacturer provenance',()=>{
 const global=[realGlobal('P23')]
 const china=[manufacturer('p23'),manufacturer('pb1055')]
 const result=reconcileGlobalPhotos(global,china)
 assert.equal(result.matchedModels,1)
 assert.equal(result.unmatchedModels,1)
 const matched=result.products[0]
 assert.equal(matched.image_url,global[0].image_url)
 assert.deepEqual(JSON.parse(matched.source_images),JSON.parse(global[0].source_images))
 assert.equal(matched.photo_match_method,'unique-explicit-model-code')
 assert.equal(matched.photo_source_site,global[0].source_site)
 assert.equal(matched.media_delivery,'global-shopify-exact-model')
 assert.equal(matched.media_verified,false)
 assert.equal(matched.source_site,china[0].source_site)
 assert.equal(matched.official_china_images,china[0].source_images)
 assert.equal(result.products[1],china[1])
})
test('Do not attach false imagery to SKU with ambiguous global matches or inconsistent product category',()=>{
 const globals=[realGlobal('PB1055','g1'),realGlobal('PB1055','g2')]
 const one=reconcileGlobalPhotos(globals,[manufacturer('pb1055')])
 assert.equal(one.matchedModels,0)
 const other=reconcileGlobalPhotos([{...realGlobal('P23'),category:'charger'}],[manufacturer('p23')])
 assert.equal(other.matchedModels,0)
})
test('Do not copy untrusted URLs or infer image match from similar-looking model names',()=>{
 const p=realGlobal('P23')
 const noPhotos={...p,source_images:'["https://evil.example/photo.jpg"]',image_url:'https://evil.example/photo.jpg'}
 assert.equal(reconcileGlobalPhotos([noPhotos],[manufacturer('p23')]).matchedModels,0)
 assert.equal(reconcileGlobalPhotos([p],[manufacturer('p230')]).matchedModels,0)
 assert.equal(reconcileGlobalPhotos([p],[manufacturer('pb1055')]).matchedModels,0)
})
test('A verified first-party photo album is not replaced by Shopify images',()=>{
 const p={...manufacturer('p23'),media_delivery:'optimized-first-party-webp',image_url:'media/cn/model.webp'}
 const r=reconcileGlobalPhotos([realGlobal('P23')],[p])
 assert.equal(r.matchedModels,0)
 assert.equal(r.products[0].image_url,'media/cn/model.webp')
})
