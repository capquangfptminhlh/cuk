# CUKTECH Cloudflare Worker

API Worker và SQLite D1 schema nằm trong `worker/src` và `worker/migrations`.

**Triển khai:** xem `docs/CLOUDFLARE_GITHUB_PAGES.md` để tạo D1, thay UUID, chạy migrations và gắn domain `api.cuktech.vn`.

Dữ liệu đơn hàng, phiên đăng nhập quản trị và tồn kho nằm trên D1, không nằm trong GitHub Pages. Mật khẩu quản trị dùng Cloudflare encrypted secrets. Các biến bán hàng mặc định ở chế độ demo, không chấp nhận đơn thật. Hình và nội dung nguồn chưa được phép sử dụng vẫn ẩn.

Public catalog metadata sync defaults to enabled in the Cloudflare deployment (`CATALOG_SYNC_ENABLED=1`) and rechecks source robots.txt on every run. It imports every publicly exposed product as an UNPUBLISHED D1 draft with local price=0 and stock=0. Source images stay private until explicit approval. The importer now verifies the source collection's declared count before recording success, preserves Unicode handles and reports source/read/stored/draft/visible counts. To disable scheduled synchronization, set the variable back to 0 and redeploy. Cloudflare deployment and D1 binding remain required.
