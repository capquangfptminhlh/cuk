# CUKTECH: GitHub Pages + Cloudflare

**Architecture:** GitHub Pages hosts a Vite/React static storefront on `cuktech.vn`, Cloudflare DNS provides domain records, Cloudflare Workers serves authenticated APIs at `api.cuktech.vn`, and Cloudflare D1 stores orders, catalog, sessions and inventory. GitHub Pages itself does not run Node.js/SQLite.

## Stage 1 — Enable Pages (safe preview)
1. GitHub repo **Settings → Pages → Build and deployment → Source → GitHub Actions**. Under **Custom domain**, enter `cuktech.vn` and Save **before** adding DNS. Enable **Enforce HTTPS** when available.
2. In repo **Settings → Secrets and variables → Actions → Variables**, create **PAGES_ENABLED** = `true`. New pushes to `main` deploy the Vite app via `.github/workflows/pages.yml`; it builds for API `https://api.cuktech.vn`.
3. In Cloudflare DNS for the `cuktech.vn` zone, remove stale conflicting root A/AAAA records and add FOUR root **A** records (DNS-only first): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. Add `www` CNAME pointing to `capquangfptminhlh.github.io` (DNS-only first). GitHub may redirect between www/root once both correctly configured. Do not delete mail/MX/TXT records.
4. DNS must resolve and GitHub Pages must finish issuing TLS before the site will work on `https://cuktech.vn`.

**Important:** `404.html` is a client-side routing fallback for the React app. Direct deep links can return HTTP 404 on GitHub Pages even when React renders the product. For strong product SEO/SSR, use Cloudflare Pages/Workers as the frontend host instead. The initial static homepage intentionally carries `noindex` while products and legal information are demo.

## Stage 2 — Cloudflare API
See `worker/README.md` for the D1 Worker, admin secrets, database migration, and custom domain. Orders and admin only work when `api.cuktech.vn` is deployed. Demo prices and stock must never accept real orders. Set `STORE_DEMO=0` and `STORE_READY=1` only after inventory and product rights verification.

## Important
- Pushing code to GitHub does **not** grant access to Cloudflare DNS and does not configure a GitHub Pages custom domain automatically.
- Do not point `api.cuktech.vn` to GitHub Pages; it must route to a Cloudflare Worker with D1.
- Keep admin secrets and Cloudflare API tokens out of Git and browser code.
