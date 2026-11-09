import test from 'node:test'
import assert from 'node:assert/strict'
import {previewFromCatalog,buildSnapshot,sourceImages} from '../scripts/build-catalog-preview.js'

const products=[
 {handle:'奖项01',title:'奖项01',body_html:'<p>Text copied from third party</p>',images:[{src:'https://cdn.shopify.com/abc.jpg'}]},
 {handle:'奖项02',title:'奖项02',images:[{src:'https://cdn.shopify.com/def.jpg'}]},
 {handle:'a15c-cuktech-67w-gan-charger-2c1a',title:'CUKTECH 67W GaN Charger 2C1A',images:[]}
]
function fakePublic(items,count){
 return async url=>{
  const path=new URL(url).pathname+new URL(url).search
  let content='',status=200
  if(path==='/robots.txt')content='User-agent: *\nAllow: /'
  else if(path==='/products.json?limit=250&page=1')content=JSON.stringify({products:items})
  else if(path==='/collections/all')content='<div class="utility-bar__item">'+count+' products</div>'
  else status=404
  return new Response(content,{status})
 }
}
test('Static preview includes authentic image galleries but never invents price or stock',async()=>{
 const rows=await previewFromCatalog(products)
 assert.equal(rows.length,3)
 assert.equal(new Set(rows.map(p=>p.slug)).size,3)
 assert.ok(rows.every(p=>p.price===0&&p.stock===0))
 assert.equal(rows[0].image_url,'https://cdn.shopify.com/abc.jpg')
 assert.equal(rows[1].image_url,'https://cdn.shopify.com/def.jpg')
 assert.deepEqual(JSON.parse(rows[0].source_images),['https://cdn.shopify.com/abc.jpg'])
 assert.equal(rows[2].image_url,'')
 assert.equal(rows[2].source_images,'[]')
 assert.ok(rows.every(p=>!p.description.includes('Text copied')))
})
test('Verified static snapshot has all expected public items',async()=>{
 const data=await buildSnapshot({fetchImpl:fakePublic(products,3),delay:async()=>{}})
 assert.equal(data.verified,true)
 assert.equal(data.sourceCount,3)
 assert.equal(data.products.length,3)
 assert.equal(data.productsWithImages,2)
 assert.equal(data.totalImages,2)
})
test('Partial source fails and no incomplete snapshot can be emitted',async()=>{
 await assert.rejects(buildSnapshot({fetchImpl:fakePublic(products.slice(0,2),3),delay:async()=>{}}),/CATALOG_COUNT_MISMATCH/)
})

test('Real-source image collector includes whole gallery, de-duplicates, blocks untrusted hosts',()=>{
 const images=sourceImages({
  image:{src:'https://cdn.shopify.com/s/files/a.jpg?v=1'},
  images:[
   {src:'https://cdn.shopify.com/s/files/a.jpg?v=1'},
   {src:'//cdn.shopify.com/s/files/b.png?v=2'},
   {src:'https://cuktech.com/cdn/shop/files/c.webp'},
   {src:'https://untrusted.example/track.jpg'},
   {src:'http://cdn.shopify.com/unsecured.png'},
   {src:'javascript:alert(1)'}
  ],
  variants:[{featured_image:{src:'https://cdn.shopify.com/s/files/d.avif'}}]
 })
 assert.deepEqual(images,[
  'https://cdn.shopify.com/s/files/a.jpg?v=1',
  'https://cdn.shopify.com/s/files/b.png?v=2',
  'https://cuktech.com/cdn/shop/files/c.webp',
  'https://cdn.shopify.com/s/files/d.avif'
 ])
})
