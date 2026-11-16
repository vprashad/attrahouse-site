-- Stock counter. One row per product (SKU). available can never go below 0:
-- a hold that would take it negative fails, and the whole batch is rolled back.
CREATE TABLE IF NOT EXISTS stock (
  sku TEXT PRIMARY KEY,
  available INTEGER NOT NULL CHECK (available >= 0),
  sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  updated_at INTEGER NOT NULL
);

-- A hold keeps units aside while a buyer is on the payment page.
CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held', 'paid', 'released')),
  payment_ref TEXT
);
CREATE INDEX IF NOT EXISTS holds_status_expiry ON holds (status, expires_at);

CREATE TABLE IF NOT EXISTS hold_items (
  hold_id TEXT NOT NULL REFERENCES holds (id),
  sku TEXT NOT NULL REFERENCES stock (sku),
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (hold_id, sku)
);

-- Every change to stock, for checking and for Finance.
CREATE TABLE IF NOT EXISTS stock_log (
  at INTEGER NOT NULL,
  sku TEXT NOT NULL,
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT
);
