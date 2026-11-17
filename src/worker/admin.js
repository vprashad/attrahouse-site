// The private stock and orders page. Server-rendered, no script needed.
import { setAvailable, stockState } from './stock.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rm = (sen) => `RM${(sen / 100).toFixed(2)}`;
const when = (ms) => new Date(ms).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

export async function handleAdmin(request, env, catalogue, user) {
  const url = new URL(request.url);
  const now = Date.now();
  let notice = '';
  if (request.method === 'POST' && url.pathname === '/admin/stock') {
    const form = await request.formData();
    const sku = String(form.get('sku') || '');
    const n = Number(form.get('available'));
    if (!catalogue.products.some((p) => p.sku === sku)) notice = 'Unknown product.';
    else {
      const r = await setAvailable(env.DB, sku, n, now, `manual by ${user}`);
      notice = r.ok ? `Saved: ${esc(sku)} is now ${n}.` : 'Enter a whole number, 0 or more.';
    }
  }
  const { results: stock } = await env.DB.prepare('SELECT sku, available, sold FROM stock').all();
  const bySku = new Map(stock.map((r) => [r.sku, r]));
  const { results: orders } = await env.DB.prepare('SELECT id, created_at, status, name, email, phone, region, items_json, total_sen, test FROM orders ORDER BY created_at DESC LIMIT 50').all();

  const rows = catalogue.products.map((p) => {
    const s = bySku.get(p.sku);
    const st = s ? stockState(s.available, catalogue.lowStockAt) : null;
    const label = !s ? 'Not set' : st.state === 'sold_out' ? 'Sold out' : st.state === 'low' ? `Only ${st.left} left` : 'In stock';
    return `<tr><td>${esc(p.name)}</td><td class="n">${s ? s.available : '–'}</td><td class="n">${s ? s.sold : '–'}</td><td>${label}</td>
      <td><form method="post" action="/admin/stock"><input type="hidden" name="sku" value="${esc(p.sku)}"><label class="sr" for="n-${esc(p.sku)}">New number for ${esc(p.name)}</label><input id="n-${esc(p.sku)}" name="available" type="number" min="0" step="1" required value="${s ? s.available : ''}"><button>Save</button></form></td></tr>`;
  }).join('');
  const orows = orders.map((o) => `<tr><td>${when(o.created_at)}</td><td>${esc(o.status)}${o.test ? ' (test)' : ''}</td><td>${esc(o.name)}<br><small>${esc(o.email)} · ${esc(o.phone)}</small></td><td>${JSON.parse(o.items_json).map((i) => `${i.qty} × ${esc(i.sku)}`).join('<br>')}</td><td class="n">${rm(o.total_sen)}</td></tr>`).join('') || '<tr><td colspan="5">No orders yet.</td></tr>';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Stock and orders · Attra House</title>
<style>:root{--bg:#F7F1E6;--fg:#2B2624;--line:#DDD3C2;--brown:#8A5A2B;--red:#C9382E;--yellow:#F3C64A}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-right,0px)) 64px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:20px}h1,h2{margin:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:620px}th,td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--brown)}
.n{font-variant-numeric:tabular-nums}form{display:flex;gap:8px}input[type=number]{width:90px;font:inherit;padding:8px;border:1.5px solid var(--brown);border-radius:8px;background:#fff;color:var(--fg)}
button{font:700 15px system-ui,sans-serif;background:var(--yellow);color:var(--fg);border:0;border-radius:999px;padding:8px 16px;min-height:40px;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
.notice{border:2px solid var(--fg);border-radius:12px;padding:10px 14px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}small{color:var(--brown)}</style></head>
<body><main><h1>Stock and orders</h1><p>Signed in as ${esc(user)}. Times are Malaysia time.</p>${notice ? `<p class="notice" role="status">${notice}</p>` : ''}
<h2>Stock</h2><p><small>"Available" is what the shop can still sell. Units on a buyer's payment page are already taken off and come back if unpaid after 20 minutes.</small></p>
<div class="tw"><table><thead><tr><th>Product</th><th>Available</th><th>Sold</th><th>Shop shows</th><th>Set a new number</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Latest orders</h2><p><small>Refunds are made in HitPay. After a refund, add the units back above.</small></p>
<div class="tw"><table><thead><tr><th>When</th><th>Status</th><th>Buyer</th><th>Items</th><th>Total</th></tr></thead><tbody>${orows}</tbody></table></div></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
