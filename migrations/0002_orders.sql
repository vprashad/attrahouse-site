-- One row per checkout. The order id is the hold id.
-- Personal data kept to what delivery needs. Retention period: Compliance to set.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment', 'paid', 'expired', 'needs_refund', 'cancelled')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('peninsular', 'east')),
  items_json TEXT NOT NULL,
  subtotal_sen INTEGER NOT NULL,
  delivery_sen INTEGER NOT NULL,
  total_sen INTEGER NOT NULL,
  payment_request_id TEXT,
  paid_at INTEGER,
  test INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at);
