import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from './d1-shim.js';
import catalogue from '../src/data/products.json' with { type: 'json' };
import { seedStock } from '../src/worker/stock.js';
import { addColumns, markRefunded } from '../src/worker/refunds.js';
import { handleAdmin } from '../src/worker/admin.js';

const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
const T = Date.UTC(2026, 10, 18, 15, 0);

async function setup() {
  const db = makeD1();
  db.raw.exec(sql('0002_orders.sql'));
  await addColumns(db, sql('0003_refunds.sql'));
  await addColumns(db, sql('0004_gift.sql'));
  await seedStock(db, catalogue, T);
  return db;
}
function addOrder(db, id, status, items) {
  db.raw.prepare(`INSERT INTO orders (id, created_at, status, name, email, phone, address, region, items_json, subtotal_sen, delivery_sen, total_sen, test)
                  VALUES (?, ?, ?, 'Buyer', 'b@example.com', '0123456789', '1 Jalan Test, KL', 'peninsular', ?, 26900, 0, 26900, 1)`).run(id, T, status, JSON.stringify(items));
}
const stock = (db, sku) => ({ ...db.raw.prepare('SELECT available, sold FROM stock WHERE sku = ?').get(sku) });
const order = (db, id) => db.raw.prepare('SELECT status, refunded_at, refunded_by, refund_restocked FROM orders WHERE id = ?').get(id);

test('the refund columns can be added again and again without error', async () => {
  const db = await setup();
  await addColumns(db, sql('0003_refunds.sql'));
  await addColumns(db, sql('0003_refunds.sql'));
  assert.ok(db.raw.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'refund_restocked'));
});

test('a paid order marked refunded with "put back" returns its units once, even if clicked twice', async () => {
  const db = await setup();
  db.raw.prepare("UPDATE stock SET available = 9, sold = 1 WHERE sku = 'meal-time'").run();
  addOrder(db, 'o-paid', 'paid', [{ sku: 'meal-time', qty: 1 }]);
  const r = await markRefunded(db, 'o-paid', 'owner@example.com', T + 1000, true);
  assert.deepEqual(r, { ok: true, reason: 'refunded', restocked: true });
  assert.deepEqual(stock(db, 'meal-time'), { available: 10, sold: 0 });
  assert.equal(order(db, 'o-paid').refunded_by, 'owner@example.com');
  const again = await markRefunded(db, 'o-paid', 'owner@example.com', T + 2000, true);
  assert.equal(again.reason, 'already_refunded');
  assert.deepEqual(stock(db, 'meal-time'), { available: 10, sold: 0 });
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM stock_log WHERE reason = 'refund_restock'").get().n, 1);
});

test('a paid order marked refunded without "put back" leaves stock alone', async () => {
  const db = await setup();
  db.raw.prepare("UPDATE stock SET available = 9, sold = 1 WHERE sku = 'veggie-garden'").run();
  addOrder(db, 'o-keep', 'paid', [{ sku: 'veggie-garden', qty: 1 }]);
  const r = await markRefunded(db, 'o-keep', 'owner@example.com', T + 1000, false);
  assert.equal(r.restocked, false);
  assert.deepEqual(stock(db, 'veggie-garden'), { available: 9, sold: 1 });
  assert.equal(order(db, 'o-keep').refund_restocked, 0);
});

test('a needs_refund order never puts units back, because it never took any', async () => {
  const db = await setup();
  db.raw.prepare("UPDATE stock SET available = 0, sold = 2 WHERE sku = 'meal-time'").run();
  addOrder(db, 'o-late', 'needs_refund', [{ sku: 'meal-time', qty: 1 }]);
  const r = await markRefunded(db, 'o-late', 'owner@example.com', T + 1000, true);
  assert.deepEqual(r, { ok: true, reason: 'refunded', restocked: false });
  assert.deepEqual(stock(db, 'meal-time'), { available: 0, sold: 2 });
});

test('unpaid, expired and unknown orders cannot be marked refunded', async () => {
  const db = await setup();
  addOrder(db, 'o-wait', 'awaiting_payment', [{ sku: 'meal-time', qty: 1 }]);
  addOrder(db, 'o-exp', 'expired', [{ sku: 'meal-time', qty: 1 }]);
  assert.equal((await markRefunded(db, 'o-wait', 'u', T, true)).reason, 'not_refundable');
  assert.equal((await markRefunded(db, 'o-exp', 'u', T, true)).reason, 'not_refundable');
  assert.equal((await markRefunded(db, 'nope', 'u', T, true)).reason, 'unknown_order');
});

test('the private page needs the confirm tick, refuses posts from other sites, and shows the refund', async () => {
  const db = await setup();
  addOrder(db, 'o-late', 'needs_refund', [{ sku: 'meal-time', qty: 1 }]);
  const env = { DB: db, CHECKOUT_ENABLED: 'true', LIVE_PAYMENTS: 'false', CURRENCY: 'MYR', STOCK_DB: 'attrahouse-stock-preview' };
  const post = (fields, origin = 'https://x.test') => new Request('https://x.test/admin/refund', { method: 'POST', headers: { origin }, body: new URLSearchParams(fields) });

  const before = await (await handleAdmin(new Request('https://x.test/admin/'), env, catalogue, 'owner@example.com')).text();
  assert.match(before, /Mark refunded/);

  const noTick = await (await handleAdmin(post({ order: 'o-late' }), env, catalogue, 'owner@example.com')).text();
  assert.match(noTick, /tick &quot;I have refunded this buyer&quot; first|tick "I have refunded this buyer" first/);
  assert.equal(order(db, 'o-late').refunded_at, null);

  const noHow = await (await handleAdmin(post({ order: 'o-late', confirm: 'yes' }), env, catalogue, 'owner@example.com')).text();
  assert.match(noHow, /choose how the money went back/);
  assert.equal(order(db, 'o-late').refunded_at, null);

  const foreign = await handleAdmin(post({ order: 'o-late', confirm: 'yes', method: 'hitpay' }, 'https://evil.example'), env, catalogue, 'owner@example.com');
  assert.equal(foreign.status, 403);
  assert.equal(order(db, 'o-late').refunded_at, null);

  const ok = await (await handleAdmin(post({ order: 'o-late', confirm: 'yes', method: 'bank_transfer' }), env, catalogue, 'owner@example.com')).text();
  assert.match(ok, /marked refunded/);
  assert.match(ok, /Refunded by bank transfer, .* by owner@example.com/);
  assert.equal(db.raw.prepare("SELECT refund_method FROM orders WHERE id = 'o-late'").get().refund_method, 'bank_transfer');
  assert.ok(!/<button>Mark refunded<\/button>/.test(ok));
});
