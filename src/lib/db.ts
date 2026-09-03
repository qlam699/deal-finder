import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, "data.db")
  : path.join(process.cwd(), "data.db");

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
      deal_price INTEGER,
      profit_margin REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      checked INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      content TEXT,
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
  try {
    d.exec("ALTER TABLE products ADD COLUMN content TEXT");
  } catch {
    // Column already exists.
  }
  try {
    d.exec("ALTER TABLE products ADD COLUMN deal_price INTEGER");
  } catch {
    // Column already exists.
  }
  // Older / wrong deal rows: deal phải ≤ giá Chợ Tốt (listing).
  d.exec(`
    UPDATE products
    SET deal_price = CASE
      WHEN market_price IS NULL OR market_price <= 0 THEN NULL
      WHEN price <= 0 THEN NULL
      ELSE MIN(price, CAST(ROUND(market_price * 0.9) AS INTEGER))
    END
    WHERE market_price IS NOT NULL
      AND (deal_price IS NULL OR deal_price > price)
  `);

  // Backfill content from raw_json.body for older rows.
  const missingContent = d
    .prepare(
      "SELECT id, raw_json FROM products WHERE (content IS NULL OR content = '') AND raw_json IS NOT NULL",
    )
    .all() as { id: number; raw_json: string }[];
  const updateContent = d.prepare("UPDATE products SET content = ? WHERE id = ?");
  for (const row of missingContent) {
    try {
      const raw = JSON.parse(row.raw_json) as { body?: string };
      if (raw.body) updateContent.run(raw.body, row.id);
    } catch {
      // ignore invalid json
    }
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
    const insert = d.prepare("INSERT INTO categories (name, chotot_category_id, enabled) VALUES (?, ?, ?)");
    insert.run("Điện thoại", "5010", 1);
    insert.run("Laptop", "5030", 1);
    insert.run("Máy tính bảng", "5040", 0);
    insert.run("Xe đạp", "2060", 0);
  }

  // Fix wrong historical seed: 5020=Tivi/Âm thanh, 5030=Laptop, 5040=Máy tính bảng
  const catFixed = d.prepare("SELECT value FROM settings WHERE key = 'chotot_cg_ids_fixed'").get() as
    | { value: string }
    | undefined;
  if (!catFixed) {
    d.prepare(
      "UPDATE categories SET chotot_category_id = '5030' WHERE name = 'Laptop' AND chotot_category_id = '5020'",
    ).run();
    d.prepare(
      "UPDATE categories SET chotot_category_id = '5040' WHERE name = 'Máy tính bảng' AND chotot_category_id = '5030'",
    ).run();
    d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('chotot_cg_ids_fixed', '1')").run();
  }

  const xeDapAdded = d.prepare("SELECT value FROM settings WHERE key = 'category_xe_dap_added'").get() as
    | { value: string }
    | undefined;
  if (!xeDapAdded) {
    d.prepare(
      "INSERT OR IGNORE INTO categories (name, chotot_category_id, enabled) VALUES ('Xe đạp', '2060', 0)",
    ).run();
    d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('category_xe_dap_added', '1')").run();
  }

  const defaultEnabled = d.prepare("SELECT value FROM settings WHERE key = 'category_default_enabled_v2'").get() as
    | { value: string }
    | undefined;
  if (!defaultEnabled) {
    d.prepare("UPDATE categories SET enabled = 0 WHERE name IN ('Máy tính bảng', 'Xe đạp')").run();
    d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('category_default_enabled_v2', '1')").run();
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
  content?: string;
  raw_json?: string;
}): { changes: number; productId: number | null } {
  const d = getDb();
  const tx = d.transaction((input: typeof product) => {
    const seen = d
      .prepare("SELECT chotot_id FROM seen_products WHERE chotot_id = ?")
      .get(input.chotot_id) as { chotot_id: string } | undefined;

    if (seen) {
      return { changes: 0, productId: null as number | null };
    }

    d.prepare("INSERT OR IGNORE INTO seen_products (chotot_id) VALUES (?)").run(
      input.chotot_id,
    );

    const result = d
      .prepare(`
        INSERT OR IGNORE INTO products (chotot_id, title, price, listed_at, category, image, url, content, raw_json)
        VALUES (@chotot_id, @title, @price, @listed_at, @category, @image, @url, @content, @raw_json)
      `)
      .run(input);

    return {
      changes: result.changes,
      productId: result.changes > 0 ? Number(result.lastInsertRowid) : null,
    };
  });

  return tx(product);
}

export function getProductsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT * FROM products WHERE id IN (${placeholders}) AND deleted_at IS NULL AND checked = 0`,
    )
    .all(...ids);
}

export function getProductById(id: number) {
  return getDb()
    .prepare("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL")
    .get(id);
}

export function getUncheckedProducts(limit = 5) {
  return getDb()
    .prepare(
      "SELECT * FROM products WHERE checked = 0 AND deleted_at IS NULL ORDER BY COALESCE(listed_at, 0) DESC, created_at DESC LIMIT ?",
    )
    .all(limit);
}

export function updateProductPrice(
  id: number,
  marketPrice: number,
  dealPrice: number,
  profitMargin: number,
) {
  getDb()
    .prepare(
      "UPDATE products SET market_price = ?, deal_price = ?, profit_margin = ?, checked = 1 WHERE id = ?",
    )
    .run(marketPrice, dealPrice, profitMargin, id);
}

const PRODUCT_SORT_COLUMNS: Record<string, string> = {
  title: "title",
  category: "category",
  listed_at: "COALESCE(listed_at, strftime('%s', created_at))",
  price: "price",
  deal_price: "deal_price",
  market_price: "market_price",
  profit_margin: "profit_margin",
  created_at: "created_at",
};

export function getProducts(opts: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const { category, search, limit = 50, offset = 0, sortBy = "created_at", sortOrder = "desc" } = opts;
  const sortColumn = PRODUCT_SORT_COLUMNS[sortBy] ?? PRODUCT_SORT_COLUMNS.created_at;
  const dir = sortOrder === "asc" ? "ASC" : "DESC";

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

  sql += ` ORDER BY ${sortColumn} ${dir} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return getDb().prepare(sql).all(...params);
}

export function getAllActiveProductsForExistenceCheck() {
  return getDb()
    .prepare(
      "SELECT id, url FROM products WHERE deleted_at IS NULL AND url IS NOT NULL AND url != '' ORDER BY id ASC",
    )
    .all() as { id: number; url: string }[];
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
  return getDb().prepare("SELECT * FROM api_keys ORDER BY priority ASC, id ASC").all();
}

export function getActiveKeyForProvider(provider: string) {
  const d = getDb();
  refreshDailyKeyCounters(d);
  return d.prepare(
    "SELECT * FROM api_keys WHERE provider = ? AND status = 'active' ORDER BY priority ASC, id ASC LIMIT 1"
  ).get(provider);
}

export function getNextAvailableKey() {
  const d = getDb();
  refreshDailyKeyCounters(d);
  return d.prepare(
    "SELECT * FROM api_keys WHERE status = 'active' ORDER BY priority ASC, id ASC"
  ).all();
}

function refreshDailyKeyCounters(d: Database.Database) {
  // New VN local day: reset counters and revive keys exhausted by daily quota.
  d.prepare(`
    UPDATE api_keys
    SET
      requests_today = 0,
      last_reset = date('now', 'localtime'),
      status = 'active',
      last_error = NULL
    WHERE last_reset != date('now', 'localtime')
      AND (
        status = 'exhausted_today'
        OR (
          status = 'error'
          AND (
            lower(COALESCE(last_error, '')) LIKE '%429%'
            OR lower(COALESCE(last_error, '')) LIKE '%too many requests%'
            OR lower(COALESCE(last_error, '')) LIKE '%quota exceeded%'
            OR lower(COALESCE(last_error, '')) LIKE '%free_tier%'
            OR lower(COALESCE(last_error, '')) LIKE '%free tier%'
          )
        )
      )
  `).run();

  // Still reset counters for other keys (error/active) on new day.
  d.prepare(`
    UPDATE api_keys
    SET requests_today = 0, last_reset = date('now', 'localtime')
    WHERE last_reset != date('now', 'localtime')
  `).run();
}

export function incrementKeyUsage(id: number) {
  getDb().prepare("UPDATE api_keys SET requests_today = requests_today + 1 WHERE id = ?").run(id);
}

export function markKeyError(id: number, error: string) {
  getDb().prepare("UPDATE api_keys SET last_error = ?, status = 'error' WHERE id = ?").run(error, id);
}

/** Daily quota / rate-limit: skip this key until next local day. */
export function markKeyExhaustedToday(id: number, error: string) {
  getDb()
    .prepare(
      "UPDATE api_keys SET last_error = ?, status = 'exhausted_today', last_reset = date('now', 'localtime') WHERE id = ?",
    )
    .run(error, id);
}

export function addApiKey(provider: string, apiKey: string, label?: string) {
  const d = getDb();
  const maxPriority = d.prepare("SELECT COALESCE(MAX(priority), 0) as m FROM api_keys").get() as {
    m: number;
  };
  return d
    .prepare("INSERT INTO api_keys (provider, api_key, label, priority) VALUES (?, ?, ?, ?)")
    .run(provider, apiKey, label || null, maxPriority.m + 1);
}

/** Persist list order: first id = highest priority (runs first). */
export function reorderApiKeys(orderedIds: number[]) {
  const d = getDb();
  const update = d.prepare("UPDATE api_keys SET priority = ? WHERE id = ?");
  const tx = d.transaction((ids: number[]) => {
    ids.forEach((id, index) => {
      update.run(index + 1, id);
    });
  });
  tx(orderedIds);
}

export function deleteApiKey(id: number) {
  getDb().prepare("DELETE FROM api_keys WHERE id = ?").run(id);
}

export function resetKeyStatus(id: number) {
  getDb().prepare("UPDATE api_keys SET status = 'active', last_error = NULL WHERE id = ?").run(id);
}
