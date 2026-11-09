import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { robotsAllows, fetchPublicCatalog, importCatalog, CrawlError } from '../server/catalog-sync.js'
const record = (i) => ({ id: i, handle: `cuktech-model-${i}`, title: `CUKTECH Model ${i} Power Bank`, body_html: '<p>Power bank 20,000mAh with 100W output</p>', images: [{ src: `https://cdn.shopify.com/p${i}.jpg` }], variants: [{ id: i, sku:`M-${i}`, title: 'Black', available: true, price: '999.00' }], updated_at: '2026-11-09T00:00:00Z' })
function fake(responses) {
 const calls = []
 const fn = async url => {const path = new URL(url).pathname + new URL(url).search; calls.push(path);const content = responses[path];return { url, ok: content !== undefined, status: content===undefined ? 404:200, text: async()=>typeof content==='string'?content:JSON.stringify(content) } }
 return { fn, calls }
}
function makeDatabase() {
 const db = new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL DEFAULT 0,old_price INTEGER NOT NULL DEFAULT 0,stock INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL DEFAULT '',art TEXT NOT NULL DEFAULT 'powerbank',featured INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 1,capacity TEXT NOT NULL DEFAULT '',wattage TEXT NOT NULL DEFAULT '',source_id TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',source_title TEXT NOT NULL DEFAULT '',source_description TEXT NOT NULL DEFAULT '',source_tags TEXT NOT NULL DEFAULT '',source_images TEXT NOT NULL DEFAULT '[]',source_variants TEXT NOT NULL DEFAULT '[]',source_updated_at TEXT NOT NULL DEFAULT '',source_synced_at TEXT NOT NULL DEFAULT '',source_status TEXT NOT NULL DEFAULT '',image_url TEXT NOT NULL DEFAULT '')`)
 return db
}
test('robots.txt respects most specific allow/disallow and groups',()=>{
 const rules = 'User-agent: *\nDisallow: /private\nDisallow: /products.json\nAllow: /products.json?limit=250\nUser-agent: OtherBot\nDisallow: /'
 assert.equal(robotsAllows(rules,'/private/details'),false)
 assert.equal(robotsAllows(rules,'/products.json'),false)
 assert.equal(robotsAllows(rules,'/products.json?limit=250&page=1'),true)
 assert.equal(robotsAllows(rules,'/collections/all'),true)
})
test('imports full public Shopify JSON feed without duplicating, overwriting prices or publishing',async()=>{
 const { fn,calls }=fake({
 '/robots.txt':'User-agent: *\nDisallow: /account\n',
 '/products.json?limit=250&page=1':{products:Array.from({length:39},(_,i)=>record(i+1))}
 })
 const result=await fetchPublicCatalog({fetchImpl:fn,delay:async()=>{}})
 assert.equal(result.products.length,39)
 assert.equal(result.mode,'shopify-json')
 assert.equal(calls.includes('/account'),false)
 const d=makeDatabase()
 let stats=importCatalog(result.products,{database:d})
 assert.equal(stats.added,39)
 const p=d.prepare('SELECT * FROM products WHERE slug=?').get('cuktech-model-1')
 assert.equal(p.price,0);assert.equal(p.stock,0);assert.equal(p.published,0)
 assert.equal(JSON.parse(p.source_images)[0],'https://cdn.shopify.com/p1.jpg')
 assert.equal(JSON.parse(p.source_variants)[0].sku,'M-1')
 d.prepare('UPDATE products SET price=490000,stock=10,published=1,description=? WHERE slug=?').run('Mô tả riêng của shop','cuktech-model-1')
 stats=importCatalog(result.products,{database:d})
 assert.equal(stats.added,0);assert.equal(stats.updated,39)
 const after=d.prepare('SELECT * FROM products WHERE slug=?').get('cuktech-model-1')
 assert.equal(after.price,490000);assert.equal(after.stock,10);assert.equal(after.published,1)
 assert.equal(after.description,'Mô tả riêng của shop')
 d.close()
})
test('falls back to public HTML product pages and does not invent price/stock',async()=>{
 const {fn}=fake({
 '/robots.txt':'User-agent: *\nDisallow: /products.json\nDisallow: /collections/all/products.json\n',
 '/collections/all?page=1':'<a href="/products/example-cuktech">Example</a>',
 '/collections/all?page=2':'<a href="/products/example-cuktech">Example</a>',
 '/products/example-cuktech':'<html><meta property="og:image" content="https://cdn.shopify.com/example.jpg"><script type="application/ld+json">{"@type":"Product","name":"CUKTECH Example Charger 65W","description":"Great charger","offers":{"price":"999.00","availability":"https://schema.org/InStock"}}</script></html>'
 })
 const result=await fetchPublicCatalog({fetchImpl:fn,delay:async()=>{}})
 assert.equal(result.products.length,1)
 assert.equal(result.mode,'html-fallback')
 assert.equal(result.products[0].title,'CUKTECH Example Charger 65W')
 const d=makeDatabase();importCatalog(result.products,{database:d});const p=d.prepare('SELECT * FROM products WHERE slug=?').get('example-cuktech');assert.equal(p.price,0);assert.equal(p.stock,0);d.close()
})
test('fails closed when robots is unavailable or catalogue is blocked',async()=>{
 const noRobots=fake({});await assert.rejects(fetchPublicCatalog({fetchImpl:noRobots.fn,delay:async()=>{}}),CrawlError)
 const denyAll=fake({'/robots.txt':'User-agent: *\nDisallow: /'});await assert.rejects(fetchPublicCatalog({fetchImpl:denyAll.fn,delay:async()=>{}}),CrawlError)
})

test('does not import a partially read 250+ item JSON catalog',async()=>{
 const sample=Array.from({length:250},(_,i)=>record(i+1))
 const {fn}=fake({
 '/robots.txt':'User-agent: *\nAllow: /',
 '/products.json?limit=250&page=1':{products:sample},
 '/products.json?limit=250&page=2':undefined
 })
 await assert.rejects(fetchPublicCatalog({fetchImpl:fn,delay:async()=>{}}),/gián đoạn/)
})
test('does not quietly discard inaccessible HTML product detail',async()=>{
 const {fn}=fake({
 '/robots.txt':'User-agent: *\nDisallow: /products.json\nDisallow: /collections/all/products.json',
 '/collections/all?page=1':'<a href="/products/example-cuktech">Example</a>',
 '/collections/all?page=2':'<a href="/products/example-cuktech">Example</a>'
 })
 await assert.rejects(fetchPublicCatalog({fetchImpl:fn,delay:async()=>{}}),/chi tiết/)
})
