// Recording refunds. The money itself is returned in HitPay; this only records that it was,
// and, for a paid order, can put the units back on sale. Safe to repeat: a second click does nothing.

/** Add the refund columns if they are missing. Each ALTER runs alone; "duplicate column" means done. */
export async function addColumns(db, sql) {
  const stmts = sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean);
  for (const s of stmts) {
    try { await db.prepare(s).run(); }
    catch (e) { if (!/duplicate column|no such column/i.test(String(e && e.message))) throw e; }
  }
}

export const REFUND_METHODS = { hitpay: 'In HitPay', bank_transfer: 'By bank transfer', other: 'Other way' };

/** Orders that may be marked refunded. */
export const refundable = (o) => (o.status === 'paid' || o.status === 'needs_refund') && !o.refunded_at;

/**
 * Mark an order refunded. method is how the money went back (REFUND_METHODS). restock only applies to paid orders (a needs_refund order never took units).
 * Returns { ok, reason, restocked }.
 */
export async function markRefunded(db, orderId, user, now, restock, method = 'hitpay') {
  if (!Object.hasOwn(REFUND_METHODS, method)) return { ok: false, reason: 'bad_method' };
  const o = await db.prepare('SELECT id, status, items_json, refunded_at FROM orders WHERE id = ?').bind(orderId).first();
  if (!o) return { ok: false, reason: 'unknown_order' };
  if (o.refunded_at) return { ok: false, reason: 'already_refunded' };
  if (!refundable(o)) return { ok: false, reason: 'not_refundable' };
  const putBack = restock && o.status === 'paid';
  const stmts = [
    db.prepare('UPDATE orders SET refunded_at = ?, refunded_by = ?, refund_restocked = ?, refund_method = ? WHERE id = ? AND refunded_at IS NULL')
      .bind(now, user, putBack ? 1 : 0, method, orderId),
  ];
  if (putBack) {
    // Only applies if the update above just happened (same id and timestamp), so a double submit cannot restock twice.
    const done = 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND refunded_at = ? AND refund_restocked = 1)';
    for (const { sku, qty } of JSON.parse(o.items_json)) {
      stmts.push(db.prepare(`UPDATE stock SET available = available + ?, sold = sold - ?, updated_at = ? WHERE sku = ? AND ${done}`).bind(qty, qty, now, sku, orderId, now));
      stmts.push(db.prepare(`INSERT INTO stock_log (at, sku, change, reason, ref) SELECT ?, ?, ?, 'refund_restock', ? WHERE ${done}`).bind(now, sku, qty, orderId, orderId, now));
    }
  }
  const res = await db.batch(stmts);
  if (res[0].meta.changes !== 1) return { ok: false, reason: 'already_refunded' };
  return { ok: true, reason: 'refunded', restocked: putBack };
}
