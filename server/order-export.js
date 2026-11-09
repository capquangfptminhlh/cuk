/** CSV for the authenticated administrator only. Neutralize spreadsheet formula injection. */
function cell(value) {
  let s=String(value ?? '').replace(/\r\n?/g,'\n')
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s="'"+s
  return '"'+s.replace(/"/g,'""')+'"'
}
export function ordersToCsv(orders) {
  const headers=['Mã đơn','Ngày tạo','Khách hàng','Số điện thoại','Địa chỉ','Sản phẩm','Tổng tiền VND','Trạng thái']
  const rows=orders.map(order=>[
    order.id,order.created_at,order.customer,order.phone,order.address,
    (typeof order.items==='string'?JSON.parse(order.items):order.items||[]).map(item=>`${item.name} x ${item.qty}`).join(' | '),
    order.total,order.status
  ])
  return '\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
