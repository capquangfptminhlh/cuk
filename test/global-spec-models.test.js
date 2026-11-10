import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {publicModelFromHtml,enrichCatalogModels} from '../scripts/enrich-global-models.js'

test('Extract true manufacturer model numbers from visible public SPEC HTML',()=>{
 assert.equal(publicModelFromHtml('<h2>SPEC</h2><div>Model:&nbsp;P23</div><div>Power 210W</div>'),'p23')
 assert.equal(publicModelFromHtml('<h2>SPEC</h2><p>Model：P01CT</p><p>Battery 40000mAh</p>'),'p01ct')
 assert.equal(publicModelFromHtml('<div>Specifications</div><div><strong>Model</strong>: PB200U</div>'),'pb200u')
 assert.equal(publicModelFromHtml('<div>Model: <span>NOT-A-MODEL</span></div>'),null)
 assert.equal(publicModelFromHtml('<script>const data="Model: P23";</script><div>No SKU</div>'),null)
})
test('Enriches only the matching product using exact public SPEC, preserving price, stock and photos',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cuk-spec-'))
 const filename=join(folder,'products.json')
 const products=[
  {name:'CUKTECH 30 Power Bank 40000mAh 300W',source_site:'https://cuktech.com/products/cuktech-p-series-40000mah-300w-power-bank',source_model_codes:[],price:0,stock:0,image_url:'https://cdn.shopify.com/sample.jpg'},
  {name:'CUKTECH 15 Ultra Power Bank',source_site:'https://cuktech.com/products/cuktech-15-power-bank',source_model_codes:[],price:0,stock:0,image_url:'https://cdn.shopify.com/ultra.jpg'},
  {name:'AD1204U-IDEA',source_site:'https://cuktech.com/products/award',source_model_codes:[],price:0,stock:0}
 ]
 try{
  await writeFile(filename,JSON.stringify({verified:true,sourceCount:3,products}))
  const urls=[]
  const fake=async url=>{
   const path=new URL(url).pathname
   urls.push(path)
   return new Response(path==='/robots.txt'?'User-agent: *\nDisallow: /admin\n':
    path.includes('40000mah')?'<h2>SPEC</h2><p>Model：P01CT</p>':
    path.includes('15-power-bank')?'<h2>SPEC</h2><p>Model: PB200U</p>':'',
    {status:200,headers:{'content-type':'text/html'}})
  }
  const result=await enrichCatalogModels({filename,fetchImpl:fake,delay:async()=>{}})
  assert.equal(result.found,2)
  assert.equal(result.checked,2)
  assert.equal(result.conflicts,0)
  assert.deepEqual(urls,['/robots.txt','/products/cuktech-p-series-40000mah-300w-power-bank','/products/cuktech-15-power-bank'])
  const after=JSON.parse(await readFile(filename,'utf8'))
  assert.deepEqual(after.products[0].source_model_codes,['p01ct'])
  assert.deepEqual(after.products[1].source_model_codes,['pb200u'])
  assert.deepEqual(after.products[2].source_model_codes,[])
  assert.equal(after.products[0].image_url,products[0].image_url)
  assert.equal(after.products[0].price,0)
  assert.equal(after.products[1].stock,0)
 } finally {await rm(folder,{recursive:true,force:true})}
})
test('Rejects conflicting model claims and obeys source robots.txt without guessing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cuk-spec-conflict-')),filename=join(dir,'catalog.json')
 const products=[{name:'CUKTECH model sample',source_site:'https://cuktech.com/products/sample',source_model_codes:['p23']}]
 try{
  await writeFile(filename,JSON.stringify({verified:true,sourceCount:1,products}))
  const fake=async url=>new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /\n':
   '<h2>SPEC</h2><p>Model：P01CT</p>',{status:200})
  const result=await enrichCatalogModels({filename,fetchImpl:fake,delay:async()=>{}})
  assert.equal(result.conflicts,1);assert.equal(result.found,0)
  const after=JSON.parse(await readFile(filename,'utf8'))
  assert.deepEqual(after.products[0].source_model_codes,['p23'])
  await writeFile(filename,JSON.stringify({verified:true,sourceCount:1,products}))
  const denied=async url=>new Response(url.endsWith('/robots.txt')?'User-agent: *\nDisallow: /products/\n':'', {status:200})
  const blocked=await enrichCatalogModels({filename,fetchImpl:denied,delay:async()=>{}})
  assert.equal(blocked.checked,0);assert.equal(blocked.found,0)
 } finally {await rm(dir,{recursive:true,force:true})}
})
