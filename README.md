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

## Đồng bộ danh mục sản phẩm công khai từ cuktech.com

### Phạm vi và giới hạn

- Bộ nhập `server/catalog-sync.js` đọc **dữ liệu sản phẩm công khai** từ `https://cuktech.com` (không yêu cầu đăng nhập, không vượt chặn).
- Ưu tiên feed sản phẩm JSON có phân trang (`/products.json` hoặc `/collections/all/products.json`). Nếu website không hỗ trợ, đọc liên kết danh mục và siêu dữ liệu sản phẩm trên HTML công khai.
- Tự động kiểm tra `robots.txt` trước khi đọc. Tự dừng khi bị 403/429, robots không truy cập được hoặc website cấm; không dùng proxy/stealth.
- Tối đa 20 trang phân trang mỗi lần; có khoảng nghỉ 1,25 giây giữa các yêu cầu HTTP; nếu bị giới hạn trang, đồng bộ báo lỗi thay vì coi dữ liệu thiếu là đầy đủ.
- Lưu tên gốc, mô tả, loại, thẻ, liên kết, danh sách hình ảnh và biến thể/SKU được công khai. Hình ảnh được **tham chiếu bằng URL**, không tải xuống/mirror lên server.
- **Không suy đoán số lượng tồn kho**: `available` chỉ có thể là cờ còn hàng/hết hàng, không phải số lượng thực tế.
- **Không tự đổi USD sang giá bán VND**: website nguồn đang có các mức `$0/$999` không đại diện cho giá thương mại tại Việt Nam.
- Sản phẩm mới từ nguồn luôn tạo với **giá=0, tồn kho=0, ẩn**. Quản trị viên phải kiểm tra ảnh/nội dung và quyền sử dụng rồi tự điền giá, tồn kho và bật hiển thị. Các lần đồng bộ sau giữ nguyên thông tin kinh doanh do chủ shop cài đặt.
- Dùng khóa `source_id` tránh trùng khi cập nhật; sản phẩm biến mất khỏi nguồn chỉ được gắn trạng thái `missing`, không tự xóa sản phẩm hay đơn hàng.
- Nội dung/ảnh/nhãn hiệu trên cuktech.com có thể được bảo hộ quyền tác giả/nhãn hiệu: chỉ công khai lại trên trang thương mại của mình nếu anh có quyền sử dụng.

### Chạy và theo dõi

```bash
npm install
npm run sync:products    # Chạy 1 lần thủ công, đọc nguồn thực tế và lưu SQLite
```

Trong trang `/admin`, mở tab **Đồng bộ CUKTECH** để bấm **Chạy đồng bộ ngay**, kiểm tra số lượng nhập và lịch sử chạy. API tác động đến đồng bộ yêu cầu đăng nhập quản trị viên.

Để tự đồng bộ khi server Node đang hoạt động (chạy lần đầu sau 20 giây, sau đó lặp lại mỗi 12 giờ), cấu hình môi trường:

```env
CATALOG_SYNC_ENABLED=1
CATALOG_SYNC_HOURS=12
```

Mặc định tính năng lịch tự động **tắt** để chủ website xác minh điều khoản sử dụng/giấy phép hình ảnh trước. GitHub Actions chỉ build và chạy test; việc lên lịch không cập nhật một cơ sở dữ liệu SQLite nằm trên server đang chạy nếu chưa có kết nối tới server.

Để tránh nhập dữ liệu rác hoặc đăng bán nhầm, hãy bật `STORE_DEMO=0` chỉ sau khi cập nhật giá VND và tồn kho thật qua `/admin`.

### Kiểm thử

```bash
npm run check
npm test
npm run build
```

Các test giả lập dữ liệu công khai, xác minh chống trùng, bảo toàn giá VND/tồn kho và tuân thủ robots.txt. Kiểm thử **không chứng minh** đã tải toàn bộ danh mục ở site nguồn: phải chạy trên máy chủ thật rồi đối chiếu số lượng xuất ra với danh mục công khai hiện tại.
