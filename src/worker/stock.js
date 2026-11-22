// Stock counter for the Attra House shop, on Cloudflare D1.
//
// Rules:
// - Every unit for sale is a number in `stock.available`. It can never drop below 0
//   (a CHECK constraint), so two buyers can never both take the last unit.
// - A buyer going to payment gets a hold. The hold's units leave `available` at once.
// - Paid: the hold becomes a sale. Not paid in time: the units go back on sale.
// - Each change is one D1 batch, which runs as a single transaction: all or nothing.

export const HOLD_MINUTES = 20;
export const MAX_QTY_PER_ITEM = 20;

/** @param {number} available @param {number} lowStockAt */
export function stockState(available, lowStockAt) {
  if (available <= 0) return { state: 'sold_out' };
  if (available <= lowStockAt) return { state: 'low', left: available };
  return { state: 'in_stock' }; // exact counts above the low mark stay private
}

/** Phase 2 products are listed as "coming soon": no price, no stock, not for sale. */
export const isOnSale = (p) => p.status !== 'coming-soon';

/**
 * Check a basket against the catalogue. Returns a clean list or an error code.
 * @param {{sku:string, qty:number}[]} items
 * @param {{products: any[], groups: Record<string, any>}} catalogue
 */
export function validateItems(items, catalogue) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'empty_basket' };
  const bySku = new Map(catalogue.products.map((p) => [p.sku, p]));
  const merged = new Map();
  for (const it of items) {
    const p = it && bySku.get(it.sku);
    if (!p) return { error: 'unknown_product' };
    if (!isOnSale(p)) return { error: 'not_on_sale' }; // "coming soon" products cannot be ordered
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY_PER_ITEM) return { error: 'bad_quantity' };
    merged.set(it.sku, (merged.get(it.sku) || 0) + it.qty);
  }
  // Grouped products, such as holders sold "any 2 for RM29", must come in whole groups.
  for (const [name, g] of Object.entries(catalogue.groups || {})) {
    let n = 0;
    for (const [sku, qty] of merged) if (bySku.get(sku).group === name) n += qty;
    if (n % g.unitsPerPair !== 0) return { error: 'holders_in_pairs' };
  }
  return { items: [...merged].map(([sku, qty]) => ({ sku, qty })) };
}

/** Price a validated basket in sen. */
export function priceItems(items, catalogue) {
  const bySku = new Map(catalogue.products.map((p) => [p.sku, p]));
  let total = 0;
  const groupUnits = {};
  for (const { sku, qty } of items) {
    const p = bySku.get(sku);
    if (p.group) groupUnits[p.group] = (groupUnits[p.group] || 0) + qty;
    else total += p.priceSen * qty;
  }
  for (const [name, units] of Object.entries(groupUnits)) {
    const g = catalogue.groups[name];
    total += (units / g.unitsPerPair) * g.pairPriceSen;
  }
  return total;
}

/** Put the catalogue's starting numbers in, once. Products with no number yet are skipped. */
export async function seedStock(db, catalogue, now) {
  const stmts = [];
  for (const p of catalogue.products) {
    if (!isOnSale(p) || !Number.isInteger(p.startStock)) continue;
    stmts.push(db.prepare('INSERT OR IGNORE INTO stock (sku, available, sold, updated_at) VALUES (?, ?, 0, ?)').bind(p.sku, p.startStock, now));
  }
  if (stmts.length) await db.batch(stmts);
  return stmts.length;
}

/** Current state of every product, with expired holds returned first. */
export async function readStock(db, lowStockAt, now, catalogue) {
  await releaseExpired(db, now);
  const { results } = await db.prepare('SELECT sku, available FROM stock').all();
  const out = {};
  // Only products on sale are reported; a "coming soon" product never appears, even if an old row exists.
  const listed = catalogue && new Set(catalogue.products.filter(isOnSale).map((p) => p.sku));
  for (const r of results) if (!listed || listed.has(r.sku)) out[r.sku] = stockState(r.available, lowStockAt);
  return out;
}

/**
 * Take units aside for a buyer. Fails with `sold_out` (and the short SKUs) if any item
 * cannot be covered; in that case nothing is taken.
 */
export async function createHold(db, items, now, newId, minutes = HOLD_MINUTES) {
  await releaseExpired(db, now);
  // A product with no stock row yet (no number set) cannot be sold.
  const unset = [];
  for (const { sku } of items) {
    if (!(await db.prepare('SELECT 1 AS x FROM stock WHERE sku = ?').bind(sku).first())) unset.push(sku);
  }
  if (unset.length) return { ok: false, reason: 'sold_out', skus: unset };
  const id = newId();
  const expiresAt = now + minutes * 60_000;
  const stmts = [db.prepare("INSERT INTO holds (id, created_at, expires_at, status) VALUES (?, ?, ?, 'held')").bind(id, now, expiresAt)];
  for (const { sku, qty } of items) {
    stmts.push(db.prepare('UPDATE stock SET available = available - ?, updated_at = ? WHERE sku = ?').bind(qty, now, sku));
    stmts.push(db.prepare('INSERT INTO hold_items (hold_id, sku, qty) VALUES (?, ?, ?)').bind(id, sku, qty));
    stmts.push(db.prepare("INSERT INTO stock_log (at, sku, change, reason, ref) VALUES (?, ?, ?, 'hold', ?)").bind(now, sku, -qty, id));
  }
  try {
    await db.batch(stmts);
    return { ok: true, holdId: id, expiresAt };
  } catch (e) {
    if (!/CHECK constraint/i.test(String(e && e.message))) throw e;
    const short = [];
    for (const { sku, qty } of items) {
      const row = await db.prepare('SELECT available FROM stock WHERE sku = ?').bind(sku).first();
      if (!row || row.available < qty) short.push(sku);
    }
    return { ok: false, reason: 'sold_out', skus: short };
  }
}

/** Return a held basket to sale. Does nothing if the hold is already paid or released. */
export async function releaseHold(db, holdId, now, reason = 'released') {
  const res = await db.batch([
    db.prepare(`UPDATE stock SET available = available + (SELECT qty FROM hold_items WHERE hold_id = ?1 AND sku = stock.sku), updated_at = ?2
                WHERE sku IN (SELECT sku FROM hold_items WHERE hold_id = ?1)
                  AND EXISTS (SELECT 1 FROM holds WHERE id = ?1 AND status = 'held')`).bind(holdId, now),
    db.prepare(`INSERT INTO stock_log (at, sku, change, reason, ref)
                SELECT ?2, sku, qty, ?3, ?1 FROM hold_items
                WHERE hold_id = ?1 AND EXISTS (SELECT 1 FROM holds WHERE id = ?1 AND status = 'held')`).bind(holdId, now, reason),
    db.prepare("UPDATE holds SET status = 'released' WHERE id = ? AND status = 'held'").bind(holdId),
  ]);
  return res[2].meta.changes === 1;
}

/** Return every hold whose time ran out. */
export async function releaseExpired(db, now) {
  const { results } = await db.prepare("SELECT id FROM holds WHERE status = 'held' AND expires_at < ?").bind(now).all();
  let n = 0;
  for (const r of results) if (await releaseHold(db, r.id, now, 'expired')) n++;
  return n;
}

/**
 * Payment confirmed. Safe to call twice with the same payment.
 * If the hold had already run out, it tries to take the units again; if they are gone,
 * it reports `needs_refund` so the order can be refunded by hand.
 */
export async function markPaid(db, holdId, paymentRef, now) {
  const hold = await db.prepare('SELECT status, payment_ref FROM holds WHERE id = ?').bind(holdId).first();
  if (!hold) return { ok: false, reason: 'unknown_hold' };
  if (hold.status === 'paid') return { ok: hold.payment_ref === paymentRef, reason: hold.payment_ref === paymentRef ? 'already_paid' : 'paid_with_other_ref' };
  if (hold.status === 'held') {
    const res = await db.batch([
      db.prepare(`UPDATE stock SET sold = sold + (SELECT qty FROM hold_items WHERE hold_id = ?1 AND sku = stock.sku), updated_at = ?2
                  WHERE sku IN (SELECT sku FROM hold_items WHERE hold_id = ?1)
                    AND EXISTS (SELECT 1 FROM holds WHERE id = ?1 AND status = 'held')`).bind(holdId, now),
      db.prepare("UPDATE holds SET status = 'paid', payment_ref = ? WHERE id = ? AND status = 'held'").bind(paymentRef, holdId),
    ]);
    if (res[1].meta.changes === 1) return { ok: true, reason: 'paid' };
    return markPaid(db, holdId, paymentRef, now); // status changed underneath; re-read
  }
  // Released before payment arrived: take the units again if they are still there.
  const { results: items } = await db.prepare('SELECT sku, qty FROM hold_items WHERE hold_id = ?').bind(holdId).all();
  const stmts = [];
  for (const { sku, qty } of items) {
    stmts.push(db.prepare('UPDATE stock SET available = available - ?, sold = sold + ?, updated_at = ? WHERE sku = ?').bind(qty, qty, now, sku));
    stmts.push(db.prepare("INSERT INTO stock_log (at, sku, change, reason, ref) VALUES (?, ?, ?, 'late_payment', ?)").bind(now, sku, -qty, holdId));
  }
  stmts.push(db.prepare("UPDATE holds SET status = 'paid', payment_ref = ? WHERE id = ? AND status = 'released'").bind(paymentRef, holdId));
  try {
    await db.batch(stmts);
    return { ok: true, reason: 'paid_late' };
  } catch (e) {
    if (!/CHECK constraint/i.test(String(e && e.message))) throw e;
    return { ok: false, reason: 'needs_refund' };
  }
}

/** Set a product's number by hand (restock or correction). */
export async function setAvailable(db, sku, available, now, note = 'manual') {
  if (!Number.isInteger(available) || available < 0) return { ok: false, reason: 'bad_number' };
  const row = await db.prepare('SELECT available FROM stock WHERE sku = ?').bind(sku).first();
  if (!row) {
    await db.prepare('INSERT INTO stock (sku, available, sold, updated_at) VALUES (?, ?, 0, ?)').bind(sku, available, now).run();
  } else {
    await db.batch([
      db.prepare('UPDATE stock SET available = ?, updated_at = ? WHERE sku = ?').bind(available, now, sku),
      db.prepare('INSERT INTO stock_log (at, sku, change, reason, ref) VALUES (?, ?, ?, ?, NULL)').bind(now, sku, available - row.available, note),
    ]);
  }
  return { ok: true };
}
