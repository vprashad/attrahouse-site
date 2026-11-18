-- Refunds recorded by hand on /admin after the money has been returned in HitPay.
-- Added 18 Nov 2026. Each line is applied on its own and "duplicate column" is ignored,
-- so this is safe to run on every start (see addColumns in src/worker/refunds.js).
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE orders ADD COLUMN refunded_by TEXT;
ALTER TABLE orders ADD COLUMN refund_restocked INTEGER NOT NULL DEFAULT 0;
-- How the money went back: hitpay, bank_transfer or other (DuitNow QR paid from a banking app cannot be refunded in HitPay).
ALTER TABLE orders ADD COLUMN refund_method TEXT
