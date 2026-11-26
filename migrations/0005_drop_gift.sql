-- Gift wrap was dropped by Viveg (24 Nov 2026 night, Admin update), and he chose to remove its columns (26 Nov 2026).
-- Only the preview's test database ever had them. Each line runs alone, and "no such column" is ignored,
-- so this is safe on a database that never had them and on every later start.
-- No semicolons in comments: addColumns splits this file on them.
ALTER TABLE orders DROP COLUMN gift_wrap;
ALTER TABLE orders DROP COLUMN gift_message;
ALTER TABLE orders DROP COLUMN hide_prices
