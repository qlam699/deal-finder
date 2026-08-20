import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = db!;

  d.exec(`
    CREATE TABLE IF NOT EXISTS seen_products (
      chotot_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      chotot_category_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chotot_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      price INTEGER NOT NULL,
      listed_at INTEGER,
      category TEXT,
      image TEXT,
      url TEXT,
      market_price INTEGER,
      profit_margin REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      checked INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      label TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      requests_today INTEGER NOT NULL DEFAULT 0,
      last_reset TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Backward compatibility for old DB files.
  try {
    d.exec("ALTER TABLE products ADD COLUMN deleted_at TEXT");
  } catch {
    // Column already exists.
  }
  try {
    d.exec("ALTER TABLE products ADD COLUMN listed_at INTEGER");
  } catch {
    // Column already exists.
  }

  // Backfill seen history from existing products.
  d.exec(`
    INSERT OR IGNORE INTO seen_products (chotot_id)
    SELECT chotot_id FROM products
  `);

  // One-time: convert previously stored UTC timestamps to VN local (+7h).
  const migrated = d
    .prepare("SELECT value FROM settings WHERE key = 'timezone_vn_migrated'")
    .get() as { value: string } | undefined;
  if (!migrated) {
    d.exec(`
      UPDATE products
      SET created_at = datetime(created_at, '+7 hours')
      WHERE created_at IS NOT NULL;

      UPDATE products
      SET deleted_at = datetime(deleted_at, '+7 hours')
      WHERE deleted_at IS NOT NULL;

      UPDATE seen_products
      SET first_seen_at = datetime(first_seen_at, '+7 hours')
      WHERE first_seen_at IS NOT NULL;

      UPDATE api_keys
      SET created_at = datetime(created_at, '+7 hours')
      WHERE created_at IS NOT NULL;

      INSERT OR REPLACE INTO settings (key, value) VALUES ('timezone_vn_migrated', '1');
    `);
  }

  // Seed default categories if empty
  const count = d.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number };
  if (count.c === 0) {
    const insert = d.prepare("INSERT INTO categories (name, chotot_category_id, enabled) VALUES (?, ?, 1)");
    insert.run("Điện thoại", "5010");
    insert.run("Laptop", "5020");
    insert.run("Máy tính bảng", "5030");
  }
}

// Product helpers
export function insertProduct(product: {
  chotot_id: string;
  title: string;
  price: number;
  listed_at?: number;
  category?: string;
  image?: string;
  url?: string;
  raw_json?: string;
}) {
  const d = getDb();
  const tx = d.transaction((input: typeof product) => {
    const seen = d
      .prepare("SELECT chotot_id FROM seen_products WHERE chotot_id = ?")
      .get(input.chotot_id) as { chotot_id: string } | undefined;

    if (seen) {
      return { changes: 0 };
    }

    d.prepare("INSERT OR IGNORE INTO seen_products (chotot_id) VALUES (?)").run(
      input.chotot_id,
    );

    return d
      .prepare(`
        INSERT OR IGNORE INTO products (chotot_id, title, price, listed_at, category, image, url, raw_json)
        VALUES (@chotot_id, @title, @price, @listed_at, @category, @image, @url, @raw_json)
      `)
      .run(input);
  });

  return tx(product);
}

export function getUncheckedProducts(limit = 10) {
  return getDb()
    .prepare(
      "SELECT * FROM products WHERE checked = 0 AND deleted_at IS NULL ORDER BY COALESCE(listed_at, 0) DESC, created_at DESC LIMIT ?",
    )
    .all(limit);
}

export function updateProductPrice(id: number, marketPrice: number, profitMargin: number) {
  getDb().prepare("UPDATE products SET market_price = ?, profit_margin = ?, checked = 1 WHERE id = ?").run(marketPrice, profitMargin, id);
}

export function getProducts(opts: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
}) {
  const { category, search, limit = 50, offset = 0, sortBy = "created_at" } = opts;
  const validSort = ["created_at", "profit_margin", "price"].includes(sortBy) ? sortBy : "created_at";
  const dir = "DESC";

  let sql = "SELECT * FROM products WHERE deleted_at IS NULL";
  const params: unknown[] = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR CAST(chotot_id AS TEXT) LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like);
  }

  sql += ` ORDER BY ${validSort} ${dir} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return getDb().prepare(sql).all(...params);
}

export function countProducts(category?: string, search?: string) {
  let sql = "SELECT COUNT(*) as total FROM products WHERE deleted_at IS NULL";
  const params: unknown[] = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (title LIKE ? OR CAST(chotot_id AS TEXT) LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like);
  }

  const row = getDb().prepare(sql).get(...params) as { total: number };
  return row.total;
}

export function getDeletedProducts(opts: { limit?: number; offset?: number }) {
  const { limit = 50, offset = 0 } = opts;
  return getDb()
    .prepare("SELECT * FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
}

export function countDeletedProducts() {
  const row = getDb()
    .prepare("SELECT COUNT(*) as total FROM products WHERE deleted_at IS NOT NULL")
    .get() as { total: number };
  return row.total;
}

export function softDeleteProduct(id: number) {
  return getDb()
    .prepare("UPDATE products SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
}

export function restoreProduct(id: number) {
  return getDb()
    .prepare("UPDATE products SET deleted_at = NULL WHERE id = ?")
    .run(id);
}

export function hardDeleteProduct(id: number) {
  return getDb()
    .prepare("DELETE FROM products WHERE id = ?")
    .run(id);
}

export function hardDeleteAllTrashedProducts() {
  return getDb()
    .prepare("DELETE FROM products WHERE deleted_at IS NOT NULL")
    .run();
}

// Category helpers
export function getCategories() {
  return getDb().prepare("SELECT * FROM categories ORDER BY id").all();
}

export function getEnabledCategories() {
  return getDb().prepare("SELECT * FROM categories WHERE enabled = 1").all();
}

export function toggleCategory(id: number, enabled: boolean) {
  getDb().prepare("UPDATE categories SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function addCategory(name: string, chotot_category_id: string) {
  return getDb().prepare("INSERT INTO categories (name, chotot_category_id) VALUES (?, ?)").run(name, chotot_category_id);
}

// API Key helpers
export function getApiKeys() {
  return getDb().prepare("SELECT * FROM api_keys ORDER BY provider, priority ASC").all();
}

export function getActiveKeyForProvider(provider: string) {
  const d = getDb();
  // Reset counters if day changed
  d.prepare(
    "UPDATE api_keys SET requests_today = 0, last_reset = date('now', 'localtime') WHERE last_reset != date('now', 'localtime')",
  ).run();
  return d.prepare(
    "SELECT * FROM api_keys WHERE provider = ? AND status = 'active' ORDER BY priority ASC LIMIT 1"
  ).get(provider);
}

export function getNextAvailableKey() {
  const d = getDb();
  d.prepare(
    "UPDATE api_keys SET requests_today = 0, last_reset = date('now', 'localtime') WHERE last_reset != date('now', 'localtime')",
  ).run();
  return d.prepare(
    "SELECT * FROM api_keys WHERE status = 'active' ORDER BY priority ASC"
  ).all();
}

export function incrementKeyUsage(id: number) {
  getDb().prepare("UPDATE api_keys SET requests_today = requests_today + 1 WHERE id = ?").run(id);
}

export function markKeyError(id: number, error: string) {
  getDb().prepare("UPDATE api_keys SET last_error = ?, status = 'error' WHERE id = ?").run(error, id);
}

export function addApiKey(provider: string, apiKey: string, label?: string) {
  const d = getDb();
  const maxPriority = d.prepare("SELECT COALESCE(MAX(priority), 0) as m FROM api_keys WHERE provider = ?").get(provider) as { m: number };
  return d.prepare("INSERT INTO api_keys (provider, api_key, label, priority) VALUES (?, ?, ?, ?)").run(provider, apiKey, label || null, maxPriority.m + 1);
}

export function deleteApiKey(id: number) {
  getDb().prepare("DELETE FROM api_keys WHERE id = ?").run(id);
}

export function resetKeyStatus(id: number) {
  getDb().prepare("UPDATE api_keys SET status = 'active', last_error = NULL WHERE id = ?").run(id);
}
