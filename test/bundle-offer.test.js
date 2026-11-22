import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import catalogue from '../src/data/products.json' with { type: 'json' };

// Load the browser script the same way the page does.
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/bundle.js', import.meta.url), 'utf8'), ctx);
const { offer, apply, text, line, conditions } = ctx.window.AHBundle;
import strings from '../src/data/strings.json' with { type: 'json' };
const cat = { ...catalogue, bundleText: strings.bundle };

const price = (sku) => catalogue.products.find((p) => p.sku === sku).priceSen;
const bundle = catalogue.products.find((p) => p.sku === 'grand-kitchen-bundle');
const rm = (sen) => `RM${sen / 100}`;
const inStock = Object.fromEntries(catalogue.products.map((p) => [p.sku, { state: 'in_stock' }]));
const b = (...skus) => skus.map((sku) => ({ sku, qty: 1 }));
const FB = 'fruit-basket', VG = 'veggie-garden', MT = 'meal-time', KB = 'chefs-knife-block';

test('the Bundle is three priced sets plus a free Knife Block, and costs what the three sets cost', () => {
  assert.deepEqual(bundle.contains, [FB, VG, MT]);
  assert.deepEqual(bundle.free, [KB]);
  assert.equal(bundle.priceSen, price(FB) + price(VG) + price(MT));
});

test("Design's worked table (22 Nov): two sets get an offer for the missing one; amounts follow from today's prices", () => {
  const rows = [[[FB, VG], [MT]], [[FB, MT], [VG]], [[VG, MT], [FB]], [[FB, VG, KB], [MT]]];
  for (const [skus, missing] of rows) {
    const o = offer(b(...skus), cat, inStock, false);
    assert.equal(o.kind, 'add', skus.join('+'));
    assert.deepEqual([...o.missing], missing, skus.join('+'));
    assert.equal(o.upgradeSen, price(missing[0]), 'the upgrade costs what the missing set costs');
  }
  // At Finance's prices of 21 Nov these are Design's figures: +RM269, +RM249, +RM299.
  if (bundle.priceSen === 81700) assert.deepEqual(rows.slice(0, 3).map(([s]) => offer(b(...s), cat, inStock, false).upgradeSen / 100), [269, 249, 299]);
});

test('all three sets in the basket: an offer to switch at the same price, never an automatic change (Viveg, 22 Nov evening)', () => {
  for (const basket of [b(FB, VG, MT), b(FB, VG, MT, KB)]) {
    const o = offer(basket, cat, inStock, false);
    assert.equal(o.kind, 'switch');
    assert.equal(o.upgradeSen, 0, 'same total');
    const out = apply(basket, o);
    assert.equal(out.find((i) => i.sku === bundle.sku).qty, 1);
    assert.equal(out.some((i) => [FB, VG, MT].includes(i.sku)), false);
    assert.equal(out.some((i) => i.sku === KB), basket.some((i) => i.sku === KB), 'a separate Knife Block Set stays');
  }
  assert.equal(text(offer(b(FB, VG, MT), cat, inStock, false), cat), `Switch to the Grand Kitchen Bundle and get a free Chef's Knife Block Set (worth ${rm(price(KB))})? Same price: ${rm(bundle.priceSen)}.`);
  assert.equal(offer(b(FB, VG, MT), cat, inStock, true), null, 'not asked again after a no');
  assert.equal(offer(b(FB, VG, MT), cat, { ...inStock, [KB]: { state: 'sold_out' } }, false), null, 'no switch offer when the free item is sold out');
});

test('no panel with fewer than 2 sets, two copies of one set, or other items', () => {
  assert.equal(offer(b(FB), cat, inStock, false), null);
  assert.equal(offer([{ sku: FB, qty: 2 }], cat, inStock, false), null);
  assert.equal(offer(b(FB, KB), cat, inStock, false), null);
  assert.equal(offer(b(FB, 'pouch-holder'), cat, inStock, false), null);
});

test('no offer when the Bundle is sold out, its last units are already in the basket, stock is unknown, or the buyer said no', () => {
  assert.equal(offer(b(FB, VG), cat, { ...inStock, [bundle.sku]: { state: 'sold_out' } }, false), null);
  assert.equal(offer([...b(FB, VG), { sku: bundle.sku, qty: 1 }], cat, { ...inStock, [bundle.sku]: { state: 'low', left: 1 } }, false), null);
  assert.ok(offer(b(FB, VG), cat, { ...inStock, [bundle.sku]: { state: 'low', left: 1 } }, false));
  assert.equal(offer(b(FB, VG), cat, null, false), null);
  assert.equal(offer(b(FB, VG), cat, inStock, true), null);
});

test('taking the upgrade removes one of each matching set, adds one Bundle and keeps everything else', () => {
  const basket = [{ sku: FB, qty: 2 }, { sku: VG, qty: 1 }, { sku: KB, qty: 1 }];
  const out = apply(basket, offer(basket, cat, inStock, false));
  assert.deepEqual(out.map((i) => ({ ...i })), [{ sku: FB, qty: 1 }, { sku: KB, qty: 1 }, { sku: bundle.sku, qty: 1 }]);
  assert.deepEqual(basket[0], { sku: FB, qty: 2 }, 'the original basket is not changed');
});

test("wording is Compliance's, filled with computed amounts; no saving or 'was' figure anywhere", () => {
  assert.equal(line(cat), `Fruit Basket, Veggie Garden and Meal Time for ${rm(bundle.priceSen)}, with a free Chef's Knife Block Set (worth ${rm(price(KB))}).`);
  assert.equal(conditions(cat), 'With the Grand Kitchen Bundle only. While stocks last.');
  assert.equal(text(offer(b(FB, VG), cat, inStock, false), cat),
    `Add Meal Time for ${rm(price(MT))} and get the Grand Kitchen Bundle, with a free Chef's Knife Block Set (worth ${rm(price(KB))}).`);
  const shown = ['public/js/bundle.js', 'public/js/checkout.js', 'src/components/Home.astro', 'src/pages/basket.astro', 'src/pages/[sku].astro', 'src/components/ProductCard.astro', 'src/data/strings.json']
    .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/^\s*(\/\/|\/\*|\*|"_source").*$/gm, '')).join('\n');
  assert.doesNotMatch(shown, /Save \{?RM|Save \{rm|\bwas RM|separately\./i);
});
