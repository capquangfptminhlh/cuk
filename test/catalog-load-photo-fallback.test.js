import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 staticAssetUrl,safePhotoUrl,photoCandidates,checkedSnapshot,loadStaticCatalog
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
test('Image candidates start with local WebP and fall back only to same SKU original Shopify URL',()=>{
 const list=photoCandidates(product,'https://cuktech.vn/')
 assert.deepEqual(list,['https://cuktech.vn/'+local,cdn])
 assert.deepEqual(photoCandidates({...product,source_images:'corrupt'} ,'https://cuktech.vn/'),list)
 assert.deepEqual(photoCandidates({...product,original_image_url:'https://evil.example/123.jpg'} ,'https://cuktech.vn/'),['https://cuktech.vn/'+local,cdn])
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
