/**
 * Public HTTPS smoke test: unlike a build-artifact check, verifies that the
 * actual custom domain serves the expected release and real WebP bytes.
 */
const wait=ms=>new Promise(done=>setTimeout(done,ms))
export async function inspectPublicSite({
 base='https://cuktech.vn/', sha=process.env.GITHUB_SHA,
 fetchImpl=fetch, photosToCheck=4
}={}){
 const root=new URL(base)
 const request=async path=>{
  const url=new URL(path,root).href
  const response=await fetchImpl(url,{redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(18000)})
  if(!response.ok)throw new Error(url+' returned HTTP '+response.status)
  return response
 }
 const release=await (await request('build.json')).json()
 if(sha&&release.commit!==sha)throw new Error('STALE_CDN_RELEASE: expected '+sha+' got '+release.commit)
 const html=await (await request('')).text()
 if(!html.includes('id="root"'))throw new Error('Homepage is not serving the React storefront')
 const catalog=await (await request('catalog.snapshot.json')).json()
 if(catalog?.verified!==true || catalog?.sourceCount!==catalog?.products?.length ||
    catalog?.mediaAudit?.coveredProducts!==catalog.sourceCount)throw new Error('Live catalog has incomplete product cover data')
 const products=catalog.products.filter(p=>p.image_url?.startsWith('media/products/'))
 if(products.length!==catalog.sourceCount)throw new Error('Missing first-party cover photo for some live products')
 const samples=[products[0],products[Math.floor(products.length/3)],products[Math.floor(products.length*2/3)],products.at(-1)]
 const unique=[...new Map(samples.filter(Boolean).map(p=>[p.image_url,p])).values()].slice(0,photosToCheck)
 for(const p of unique){
  const response=await request(p.image_url)
  if(!String(response.headers.get('content-type')||'').startsWith('image/'))
   throw new Error('Bad image MIME type for '+p.slug+': '+response.headers.get('content-type'))
  const bytes=new Uint8Array(await response.arrayBuffer())
  const head=String.fromCharCode(...bytes.subarray(0,4))
  const signature=String.fromCharCode(...bytes.subarray(8,12))
  if(head!=='RIFF'||signature!=='WEBP'||bytes.length<100)throw new Error('Invalid WebP returned by custom domain for '+p.slug)
 }
 return {site:root.href,sha:release.commit,sourceCount:catalog.sourceCount,
  verifiedProductCovers:products.length,sampledWebPImages:unique.length}
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 let error
 for(let attempt=0;attempt<6;attempt++){
  try{
   const result=await inspectPublicSite()
   console.log('LIVE CUKTECH PHOTO QA PASS:',JSON.stringify(result))
   error=null
   break
  }catch(e){
   error=e
   console.error('LIVE PHOTO QA attempt',attempt+1,'failed:',e.message)
   if(attempt<5)await wait(6500)
  }
 }
 if(error)process.exitCode=1
}
