import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {normalizeHandle,catalogIdentity,collectionProductCount,assertCatalogComplete,robotsAllows} from '../worker/src/catalog-core.js'
import {fetchCompleteCatalog,syncCatalog} from '../worker/src/sync.js'

const migration=readFileSync(new URL('../worker/migrations/0001_init.sql',import.meta.url),'utf8')
const allProducts=Array.from({length:40},(_,i)=>({
 id:i+1,
 handle:i<7?'奖项'+String(i+1).padStart(2,'0'):i===7?'ad1204u-红点':i===8?'ad1203p-红点':'cuktech-product-'+i,
 title:i<7?'奖项'+String(i+1).padStart(2,'0'):'CUKTECH Product '+i,
 images:[{src:'https://cdn.shopify.com/item-'+i+'.jpg'}],
 variants:[{id:i+100,sku:'SKU-'+i,price:'999.00',available:true}],
 body_html:'<p>Fast charger 100W</p>',
 updated_at:'2026-11-09T00:00:00+08:00'
}))
function fakeSource(products=allProducts,count=40){
 const hits=[]
 const fetchImpl=async url=>{
  const path=new URL(url).pathname+new URL(url).search;hits.push(path)
  let body='',status=200
  if(path==='/robots.txt')body='User-agent: *\nAllow: /\nDisallow: /admin'
  else if(path==='/products.json?limit=250&page=1')body=JSON.stringify({products})
  else if(path==='/collections/all')body='<div class="utility-bar__item">'+count+' products</div>'
  else status=404
  return new Response(body,{status})
 }
 return {fetchImpl,hits}
}
function fakeD1(){
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec('PRAGMA foreign_keys=ON;')
 sqlite.exec(migration)
 const DB={
  prepare(sql){
   return {
    sql,params:[],
    bind(...args){return {...this,params:args,bind:this.bind,run:this.run,first:this.first,all:this.all}},
    async run(){return sqlite.prepare(this.sql).run(...this.params)},
    async first(){return sqlite.prepare(this.sql).get(...this.params)||null},
    async all(){return {results:sqlite.prepare(this.sql).all(...this.params)}}
   }
  },
  async batch(statements){
   sqlite.exec('BEGIN IMMEDIATE')
   try{const rows=[];for(const q of statements)rows.push(await q.run());sqlite.exec('COMMIT');return rows}
   catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 }
 return {DB,sqlite}
}
test('Unicode handles are NOT collapsed, including Chinese awards',async()=>{
 const a=await catalogIdentity('奖项01'),b=await catalogIdentity('奖项02'),c=await catalogIdentity('ad1204u-红点')
 assert.equal(normalizeHandle('  奖项01 '),'奖项01')
 assert.notEqual(a.id,b.id)
 assert.notEqual(a.slug,b.slug)
 assert.equal(a.sourceId,'cuktech:奖项01')
 assert.equal(a.sourceUrl,'https://cuktech.com/products/%E5%A5%96%E9%A1%B901')
 assert.ok(c.slug.startsWith('imported-ad1204u-'))
 assert.notEqual(c.slug,(await catalogIdentity('ad1204u-黑点')).slug)
})
test('40 public items verified against collection count; 39 of 40 fails before import',async()=>{
 const {fetchImpl,hits}=fakeSource()
 const full=await fetchCompleteCatalog({fetchImpl,delay:async()=>{}})
 assert.equal(full.products.length,40);assert.equal(full.sourceCount,40);assert.equal(full.verified,true)
 assert.deepEqual(hits,['/robots.txt','/products.json?limit=250&page=1','/collections/all'])
 const tooFew=fakeSource(allProducts.slice(0,39),40)
 await assert.rejects(fetchCompleteCatalog({fetchImpl:tooFew.fetchImpl,delay:async()=>{}}),/CATALOG_COUNT_MISMATCH/)
})
test('robots permission and duplicate handle protection',()=>{
 assert.equal(robotsAllows('User-agent: *\nDisallow: /products.json\nAllow: /collections/all','/products.json?limit=250&page=1'),false)
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /products.json','/products.json?limit=250&page=1'),true)
 assert.equal(collectionProductCount('<div class="utility-bar__item">40 products</div>'),40)
 assert.throws(()=>assertCatalogComplete([...allProducts,allProducts[0]],41),/Duplicate handle/)
})
test('40 products imported to D1 with unique source keys, and local prices persist after resync',async()=>{
 const {DB,sqlite}=fakeD1()
 const source=fakeSource()
 const env={DB}
 const result=await syncCatalog(env,{fetchImpl:source.fetchImpl,delay:async()=>{}})
 assert.equal(result.fetched,40)
 assert.equal(result.stored,40)
 assert.equal(result.drafts,40)
 assert.equal(result.visible,0)
 const unicode=sqlite.prepare("SELECT * FROM products WHERE source_id='cuktech:奖项01'").get()
 assert.ok(unicode);assert.equal(unicode.price,0);assert.equal(unicode.stock,0);assert.equal(unicode.published,0)
 assert.equal(JSON.parse(unicode.source_images).length,1)
 sqlite.prepare("UPDATE products SET price=490000,stock=15,published=1,media_approved=1 WHERE source_id='cuktech:奖项01'").run()
 const again=await syncCatalog(env,{fetchImpl:source.fetchImpl,delay:async()=>{}})
 assert.equal(again.fetched,40)
 assert.equal(again.visible,1)
 assert.equal(again.drafts,39)
 const after=sqlite.prepare("SELECT price,stock,published,media_approved FROM products WHERE source_id='cuktech:奖项01'").get()
 assert.deepEqual(after,{price:490000,stock:15,published:1,media_approved:1})
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE source_id LIKE 'cuktech:%'").get().n,40)
 sqlite.close()
})
test('partial 39/40 import does not insert anything in D1',async()=>{
 const {DB,sqlite}=fakeD1()
 await assert.rejects(syncCatalog({DB},{fetchImpl:fakeSource(allProducts.slice(0,39),40).fetchImpl,delay:async()=>{}}),/CATALOG_COUNT_MISMATCH/)
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE source_id LIKE 'cuktech:%'").get().n,0)
 assert.equal(sqlite.prepare("SELECT status FROM catalog_sync_runs ORDER BY id DESC LIMIT 1").get().status,'failed')
 sqlite.close()
})
