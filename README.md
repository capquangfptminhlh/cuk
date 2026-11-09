# CUKTECH VN — Website bán hàng

Website thương mại điện tử **độc lập**, thiết kế theo nhịp bố cục tối giản của cuktech.com, có tùy biến Việt Nam. Không sao chép source/theme độc quyền, banner hoặc ảnh có bản quyền của website tham chiếu. Đây **không phải** tuyên bố đại lý chính hãng.

## Đã có

- React 19 + Vite: trang chủ, danh mục, lọc, tìm kiếm, chi tiết, giỏ hàng, thanh toán COD, xác nhận đơn, newsletter, trang thông tin.
- Express + SQLite (`node:sqlite`): sản phẩm, đơn hàng, tồn kho trừ nguyên tử, tài khoản admin và phiên đăng nhập.
- `/admin`: đăng nhập, cập nhật giá/tồn kho/thông tin sản phẩm, thêm sản phẩm, quản lý trạng thái đơn hàng.
- Responsive, hình minh họa thiết bị tự dựng bằng CSS; **chưa** dùng ảnh thật hay nội dung được cấp phép từ chủ thương hiệu.

## Chạy trên máy

Yêu cầu **Node.js >=22.13**.

```bash
npm install
cp .env.example .env
# sửa .env: ADMIN_EMAIL, ADMIN_PASSWORD dài >=14 ký tự, STORE_DEMO=1
npm run dev:api  # cửa sổ terminal 1
npm run dev      # cửa sổ terminal 2 -> http://localhost:5173
```

Trên Windows, sao chép `.env.example` sang `.env` thay vì `cp` nếu cần. `server/index.js` chưa đọc .env tự động: Node 22 có thể dùng `node --env-file=.env server/index.js`, hoặc dùng môi trường của dịch vụ hosting. Để tiện dev có thể chạy `node --env-file=.env --watch server/index.js`.

### Triển khai production

```bash
npm ci
npm run build
NODE_ENV=production PORT=3001 ADMIN_EMAIL='...' ADMIN_PASSWORD='...' STORE_DEMO=0 npm start
```

Cấu hình reverse proxy HTTPS cho cuktech.vn về cổng 3001; không kết nối tên miền tự động. Dữ liệu SQLite nằm ở `server/data/store.sqlite` (phải mount volume lưu trữ). Back up DB định kỳ. Chỉ công khai khi đã thay giá demo, tồn kho, địa chỉ liên hệ, chính sách, thông tin pháp lý, thông tin đơn vị kinh doanh và ảnh được cấp quyền sử dụng. Nếu dùng môi trường serverless không có ổ đĩa bền vững, chuyển DB sang PostgreSQL.

### Lưu ý bảo mật

- Không có admin mặc định; phải cấu hình tài khoản trên máy chủ trước khi khởi chạy lần đầu.
- Login đặt cookie HttpOnly/SameSite Strict/Secure trên HTTPS; mật khẩu băm scrypt; đơn hàng được tính lại giá và kiểm tra tồn kho phía server.
- Chưa tích hợp cổng thanh toán thật (mặc định chỉ COD), vận chuyển tự động, email/SMS xác nhận, quản lý nhiều admin hoặc đồng bộ kho ngoài. Cần hoàn thiện các phần này trước khi mở rộng kinh doanh thực tế.

### Dữ liệu mẫu

Danh mục/tên model đối chiếu trang CUKTECH công khai, nhưng các mức **giá bán, tồn kho, mô tả minh họa trong code đều là dữ liệu demo**. Khi `STORE_DEMO=1`, giao diện hiện thông báo minh bạch. Không tự nhận hàng chính hãng hoặc chính sách bảo hành cụ thể khi chưa xác thực.