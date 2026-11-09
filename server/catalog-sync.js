/**
 * Responsible, read-only CUKTECH catalog importer.
 * Uses public storefront endpoints only. Honors robots.txt; never evades authentication,
 * blocking, or rate limiting. Does not infer inventory or local retail prices.
 */
import { createHash } from 'node:crypto'
import { db } from './db.js'

const BASE = 'https://cuktech.com'
const UA = 'CUKTECHVN-CatalogSync/1.0 (public catalog importer; https://cuktech.vn)'
const MAX_PAGES = 20
const DELAY_MS = 1250
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const limitText = (value, max = 10000) => String(value ?? '').trim().slice(0, max)
const cleanHtml = (html) => limitText(String(html ?? '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<\/(?:li|p|div|h[1-6]|tr|br)>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n'), 10000)
const safeSlug = (value) => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
const sourceId = (handle) => 'cuktech:' + handle
const localId = (handle) => 'source-' + createHash('sha256').update(sourceId(handle)).digest('hex').slice(0, 24)
const safeImage = (src) => {
  if (typeof src !== 'string' || !src.trim()) return ''
  try { const u = new URL(src, BASE); return u.protocol === 'https:' ? u.href : '' } catch { return '' }
}
const unique = (list) => [...new Set(list.filter(Boolean))]
function categoryOf(product) {
  const text = `${product.title ?? ''} ${product.product_type ?? ''} ${product.tags ?? ''}`.toLowerCase()
  if (/cable|usb-c to|cord|dây|cáp/i.test(text)) return 'cable'
  if (/charger|gan|charging station|adapter|car charger|wall charge|củ sạc/i.test(text)) return 'charger'
  if (/power bank|battery|pin sạc|magnetic power|p-series/i.test(text)) return 'powerbank'
  return 'other'
}
function specOf(product) {
  const match = (regex) => String(product.title + ' ' + product.description).match(regex)?.[0] || ''
  return { capacity: match(/\d[\d,.]*\s*mAh/i).replace(/\s/g, '').slice(0, 60), wattage: match(/\d{1,3}\s*W\b/i).replace(/\s/g, '').slice(0, 60) }
}
/** Minimal robots.txt evaluator: most specific matching UA group, Allow wins ties. */
export function robotsAllows(robots, pathname, agent = 'CUKTECHVN-CatalogSync') {
  let groups = [], current = null, hasRule = false
  for (const raw of String(robots).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line || !line.includes(':')) continue
    const at = line.indexOf(':'), key = line.slice(0, at).trim().toLowerCase(), value = line.slice(at + 1).trim()
    if (key === 'user-agent') {
      if (!current || hasRule) { current = { agents: [], rules: [] }; groups.push(current); hasRule = false }
      current.agents.push(value.toLowerCase())
    } else if (['allow', 'disallow'].includes(key) && current) {
      hasRule = true
      if (value) current.rules.push({ allow: key === 'allow', path: value })
    }
  }
  const ua = agent.toLowerCase()
  const scores = groups.map(g => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : ua.includes(a) ? a.length : -1)))
  const max = Math.max(-1, ...scores)
  if (max < 0) return true
  const rules = groups.flatMap((g,i) => scores[i] === max ? g.rules : [])
  let best = null
  for (const rule of rules) {
    const literal = rule.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\$$/, '$')
    const anchored = rule.path.endsWith('$') ? '^' + literal : '^' + literal
    if (new RegExp(anchored).test(pathname)) {
      const length = rule.path.replace(/[\*$]/g, '').length
      if (!best || length > best.length || (length === best.length && rule.allow)) best = { length, allow: rule.allow }
    }
  }
  return best?.allow ?? true
}

export class CrawlError extends Error {}
export async function fetchPublicCatalog({ fetchImpl = fetch, delay = wait, maxPages = MAX_PAGES } = {}) {
  const robotsResponse = await fetchImpl(BASE + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(18000), redirect: 'follow' })
  if (!robotsResponse.ok) throw new CrawlError(`Không thể kiểm tra robots.txt (HTTP ${robotsResponse.status}); dừng để tránh truy cập trái phép`)
  const robots = await robotsResponse.text()
  const allowed = (url) => {
    const u = new URL(url, BASE)
    if (u.origin !== BASE) throw new CrawlError('Không truy cập domain ngoài nguồn')
    if (!robotsAllows(robots, u.pathname + u.search)) throw new CrawlError(`robots.txt không cho phép: ${u.pathname}`)
    return u.href
  }
  let requests = 0
  const get = async (url) => {
    const safeUrl = allowed(url)
    if (requests++ > 0) await delay(DELAY_MS)
    const response = await fetchImpl(safeUrl, { headers: { 'User-Agent': UA, Accept: 'application/json,text/html;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(18000) })
    if (response.status === 403 || response.status === 429) throw new CrawlError(`Trang nguồn chặn truy cập (HTTP ${response.status}); dừng đồng bộ`)
    if (!response.ok) return { status: response.status, body: null }
    if (new URL(response.url || safeUrl).origin !== BASE) throw new CrawlError('Nguồn chuyển hướng sang domain khác')
    return { status: response.status, body: await response.text() }
  }

  // Structured public product catalog, when the store explicitly exposes it.
  for (const endpoint of ['/products.json', '/collections/all/products.json']) {
    if (!robotsAllows(robots, endpoint)) continue
    const all = []
    let usable = false
    for (let page = 1; page <= maxPages; page++) {
      const url = `${endpoint}?limit=250&page=${page}`
      if (!robotsAllows(robots, url)) break
      const response = await get(url)
      if (!response.body) { if (page === 1) break; throw new CrawlError(`Danh mục JSON gián đoạn ở trang ${page}; không lưu kết quả thiếu`) }
      let parsed
      try { parsed = JSON.parse(response.body) } catch { if (page === 1) break; throw new CrawlError(`JSON trang ${page} không hợp lệ; không lưu kết quả thiếu`) }
      if (!Array.isArray(parsed.products)) { if (page === 1) break; throw new CrawlError(`Dữ liệu JSON trang ${page} không hợp lệ`) }
      usable = true
      const batch = parsed.products
      all.push(...batch.map(normalizeShopifyProduct).filter(Boolean))
      if (batch.length < 250) break
      if (page === maxPages) throw new CrawlError('Chạm giới hạn số trang; không cập nhật danh mục chưa đầy đủ')
    }
    if (usable && all.length) return { products: dedupe(all), mode: 'shopify-json', requests }
  }

  // Public HTML fallback for themes that disable JSON feeds. Each product detail
  // is resolved only from real public /products/<handle> links on collection pages.
  const handles = new Set()
  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = `/collections/all?page=${page}`
    if (!robotsAllows(robots, pageUrl)) throw new CrawlError('robots.txt không cho phép đọc danh mục HTML')
    const { body } = await get(pageUrl)
    if (!body) { if (page === 1) throw new CrawlError('Không truy cập được trang danh mục công khai'); break }
    const before = handles.size
    for (const match of body.matchAll(/href\s*=\s*["']([^"']*\/products\/([a-z0-9-]+)(?:\?[^"']*)?)["']/gi)) handles.add(match[2])
    if (handles.size === before) break
    if (page === maxPages) throw new CrawlError('Danh mục HTML vượt giới hạn trang; dừng để tránh bỏ sót sản phẩm')
  }
  if (!handles.size) throw new CrawlError('Không tìm được sản phẩm công khai; không thay đổi dữ liệu cũ')
  const all = []
  for (const handle of handles) {
    const { body } = await get('/products/' + handle)
    if (!body) throw new CrawlError(`Không lấy được chi tiết ${handle}; tránh đồng bộ thiếu sản phẩm`)
    const parsed = normalizeHtmlProduct(handle, body)
    if (!parsed) throw new CrawlError(`Không đọc được chi tiết ${handle}; tránh đồng bộ thiếu sản phẩm`)
    all.push(parsed)
  }
  if (!all.length) throw new CrawlError('Không đọc được chi tiết sản phẩm')
  return { products: dedupe(all), mode: 'html-fallback', requests }
}
function dedupe(products) { return [...new Map(products.map(p => [p.handle, p])).values()] }
function normalizeShopifyProduct(p) {
  const handle = safeSlug(p.handle)
  if (!handle || !p.title) return null
  const images = unique([...(p.images || []).map(i => safeImage(typeof i === 'string' ? i : i.src)), safeImage(p.image?.src)])
  const variants = (p.variants || []).map(v => ({ id: String(v.id ?? ''), sku: limitText(v.sku, 100), title: limitText(v.title, 150), option1: v.option1 ?? '', option2: v.option2 ?? '', option3: v.option3 ?? '', available: v.available === true, source_price: v.price == null ? null : String(v.price) }))
  const title = limitText(p.title, 160)
  return { handle, title, description: cleanHtml(p.body_html), product_type: limitText(p.product_type, 120), tags: p.tags ?? '', images, variants, source_updated_at: limitText(p.updated_at, 60) }
}
function htmlAttr(html, name) {
  const re = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  return tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] || ''
}
function normalizeHtmlProduct(handle, html) {
  let ld = null
  for (const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const decoded = JSON.parse(script[1].trim())
      const nodes = Array.isArray(decoded) ? decoded : Array.isArray(decoded['@graph']) ? decoded['@graph'] : [decoded]
      ld = nodes.find(n => n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product'))) || ld
    } catch { /* optional metadata */ }
  }
  const title = limitText(ld?.name || htmlAttr(html, 'og:title') || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, '') || '', 160)
  if (!title) return null
  const images = unique([...(Array.isArray(ld?.image) ? ld.image : ld?.image ? [ld.image] : []).map(i => safeImage(typeof i === 'string' ? i : i.url)), safeImage(htmlAttr(html, 'og:image'))])
  const description = cleanHtml(ld?.description || htmlAttr(html, 'og:description'))
  const offers = Array.isArray(ld?.offers) ? ld.offers : ld?.offers ? [ld.offers] : []
  return { handle, title, description, product_type: '', tags: '', images, variants: offers.map((o,i)=>({id: String(o.sku || i),sku: o.sku || '', title: '', available: /InStock/i.test(o.availability || ''), source_price: o.price == null ? null : String(o.price)})), source_updated_at: '' }
}

/** Import is idempotent. Prices, stock, publication and admin changes are never overwritten. */
export function importCatalog(products, { database = db, mode = 'unknown', requests = 0 } = {}) {
  if (!Array.isArray(products) || products.length === 0) throw new Error('Danh mục rỗng; không ghi đè dữ liệu')
  const bySource = database.prepare('SELECT id FROM products WHERE source_id = ?')
  const bySlug = database.prepare('SELECT id,source_id FROM products WHERE slug = ?')
  const byName = database.prepare('SELECT id,source_id FROM products WHERE lower(name) = lower(?)')
  const insert = database.prepare(`INSERT INTO products
    (id,slug,name,category,price,stock,description,art,featured,published,capacity,wattage,
     source_id,source_url,source_title,source_description,source_tags,source_images,source_variants,source_updated_at,source_synced_at,source_status,image_url)
    VALUES (?,?,?,?,0,0,?,?,0,0,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'active',?)`)
  const update = database.prepare(`UPDATE products SET source_id=?,source_url=?,source_title=?,source_images=?,
      source_description=?,source_tags=?,source_variants=?,source_updated_at=?,source_synced_at=CURRENT_TIMESTAMP,source_status='active',image_url=CASE WHEN image_url='' OR image_url LIKE 'https://cdn.shopify.com/%' THEN ? ELSE image_url END
      WHERE id=?`)
  const touchMissing = database.prepare("UPDATE products SET source_status='missing' WHERE source_id LIKE 'cuktech:%' AND source_synced_at < ?")
  const started = new Date().toISOString().replace('T',' ').slice(0,19)
  let added = 0, updated = 0, skipped = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const p of dedupe(products)) {
      if (!p.handle || !p.title) { skipped++; continue }
      const id = sourceId(p.handle), url = `${BASE}/products/${p.handle}`
      const category = categoryOf(p), spec = specOf(p)
      const image = p.images.find(Boolean) || ''
      const payload = [id,url,p.title,limitText(p.description,10000),limitText(Array.isArray(p.tags)?p.tags.join(', '):p.tags,2000),JSON.stringify(p.images),JSON.stringify(p.variants),p.source_updated_at || '',image]
      const found = bySource.get(id) || bySlug.get(p.handle) || byName.get(p.title)
      if (found && found.source_id && found.source_id !== id) { skipped++; continue }
      if (found) { update.run(...payload, found.id); updated++ }
      else {
        const slug = bySlug.get(p.handle) ? 'imported-' + p.handle : p.handle
        insert.run(localId(p.handle), slug, p.title, category,
          limitText(p.description, 1000), category === 'cable' ? 'cable' : category === 'charger' ? 'charger' : 'powerbank',
          spec.capacity, spec.wattage, ...payload)
        added++
      }
    }
    // Only reports missing products; never deletes/unpublishes anything automatically.
    touchMissing.run(started)
    database.exec('COMMIT')
    return { total: products.length, added, updated, skipped, mode, requests }
  } catch (e) { database.exec('ROLLBACK'); throw e }
}
let running = false
export async function runCatalogSync({ fetchImpl = fetch, delay = wait, database = db } = {}) {
  if (running) throw new Error('Đồng bộ đang chạy')
  running = true
  const startedAt = new Date().toISOString()
  try {
    const data = await fetchPublicCatalog({ fetchImpl, delay })
    const stats = importCatalog(data.products, { database, mode: data.mode, requests: data.requests })
    database.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').run(startedAt, 'success', JSON.stringify(stats))
    return stats
  } catch (e) {
    database.prepare('INSERT INTO catalog_sync_runs(started_at,status,summary) VALUES(?,?,?)').run(startedAt, 'failed', limitText(e.message, 500))
    throw e
  } finally { running = false }
}
export function isCatalogSyncRunning() { return running }
