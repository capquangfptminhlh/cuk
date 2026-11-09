import { createHash } from 'node:crypto'

export class CheckoutError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

function normalize(body) {
  const { customer, phone, address, note = '', items } = body || {}
  if (typeof customer !== 'string' || customer.trim().length < 2 || customer.length > 100 ||
      typeof phone !== 'string' || !/^(?:0\d{9}|\+?84\d{9})$/.test(phone.replace(/[ .-]/g,'')) ||
      typeof address !== 'string' || address.trim().length < 12 || address.length > 500 ||
      typeof note !== 'string' || note.length > 1000 ||
      !Array.isArray(items) || items.length < 1 || items.length > 40) {
    throw new CheckoutError('Vui lòng kiểm tra tên, điện thoại, địa chỉ và sản phẩm')
  }
  for (const item of items) {
    if (typeof item?.id !== 'string' || item.id.length > 100 ||
        !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
      throw new CheckoutError('Số lượng không hợp lệ')
    }
  }
  if (new Set(items.map(i=>i.id)).size !== items.length) throw new CheckoutError('Sản phẩm bị lặp')
  return { customer:customer.trim(), phone:phone.replace(/[ .-]/g,''), address:address.trim(), note:note.trim(), items }
}

/**
 * SQLite BEGIN IMMEDIATE guarantees a replay cannot decrement inventory twice.
 * A key is optional for old clients; the storefront always sends one.
 */
export function placeOrder(database, rawBody, key = '', generateId = () => { throw new Error('Missing order ID generator') }) {
  if (typeof key !== 'string' || (key && !/^[a-zA-Z0-9:_-]{16,120}$/.test(key))) {
    throw new CheckoutError('Mã giao dịch không hợp lệ')
  }
  const body = normalize(rawBody)
  const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  let open = false
  try {
    database.exec('BEGIN IMMEDIATE')
    open = true
    if (key) {
      const previous = database.prepare('SELECT request_hash,order_id FROM checkout_requests WHERE request_key=?').get(key)
      if (previous) {
        if (previous.request_hash !== requestHash) throw new CheckoutError('Mã giao dịch đã được dùng cho một đơn khác',409)
        const order = database.prepare('SELECT id,total FROM orders WHERE id=?').get(previous.order_id)
        if (!order) throw new CheckoutError('Không tìm thấy đơn hàng trước đó',409)
        database.exec('COMMIT');open = false
        return { id:order.id, total:order.total, replayed:true }
      }
    }
    const select = database.prepare('SELECT id,name,price,stock,published,source_id,media_approved FROM products WHERE id=?')
    const items = []
    let total = 0
    for (const { id, qty } of body.items) {
      const p = select.get(id)
      if (!p || !p.published || p.price <= 0 || p.stock < qty ||
          (p.source_id && p.media_approved !== 1)) {
        throw new CheckoutError('Sản phẩm hết hàng hoặc chưa có giá bán hợp lệ',409)
      }
      total += p.price * qty
      if (!Number.isSafeInteger(total)) throw new CheckoutError('Giá trị đơn hàng quá lớn',400)
      items.push({id:p.id,name:p.name,price:p.price,qty})
    }
    const id = generateId()
    for (const item of items) {
      const result = database.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(item.qty,item.id,item.qty)
      if (result.changes !== 1) throw new CheckoutError('Không đủ tồn kho',409)
    }
    database.prepare('INSERT INTO orders(id,customer,phone,address,note,items,total) VALUES (?,?,?,?,?,?,?)')
      .run(id,body.customer,body.phone,body.address,body.note,JSON.stringify(items),total)
    if (key) database.prepare('INSERT INTO checkout_requests(request_key,request_hash,order_id) VALUES (?,?,?)').run(key,requestHash,id)
    database.exec('COMMIT');open = false
    return { id,total,replayed:false }
  } catch(e) {
    if (open) database.exec('ROLLBACK')
    throw e
  }
}
