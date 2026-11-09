import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(here, 'data'), { recursive: true })
export const db = new DatabaseSync(process.env.DB_PATH || join(here, 'data', 'store.sqlite'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 category TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0,
 old_price INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
 capacity TEXT NOT NULL DEFAULT '', wattage TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 art TEXT NOT NULL DEFAULT 'powerbank', featured INTEGER NOT NULL DEFAULT 0,
 published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, customer TEXT NOT NULL, phone TEXT NOT NULL,
 address TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', items TEXT NOT NULL,
 total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id), expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter (
 email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)


// Additive migration: preserve existing products, pricing, orders, and admin accounts.
const sourceColumns = {
 source_id: "TEXT NOT NULL DEFAULT ''",
 source_url: "TEXT NOT NULL DEFAULT ''",
 source_title: "TEXT NOT NULL DEFAULT ''",
 source_description: "TEXT NOT NULL DEFAULT ''",
 source_tags: "TEXT NOT NULL DEFAULT ''",
 source_images: "TEXT NOT NULL DEFAULT '[]'",
 source_variants: "TEXT NOT NULL DEFAULT '[]'",
 source_updated_at: "TEXT NOT NULL DEFAULT ''",
 source_synced_at: "TEXT NOT NULL DEFAULT ''",
 source_status: "TEXT NOT NULL DEFAULT ''",
 image_url: "TEXT NOT NULL DEFAULT ''",
 media_approved: "INTEGER NOT NULL DEFAULT 0"
}
const existing = new Set(db.prepare('PRAGMA table_info(products)').all().map(c => c.name))
for (const [name, type] of Object.entries(sourceColumns)) {
 if (!existing.has(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`)
}
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_source_id ON products(source_id) WHERE source_id != '';
CREATE TABLE IF NOT EXISTS catalog_sync_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 started_at TEXT NOT NULL,
 status TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT ''
);
`)

const seed = [
 ['10-mini','cuktech-10-mini','CUKTECH 10 Mini Power Bank','powerbank',490000,590000,24,'10000mAh','55W','Nhỏ gọn','Thiết kế nhỏ gọn, tiện mang theo mỗi ngày.','mini',1],
 ['15-air','cuktech-15-air','CUKTECH 15 Air Power Bank','powerbank',1390000,1690000,18,'15000mAh','100W','Mới','Mỏng nhẹ, màn hình thông minh và sạc nhanh đa thiết bị.','air',1],
 ['10-pro','cuktech-10-150w','CUKTECH 10 Power Bank 150W','powerbank',1090000,1290000,32,'10000mAh','150W','Bán chạy','Pin dự phòng công suất cao cho người dùng năng động.','powerbank',1],
 ['15-150','cuktech-15-150w','CUKTECH 15 Power Bank 150W','powerbank',1290000,1490000,14,'20000mAh','150W','','Dung lượng lớn và nhiều cổng sạc cho công việc di động.','powerbank',0],
 ['20-210','cuktech-20-210w','CUKTECH 20 Power Bank 210W','powerbank',1890000,2090000,12,'25000mAh','210W','Cao cấp','Sức mạnh đáng tin cậy cho laptop và hệ thiết bị của bạn.','powerbank',1],
 ['30-300','cuktech-30-300w','CUKTECH 30 Power Bank 300W','powerbank',2590000,2790000,7,'40000mAh','300W','Mới','Trạm năng lượng di động cho nhu cầu công suất cao.','station',0],
 ['gan100','cuktech-gan-100w','CUKTECH No.10 GaN Charger','charger',690000,790000,21,'','100W','Bán chạy','Củ sạc GaN gọn gàng, tối ưu cho điện thoại và laptop.','charger',1],
 ['gan65','cuktech-gan-65w','CUKTECH 65W GaN 2C1A','charger',390000,490000,42,'','65W','','Ba cổng linh hoạt, sạc đa thiết bị tại nhà hay văn phòng.','charger',0],
 ['gan140','cuktech-gan-140w','CUKTECH 4-in-1 USB-C Charger','charger',990000,1190000,15,'','140W','Mới','Bộ sạc nhiều cổng hiệu suất cao cho không gian làm việc.','charger',1],
 ['gan30','cuktech-gan-30w','CUKTECH GaN3 Charger','charger',250000,320000,66,'','30W','','Giải pháp sạc nhanh nhỏ gọn cho thiết bị hằng ngày.','charger',0],
 ['cable240','cuktech-usbc-240w','CUKTECH USB-C Fast Cable','cable',149000,189000,70,'1m','240W','','Cáp USB-C tốc độ cao, linh hoạt cho thiết bị tương thích.','cable',0],
 ['cable100','cuktech-usbc-100w','CUKTECH USB-C Braided Cable','cable',99000,129000,98,'2m','100W','','Cáp bện bền bỉ, chiều dài thuận tiện cho mọi góc làm việc.','cable',0]
]
if (process.env.STORE_DEMO !== '0' && db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
 const insert = db.prepare('INSERT INTO products (id,slug,name,category,price,old_price,stock,capacity,wattage,badge,description,art,featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
 for (const p of seed) insert.run(...p)
}

export function hashPassword(password) {
 const salt = randomBytes(16).toString('hex')
 return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
export function verifyPassword(password, encoded) {
 const [salt, hash] = encoded.split(':')
 if (!salt || !hash) return false
 const actual = scryptSync(password, salt, 64)
 const expected = Buffer.from(hash, 'hex')
 return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function sha256(token) { return createHash('sha256').update(token).digest('hex') }
export function setupAdmin() {
 const email = process.env.ADMIN_EMAIL?.trim()?.toLowerCase()
 const password = process.env.ADMIN_PASSWORD
 if (!email || !password || password.length < 14 || password.includes('replace-with')) {
  console.warn('ADMIN NOT CONFIGURED: set ADMIN_EMAIL and a strong ADMIN_PASSWORD (>=14 characters).')
  return
 }
 const existing = db.prepare('SELECT id FROM admins WHERE email=?').get(email)
 if (!existing) db.prepare('INSERT INTO admins(id,email,password_hash) VALUES (?,?,?)').run(randomUUID(), email, hashPassword(password))
}
setupAdmin()
export function newOrderId() { return 'CK' + Date.now().toString(36).toUpperCase() + randomBytes(3).toString('hex').toUpperCase() }
