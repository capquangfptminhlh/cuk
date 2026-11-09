/**
 * Catalog identity and integrity helpers shared by the Worker importer and tests.
 * Never transliterate source keys into lossy ASCII before de-duplication.
 */
export function normalizeHandle(value) {
 const handle=String(value??'').trim().normalize('NFC')
 if(!handle || handle.length>160 || /[/?#\s]/u.test(handle)) throw new Error('Invalid source product handle')
 return handle
}
export async function catalogIdentity(value,digestImpl=globalThis.crypto?.subtle) {
 const handle=normalizeHandle(value)
 if(!digestImpl) throw new Error('Secure SHA-256 is unavailable')
 const bytes=await digestImpl.digest('SHA-256',new TextEncoder().encode(handle))
 const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')
 const ascii=handle.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,44).replace(/-+$/,'') || 'item'
 return {handle,sourceId:'cuktech:'+handle,id:'source-'+hash.slice(0,28),
  slug:'imported-'+ascii+'-'+hash.slice(0,12),
  sourceUrl:'https://cuktech.com/products/'+encodeURIComponent(handle)}
}
export function uniqueSourceProducts(records) {
 if(!Array.isArray(records))throw new Error('Catalog records must be an array')
 const map=new Map()
 for(const item of records) {
  const handle=normalizeHandle(item?.handle)
  if(!item?.title)throw new Error('Source product lacks a title: '+handle)
  if(map.has(handle)) throw new Error('Duplicate handle in public catalog: '+handle)
  map.set(handle,item)
 }
 if(!map.size)throw new Error('Public catalog is empty; do not change existing data')
 return [...map.values()]
}
export function collectionProductCount(html) {
 const text=String(html??'')
 const match=text.match(/<[^>]*class=["'][^"']*\butility-bar__item\b[^"']*["'][^>]*>\s*(\d{1,6})\s+products\b/i) ||
   text.match(/>\s*(\d{1,6})\s+products\s*</i)
 return match?Number(match[1]):null
}
export function assertCatalogComplete(products,expected) {
 const found=uniqueSourceProducts(products)
 if(expected!==null && expected!==undefined && found.length!==expected) {
  throw new Error('CATALOG_COUNT_MISMATCH: collection declares '+expected+' products but JSON returned '+found.length+' distinct handles; no database writes')
 }
 return {products:found,sourceCount:expected,verified:expected!==null&&expected!==undefined}
}
export function robotsAllows(robots,path,identity='CUKTECHVN-PublicCatalog') {
 const groups=[]
 let group=null,hasRules=false
 for(const row of String(robots).split(/\r?\n/)){
  const line=row.replace(/#.*/,'').trim(),idx=line.indexOf(':')
  if(idx<0)continue
  const k=line.slice(0,idx).trim().toLowerCase(),v=line.slice(idx+1).trim()
  if(k==='user-agent'){
   if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false}
   group.agents.push(v.toLowerCase())
  }else if((k==='allow'||k==='disallow')&&group){
   hasRules=true
   if(v)group.rules.push({path:v,allow:k==='allow'})
  }
 }
 const ua=identity.toLowerCase()
 const scores=groups.map(g=>Math.max(-1,...g.agents.map(a=>a==='*'?0:ua.includes(a)?a.length:-1)))
 const best=Math.max(-1,...scores)
 if(best<0)return true
 let match=null
 const special='^$.*+?()[]{}|\\'
 for(let i=0;i<groups.length;i++){
  if(scores[i]!==best)continue
  for(const rule of groups[i].rules){
   const end=rule.path.endsWith('$')
   const parts=(end?rule.path.slice(0,-1):rule.path).split('*')
   const escaped=parts.map(p=>[...p].map(c=>special.includes(c)?'\\'+c:c).join('')).join('.*')
   if(new RegExp('^'+escaped+(end?'$':'')).test(path)){
    const len=rule.path.replace(/[*$]/g,'').length
    if(!match||len>match.length||(len===match.length&&rule.allow))match={length:len,allow:rule.allow}
   }
  }
 }
 return match?.allow??true
}
