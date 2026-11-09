-- Apply with: npx wrangler d1 migrations apply cuktech-store --remote --config worker/wrangler.toml
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 category TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, old_price INTEGER NOT NULL DEFAULT 0,
 stock INTEGER NOT NULL DEFAULT 0, capacity TEXT NOT NULL DEFAULT '', wattage TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', art TEXT NOT NULL DEFAULT 'powerbank',
 featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, image_url TEXT NOT NULL DEFAULT '',
 media_approved INTEGER NOT NULL DEFAULT 0, source_id TEXT UNIQUE,
 source_url TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '',
 source_description TEXT NOT NULL DEFAULT '', source_tags TEXT NOT NULL DEFAULT '',
 source_images TEXT NOT NULL DEFAULT '[]', source_variants TEXT NOT NULL DEFAULT '[]',
 source_updated_at TEXT NOT NULL DEFAULT '', source_synced_at TEXT NOT NULL DEFAULT '',
 source_status TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS products_public ON products (published,featured,created_at);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, customer TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', items TEXT NOT NULL, total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 unit_price INTEGER NOT NULL CHECK(unit_price > 0), PRIMARY KEY(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS checkout_requests (
 request_key TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
 order_id TEXT NOT NULL REFERENCES orders(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_returns (order_id TEXT PRIMARY KEY REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS newsletter (email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS request_limits (scope TEXT PRIMARY KEY, start_ms INTEGER NOT NULL, hits INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS catalog_sync_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL
);

-- Reserve inventory inside the same D1 transaction as the order record.
CREATE TRIGGER IF NOT EXISTS order_item_reserve BEFORE INSERT ON order_items BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM products WHERE id=NEW.product_id AND published=1 AND price=NEW.unit_price
  AND stock>=NEW.quantity AND (source_id IS NULL OR media_approved=1)
 ) THEN RAISE(ABORT,'OUT_OF_STOCK_OR_PRICE_CHANGED') END;
 UPDATE products SET stock=stock-NEW.quantity WHERE id=NEW.product_id;
END;

-- Cancelled orders return reserved stock once, even when a request is retried.
CREATE TRIGGER IF NOT EXISTS order_return_stock AFTER INSERT ON inventory_returns BEGIN
 UPDATE products
 SET stock=stock + (SELECT COALESCE(SUM(quantity),0) FROM order_items
                   WHERE order_id=NEW.order_id AND product_id=products.id)
 WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.order_id);
END;

-- Illustrative catalog only; price/stock are NOT live until admin reviews.
INSERT OR IGNORE INTO products(id,slug,name,category,description,art,featured,published,capacity,wattage)
VALUES
 ('demo-10','cuktech-10-mini','CUKTECH 10 Mini Power Bank','powerbank','Pin dự phòng CUKTECH nhỏ gọn','mini',1,1,'10000mAh','55W'),
 ('demo-15','cuktech-15-air','CUKTECH 15 Air Power Bank','powerbank','Thiết kế mỏng nhẹ và sạc nhanh','air',1,1,'15000mAh','100W'),
 ('demo-20','cuktech-20-210w','CUKTECH 20 Power Bank','powerbank','Công suất cao cho nhiều thiết bị','powerbank',1,1,'25000mAh','210W'),
 ('demo-gan','cuktech-gan-100w','CUKTECH No.10 GaN Charger','charger','Củ sạc GaN đa năng','charger',1,1,'','100W');
