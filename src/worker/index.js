// Cloudflare Worker for attrahouse.com.
// Static pages are served from the Astro build (env.ASSETS). Only /api/* reaches this code.
import catalogue from '../data/products.json';
import { readStock, createHold, validateItems, priceItems, seedStock, releaseExpired } from './stock.js';
import { SITE_MODE } from './mode.js';
import schema from '../../migrations/0001_stock.sql';

// Create the tables on first use, so the database needs no setup by hand. Safe to repeat.
let ready = null;
function ensureSchema(db) {
  if (!ready) {
    const stmts = schema.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean);
    ready = db.batch(stmts.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Before launch the site is a landing page only: no shop, no stock, no checkout.
    if (SITE_MODE !== 'shop') return json({ error: 'not_found' }, 404);

    await ensureSchema(env.DB);
    const now = Date.now();
    if (url.pathname === '/api/stock' && request.method === 'GET') {
      await seedStock(env.DB, catalogue, now);
      return json({ lowStockAt: catalogue.lowStockAt, items: await readStock(env.DB, catalogue.lowStockAt, now) });
    }

    if (url.pathname === '/api/hold' && request.method === 'POST') {
      // Off until HitPay is connected: an open hold endpoint would let anyone lock stock.
      if (env.CHECKOUT_ENABLED !== 'true') return json({ error: 'checkout_not_open' }, 403);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
      const v = validateItems(body && body.items, catalogue);
      if (v.error) return json({ error: v.error }, 400);
      const r = await createHold(env.DB, v.items, now, () => crypto.randomUUID());
      if (!r.ok) return json({ error: r.reason, skus: r.skus }, 409);
      return json({ holdId: r.holdId, expiresAt: r.expiresAt, totalSen: priceItems(v.items, catalogue) });
    }

    return json({ error: 'not_found' }, 404);
  },

  // Every 5 minutes: put units from unpaid, expired holds back on sale.
  async scheduled(_event, env) {
    if (SITE_MODE !== 'shop') return;
    await ensureSchema(env.DB);
    await releaseExpired(env.DB, Date.now());
  },
};
