// The private stock and orders page. Server-rendered, no script needed.
import { setAvailable, stockState, isOnSale } from './stock.js';
import { runningSettings } from './settings.js';
import { markRefunded, refundable, REFUND_METHODS } from './refunds.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rm = (sen) => `RM${(sen / 100).toFixed(2)}`;
const when = (ms) => new Date(ms).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

export async function handleAdmin(request, env, catalogue, user, siteMode = 'shop') {
  const url = new URL(request.url);
  const now = Date.now();
  let notice = '';
  // Only accept form posts made from this page itself.
  const origin = request.headers.get('origin');
  if (request.method === 'POST' && origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  if (request.method === 'POST' && url.pathname === '/admin/refund') {
    const form = await request.formData();
    const id = String(form.get('order') || '');
    if (form.get('confirm') !== 'yes') notice = 'Not saved: tick "I have refunded this buyer" first.';
    else {
      const r = await markRefunded(env.DB, id, user, now, form.get('restock') === 'yes', String(form.get('method') || ''));
      notice = r.ok
        ? `Saved: order ${esc(id.slice(0, 8))} marked refunded${r.restocked ? ' and its units are back on sale' : ''}.`
        : r.reason === 'already_refunded' ? 'That order was already marked refunded.' : r.reason === 'bad_method' ? 'Not saved: choose how the money went back.' : 'That order cannot be marked refunded.';
    }
  }
  if (request.method === 'POST' && url.pathname === '/admin/stock') {
    const form = await request.formData();
    const sku = String(form.get('sku') || '');
    const n = Number(form.get('available'));
    if (!catalogue.products.some((p) => p.sku === sku && isOnSale(p))) notice = 'Unknown product.';
    else {
      const r = await setAvailable(env.DB, sku, n, now, `manual by ${user}`);
      notice = r.ok ? `Saved: ${esc(sku)} is now ${n}.` : 'Enter a whole number, 0 or more.';
    }
  }
  const { results: stock } = await env.DB.prepare('SELECT sku, available, sold FROM stock').all();
  const bySku = new Map(stock.map((r) => [r.sku, r]));
  const { results: orders } = await env.DB.prepare('SELECT id, created_at, status, name, email, phone, region, items_json, total_sen, test, refunded_at, refunded_by, refund_restocked, refund_method, marketing_consent, marketing_consent_at FROM orders ORDER BY created_at DESC LIMIT 50').all();

  const rows = catalogue.products.filter(isOnSale).map((p) => {
    const s = bySku.get(p.sku);
    const st = s ? stockState(s.available, catalogue.lowStockAt) : null;
    const label = !s ? 'Not set' : st.state === 'sold_out' ? 'Sold out' : st.state === 'low' ? `Only ${st.left} left` : 'In stock';
    return `<tr><td>${esc(p.name)}</td><td class="n">${s ? s.available : '–'}</td><td class="n">${s ? s.sold : '–'}</td><td>${label}</td>
      <td><form method="post" action="/admin/stock"><input type="hidden" name="sku" value="${esc(p.sku)}"><label class="sr" for="n-${esc(p.sku)}">New number for ${esc(p.name)}</label><input id="n-${esc(p.sku)}" name="available" type="number" min="0" step="1" required value="${s ? s.available : ''}"><button>Save</button></form></td></tr>`;
  }).join('');
  const refundCell = (o) => {
    if (o.refunded_at) return `<br><small>Refunded ${esc((REFUND_METHODS[o.refund_method] || 'by an unrecorded method').toLowerCase())}, ${when(o.refunded_at)}, by ${esc(o.refunded_by)}${o.refund_restocked ? '; units put back' : ''}</small>`;
    if (!refundable(o)) return '';
    const restock = o.status === 'paid'
      ? `<label class="ck"><input type="checkbox" name="restock" value="yes"> Put the units back on sale</label>`
      : '<small>No units to put back: this order never took stock.</small>';
    return `<form class="rf" method="post" action="/admin/refund"><input type="hidden" name="order" value="${esc(o.id)}">
      <label class="ck"><input type="checkbox" name="confirm" value="yes" required> I have refunded this buyer</label>
      <label class="sel">How <select name="method" required><option value="">Choose…</option>${Object.entries(REFUND_METHODS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>${restock}<button>Mark refunded</button></form>`;
  };
  const orows = orders.map((o) => `<tr><td>${when(o.created_at)}</td><td>${o.refunded_at ? 'refunded' : esc(o.status)}${o.test ? ' (test)' : ''}${refundCell(o)}</td><td>${esc(o.name)}<br><small>${esc(o.email)} · ${esc(o.phone)}${o.marketing_consent ? `<br>News and offers: yes, ticked ${when(o.marketing_consent_at)}` : ''}</small></td><td>${JSON.parse(o.items_json).map((i) => `${i.qty} × ${esc(i.sku)}`).join('<br>')}</td><td class="n">${rm(o.total_sen)}</td></tr>`).join('') || '<tr><td colspan="5">No orders yet.</td></tr>';

  const settings = runningSettings(env, siteMode);
  const srows = settings.map((r) => `<tr${r.warn ? ' class="warn"' : ''}><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}${r.warn ? ' <strong>Check this</strong>' : ''}</td></tr>`).join('');
  const anyWarn = settings.some((r) => r.warn);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Stock and orders · Attra House</title>
<style>:root{--bg:#F7F1E6;--fg:#2B2624;--line:#DDD3C2;--brown:#8A5A2B;--red:#C9382E;--yellow:#F3C64A}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-right,0px)) 64px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:20px}h1,h2{margin:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:620px}th,td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--brown)}
.n{font-variant-numeric:tabular-nums}form{display:flex;gap:8px}input[type=number]{width:90px;font:inherit;padding:8px;border:1.5px solid var(--brown);border-radius:8px;background:#fff;color:var(--fg)}
button{font:700 15px system-ui,sans-serif;background:var(--yellow);color:var(--fg);border:0;border-radius:999px;padding:8px 16px;min-height:40px;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
.set{min-width:0;max-width:640px;table-layout:fixed}.set th,.set td{overflow-wrap:anywhere}.set th{width:50%}.set th{text-transform:none;letter-spacing:0;font-size:15px;color:var(--fg);font-weight:600}.warn td,.warn th{color:var(--red)}.rf{flex-direction:column;align-items:flex-start;gap:6px;margin-top:8px}.ck{display:flex;gap:8px;align-items:flex-start;font-size:14px}.ck input{width:18px;height:18px;margin-top:2px;accent-color:var(--fg)}.sel{display:flex;gap:8px;align-items:center;font-size:14px}.sel select{font:inherit;padding:6px 8px;border:1.5px solid var(--brown);border-radius:8px;background:#fff;color:var(--fg)}.notice{border:2px solid var(--fg);border-radius:12px;padding:10px 14px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}small{color:var(--brown)}</style></head>
<body><main><h1>Stock and orders</h1><p>Signed in as ${esc(user)}. Times are Malaysia time.</p>${notice ? `<p class="notice" role="status">${notice}</p>` : ''}
<h2>Settings in use</h2><p><small>What this copy of the site is running with right now. Keys are never shown, only whether they are present.${anyWarn ? ' <strong>Something below needs checking.</strong>' : ''}</small></p>
<div class="tw"><table class="set"><tbody>${srows}</tbody></table></div>
<h2>Stock</h2><p><small>"Available" is what the shop can still sell. Units on a buyer's payment page are already taken off and come back if unpaid after 20 minutes.</small></p>
<div class="tw"><table><thead><tr><th>Product</th><th>Available</th><th>Sold</th><th>Shop shows</th><th>Set a new number</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Latest orders</h2><p><small>Refund the buyer first: in HitPay where it allows, otherwise by bank transfer (HitPay cannot refund DuitNow QR paid from a banking app). Then mark the order refunded here and say how; for a paid order you can put its units back on sale at the same time.</small></p>
<div class="tw"><table><thead><tr><th>When</th><th>Status</th><th>Buyer</th><th>Items</th><th>Total</th></tr></thead><tbody>${orows}</tbody></table></div></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
