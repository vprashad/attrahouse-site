-- Free gift wrap (Design spec 4.4). Built switched off: features.json giftWrap is false (Viveg 22 Nov, Admin 24 Nov 2026).
-- The message text must be deleted 90 days after delivery (Compliance retention). That clean-up has to exist
-- before the switch is turned on. Applied like 0003: each line alone, "duplicate column" ignored.
-- No semicolons in comments: addColumns splits this file on them.
ALTER TABLE orders ADD COLUMN gift_wrap INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN gift_message TEXT;
ALTER TABLE orders ADD COLUMN hide_prices INTEGER NOT NULL DEFAULT 0
