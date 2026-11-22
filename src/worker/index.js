// Cloudflare Worker for attrahouse.com.
// Static pages come from the Astro build (env.ASSETS). Only /api/* and /admin/* reach this code.
import catalogue from '../data/products.json';
import { readStock, seedStock, releaseExpired, validateItems } from './stock.js';
import { startCheckout, confirmOrder, publicOrder, validateCustomer } from './orders.js';
import { checkWebhook, apiKey, webhookSalt, isLive } from './hitpay.js';
import { accessUser } from './access.js';
import { handleAdmin } from './admin.js';
import { SITE_MODE } from './mode.js';
import schema1 from '../../migrations/0001_stock.sql';
import schema2 from '../../migrations/0002_orders.sql';
import schema3 from '../../migrations/0003_refunds.sql';
import { addColumns } from './refunds.js';
import { checkBot } from './turnstile.js';
import turnstile from '../data/turnstile.json';

// Create the tables and starting stock on first use, so the database needs no setup by hand. Safe to repeat.
let ready = null;
function ensureReady(db) {
  if (!ready) {
    const stmts = (schema1 + ';' + schema2).split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean);
    ready = db.batch(stmts.map((s) => db.prepare(s))).then(() => addColumns(db, schema3)).then(() => seedStock(db, catalogue, Date.now())).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/');
    const isAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
    if (!isApi && !isAdmin) return env.ASSETS.fetch(request);

    // Before launch the site is a landing page only: no shop, no stock, no checkout, no admin.
    if (SITE_MODE !== 'shop') return json({ error: 'not_found' }, 404);
    await ensureReady(env.DB);
    const now = Date.now();
    const deps = { db: env.DB, env, fetchFn: fetch, now, newId: () => crypto.randomUUID(), origin: url.origin, catalogue };

    if (isAdmin) {
      const user = await accessUser(request, env);
      if (!user) return new Response('Not found', { status: 404 });
      return handleAdmin(request, env, catalogue, user, SITE_MODE);
    }

    if (url.pathname === '/api/stock' && request.method === 'GET') {
      return json({ lowStockAt: catalogue.lowStockAt, checkout: env.CHECKOUT_ENABLED === 'true', items: await readStock(env.DB, catalogue.lowStockAt, now, catalogue) });
    }

    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      if (env.CHECKOUT_ENABLED !== 'true') return json({ error: 'checkout_not_open' }, 403);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
      // Check the buyer's details first, so mistakes are reported even when payment is not set up.
      const v = validateItems(body?.items, catalogue);
      if (v.error) return json({ error: v.error }, 400);
      const c = validateCustomer(body?.customer);
      if (c.error) return json({ error: c.error }, 400);
      if (!apiKey(env)) { console.error('No HitPay key for', isLive(env) ? 'live' : 'sandbox'); return json({ error: 'payment_not_configured' }, 503); }
      const bot = await checkBot(env, fetch, { token: body?.turnstile, ip: request.headers.get('cf-connecting-ip'), hostname: url.hostname, action: turnstile.action });
      if (bot) return json({ error: bot.error }, bot.status);
      const r = await startCheckout(deps, body);
      return json(r.body, r.status);
    }

    if (url.pathname === '/api/order' && request.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'not_found' }, 404);
      await confirmOrder(deps, id); // asks HitPay; records the sale if paid
      const o = await publicOrder(env.DB, id);
      return o ? json(o) : json({ error: 'not_found' }, 404);
    }

    if (url.pathname === '/api/hitpay-webhook' && request.method === 'POST') {
      const raw = await request.text();
      const check = await checkWebhook(webhookSalt(env), raw, request.headers.get('Hitpay-Signature') || '');
      if (check) { if (check.status === 503) console.error('No HitPay webhook salt for', isLive(env) ? 'live' : 'sandbox'); return json({ error: check.error }, check.status); }
      let data = {};
      try { data = JSON.parse(raw); } catch { data = Object.fromEntries(new URLSearchParams(raw)); }
      const ref = data.reference_number || data.payment_request?.reference_number;
      // The webhook only prompts a check: confirmOrder asks HitPay directly before recording anything.
      if (ref && /^[0-9a-f-]{36}$/.test(ref)) await confirmOrder(deps, ref);
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  },

  // Every 5 minutes on the live site: unpaid, expired holds go back on sale.
  async scheduled(_event, env) {
    if (SITE_MODE !== 'shop') return;
    await ensureReady(env.DB);
    await releaseExpired(env.DB, Date.now());
  },
};
