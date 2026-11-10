/**
 * Enrich the international Shopify preview with manufacturer model IDs
 * disclosed on each public cuktech.com product page's SPEC section.
 * The Shopify JSON body sometimes omits the website's product specifications.
 * No prices/stock/images change. Respect robots.txt, stop on 403/429.
 */
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {robotsAllows} from '../worker/src/catalog-core.js'

const BASE='https://cuktech.com'
const USER_AGENT='CUKTECHVN-PublicCatalog/1.0 (+https://cuktech.vn)'
const CODE=/^[a-z]{1,5}\d{2,6}[a-z0-9]{0,6}$/i
const isSpecial=s=>/\b(?:award|edition|limited|red[- ]?dot|epda|idea|special|holiday|new[- ]?year)\b|红点|限量|新年|三体|奖项/i.test(String(s??''))
const sleep=ms=>new Promise(done=>setTimeout(done,ms))
export function publicModelFromHtml(html){
 const src=String(html??'')
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
   .replace(/<!--[\s\S]*?-->/g,' ')
   .replace(/<\/?(?:p|div|section|br|h\d|li|tr|td|span|strong)\b[^>]*>/gi,' ')
   .replace(/<[^>]*>/g,' ')
   .replace(/&nbsp;|&#160;|&#xA0;/gi,' ')
   .replace(/&colon;/gi,':')
   .replace(/\s+/g,' ')
 const spec=src.match(/\b(?:SPEC|Specifications|Technical Specifications)\b([\s\S]{0,3500})/i)
 const source=spec?spec[1]:src
 const model=source.match(/(?:^|\s)(?:Model(?:\s*(?:No\.?|Number))?|型号)\s*[:：]\s*([a-z]{1,5}\d{2,6}[a-z0-9]{0,6})(?![a-z0-9_-])/i)
 return model&&CODE.test(model[1])?model[1].toLowerCase():null
}
export async function enrichCatalogModels({
 filename='public/catalog.snapshot.json',fetchImpl=fetch,delay=sleep,maxPages=80
}={}){
 const catalog=JSON.parse(await readFile(resolve(filename),'utf8'))
 if(!catalog.verified||!Array.isArray(catalog.products)||
   catalog.products.length!==catalog.sourceCount)throw new Error('International source catalog is incomplete')
 const robotResponse=await fetchImpl(BASE+'/robots.txt',{
  headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(15000)
 })
 if(!robotResponse.ok)throw new Error('Cannot inspect public source robots policy')
 const robots=await robotResponse.text()
 const rows=[]
 let checked=0,found=0,conflicts=0,missing=0
 for(const product of catalog.products.slice(0,maxPages)) {
  if(!product.source_site || isSpecial(product.name))continue
  const url=new URL(product.source_site)
  if(url.origin!==BASE || !url.pathname.startsWith('/products/'))throw new Error('Invalid official product URL')
  if(!robotsAllows(robots,url.pathname,USER_AGENT)) {
   rows.push({product:product.name,reason:'robots-disallowed'});continue
  }
  await delay(500)
  let response
  try{
   response=await fetchImpl(url.href,{headers:{
    'Accept':'text/html,application/xhtml+xml',
    'User-Agent':USER_AGENT
   },signal:AbortSignal.timeout(20000),redirect:'follow'})
  }catch(e){rows.push({product:product.name,reason:'fetch-error'});missing++;continue}
  if([403,429].includes(response.status))throw new Error('International manufacturer declined requests: HTTP '+response.status)
  if(!response.ok || new URL(response.url||url.href).origin!==BASE){rows.push({product:product.name,reason:'http-'+response.status});missing++;continue}
  checked++
  const detected=publicModelFromHtml(await response.text())
  if(!detected){missing++;continue}
  const listed=(product.source_model_codes||[]).map(x=>String(x).toLowerCase())
  if(listed.length&&!listed.includes(detected)){conflicts++;rows.push({product:product.name,reason:'model-conflict',spec:detected,listed});continue}
  product.source_model_codes=[...new Set([...listed,detected])].sort()
  product.spec_model_source='cuktech.com-public-spec'
  found++
 }
 catalog.modelSpecAudit={checked,found,missing,conflicts,nonmatching:rows,
  checkedAt:new Date().toISOString()}
 await writeFile(resolve(filename),JSON.stringify(catalog,null,2)+'\n')
 return catalog.modelSpecAudit
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 enrichCatalogModels().then(a=>console.log('CUKTECH INTERNATIONAL SPEC MODELS',a.found,
  'confirmed from',a.checked,'product pages;',a.conflicts,'conflicts; missing',a.missing))
 .catch(e=>{console.error('INTERNATIONAL SPEC ENRICH ERROR',e.message);process.exitCode=1})
}
