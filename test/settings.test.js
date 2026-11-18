import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from './d1-shim.js';
import catalogue from '../src/data/products.json' with { type: 'json' };
import { seedStock } from '../src/worker/stock.js';
import { runningSettings } from '../src/worker/settings.js';
import { handleAdmin } from '../src/worker/admin.js';
import { addColumns } from '../src/worker/refunds.js';

const row = (rows, label) => rows.find((r) => r.label === label);
const preview = { CHECKOUT_ENABLED: 'true', LIVE_PAYMENTS: 'false', CURRENCY: 'MYR', HITPAY_BASE: 'https://api.sandbox.hit-pay.com', STOCK_DB: 'attrahouse-stock-preview', HITPAY_API_KEY_SANDBOX: 'sk-test-secret-value', HITPAY_WEBHOOK_SALT_SANDBOX: 'salt-test-secret-value' };
const launch = { CHECKOUT_ENABLED: 'true', LIVE_PAYMENTS: 'true', CURRENCY: 'MYR', HITPAY_BASE: 'https://api.hit-pay.com', STOCK_DB: 'attrahouse-stock', HITPAY_API_KEY_LIVE: 'sk-live-secret-value', HITPAY_WEBHOOK_SALT_LIVE: 'salt-live-secret-value' };

test('preview settings read as sandbox and test stock, with no warnings', () => {
  const rows = runningSettings(preview, 'shop');
  assert.equal(row(rows, 'HitPay').value, 'Sandbox (test money)');
  assert.equal(row(rows, 'Stock database').value, 'attrahouse-stock-preview (test stock)');
  assert.equal(row(rows, 'HITPAY_API_KEY_SANDBOX').value, 'Present');
  assert.ok(rows.every((r) => !r.warn));
});

test('launch settings read as live and real stock, with no warnings', () => {
  const rows = runningSettings(launch, 'shop');
  assert.equal(row(rows, 'HitPay').value, 'Live (real money)');
  assert.equal(row(rows, 'Live payments').value, 'On');
  assert.equal(row(rows, 'HITPAY_API_KEY_LIVE').value, 'Present');
  assert.equal(row(rows, 'Stock database').value, 'attrahouse-stock (real stock)');
  assert.ok(rows.every((r) => !r.warn));
});

test('mismatches are flagged: live payments on sandbox, missing key, live HitPay on test stock, unlabelled database', () => {
  assert.ok(row(runningSettings({ ...preview, LIVE_PAYMENTS: 'true' }, 'shop'), 'Live payments').warn);
  assert.ok(row(runningSettings({ ...preview, HITPAY_API_KEY_SANDBOX: undefined }, 'shop'), 'HITPAY_API_KEY_SANDBOX').warn);
  assert.ok(row(runningSettings({ ...launch, STOCK_DB: 'attrahouse-stock-preview' }, 'shop'), 'Stock database').warn);
  assert.ok(row(runningSettings({ ...preview, STOCK_DB: undefined }, 'shop'), 'Stock database').warn);
});

test('the private page shows the box and never the key or salt values', async () => {
  const db = makeD1();
  db.raw.exec(readFileSync(new URL('../migrations/0002_orders.sql', import.meta.url), 'utf8'));
  await addColumns(db, readFileSync(new URL('../migrations/0003_refunds.sql', import.meta.url), 'utf8'));
  await seedStock(db, catalogue, Date.UTC(2026, 10, 18));
  const env = { ...preview, DB: db };
  const res = await handleAdmin(new Request('https://x.test/admin/'), env, catalogue, 'owner@example.com', 'shop');
  const html = await res.text();
  assert.match(html, /Settings in use/);
  assert.match(html, /attrahouse-stock-preview \(test stock\)/);
  assert.ok(!html.includes('sk-test-secret-value') && !html.includes('salt-test-secret-value'));
  assert.ok(!html.includes('Something below needs checking'));
});
