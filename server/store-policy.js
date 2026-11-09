/** Deliberate production switch: sample prices and inventory must never accept real orders. */
export const isDemoMode = (env = process.env) => env.STORE_DEMO !== '0'
export const isCheckoutEnabled = (env = process.env) => !isDemoMode(env) && env.STORE_READY === '1'

/** Source product imagery remains internal until the shop confirms its publication rights. */
export function canPublishSourceMedia(product) {
  return !product.source_id || !product.image_url || Number(product.media_approved) === 1
}

export function publicProduct(product) {
  const p = { ...product }
  const approved = canPublishSourceMedia(p)
  if (!approved) { p.image_url = ''; p.source_images = '[]' }
  delete p.source_id
  delete p.source_url
  delete p.source_description
  delete p.source_tags
  delete p.source_title
  delete p.source_updated_at
  delete p.source_synced_at
  delete p.source_status
  delete p.media_approved
  return p
}

export function validateAdminProductUpdate(current, patch) {
  const merged = { ...current, ...patch }
  if (Number(merged.published) === 1 && !canPublishSourceMedia(merged)) {
    return 'Cần xác nhận quyền sử dụng ảnh nguồn trước khi công khai sản phẩm'
  }
  if (Number(merged.published) === 1 && merged.source_id && Number(merged.price) <= 0) {
    return 'Sản phẩm đồng bộ cần có giá VND hợp lệ trước khi công khai'
  }
  return null
}
