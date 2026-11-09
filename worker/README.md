# CUKTECH Cloudflare Worker

API Worker và SQLite D1 schema nằm trong `worker/src` và `worker/migrations`.

**Triển khai:** xem `docs/CLOUDFLARE_GITHUB_PAGES.md` để tạo D1, thay UUID, chạy migrations và gắn domain `api.cuktech.vn`.

Dữ liệu đơn hàng, phiên đăng nhập quản trị và tồn kho nằm trên D1, không nằm trong GitHub Pages. Mật khẩu quản trị dùng Cloudflare encrypted secrets. Các biến bán hàng mặc định ở chế độ demo, không chấp nhận đơn thật. Hình và nội dung nguồn chưa được phép sử dụng vẫn ẩn.
