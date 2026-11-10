import test from 'node:test'
import assert from 'node:assert/strict'
import {officialImage,discoverProducts,detailFromHtml,buildChinaCatalog} from '../scripts/build-china-catalog.js'
const photo=(name)=>'https://www.cuktech.com.cn/uploads/image/20260812/'+name+'.webp'
const anchor=(sku,name='10号电能棒Mini')=>'<a href="https://www.cuktech.com.cn/products/'+sku+'.html" class="item swiper-slide"><div class="pic"><img src="'+photo(sku)+'"></div><div class="text">'+name+'</div></a>'
test('Chinese manufacturer nav parser preserves all distinct models and cover photos',()=>{
 const html=anchor('pb1055')+anchor('pb1055')+anchor('ad1203p','10号氮化镓充电器Mini')+
  '<a class="btn" href="https://www.cuktech.com.cn/products/no-title.html">了解更多</a>'
 const products=discoverProducts(html)
 assert.equal(products.length,3)
 assert.equal(products.find(x=>x.sku==='pb1055').originalName,'10号电能棒Mini')
 assert.equal(products.find(x=>x.sku==='pb1055').cover,photo('pb1055'))
 assert.equal(products.find(x=>x.sku==='no-title').cover,'')
})
test('Extracts only the product-detail picture strip, not global navigation assets',()=>{
 const html='<img src="'+photo('navigation')+'"><div class="product-detail-page"><div class="product-name">10号电能棒Mini</div>'+
  '<div class="product-detail-main"><div class="pic-list"><img src="'+photo('one')+'"><img src="'+photo('two')+'"></div></div></div>'
 const d=detailFromHtml(html)
 assert.equal(d.name,'10号电能棒Mini')
 assert.deepEqual(d.images,[photo('one'),photo('two')])
})
test('Image validation blocks tracking hosts and insecure URLs',()=>{
 assert.equal(officialImage('//www.cuktech.com.cn/uploads/image/20260812/a.webp'),photo('a'))
 assert.equal(officialImage('http://www.cuktech.com.cn/a.webp'),'')
 assert.equal(officialImage('https://evil.example/a.webp'),'')
 assert.equal(officialImage('https://www.cuktech.com.cn/x.svg'),'')
})
test('Full catalog preserves every official SKU, source link, cover and detailed gallery without price/stock',async()=>{
 const records=Array.from({length:42},(_,i)=>({sku:'pb'+String(100+i),name:i%2?'10号电能棒Mini':'10号氮化镓充电器Mini'}))
 const html=records.map(x=>anchor(x.sku,x.name)).join('')
 const requests=[]
 const fake=async url=>{
  const path=new URL(url).pathname
  requests.push(path)
  let body=path==='/robots.txt'?'User-agent: *\nAllow: /':path==='/'?html:''
  if(path.startsWith('/products/'))body='<div class="product-name">真实商品 '+path+'</div><div class="pic-list"><img src="'+photo('d1')+'"><img src="'+photo('d2')+'"></div>'
  return new Response(body,{status:200})
 }
 const result=await buildChinaCatalog({fetchImpl:fake,delay:async()=>{},categoryPaths:['/']})
 assert.equal(result.discovered,42)
 assert.equal(result.productsWithImages,42)
 assert.equal(result.detailsFetched,42)
 assert.equal(result.missingDetails.length,0)
 assert.equal(result.totalImages,42*3)
 assert.equal(new Set(result.products.map(x=>x.slug)).size,42)
 assert.ok(result.products.every(x=>x.price===0&&x.stock===0&&x.source_market==='china'))
 assert.ok(result.products.every(x=>JSON.parse(x.source_images).length===3))
 assert.ok(result.products[0].source_site.endsWith('/products/pb100.html'))
})
test('Unavailable detail pages retain verified navigation cover but report incomplete galleries',async()=>{
 const html=Array.from({length:40},(_,i)=>anchor('pb'+String(100+i))).join('')
 const fake=async url=>{
  const path=new URL(url).pathname
  return new Response(path==='/robots.txt'?'User-agent: *\nAllow: /':path==='/'?html:'', {status:path.includes('/products/pb100.html')?404:200})
 }
 const result=await buildChinaCatalog({fetchImpl:fake,delay:async()=>{},categoryPaths:['/']})
 assert.equal(result.discovered,40)
 assert.equal(result.productsWithImages,40)
 assert.equal(result.missingDetails.length,40)
 assert.equal(JSON.parse(result.products[0].source_images).length,1)
})
