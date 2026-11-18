import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './d1-shim.js';
import { readFileSync } from 'node:fs';
import catalogue from '../src/data/products.json' with { type: 'json' };
import { seedStock } from '../src/worker/stock.js';
import { startCheckout, confirmOrder, publicOrder, validateCustomer } from '../src/worker/orders.js';
import { verifySignature, amountToSen } from '../src/worker/hitpay.js';

const T0 = Date.UTC(2026, 11, 1);
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const buyer = { name: 'Mei Ling', email: 'mei@example.com', phone: '012 345 6789', address: '12 Jalan Contoh, 43000 Kajang, Selangor', region: 'peninsular' };

// A pretend HitPay: records what it is asked and answers like the real API.
function fakeHitPay() {
  const prs = new Map();
  const fetchFn = async (url, init) => {
    if (init.method === 'POST') {
      const b = Object.fromEntries(new URLSearchParams(init.body.toString()));
      const id = `pr-${prs.size + 1}`;
      prs.set(id, { id, status: 'pending', amount: b.amount, currency: b.currency, reference_number: b.reference_number });
      return new Response(JSON.stringify({ id, url: `https://pay.example/${id}`, ...prs.get(id) }), { status: 201 });
    }
    const id = decodeURIComponent(url.split('/').pop());
    return new Response(JSON.stringify(prs.get(id) || {}), { status: prs.has(id) ? 200 : 404 });
  };
  return { prs, fetchFn };
}

async function setup() {
  const db = makeD1();
  db.raw.exec(readFileSync(new URL('../migrations/0002_orders.sql', import.meta.url), 'utf8'));
  await seedStock(db, catalogue, T0);
  const hp = fakeHitPay();
  const deps = { db, env: { HITPAY_API_KEY_SANDBOX: 'sandbox-key', HITPAY_API_KEY_LIVE: 'live-key', CURRENCY: 'MYR' }, fetchFn: hp.fetchFn, now: T0, newId: ids, origin: 'https://preview.example', catalogue };
  return { db, hp, deps };
}
const avail = (db, sku) => ({ ...db.raw.prepare('SELECT available, sold FROM stock WHERE sku = ?').get(sku) });

test('checkout holds the stock, prices it, and opens a HitPay payment page', async () => {
  const { db, hp, deps } = await setup();
  const r = await startCheckout(deps, { items: [{ sku: 'fruit-basket', qty: 1 }, { sku: 'chefs-knife-block', qty: 1 }], customer: buyer });
  assert.equal(r.status, 200);
  assert.equal(r.body.totalSen, 29900 + 6900); // delivery not set yet: RM0 on test checkouts
  assert.match(r.body.paymentUrl, /^https:\/\/pay\.example\//);
  assert.equal(hp.prs.get('pr-1').amount, '368.00');
  assert.equal(hp.prs.get('pr-1').currency, 'MYR');
  assert.equal(avail(db, 'fruit-basket').available, 9);
});

test('nothing is sold until HitPay says the payment request is completed', async () => {
  const { db, hp, deps } = await setup();
  const r = await startCheckout(deps, { items: [{ sku: 'pasta-set', qty: 2 }], customer: buyer });
  assert.equal((await confirmOrder(deps, r.body.orderId)).status, 'awaiting_payment');
  assert.equal(avail(db, 'pasta-set').sold, 0);
  hp.prs.get('pr-1').status = 'completed';
  assert.equal((await confirmOrder(deps, r.body.orderId)).status, 'paid');
  assert.equal((await confirmOrder(deps, r.body.orderId)).status, 'paid'); // repeat is harmless
  assert.deepEqual(avail(db, 'pasta-set'), { available: 8, sold: 2 });
  const pub = await publicOrder(db, r.body.orderId);
  assert.equal(pub.status, 'paid');
  assert.equal(pub.email, undefined); // no personal details on the public order view
});

test('a completed payment for the wrong amount is not accepted', async () => {
  const { db, hp, deps } = await setup();
  const r = await startCheckout(deps, { items: [{ sku: 'meal-time', qty: 1 }], customer: buyer });
  Object.assign(hp.prs.get('pr-1'), { status: 'completed', amount: '1.00' });
  assert.equal((await confirmOrder(deps, r.body.orderId)).status, 'awaiting_payment');
  assert.equal(avail(db, 'meal-time').sold, 0);
});

test('a completed payment is accepted whatever form HitPay writes the amount in (2,880.00, 2880, 2880.00)', async () => {
  for (const amount of ['2,880.00', 2880, '2880', '2880.0']) {
    const { db, hp, deps } = await setup();
    const items = ['fruit-basket', 'veggie-garden', 'meal-time', 'chefs-knife-block', 'grand-kitchen-bundle', 'pasta-set', 'pink-cake-set', 'chocolate-cake-set', 'grocery-playset', 'pouch-holder', 'juicebox-holder'].map((sku) => ({ sku, qty: 1 }));
    const r = await startCheckout(deps, { items, customer: buyer });
    assert.equal(r.body.totalSen, 288000);
    Object.assign(hp.prs.get('pr-1'), { status: 'completed', amount });
    assert.equal((await confirmOrder(deps, r.body.orderId)).status, 'paid', `amount ${JSON.stringify(amount)}`);
    assert.equal(avail(db, 'grand-kitchen-bundle').sold, 1);
  }
});

test('amountToSen reads money amounts and rejects anything else', () => {
  assert.equal(amountToSen('328.00'), 32800);
  assert.equal(amountToSen('2,880.00'), 288000);
  assert.equal(amountToSen(2880.5), 288050);
  assert.equal(amountToSen('1.5'), 150);
  for (const bad of ['', null, undefined, 'abc', '-5.00', '1.234', '1e3']) assert.equal(amountToSen(bad), null);
});

test('unpaid after 20 minutes: the order shows expired and the stock is back', async () => {
  const { db, deps } = await setup();
  const r = await startCheckout(deps, { items: [{ sku: 'grocery-playset', qty: 1 }], customer: buyer });
  assert.equal(avail(db, 'grocery-playset').available, 4);
  const later = { ...deps, now: T0 + 21 * 60_000 };
  await startCheckout(later, { items: [{ sku: 'pasta-set', qty: 1 }], customer: buyer }); // any stock action releases expired holds
  assert.equal(avail(db, 'grocery-playset').available, 5);
  assert.equal((await confirmOrder(later, r.body.orderId)).status, 'expired');
});

test('sold out at checkout: refused, and no payment page is made', async () => {
  const { db, hp, deps } = await setup();
  db.raw.prepare("UPDATE stock SET available = 0 WHERE sku = 'pink-cake-set'").run();
  const r = await startCheckout(deps, { items: [{ sku: 'pink-cake-set', qty: 1 }], customer: buyer });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.skus, ['pink-cake-set']);
  assert.equal(hp.prs.size, 0);
});

test('if HitPay is down, the held stock is returned at once', async () => {
  const { db, deps } = await setup();
  const r = await startCheckout({ ...deps, fetchFn: async () => new Response('{}', { status: 500 }) }, { items: [{ sku: 'veggie-garden', qty: 1 }], customer: buyer });
  assert.equal(r.status, 502);
  assert.equal(avail(db, 'veggie-garden').available, 10);
});

test('holders: any 2 for RM29, from 27 pouch and 27 juice-box holders', async () => {
  const { db, hp, deps } = await setup();
  assert.equal(avail(db, 'pouch-holder').available, 27);
  assert.equal(avail(db, 'juicebox-holder').available, 27);
  const odd = await startCheckout(deps, { items: [{ sku: 'pouch-holder', qty: 3 }], customer: buyer });
  assert.equal(odd.body.error, 'holders_in_pairs');
  const r = await startCheckout(deps, { items: [{ sku: 'pouch-holder', qty: 1 }, { sku: 'juicebox-holder', qty: 3 }], customer: buyer });
  assert.equal(r.body.totalSen, 5800);
  assert.equal(hp.prs.get('pr-1').amount, '58.00');
});

test('live payments refuse to open while delivery fees are not set', async () => {
  const { deps } = await setup();
  const r = await startCheckout({ ...deps, env: { ...deps.env, LIVE_PAYMENTS: 'true' } }, { items: [{ sku: 'fruit-basket', qty: 1 }], customer: buyer });
  assert.equal(r.body.error, 'delivery_fees_not_set');
});

test('buyer details are checked', () => {
  assert.equal(validateCustomer({ ...buyer, email: 'mei@' }).error, 'email_invalid');
  assert.equal(validateCustomer({ ...buyer, phone: '12' }).error, 'phone_invalid');
  assert.equal(validateCustomer({ ...buyer, address: 'Kajang' }).error, 'address_missing');
  assert.equal(validateCustomer({ ...buyer, region: 'moon' }).error, 'region_missing');
  assert.equal(validateCustomer(buyer).customer.email, 'mei@example.com');
});

test('webhook signature: HMAC-SHA256 of the raw body with the salt', async () => {
  const { createHmac } = await import('node:crypto');
  const body = '{"reference_number":"x"}';
  const sig = createHmac('sha256', 'salt123').update(body).digest('hex');
  assert.equal(await verifySignature('salt123', body, sig), true);
  assert.equal(await verifySignature('salt123', body + ' ', sig), false);
  assert.equal(await verifySignature('', body, sig), false);
});

test('the sandbox key only goes to the sandbox, the live key only to live', async () => {
  const { apiKey } = await import('../src/worker/hitpay.js');
  const keys = { HITPAY_API_KEY_SANDBOX: 'sandbox-key', HITPAY_API_KEY_LIVE: 'live-key' };
  assert.equal(apiKey({ ...keys }), 'sandbox-key'); // no base set: sandbox
  assert.equal(apiKey({ ...keys, HITPAY_BASE: 'https://api.sandbox.hit-pay.com' }), 'sandbox-key');
  assert.equal(apiKey({ ...keys, HITPAY_BASE: 'https://api.hit-pay.com' }), 'live-key');
  assert.equal(apiKey({ HITPAY_API_KEY_SANDBOX: 'sandbox-key', HITPAY_BASE: 'https://api.hit-pay.com' }), undefined);
});
