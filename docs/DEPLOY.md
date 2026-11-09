# Triển khai CUKTECH VN bằng Docker Compose trên VPS

Ứng dụng có Express + SQLite, **không chạy như website tĩnh thuần túy**. Không dùng hosting serverless không có ổ đĩa bền vững để lưu đơn.

## Cài đặt
Yêu cầu Docker Engine + Docker Compose plugin và VPS có HTTPS reverse proxy. Clone repo, tạo file **.env** riêng trên máy chủ từ **.env.example**, sau đó:
- Đặt `NODE_ENV=production`, `STORE_DEMO=0`, `STORE_READY=0` (không mở bán ngay).
- Đặt `ADMIN_EMAIL` và mật khẩu mạnh `ADMIN_PASSWORD` tối thiểu 14 ký tự. Không đưa .env lên GitHub.
- Đặt `CATALOG_SYNC_ENABLED=0` lúc đầu, chỉ bật khi đã xác minh được phép dùng dữ liệu từ nguồn.
- Chạy `docker compose up -d --build`.
- Kiểm tra `curl -fsS http://127.0.0.1:3001/api/health`, phải trả `{"ok":true}`.

## Tên miền
Trỏ bản ghi DNS `A` của **cuktech.vn** đến IP VPS do anh kiểm soát. Cấu hình reverse proxy Nginx/Caddy/Cloudflare với chứng chỉ TLS hợp lệ cho `https://cuktech.vn`, chuyển tiếp về `http://127.0.0.1:3001` và giữ header `Host`. Không mở trực tiếp cổng 3001 ra Internet; Compose chỉ bind loopback.

## Đồng bộ sản phẩm & mở bán
Vào `https://cuktech.vn/admin`. Nhập sản phẩm thực hoặc chạy đồng bộ trong tab admin, đối chiếu số lượng với cuktech.com, xác minh quyền sử dụng ảnh và mô tả, điền giá VND và tồn kho thật. Kiểm tra từng sản phẩm phải bán. Chỉ sau khi hoàn tất kiểm thử giao nhận, pháp lý, giá và kho mới đặt `STORE_READY=1` **đồng thời** `STORE_DEMO=0` rồi chạy lại Compose.

## Vận hành
- Volume `cuktech_data` giữ SQLite qua lần rebuild. **Không chạy nhiều bản web ghi vào cùng một SQLite volume trên nhiều máy**, dùng PostgreSQL nếu cần scale.
- Sao lưu SQLite theo cơ chế nhất quán (SQLite Online Backup API hoặc ngừng ghi trước khi sao lưu); luôn thử khôi phục backup trên môi trường riêng.
- `docker compose logs --tail=100 -f web` để xem lỗi; `docker compose ps` để xem health.
- Không thêm thanh toán online nếu chưa có hợp đồng và tích hợp chính thức của cổng thanh toán.
- Chưa có DNS, chứng chỉ, VPS hoặc dữ liệu sản phẩm thật trong mã nguồn; push GitHub không tự triển khai hệ thống.
