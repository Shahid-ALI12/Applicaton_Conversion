export const migrations = [
    {
        id: '001_core_schema',
        sql: `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('admin','operator')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  urdu_name TEXT,
  default_rate REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit' CHECK(type IN ('credit','cash')),
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  opening_balance REAL NOT NULL DEFAULT 0,
  advance_payment REAL NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  stock_quantity REAL NOT NULL DEFAULT 0,
  last_bag_weight_kg REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, location_id)
);

CREATE TABLE IF NOT EXISTS mix_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  order_date TEXT NOT NULL DEFAULT (date('now')),
  target_weight_kg REAL,
  cash_received REAL NOT NULL DEFAULT 0,
  driver_name TEXT,
  driver_rent REAL NOT NULL DEFAULT 0,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL,
  rate_per_bag REAL NOT NULL,
  rickshaw_fare REAL NOT NULL DEFAULT 0,
  cash_received REAL NOT NULL DEFAULT 0,
  sale_date TEXT NOT NULL DEFAULT (date('now')),
  unit_type TEXT NOT NULL DEFAULT 'bags' CHECK(unit_type IN ('bags','kg')),
  bag_weight_kg REAL,
  mix_order_id INTEGER REFERENCES mix_orders(id) ON DELETE SET NULL,
  transaction_group_id TEXT,
  rickshaw_driver_name TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_date TEXT NOT NULL DEFAULT (date('now')),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL,
  rate_per_bag REAL NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  settled_by_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  cash_paid REAL NOT NULL DEFAULT 0,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  notes TEXT,
  entered_by TEXT,
  unit_type TEXT NOT NULL DEFAULT 'bags' CHECK(unit_type IN ('bags','kg')),
  bag_weight_kg REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL DEFAULT (date('now')),
  account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  amount REAL NOT NULL CHECK(amount >= 0),
  source_type TEXT,
  source_id INTEGER,
  description TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_date TEXT NOT NULL DEFAULT (date('now')),
  from_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  to_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK(amount > 0),
  notes TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  daily_wage REAL NOT NULL DEFAULT 0 CHECK(daily_wage >= 0),
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labour_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  labour_id INTEGER NOT NULL REFERENCES labours(id) ON DELETE RESTRICT,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  amount REAL NOT NULL CHECK(amount >= 0),
  payment_type TEXT NOT NULL DEFAULT 'salary' CHECK(payment_type IN ('salary','advance','expense')),
  description TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labour_daily_wages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  labour_id INTEGER NOT NULL REFERENCES labours(id) ON DELETE RESTRICT,
  wage_date TEXT NOT NULL DEFAULT (date('now')),
  amount REAL NOT NULL CHECK(amount >= 0),
  notes TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(labour_id, wage_date)
);

CREATE TABLE IF NOT EXISTS customer_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  amount REAL NOT NULL CHECK(amount >= 0),
  applied_to_opening REAL NOT NULL DEFAULT 0,
  applied_to_advance REAL NOT NULL DEFAULT 0,
  opening_balance_before REAL,
  opening_balance_after REAL,
  advance_before REAL,
  advance_after REAL,
  notes TEXT,
  entered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_mix_order_id ON sales(mix_order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_ledger_acct_date ON cash_ledger(account_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(deleted_at);
    `,
    },
];
//# sourceMappingURL=migrations.js.map