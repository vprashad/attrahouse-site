import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './d1-shim.js';
import catalogue from '../src/data/products.json' with { type: 'json' };
import { seedStock, readStock, createHold, releaseHold, releaseExpired, markPaid, setAvailable, validateItems, priceItems, stockState } from '../src/worker/stock.js';

let n = 0;
const id = () => `hold-${++n}`;
const T0 = Date.UTC(2026, 11, 1);
const avail = (db, sku) => { const r = db.raw.prepare('SELECT available, sold FROM stock WHERE sku = ?').get(sku); return r && { ...r }; };

async function fresh() { const db = makeD1(); await seedStock(db, catalogue, T0); return db; }

test('seeds the for-sale numbers Viveg set, and skips products without one', async () => {
  const db = await fresh();
  assert.equal(avail(db, 'fruit-basket').available, 10);
  assert.equal(avail(db, 'meal-time').available, 5);
  assert.equal(avail(db, 'grand-kitchen-bundle').available, 5);
  assert.equal(avail(db, 'veggie-garden').available, 10);
  assert.equal(avail(db, 'pouch-holder').available, 27);
  await seedStock(db, catalogue, T0); // running again changes nothing
  assert.equal(avail(db, 'fruit-basket').available, 10);
});

test('shows In stock, then Only N left from 3 down, then Sold out', () => {
  assert.deepEqual(stockState(10, 3), { state: 'in_stock' });
  assert.deepEqual(stockState(4, 3), { state: 'in_stock' });
  assert.deepEqual(stockState(3, 3), { state: 'low', left: 3 });
  assert.deepEqual(stockState(1, 3), { state: 'low', left: 1 });
  assert.deepEqual(stockState(0, 3), { state: 'sold_out' });
});

test('selling all 10 Fruit Baskets turns it Sold out, and an 11th is refused', async () => {
  const db = await fresh();
  for (let i = 0; i < 10; i++) {
    const h = await createHold(db, [{ sku: 'fruit-basket', qty: 1 }], T0, id);
    assert.equal(h.ok, true);
    assert.deepEqual(await markPaid(db, h.holdId, `pay-${i}`, T0), { ok: true, reason: 'paid' });
  }
  assert.deepEqual(avail(db, 'fruit-basket'), { available: 0, sold: 10 });
  assert.equal((await readStock(db, 3, T0))['fruit-basket'].state, 'sold_out');
  const extra = await createHold(db, [{ sku: 'fruit-basket', qty: 1 }], T0, id);
  assert.deepEqual(extra, { ok: false, reason: 'sold_out', skus: ['fruit-basket'] });
});

test('two buyers going for the last unit: one gets it, the other is told sold out', async () => {
  const db = await fresh();
  await setAvailable(db, 'meal-time', 1, T0);
  const [a, b] = await Promise.all([
    createHold(db, [{ sku: 'meal-time', qty: 1 }], T0, id),
    createHold(db, [{ sku: 'meal-time', qty: 1 }], T0, id),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal(avail(db, 'meal-time').available, 0);
});

test('a basket that cannot be fully covered takes nothing at all', async () => {
  const db = await fresh();
  await setAvailable(db, 'chefs-knife-block', 0, T0);
  const r = await createHold(db, [{ sku: 'fruit-basket', qty: 2 }, { sku: 'chefs-knife-block', qty: 1 }], T0, id);
  assert.deepEqual(r, { ok: false, reason: 'sold_out', skus: ['chefs-knife-block'] });
  assert.equal(avail(db, 'fruit-basket').available, 10);
});

test('an unpaid hold goes back on sale after 20 minutes', async () => {
  const db = await fresh();
  const h = await createHold(db, [{ sku: 'meal-time', qty: 2 }], T0, id);
  assert.equal(avail(db, 'meal-time').available, 3);
  assert.equal(await releaseExpired(db, T0 + 19 * 60_000), 0);
  assert.equal(await releaseExpired(db, T0 + 21 * 60_000), 1);
  assert.equal(avail(db, 'meal-time').available, 5);
  assert.equal(await releaseHold(db, h.holdId, T0 + 22 * 60_000), false); // already released: no double return
  assert.equal(avail(db, 'meal-time').available, 5);
});

test('a payment notice arriving twice is counted once', async () => {
  const db = await fresh();
  const h = await createHold(db, [{ sku: 'veggie-garden', qty: 1 }], T0, id);
  assert.equal((await markPaid(db, h.holdId, 'pay-x', T0)).reason, 'paid');
  assert.equal((await markPaid(db, h.holdId, 'pay-x', T0)).reason, 'already_paid');
  assert.deepEqual(avail(db, 'veggie-garden'), { available: 9, sold: 1 });
});

test('a late payment keeps the sale if stock is still there, and asks for a refund if not', async () => {
  const db = await fresh();
  await setAvailable(db, 'chefs-knife-block', 1, T0);
  const late = await createHold(db, [{ sku: 'chefs-knife-block', qty: 1 }], T0, id);
  await releaseExpired(db, T0 + 21 * 60_000);
  assert.equal((await markPaid(db, late.holdId, 'pay-late', T0 + 22 * 60_000)).reason, 'paid_late');
  assert.deepEqual(avail(db, 'chefs-knife-block'), { available: 0, sold: 1 });

  await setAvailable(db, 'grand-kitchen-bundle', 1, T0);
  const gone = await createHold(db, [{ sku: 'grand-kitchen-bundle', qty: 1 }], T0, id);
  await releaseExpired(db, T0 + 21 * 60_000);
  const other = await createHold(db, [{ sku: 'grand-kitchen-bundle', qty: 1 }], T0 + 21 * 60_000, id);
  await markPaid(db, other.holdId, 'pay-other', T0 + 21 * 60_000);
  assert.equal((await markPaid(db, gone.holdId, 'pay-gone', T0 + 22 * 60_000)).reason, 'needs_refund');
  assert.equal(avail(db, 'grand-kitchen-bundle').available, 0);
});

test('restocking by hand puts the product back on sale', async () => {
  const db = await fresh();
  await setAvailable(db, 'veggie-garden', 0, T0);
  assert.equal((await readStock(db, 3, T0))['veggie-garden'].state, 'sold_out');
  await setAvailable(db, 'veggie-garden', 6, T0);
  assert.equal((await readStock(db, 3, T0))['veggie-garden'].state, 'in_stock');
  assert.equal((await setAvailable(db, 'veggie-garden', -1, T0)).ok, false);
});

test('the Bundle is its own stock: selling one does not touch the four sets', async () => {
  const db = await fresh();
  const h = await createHold(db, [{ sku: 'grand-kitchen-bundle', qty: 1 }], T0, id);
  await markPaid(db, h.holdId, 'pay-b', T0);
  assert.equal(avail(db, 'grand-kitchen-bundle').available, 4);
  for (const s of ['fruit-basket', 'veggie-garden']) assert.equal(avail(db, s).available, 10);
  for (const s of ['meal-time', 'chefs-knife-block']) assert.equal(avail(db, s).available, 5);
});

test('holders must come in twos, priced RM29 for any 2', () => {
  assert.equal(validateItems([{ sku: 'pouch-holder', qty: 1 }], catalogue).error, 'holders_in_pairs');
  const ok = validateItems([{ sku: 'pouch-holder', qty: 1 }, { sku: 'juicebox-holder', qty: 1 }], catalogue);
  assert.equal(ok.error, undefined);
  assert.equal(priceItems(ok.items, catalogue), 2900);
  const four = validateItems([{ sku: 'juicebox-holder', qty: 4 }, { sku: 'fruit-basket', qty: 1 }], catalogue);
  assert.equal(priceItems(four.items, catalogue), 2 * 2900 + 29900);
});

test('rejects unknown products and silly quantities', () => {
  assert.equal(validateItems([], catalogue).error, 'empty_basket');
  assert.equal(validateItems([{ sku: 'banana', qty: 1 }], catalogue).error, 'unknown_product');
  assert.equal(validateItems([{ sku: 'fruit-basket', qty: 0 }], catalogue).error, 'bad_quantity');
  assert.equal(validateItems([{ sku: 'fruit-basket', qty: 1.5 }], catalogue).error, 'bad_quantity');
});

test('prices match Finance: the Bundle costs exactly what its three sets cost, RM817, and the free Knife Block sells at RM69', () => {
  const three = ['fruit-basket', 'veggie-garden', 'meal-time'].map((sku) => ({ sku, qty: 1 }));
  const bundle = catalogue.products.find((p) => p.sku === 'grand-kitchen-bundle');
  assert.deepEqual(bundle.contains, three.map((i) => i.sku));
  assert.deepEqual(bundle.free, ['chefs-knife-block']);
  // Compliance (CPA s.14(2)): with a free item, the price must not be above the goods' regular price.
  assert.equal(priceItems([{ sku: bundle.sku, qty: 1 }], catalogue), priceItems(three, catalogue));
  assert.equal(bundle.priceSen, 81700);
  assert.equal(priceItems([{ sku: 'chefs-knife-block', qty: 1 }], catalogue), 6900);
});

test('"coming soon" products have no price or stock, are never seeded, reported or sold', async () => {
  const soon = catalogue.products.filter((p) => p.status === 'coming-soon');
  assert.deepEqual(soon.map((p) => p.sku), ['pasta-set', 'pink-cake-set', 'chocolate-cake-set', 'grocery-playset']);
  for (const p of soon) {
    assert.deepEqual(Object.keys(p).sort(), ['name', 'sku', 'status'], `${p.sku} carries only its name`);
    assert.equal(validateItems([{ sku: p.sku, qty: 1 }], catalogue).error, 'not_on_sale');
  }
  const db = await fresh();
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM stock WHERE sku = 'pasta-set'").get().n, 0);
  // A row left over from before (as on the preview database) is still not reported.
  db.raw.prepare("INSERT INTO stock (sku, available, sold, updated_at) VALUES ('pasta-set', 10, 0, ?)").run(T0);
  const seen = await readStock(db, 3, T0, catalogue);
  assert.equal(seen['pasta-set'], undefined);
  assert.equal(seen['fruit-basket'].state, 'in_stock');
});
