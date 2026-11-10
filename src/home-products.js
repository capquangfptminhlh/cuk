/**
 * Select real product photography for every homepage merchandising slot.
 * All decisions are based on the verified cuktech.com feed; never create
 * substitute models or use Chinese-catalog placeholders.
 */
export function productPhotos(product) {
 if (!product) return []
 let gallery = []
 try {
  gallery = typeof product.source_images === 'string'
   ? JSON.parse(product.source_images || '[]')
   : Array.isArray(product.source_images) ? product.source_images : []
 } catch { /* Invalid gallery data must not crash the homepage */ }
 const sources = [product.image_url, ...(Array.isArray(gallery) ? gallery : [])]
 const photos = new Set()
 for (const source of sources) {
  if (typeof source !== 'string' || !source.trim()) continue
  // Vite copies public/media into the static website; relative paths work on
  // both cuktech.vn/ and the /cuk/ GitHub Pages preview.
  if (/^media\/products\/[a-f0-9]{32}\.webp$/i.test(source)) {
   photos.add(source)
   continue
  }
  try {
   const url = new URL(source)
   const allowedHost = ['cdn.shopify.com', 'cuktech.com', 'www.cuktech.com'].includes(url.hostname.toLowerCase())
   if (url.protocol === 'https:' && allowedHost && /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname))
    photos.add(url.href)
  } catch { /* ignore malformed URLs */ }
 }
 return [...photos]
}
const isRealSourceProduct = p =>
 p && p.source_market === 'global' && p.slug && p.name && productPhotos(p).length > 0

const scoreProduct = p => {
 const title = String(p.name || '').toLowerCase()
 // Product photography is the priority; no dummy/fake media is scored.
 return (p.featured ? 12 : 0) + Math.min(productPhotos(p).length, 12) +
  (/\b(?:20|30|15)\b/.test(title) ? 3 : 0) +
  (/\b(?:210w|300w|150w)\b/i.test(title) ? 2 : 0) -
  (/award|奖项|special|red dot|红点/i.test(title) ? 15 : 0)
}
export function pickHomepageProducts(products = []) {
 const pool = (Array.isArray(products) ? products : []).filter(isRealSourceProduct)
 const ranked = [...pool].sort((a, b) => scoreProduct(b) - scoreProduct(a) ||
  String(a.slug).localeCompare(String(b.slug)))
 const first = (category, exclude = new Set()) =>
  ranked.find(p => p.category === category && !exclude.has(p.id)) || null
 const hero = first('powerbank') || ranked[0] || null
 const alternatePower = first('powerbank', new Set(hero ? [hero.id] : []))
 const split = alternatePower || ranked.find(p => p.id !== hero?.id) || null
 const categoryCards = {
  powerbank: first('powerbank'),
  charger: first('charger'),
  cable: first('cable')
 }
 // Keep the featured grid diverse, but never show a fake item if a category is missing.
 const featured = []
 for (const cat of ['powerbank', 'charger', 'cable', 'other']) {
  const next = first(cat)
  if (next && !featured.some(p => p.id === next.id)) featured.push(next)
 }
 for (const p of ranked) {
  if (featured.length >= 4) break
  if (!featured.some(x => x.id === p.id)) featured.push(p)
 }
 return {hero, split, categoryCards, featured: featured.slice(0, 4), chargers: ranked.filter(p => p.category === 'charger').slice(0, 4)}
}
