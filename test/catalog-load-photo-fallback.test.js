import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 staticAssetUrl,safePhotoUrl,photoCandidates,checkedSnapshot,loadStaticCatalog,retriedPhotoUrl
} from '../src/catalog-assets.js'

const HASH='abcdef0123456789abcdef0123456789'
const local='media/products/'+HASH+'.webp'
const cdn='https://cdn.shopify.com/s/files/1/cuktech-original.jpg?v=4'
const product={
 id:'p23',slug:'p23',name:'CUKTECH P23',
 image_url:local,source_images:JSON.stringify([local]),
 original_image_url:cdn,original_source_images:JSON.stringify([cdn])
}
const snapshot={verified:true,sourceCount:1,products:[product]}

test('Photo URL is root-safe on the custom domain and repository-safe on the GitHub preview',()=>{
 const root='https://cuktech.vn/'
 const repo='https://capquangfptminhlh.github.io/cuk/'
 assert.equal(staticAssetUrl(local,root),'https://cuktech.vn/'+local)
 assert.equal(staticAssetUrl(local,repo),'https://capquangfptminhlh.github.io/cuk/'+local)
 assert.equal(staticAssetUrl('catalog.snapshot.json',root),'https://cuktech.vn/catalog.snapshot.json')
 assert.equal(staticAssetUrl('catalog.snapshot.json',repo),'https://capquangfptminhlh.github.io/cuk/catalog.snapshot.json')
 assert.equal(safePhotoUrl(local,repo),'https://capquangfptminhlh.github.io/cuk/'+local)
 assert.equal(safePhotoUrl(cdn,repo),cdn)
 assert.equal(safePhotoUrl('javascript:alert(1)',root),null)
 assert.equal(safePhotoUrl('https://evil.example/test.webp',root),null)
 assert.throws(()=>staticAssetUrl('../../admin',root))
})
test('A mirrored local gallery excludes duplicate original Shopify CDN links',()=>{
 const list=photoCandidates(product,'https://cuktech.vn/')
 assert.deepEqual(list,['https://cuktech.vn/'+local])
 assert.deepEqual(photoCandidates({...product,source_images:'corrupt'} ,'https://cuktech.vn/'),list)
 assert.deepEqual(photoCandidates({...product,original_image_url:'https://evil.example/123.jpg'} ,'https://cuktech.vn/'),list)
 // Unmirrored legacy source snapshots can still display their real CDN photos.
 assert.deepEqual(photoCandidates({...product,image_url:'',source_images:'[]',original_image_url:''},'https://cuktech.vn/'),[cdn])
})
test('Static storefront loads source catalog without waiting for any offline API endpoint',async()=>{
 let called=[]
 const fetchImpl=async(url,opts)=>{
  called.push(url)
  assert.equal(opts.cache,'no-store')
  return new Response(JSON.stringify(snapshot),{status:200,headers:{'content-type':'application/json'}})
 }
 const data=await loadStaticCatalog({fetchImpl,base:'https://cuktech.vn/'})
 assert.equal(called.length,1)
 assert.deepEqual(called,['https://cuktech.vn/catalog.snapshot.json'])
 assert.equal(data[0].source_market,'global')
 assert.equal(data[0].image_url,local)
 const src=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
 const reload=src.slice(src.indexOf('const reload=async()=>{'),src.indexOf(' useEffect(()=>{',src.indexOf('const reload=async()=>{')))
 assert.doesNotMatch(reload,/Promise\.allSettled\(/)
 assert.doesNotMatch(reload,/api\('/)
 assert.match(src,/api\('\/api\/config',\{signal:AbortSignal\.timeout\(2500\)\}\)/)
})
test('Incomplete or invalid source is rejected instead of fabricating placeholder products',()=>{
 assert.throws(()=>checkedSnapshot({verified:true,sourceCount:2,products:[product]}),/missing or incomplete/)
 assert.throws(()=>checkedSnapshot({verified:false,sourceCount:1,products:[product]}),/missing or incomplete/)
 assert.throws(()=>checkedSnapshot({verified:true,sourceCount:2,products:[product,product]}),/missing or incomplete/)
})

test('11 verified local product photos are 11 gallery entries, not 22 repeated with Shopify originals',()=>{
 const photos=Array.from({length:11},(_,i)=>'media/products/'+i.toString(16).padStart(32,'0')+'.webp')
 const originals=Array.from({length:11},(_,i)=>'https://cdn.shopify.com/s/files/'+i+'.jpg?v=11')
 const preview='https://capquangfptminhlh.github.io/cuk/'
 const p={
  image_url:photos[0],source_images:JSON.stringify(photos),
  original_image_url:originals[0],original_source_images:JSON.stringify(originals)
 }
 const result=photoCandidates(p,preview)
 assert.equal(result.length,11)
 assert.deepEqual(result,photos.map(photo=>new URL(photo,preview).href))
 assert.ok(result.every(src=>src.startsWith(preview+'media/products/')))
})

test('Retrying a genuine photo makes exactly one fresh HTTPS request without changing product identity',()=>{
 const localImage=staticAssetUrl(local,'https://cuktech.vn/')
 const retry=retriedPhotoUrl(localImage,1)
 assert.equal(retry,localImage+'?cuktech_photo_retry=1')
 assert.equal(retriedPhotoUrl(localImage,0),localImage)
 assert.equal(retriedPhotoUrl(cdn,1),cdn+'&cuktech_photo_retry=1')
 assert.throws(()=>retriedPhotoUrl('javascript:alert(1)',1),/HTTPS/)
})
