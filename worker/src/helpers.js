/** Pure, portable validation for the Cloudflare D1 API. */
export const isDemo = env => env.STORE_DEMO !== '0'
export const canCheckout = env => !isDemo(env) && env.STORE_READY === '1'
export const roles = ['new','confirmed','shipping','completed','cancelled']
const allowed = { new:['confirmed','shipping','cancelled'],confirmed:['shipping','completed','cancelled'],shipping:['completed','cancelled'],completed:[],cancelled:[] }
export function transitionAllowed(from,to) { return from === to || (allowed[from] || []).includes(to) }
export function approvedProduct(p) { return !p.source_id || !p.image_url || Number(p.media_approved) === 1 }
export function publicProduct(product) {
  const p={...product}
  if (!approvedProduct(p)) { p.image_url='';p.source_images='[]' }
  for (const key of ['source_id','source_url','source_title','source_description','source_tags','source_variants','source_updated_at','source_synced_at','source_status','media_approved']) delete p[key]
  return p
}
export function normalizeOrder(input) {
  const {customer,phone,address,note='',items}=input||{}
  if(typeof customer!=='string'||customer.trim().length<2||customer.length>100||
    typeof phone!=='string'||!/^(0\d{9}|\+?84\d{9})$/.test(phone.replace(/[ .-]/g,''))||
    typeof address!=='string'||address.trim().length<12||address.length>500||
    typeof note!=='string'||note.length>1000||
    !Array.isArray(items)||items.length<1||items.length>40) return null
  if (items.some(i=>!i||typeof i.id!=='string'||i.id.length>100||!Number.isInteger(i.qty)||i.qty<1||i.qty>99)) return null
  if(new Set(items.map(i=>i.id)).size!==items.length) return null
  return {customer:customer.trim(),phone:phone.replace(/[ .-]/g,''),address:address.trim(),note:note.trim(),items}
}
export function csvCell(value) {
  let s=String(value??'').replace(/\r\n?/g,'\n')
  if(/^[\s]*[=+@\-]/.test(s))s="'"+s
  return '"'+s.replace(/"/g,'""')+'"'
}
export function originAllowed(origin,frontend='https://cuktech.vn') {
  return Boolean(origin && (origin===frontend||origin==='https://www.cuktech.vn'))
}
