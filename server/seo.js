/** Public search metadata. No demo inventory/prices are indexed. */
const fallback = 'https://cuktech.vn'
export function siteOrigin(configured = fallback) {
  try {
    const u = new URL(configured)
    return u.protocol === 'https:' ? u.origin : fallback
  } catch { return fallback }
}
const htmlEscape = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
const xmlEscape = htmlEscape
const productPublic = p => Number(p.published) === 1 && Number(p.price) > 0 &&
  (!p.source_id || Number(p.media_approved) === 1)
export function buildRobotsTxt({ ready = false, origin } = {}) {
  if (!ready) return 'User-agent: *\nDisallow: /\n'
  return 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /success/\nSitemap: ' + siteOrigin(origin) + '/sitemap.xml\n'
}
export function buildSitemap(products = [], { ready = false, origin } = {}) {
  const root = siteOrigin(origin)
  const pages = ready ? ['/', '/shop', '/about', '/policy',
    ...products.filter(productPublic).map(p => '/product/' + encodeURIComponent(p.slug))] : []
  const unique = [...new Set(pages)]
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    unique.map(path => '  <url><loc>' + xmlEscape(root + path) + '</loc></url>').join('\n') +
    '\n</urlset>'
}
export function renderSeoHtml(template, { product, path='/', ready=false, origin } = {}) {
  const root = siteOrigin(origin)
  const canonical = root + path
  const title = product ? String(product.name || 'Sản phẩm CUKTECH').slice(0,160) + ' | CUKTECH VN' : 'CUKTECH VN — Pin dự phòng, củ sạc GaN và phụ kiện'
  const description = product ? String(product.description || 'Khám phá sản phẩm sạc CUKTECH tại Việt Nam.').replace(/<[^>]*>/g,' ').slice(0,220) : 'Tìm hiểu pin sạc dự phòng, củ sạc GaN và phụ kiện công nghệ CUKTECH tại Việt Nam.'
  const tags = [
    '<link rel="canonical" href="' + htmlEscape(canonical) + '">',
    '<meta name="robots" content="' + (ready ? 'index,follow' : 'noindex,nofollow') + '">',
    '<meta property="og:type" content="' + (product ? 'product' : 'website') + '">',
    '<meta property="og:locale" content="vi_VN">',
    '<meta property="og:title" content="' + htmlEscape(title) + '">',
    '<meta property="og:description" content="' + htmlEscape(description) + '">',
    '<meta property="og:url" content="' + htmlEscape(canonical) + '">'
  ]
  if (product?.image_url && /^https:\/\//.test(product.image_url)) {
    tags.push('<meta property="og:image" content="' + htmlEscape(product.image_url) + '">')
  }
  if (ready && product && Number(product.price) > 0) {
    const json = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: product.name, description,
      brand: { '@type':'Brand', name:'CUKTECH' },
      url: canonical,
      offers: {
        '@type': 'Offer', priceCurrency: 'VND', price: product.price,
        availability: Number(product.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical
      }
    }
    if (product.image_url && /^https:\/\//.test(product.image_url)) json.image=product.image_url
    tags.push('<script type="application/ld+json">' + JSON.stringify(json).replace(/</g,'\\u003c') + '</script>')
  }
  return template.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + htmlEscape(title) + '</title>')
    .replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="' + htmlEscape(description) + '">')
    .replace('</head>', tags.join('\n') + '\n</head>')
}
