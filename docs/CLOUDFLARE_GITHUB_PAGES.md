# GitHub Pages + Cloudflare cho cuktech.vn

## Sơ đồ
- `https://cuktech.vn`: frontend React/Vite chạy trên **GitHub Pages**.
- **Cloudflare DNS**: quản lý bản ghi tên miền.
- `https://api.cuktech.vn`: backend **Cloudflare Worker** + **D1** lưu đơn hàng, khách hàng, phiên quản trị và sản phẩm.
- GitHub Pages không thể chạy Express/SQLite, nên backend VPS cũ không còn sử dụng trong phương án này.

## 1. GitHub Pages
1. GitHub repo **Settings → Pages → Source: GitHub Actions**.
2. **Custom domain** nhập `cuktech.vn`, Save **trước** khi trỏ DNS. Khi chứng chỉ đã sẵn sàng hãy bật **Enforce HTTPS**.
3. Repo **Settings → Secrets and variables → Actions → Variables**: tạo `PAGES_ENABLED=true`.
4. Push lên main sẽ chạy `.github/workflows/pages.yml`, build frontend với API `https://api.cuktech.vn`.
5. `404.html` hỗ trợ React Router khi truy cập sâu, nhưng GitHub Pages vẫn trả HTTP 404 ở một số đường dẫn con; muốn SEO mạnh về lâu dài nên chuyển frontend sang Cloudflare Pages.

## 2. DNS Cloudflare
Cần domain đã chuyển nameserver về Cloudflare. Trong **DNS → Records** xóa các A/AAAA cũ *đang xung đột* ở `@`, rồi thêm (để **DNS only** trước khi GitHub phát hành TLS):

| Loại | Tên | Giá trị |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | capquangfptminhlh.github.io |

Không đụng tới MX/TXT mail. Không trỏ `api` về GitHub Pages: gắn trực tiếp **Custom Domain** cho Cloudflare Worker.

## 3. Backend Cloudflare D1
Trên máy có Node.js, chạy trong repo:
1. `npx wrangler login`
2. `npx wrangler d1 create cuktech-store`
3. Sao chép UUID do Cloudflare cấp vào `worker/wrangler.toml` để thay `REPLACE_WITH_YOUR_D1_DATABASE_UUID`.
4. `npx wrangler d1 migrations apply cuktech-store --remote --config worker/wrangler.toml`
5. `npx wrangler secret put ADMIN_EMAIL --config worker/wrangler.toml`
6. `npx wrangler secret put ADMIN_PASSWORD --config worker/wrangler.toml` (mật khẩu ngẫu nhiên ≥14 ký tự).
7. `npx wrangler deploy --config worker/wrangler.toml`
8. Cloudflare **Workers & Pages → cuktech-api → Settings → Domains & Routes → Add Custom Domain → api.cuktech.vn**.
9. Kiểm tra `https://api.cuktech.vn/api/health`; khi hoạt động trả `backend: cloudflare-d1`.

Tùy chọn: triển khai bằng workflow GitHub thủ công `cloudflare-worker.yml` sau khi cấu hình secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variables `CLOUDFLARE_D1_DATABASE_ID` và `CLOUDFLARE_ENABLED=true`.

## 4. Bảo vệ trước khi mở bán
- Worker mặc định `STORE_DEMO=1`, `STORE_READY=0` nên **không nhận đơn thật**.
- `CATALOG_SYNC_ENABLED=0` cho đến khi xác minh quyền lấy dữ liệu/ảnh nguồn. Bộ đồng bộ chỉ dùng JSON công khai, tôn trọng robots.txt; thất bại nếu trang nguồn chặn.
- Sản phẩm đồng bộ mới mặc định ẩn, giá 0 và kho 0; chủ shop phải duyệt bản quyền ảnh, giá VND, kho thực, chính sách bảo hành/giao hàng trước khi mở bán.
- Khi đã kiểm thử thực tế và có đầy đủ thông tin mới đặt `STORE_DEMO=0` và `STORE_READY=1` rồi deploy lại.
- HTML và robots của bản GitHub Pages đang `noindex` trong chế độ demo; cần điều chỉnh khi mở bán.
- SQLite của VPS cũ không tự di chuyển sang D1. Dữ liệu thực, mật khẩu và Cloudflare token tuyệt đối không được commit.
