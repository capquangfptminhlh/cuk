import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sharp from 'sharp'
import {mediaSourceAllowed,mediaPath,cacheChinaMedia} from '../scripts/cache-china-media.js'

const IMAGE='https://www.cuktech.com.cn/uploads/image/20260812/official.webp'
test('Reject off-domain and insecure image sources',()=>{
 assert.equal(mediaSourceAllowed(IMAGE),true)
 assert.equal(mediaSourceAllowed('https://other.com/image.webp'),false)
 assert.equal(mediaSourceAllowed('http://www.cuktech.com.cn/uploads/image/a.webp'),false)
 assert.equal(mediaSourceAllowed('https://www.cuktech.com.cn/admin/a.webp'),false)
 assert.match(mediaPath(IMAGE),/^media\/cn\/[a-f0-9]{32}\.webp$/)
})
test('Mirroring creates valid static WebP files and rewrites all 40 source products',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cuktech-media-test-'))
 try{
  const image=await sharp({create:{width:80,height:80,channels:3,background:{r:200,g:30,b:20}}}).webp().toBuffer()
  const data={discovered:40,products:Array.from({length:40},(_,i)=>({
   id:'cn-'+i,slug:'cn-model-'+i,
   image_url:IMAGE,source_images:JSON.stringify([IMAGE,IMAGE])
  }))}
  const filename=join(dir,'catalog.china.json')
  await writeFile(filename,JSON.stringify(data))
  let downloads=0
  const fake=async url=>{assert.equal(url,IMAGE);downloads++;return new Response(image,{status:200,headers:{'content-type':'image/webp'}})}
  const result=await cacheChinaMedia({
   inputPath:filename,outputDir:dir,cacheDir:join(dir,'cache'),fetchImpl:fake,concurrency:3
  })
  assert.equal(result.records,40)
  assert.equal(result.sourceImages,1)
  assert.equal(result.cached,1)
  assert.equal(result.failed,0)
  assert.equal(downloads,1)
  const cached=JSON.parse(await readFile(filename,'utf8'))
  assert.equal(cached.cachedImages,1)
  assert.equal(cached.mediaDelivery,'optimized-first-party-webp')
  assert.equal(cached.products[0].image_url,mediaPath(IMAGE))
  assert.deepEqual(JSON.parse(cached.products[0].source_images),[mediaPath(IMAGE),mediaPath(IMAGE)])
  const dst=join(dir,mediaPath(IMAGE))
  const m=await sharp(dst).metadata()
  assert.equal(m.format,'webp')
  assert.equal(m.width,80)
  assert.ok((await stat(dst)).size>80)
 } finally {await rm(dir,{recursive:true,force:true})}
})
