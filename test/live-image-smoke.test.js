import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectPublicSite} from '../scripts/check-live-site.js'
const media='media/products/'+'e'.repeat(32)+'.webp'
const manifest={verified:true,sourceCount:2,mediaAudit:{coveredProducts:2},products:[
 {slug:'pb200',image_url:media},{slug:'p23',image_url:media}
]}
const goodWebp=()=>{
 const data=new Uint8Array(128)
 data.set([82,73,70,70],0) // RIFF
 data.set([87,69,66,80],8) // WEBP
 return data
}
function fetchFor({release='abc',photoStatus=200,photoData=goodWebp(),mime='image/webp'}={}){
 return async url=>{
  if(url.endsWith('build.json'))return Response.json({commit:release})
  if(url.endsWith('catalog.snapshot.json'))return Response.json(manifest)
  if(url==='https://cuktech.vn/')return new Response('<div id="root"></div>')
  if(url.endsWith(media))return new Response(photoData,{status:photoStatus,headers:{'content-type':mime}})
  throw new Error('Unrecognized URL '+url)
 }
}
test('Deployed website smoke checker validates release, source count and real WebP bytes from custom domain',async()=>{
 const result=await inspectPublicSite({fetchImpl:fetchFor(),sha:'abc'})
 assert.equal(result.site,'https://cuktech.vn/')
 assert.equal(result.sourceCount,2)
 assert.equal(result.verifiedProductCovers,2)
 assert.equal(result.sampledWebPImages,1)
})
test('A stale custom domain build cannot silently pass photo QA',async()=>{
 await assert.rejects(inspectPublicSite({fetchImpl:fetchFor({release:'older'}),sha:'abc'}),/STALE_CDN_RELEASE/)
})
test('A 404 or HTML pretending to be an image cannot pass photo QA',async()=>{
 await assert.rejects(inspectPublicSite({fetchImpl:fetchFor({photoStatus:404}),sha:'abc'}),/HTTP 404/)
 await assert.rejects(inspectPublicSite({fetchImpl:fetchFor({mime:'text\/html'}),sha:'abc'}),/Bad image MIME/)
 await assert.rejects(inspectPublicSite({fetchImpl:fetchFor({photoData:new Uint8Array(128)}),sha:'abc'}),/Invalid WebP/)
})
