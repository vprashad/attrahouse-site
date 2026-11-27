-- Marketing tick at checkout (Compliance, 26 Nov 2026: email and WhatsApp). Optional. The time of the tick is kept
-- as the record of consent. Deleted on unsubscribe or 24 months after the last order (clean-up not built yet).
-- No semicolons in comments: addColumns splits this file on them.
ALTER TABLE orders ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN marketing_consent_at INTEGER
