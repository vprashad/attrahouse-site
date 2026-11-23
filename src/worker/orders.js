// Orders: the buyer's details and the money side of a hold.
// The order id is the hold id. A sale is only recorded after HitPay itself says the payment
// request is completed for the right amount; the buyer's redirect and the webhook are only
// prompts to go and ask.
import { createHold, releaseHold, markPaid, validateItems, priceItems } from './stock.js';
import { createPaymentRequest, getPaymentRequest, amountToSen } from './hitpay.js';
import malaysia from '../data/malaysia.json' with { type: 'json' };

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE = new RegExp(malaysia.postcode);

export function deliveryFor(catalogue, region) {
  const d = catalogue.delivery || {};
  const v = region === 'east' ? d.eastMalaysiaSen : d.peninsularSen;
  return Number.isInteger(v) ? v : null;
}

/**
 * Check the buyer's details. Delivery is within Malaysia only (Viveg, 22 Nov 2026): the address must
 * name Malaysia as the country and carry a 5-digit postcode, a city and one of Malaysia's states, and the delivery region comes from the state,
 * never from the browser. Fields follow the usual shop checkout: first name (optional), last name, address,
 * apartment (optional), postcode, city, state, phone. Stored as one name and one address line.
 */
export function validateCustomer(c) {
  const first = clean(c?.firstName, 60), last = clean(c?.lastName, 60);
  const line1 = clean(c?.address, 200), line2 = clean(c?.address2, 200);
  const postcode = clean(c?.postcode, 10), city = clean(c?.city, 80);
  const country = malaysia.countries.find((x) => x === clean(c?.country, 40));
  const state = malaysia.states.find((s) => s.name === clean(c?.state, 40));
  const out = { name: [first, last].filter(Boolean).join(' '), email: clean(c?.email, 200).toLowerCase(), phone: clean(c?.phone, 40) };
  if (!EMAIL.test(out.email)) return { error: 'email_invalid' };
  if (!country) return { error: 'country_unsupported' };
  if (!last) return { error: 'name_missing' }; // first name is optional, as on the form
  if (line1.length < 5) return { error: 'address_missing' };
  if (!POSTCODE.test(postcode)) return { error: 'postcode_invalid' };
  if (city.length < 2) return { error: 'city_missing' };
  if (!state) return { error: 'state_missing' };
  if (!/^[+0-9 ()-]{8,}$/.test(out.phone)) return { error: 'phone_invalid' };
  const address = [line1, line2, `${postcode} ${city}`, state.name, country].filter(Boolean).join(', ');
  return { customer: { ...out, address, region: state.region } };
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
  const completed = String(pr.status).toLowerCase() === 'completed';
  const paid = completed && amountToSen(pr.amount) === o.total_sen;
  if (completed && !paid) console.error(`hitpay_amount_mismatch order=${orderId} expected_sen=${o.total_sen} got=${JSON.stringify(pr.amount)}`);
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
