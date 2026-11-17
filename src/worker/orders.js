// Orders: the buyer's details and the money side of a hold.
// The order id is the hold id. A sale is only recorded after HitPay itself says the payment
// request is completed for the right amount; the buyer's redirect and the webhook are only
// prompts to go and ask.
import { createHold, releaseHold, markPaid, validateItems, priceItems } from './stock.js';
import { createPaymentRequest, getPaymentRequest, senToAmount } from './hitpay.js';

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function deliveryFor(catalogue, region) {
  const d = catalogue.delivery || {};
  const v = region === 'east' ? d.eastMalaysiaSen : d.peninsularSen;
  return Number.isInteger(v) ? v : null;
}

/** Check the buyer's details. */
export function validateCustomer(c) {
  const out = { name: clean(c?.name, 120), email: clean(c?.email, 200).toLowerCase(), phone: clean(c?.phone, 40), address: clean(c?.address, 600), region: c?.region === 'east' ? 'east' : c?.region === 'peninsular' ? 'peninsular' : null };
  if (!out.name) return { error: 'name_missing' };
  if (!EMAIL.test(out.email)) return { error: 'email_invalid' };
  if (!/^[+0-9 ()-]{8,}$/.test(out.phone)) return { error: 'phone_invalid' };
  if (out.address.length < 10) return { error: 'address_missing' };
  if (!out.region) return { error: 'region_missing' };
  return { customer: out };
}

/**
 * Basket + buyer -> hold + order + HitPay payment page.
 * deps: { db, env, fetchFn, now, newId, origin, catalogue }
 */
export async function startCheckout(deps, body) {
  const { db, env, fetchFn, now, newId, origin, catalogue } = deps;
  const live = env.LIVE_PAYMENTS === 'true';
  const v = validateItems(body?.items, catalogue);
  if (v.error) return { status: 400, body: { error: v.error } };
  const c = validateCustomer(body?.customer);
  if (c.error) return { status: 400, body: { error: c.error } };
  let delivery = deliveryFor(catalogue, c.customer.region);
  if (delivery === null) {
    if (live) return { status: 503, body: { error: 'delivery_fees_not_set' } };
    delivery = 0; // test checkouts only
  }
  const subtotal = priceItems(v.items, catalogue);
  const total = subtotal + delivery;

  const hold = await createHold(db, v.items, now, newId);
  if (!hold.ok) return { status: 409, body: { error: 'sold_out', skus: hold.skus } };
  const id = hold.holdId;
  await db.prepare(`INSERT INTO orders (id, created_at, status, name, email, phone, address, region, items_json, subtotal_sen, delivery_sen, total_sen, test)
                    VALUES (?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, now, c.customer.name, c.customer.email, c.customer.phone, c.customer.address, c.customer.region, JSON.stringify(v.items), subtotal, delivery, total, live ? 0 : 1).run();
  try {
    const pr = await createPaymentRequest(env, fetchFn, {
      totalSen: total, email: c.customer.email, name: c.customer.name, phone: c.customer.phone,
      purpose: `Attra House order ${id.slice(0, 8)}`, reference: id, redirectUrl: `${origin}/order/?id=${encodeURIComponent(id)}`,
    });
    await db.prepare('UPDATE orders SET payment_request_id = ? WHERE id = ?').bind(pr.id, id).run();
    return { status: 200, body: { orderId: id, paymentUrl: pr.url, totalSen: total, expiresAt: hold.expiresAt } };
  } catch (e) {
    await releaseHold(db, id, now, 'payment_page_failed');
    await db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(id).run();
    console.error(String(e));
    return { status: 502, body: { error: 'payment_unavailable' } };
  }
}

/** Ask HitPay about an order and record the sale if it is paid. Safe to repeat. */
export async function confirmOrder(deps, orderId) {
  const { db, env, fetchFn, now } = deps;
  const o = await db.prepare('SELECT id, status, payment_request_id, total_sen FROM orders WHERE id = ?').bind(orderId).first();
  if (!o) return { status: 'unknown' };
  if (o.status === 'paid' || o.status === 'needs_refund' || o.status === 'cancelled') return { status: o.status };
  if (!o.payment_request_id) return { status: o.status };
  let pr;
  try { pr = await getPaymentRequest(env, fetchFn, o.payment_request_id); } catch (e) { console.error(String(e)); return { status: o.status }; }
  const paid = String(pr.status).toLowerCase() === 'completed' && pr.amount === senToAmount(o.total_sen);
  if (!paid) {
    const hold = await db.prepare('SELECT status FROM holds WHERE id = ?').bind(orderId).first();
    if (hold && hold.status === 'released' && o.status === 'awaiting_payment') {
      await db.prepare("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'awaiting_payment'").bind(orderId).run();
      return { status: 'expired' };
    }
    return { status: o.status };
  }
  const r = await markPaid(db, orderId, o.payment_request_id, now);
  const status = r.ok ? 'paid' : r.reason === 'needs_refund' ? 'needs_refund' : o.status;
  await db.prepare('UPDATE orders SET status = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?').bind(status, now, orderId).run();
  return { status };
}

/** What the buyer's order page may see: no personal details. */
export async function publicOrder(db, orderId) {
  const o = await db.prepare('SELECT status, items_json, subtotal_sen, delivery_sen, total_sen, test FROM orders WHERE id = ?').bind(orderId).first();
  if (!o) return null;
  return { status: o.status, items: JSON.parse(o.items_json), subtotalSen: o.subtotal_sen, deliverySen: o.delivery_sen, totalSen: o.total_sen, test: !!o.test };
}
