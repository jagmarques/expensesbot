import Database from 'better-sqlite3';
import path from 'path';
import { env } from '../../config/env';
import { generateId } from '../../utils/id';

let db: Database.Database;

export function initializeDatabase(): Database.Database {
  const dbPath = path.resolve(env.DB_PATH);
  db = new Database(dbPath);
  
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  createSchema();
  seedDefaultCategories();
  
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

function createSchema(): void {
  const statements = [
    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      default_currency TEXT DEFAULT 'EUR',
      timezone TEXT DEFAULT 'UTC',
      last_bot_message_id INTEGER,
      last_chat_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      icon TEXT,
      parent_id TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )`,
    
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_name TEXT,
      total_amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      purchase_date TEXT NOT NULL,
      receipt_photo_id TEXT,
      ocr_confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      normalized_name TEXT,
      quantity REAL,
      unit TEXT,
      unit_price INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      category_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      store_name TEXT,
      unit_price INTEGER NOT NULL,
      unit TEXT,
      purchase_date TEXT NOT NULL,
      item_id TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS budget_limits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      monthly_limit INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      alert_threshold REAL DEFAULT 0.8,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE(user_id, category_id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS recurring_expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'EUR',
      category_id TEXT,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    
    `CREATE TABLE IF NOT EXISTS receipt_photos (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      telegram_file_id TEXT,
      file_size INTEGER,
      upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
      retention_days INTEGER DEFAULT 90,
      delete_after TEXT,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    )`,
    
    `CREATE TABLE IF NOT EXISTS user_patterns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      pattern_value TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      match_count INTEGER DEFAULT 1,
      UNIQUE(user_id, pattern_type, pattern_key)
    )`,

    `CREATE TABLE IF NOT EXISTS user_context (
      user_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE INDEX IF NOT EXISTS idx_items_normalized_name ON items(normalized_name)`,
    `CREATE INDEX IF NOT EXISTS idx_price_history_name_date ON price_history(normalized_name, purchase_date)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, purchase_date)`,
    `CREATE INDEX IF NOT EXISTS idx_items_expense_id ON items(expense_id)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`,
  ];
  
  for (const stmt of statements) {
    db.exec(stmt);
  }
}

function seedDefaultCategories(): void {
  const categories = [
    { name: 'Groceries', icon: '🛒' },
    { name: 'Restaurants', icon: '🍽️' },
    { name: 'Transportation', icon: '🚗' },
    { name: 'Entertainment', icon: '🎬' },
    { name: 'Health', icon: '💊' },
    { name: 'Shopping', icon: '🛍️' },
    { name: 'Personal', icon: '💇' },
    { name: 'Bills', icon: '📄' },
    { name: 'Other', icon: '📦' },
  ];
  
  const checkStmt = db.prepare(`SELECT COUNT(*) as count FROM categories WHERE is_system = 1`);
  const result = checkStmt.get() as { count: number };
  
  if (result.count === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO categories (id, user_id, name, icon, is_system)
      VALUES (?, ?, ?, ?, 1)
    `);
    
    for (const cat of categories) {
      insertStmt.run(generateId(), null, cat.name, cat.icon);
    }
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
