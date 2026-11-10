import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {productPhotos,pickHomepageProducts} from '../src/home-products.js'

const photo=code=>'https://cdn.shopify.com/s/files/'+code+'.webp?v=1'
const product=(id,category,extra={})=>({
 id,slug:'item-'+id,name:'CUKTECH '+id,category,source_market:'global',
 image_url:photo(id),source_images:JSON.stringify([photo(id),photo(id)+'&wide=1']),
 featured:1,stock:0,price:0,...extra
})

test('Homepage images exclusively use real, source-hosted cuktech.com product photos',()=>{
 const p=product('p23','powerbank')
 assert.deepEqual(productPhotos(p),[photo('p23'),photo('p23')+'&wide=1'])
 assert.deepEqual(productPhotos({...p,image_url:'',source_images:'[]'}),[])
 assert.deepEqual(productPhotos({...p,image_url:'https://fake.example/img.webp',source_images:'[]'}),[])
 assert.deepEqual(productPhotos({...p,image_url:'javascript:alert(1)',source_images:'[]'}),[])
 assert.deepEqual(productPhotos({...p,source_images:'not json'}),[photo('p23')])
})

test('Selects only international source products and real distinct hero/split imagery',()=>{
 const products=[
  product('p23','powerbank',{name:'CUKTECH 20 Power Bank 210W'}),
  product('pb200','powerbank',{name:'CUKTECH 15 Ultra Power Bank'}),
  product('gan','charger',{name:'CUKTECH 100W GaN'}),
  product('usbc','cable',{name:'CUKTECH USB-C Cable'}),
  product('china-only','powerbank',{name:'CUKTECH CN',source_market:'china'}),
  product('broken','charger',{image_url:'',source_images:'[]'})
 ]
 const home=pickHomepageProducts(products)
 assert.equal(home.hero.id,'p23')
 assert.equal(home.split.id,'pb200')
 assert.equal(home.categoryCards.powerbank.id,'p23')
 assert.equal(home.categoryCards.charger.id,'gan')
 assert.equal(home.categoryCards.cable.id,'usbc')
 assert.equal(home.featured.length,4)
 assert.ok(home.featured.every(p=>p.source_market==='global'&&productPhotos(p).length>0))
 assert.equal(home.chargers.length,1)
})
test('Never fills missing categories with invented items or repeats the same model for split',()=>{
 const only=product('pb200','powerbank')
 const result=pickHomepageProducts([only])
 assert.equal(result.hero.id,'pb200')
 assert.equal(result.split,null)
 assert.equal(result.categoryCards.charger,null)
 assert.equal(result.categoryCards.cable,null)
 assert.equal(pickHomepageProducts([]).hero,null)
 assert.equal(pickHomepageProducts([{...only,source_market:'china'}]).hero,null)
})
test('All homepage merchandising slots use actual source product photography, not CSS device mockups',()=>{
 const code=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
 const hero=code.slice(code.indexOf('function Hero({'),code.indexOf('function SectionTitle('))
 const home=code.slice(code.indexOf('function Home(){'),code.indexOf('function TrustStrip()'))
 assert.match(hero,/HomeProductPhoto product=\{product\}/)
 assert.match(home,/HomeProductPhoto product=\{split\}/)
 assert.match(home,/HomeProductPhoto product=\{item\.product\}/)
 assert.match(home,/HomeProductPhoto product=\{categoryCards\.charger\}/)
 assert.match(home,/featured\.map\(p=><ProductCard/)
 assert.doesNotMatch(hero,/<ProductArt\b|<div className="device/)
 assert.doesNotMatch(home,/<ProductArt\b|<div className="device/)
 assert.match(code,/onError=\{\(\)=>setPhotoIndex\(i=>i\+1\)\}/)
 assert.match(code,/Không sử dụng ảnh hoặc sản phẩm minh họa/)
})
