import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import sharp from 'sharp'
import {allowedCatalogImage,localImagePath,mirrorShopifyCatalog} from '../scripts/mirror-shopify-photos.js'
import {productPhotos,pickHomepageProducts} from '../src/home-products.js'

const img1='https://cdn.shopify.com/s/files/1/cuktech-20-front.jpg?v=1'
const img2='https://cdn.shopify.com/s/files/1/cuktech-20-back.webp?v=2'
const fakeProduct=(i,urls=[img1,img2])=>({
 id:'p-'+i,slug:'cuktech-'+i,name:'CUKTECH '+i,source_market:'global',
 category:i%2?'powerbank':'charger',image_url:urls[0]||'',
 source_images:JSON.stringify(urls),price:0,stock:0
})
const image=await sharp({create:{width:240,height:240,channels:3,background:'#eeeeee'}}).png().toBuffer()
const validResponse=()=>new Response(image,{status:200,headers:{'content-type':'image/png'}})
async function withCatalog(products,fn){
 const root=await mkdtemp(join(tmpdir(),'cuktech-shopify-photos-'))
 const catalog=join(root,'catalog.snapshot.json')
 await writeFile(catalog,JSON.stringify({verified:true,sourceCount:products.length,products}))
 try{return await fn({root,catalog})}
 finally{await rm(root,{recursive:true,force:true})}
}
test('Allow only actual public CUKTECH/Shopify HTTPS product photos',()=>{
 assert.equal(allowedCatalogImage(img1),true)
 assert.equal(allowedCatalogImage('https://cuktech.com/cdn/shop/files/official.avif?v=3'),true)
 assert.equal(allowedCatalogImage('http://cdn.shopify.com/s/file.jpg'),false)
 assert.equal(allowedCatalogImage('https://other.example.com/s/file.jpg'),false)
 assert.equal(allowedCatalogImage('https://cdn.shopify.com/s/logo.svg'),false)
 assert.match(localImagePath(img1),/^media\/products\/[a-f0-9]{32}\.webp$/)
})
test('Every Shopify product gets a real first-party WebP source, and homepage uses it',async()=>{
 const products=Array.from({length:40},(_,i)=>fakeProduct(i))
 await withCatalog(products,async({root,catalog})=>{
  let downloads=0
  const result=await mirrorShopifyCatalog({inputPath:catalog,outputDir:root,cacheDir:join(root,'cache'),
   fetchImpl:async()=>{downloads++;return validResponse()},delay:async()=>{},concurrency:3})
  assert.equal(result.coveredProducts,40)
  assert.equal(result.requestedImages,2)
  assert.equal(result.cachedImages,2)
  assert.equal(result.failedImages,0)
  assert.equal(downloads,2)
  const snapshot=JSON.parse(await readFile(catalog,'utf8'))
  assert.equal(snapshot.mediaAudit.coveredProducts,40)
  assert.equal(snapshot.productsWithImages,40)
  assert.equal(snapshot.products[0].image_url,localImagePath(img1))
  assert.deepEqual(JSON.parse(snapshot.products[0].source_images),[localImagePath(img1),localImagePath(img2)])
  assert.equal(snapshot.products[0].original_image_url,img1)
  assert.deepEqual(productPhotos(snapshot.products[0]),[localImagePath(img1),localImagePath(img2)])
  assert.equal(pickHomepageProducts(snapshot.products).hero.image_url,localImagePath(img1))
  const m=await sharp(join(root,localImagePath(img1))).metadata()
  assert.equal(m.format,'webp')
  assert.equal(m.width,240)
  assert.ok((await stat(join(root,localImagePath(img1)))).size>80)
 })
})
test('If Shopify primary photo fails with 404, an independently verified alternate from same product becomes cover',async()=>{
 await withCatalog([fakeProduct(1)],async({root,catalog})=>{
  const result=await mirrorShopifyCatalog({
   inputPath:catalog,outputDir:root,cacheDir:join(root,'cache'),
   fetchImpl:async url=>url===img1?new Response('not found',{status:404}):validResponse(),
   delay:async()=>{},concurrency:1
  })
  assert.equal(result.coveredProducts,1)
  assert.equal(result.cachedImages,1)
  assert.equal(result.failedImages,1)
  const p=JSON.parse(await readFile(catalog,'utf8')).products[0]
  assert.equal(p.image_url,localImagePath(img2))
  assert.deepEqual(JSON.parse(p.source_images),[localImagePath(img2)])
 })
})
test('Never bypass source access denied: abort mirror and do not rewrite original catalog',async()=>{
 await withCatalog([fakeProduct(1)],async({root,catalog})=>{
  await assert.rejects(mirrorShopifyCatalog({
   inputPath:catalog,outputDir:root,cacheDir:join(root,'cache'),
   fetchImpl:async()=>new Response('Access Denied',{status:403}),
   delay:async()=>{},concurrency:1
  }),/Photo host denied downloads/)
  const p=JSON.parse(await readFile(catalog,'utf8')).products[0]
  assert.equal(p.image_url,img1)
 })
})
