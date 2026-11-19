import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import catalogue from '../src/data/products.json' with { type: 'json' };

// Load the browser script the same way the page does.
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/bundle.js', import.meta.url), 'utf8'), ctx);
const { offer, apply, text, saving } = ctx.window.AHBundle;

const price = (sku) => catalogue.products.find((p) => p.sku === sku).priceSen;
const bundle = catalogue.products.find((p) => p.sku === 'grand-kitchen-bundle');
const inStock = Object.fromEntries(catalogue.products.map((p) => [p.sku, { state: 'in_stock' }]));
const b = (...skus) => skus.map((sku) => ({ sku, qty: 1 }));
const FB = 'fruit-basket', VG = 'veggie-garden', MT = 'meal-time', KB = 'chefs-knife-block';

test('the Bundle lists its four items, and the saving is worked out from their prices', () => {
  assert.deepEqual(bundle.contains, [FB, VG, MT, KB]);
  assert.equal(bundle.separateTotalSen, undefined, 'no typed total left in products.json');
  assert.equal(saving(catalogue), price(FB) + price(VG) + price(MT) + price(KB) - bundle.priceSen);
});

test("Design's worked table: every row's upgrade price follows from today's prices", () => {
  const rows = [
    [[FB, VG], 'add', [MT, KB]], [[FB, MT], 'add', [VG, KB]], [[VG, MT], 'add', [FB, KB]],
    [[FB, VG, KB], 'add', [MT]], [[FB, VG, MT], 'add', [KB]], [[FB, VG, MT, KB], 'switch', []],
  ];
  for (const [skus, kind, missing] of rows) {
    const o = offer(b(...skus), catalogue, inStock, false);
    assert.equal(o.kind, kind, skus.join('+'));
    assert.deepEqual([...o.missing], missing, skus.join('+'));
    assert.equal(o.upgradeSen, bundle.priceSen - skus.reduce((t, s) => t + price(s), 0), skus.join('+'));
  }
  // At the 17 Nov prices these are Design's figures: RM281, RM261, RM311, RM212, RM12, -RM57.
  const ups = rows.map(([s]) => offer(b(...s), catalogue, inStock, false).upgradeSen / 100);
  if (bundle.priceSen === 82900 && price(FB) === 29900) assert.deepEqual(ups, [281, 261, 311, 212, 12, -57]);
});

test('no offer with fewer than 2 different food sets, two copies of one set, or only the Knife Block', () => {
  assert.equal(offer(b(FB), catalogue, inStock, false), null);
  assert.equal(offer([{ sku: FB, qty: 2 }], catalogue, inStock, false), null);
  assert.equal(offer(b(FB, KB), catalogue, inStock, false), null);
  assert.equal(offer(b(FB, 'pasta-set'), catalogue, inStock, false), null);
});

test('no offer when the Bundle is sold out, its last units are already in the basket, stock is unknown, or the buyer said no', () => {
  assert.equal(offer(b(FB, VG), catalogue, { ...inStock, [bundle.sku]: { state: 'sold_out' } }, false), null);
  assert.equal(offer([...b(FB, VG), { sku: bundle.sku, qty: 1 }], catalogue, { ...inStock, [bundle.sku]: { state: 'low', left: 1 } }, false), null);
  assert.ok(offer(b(FB, VG), catalogue, { ...inStock, [bundle.sku]: { state: 'low', left: 1 } }, false));
  assert.equal(offer(b(FB, VG), catalogue, null, false), null);
  assert.equal(offer(b(FB, VG), catalogue, inStock, true), null);
});

test('taking the upgrade removes one of each matching item, adds one Bundle and keeps extra copies', () => {
  const basket = [{ sku: FB, qty: 2 }, { sku: VG, qty: 1 }, { sku: 'pasta-set', qty: 1 }];
  const out = apply(basket, offer(basket, catalogue, inStock, false));
  assert.deepEqual(out.map((i) => ({ ...i })), [{ sku: FB, qty: 1 }, { sku: 'pasta-set', qty: 1 }, { sku: bundle.sku, qty: 1 }]);
  assert.deepEqual(basket[0], { sku: FB, qty: 2 }, 'the original basket is not changed');
  const all = b(FB, VG, MT, KB);
  assert.deepEqual(apply(all, offer(all, catalogue, inStock, false)).map((i) => ({ ...i })), [{ sku: bundle.sku, qty: 1 }]);
});

test('panel text uses the computed amounts and names', () => {
  assert.equal(text(offer(b(FB, VG), catalogue, inStock, false)),
    `Add Meal Time and Chef's Knife Block for RM${(bundle.priceSen - price(FB) - price(VG)) / 100} more and get the Grand Kitchen Bundle. Save RM${saving(catalogue) / 100} on all four.`);
  assert.equal(text(offer(b(FB, VG, MT, KB), catalogue, inStock, false)), `Switch to the Grand Kitchen Bundle: same four items, RM${saving(catalogue) / 100} less.`);
});
