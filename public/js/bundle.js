/* Bundle upgrade offer: pure rules, no page code. Shared by the basket page and the tests.
   Every amount is worked out from the catalogue's prices; none is typed here.
   The Bundle costs what its three sets cost and comes with a free Chef's Knife Block
   (Compliance, 20 Nov 2026): there is no saving figure and none may be shown. */
(function (root) {
  function find(cat, sku) { return cat.products.find(function (x) { return x.sku === sku; }); }
  function priceOf(cat, sku) { var p = find(cat, sku); return p && typeof p.priceSen === 'number' ? p.priceSen : 0; }
  function nameOf(cat, sku) { var p = find(cat, sku); return p ? p.name : sku; }
  function qtyOf(items, sku) { return items.reduce(function (n, i) { return n + (i.sku === sku ? i.qty : 0); }, 0); }
  function bundleOf(cat) { var b = cat.bundleOffer && find(cat, cat.bundleOffer.bundle); return b && b.contains ? b : null; }
  function list(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }
  function rm(sen) { return 'RM' + (sen / 100).toFixed(sen % 100 ? 2 : 0); }
  function fill(t, v) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m; }); }

  /** The words every Bundle sentence is filled from. */
  function facts(cat) {
    var b = bundleOf(cat); if (!b) return null;
    var free = (b.free || [])[0];
    return {
      bundle: b.name, price: rm(b.priceSen),
      sets: list(b.contains.map(function (s) { return nameOf(cat, s); })),
      free: free ? nameOf(cat, free) : '', worth: free ? rm(priceOf(cat, free)) : '',
    };
  }

  /**
   * The upgrade offer for this basket, or null. stock is /api/stock's items ({sku: {state, left?}});
   * with no stock information the offer is not made.
   * kind 'add': one or more of the Bundle's sets is missing; the buyer pays for the missing set.
   * kind 'switch': all the sets are already in the basket; same total, plus the free item. Offer only
   * (Viveg, 22 Nov 2026): nothing changes unless the buyer says yes. Needs the free item in stock too.
   */
  function offer(items, cat, stock, declined) {
    var b = bundleOf(cat), rule = cat.bundleOffer;
    if (!b || declined || !stock) return null;
    var present = b.contains.filter(function (x) { return qtyOf(items, x) > 0; });
    var missing = b.contains.filter(function (x) { return qtyOf(items, x) === 0; });
    if (present.length < rule.minDifferent) return null;
    var s = stock[b.sku];
    if (!s || s.state === 'sold_out') return null;
    if (s.state === 'low' && s.left <= qtyOf(items, b.sku)) return null;
    if (missing.length === 0) {
      var f = stock[(b.free || [])[0]];
      if ((b.free || []).length && (!f || f.state === 'sold_out')) return null;
    }
    return {
      kind: missing.length ? 'add' : 'switch', bundleSku: b.sku, bundleName: b.name,
      present: present, missing: missing,
      missingNames: missing.map(function (x) { return nameOf(cat, x); }),
      upgradeSen: b.priceSen - present.reduce(function (t, x) { return t + priceOf(cat, x); }, 0),
    };
  }

  /** The basket after taking the upgrade: one of each matching set out, one Bundle in. Extra copies stay. */
  function apply(items, o) {
    var out = items.map(function (i) { return { sku: i.sku, qty: i.qty }; });
    o.present.forEach(function (s) { var hit = out.find(function (i) { return i.sku === s; }); if (hit) hit.qty -= 1; });
    out = out.filter(function (i) { return i.qty > 0; });
    var b = out.find(function (i) { return i.sku === o.bundleSku; });
    if (b) b.qty += 1; else out.push({ sku: o.bundleSku, qty: 1 });
    return out;
  }

  /** Sentences from Compliance's wording (cat.bundleText = strings.json "bundle"). */
  function line(cat) { var f = facts(cat); return f ? fill(cat.bundleText.line, f) : ''; }
  function conditions(cat) { var f = facts(cat); return f ? fill(cat.bundleText.conditions, f) : ''; }
  function text(o, cat) {
    var f = facts(cat); f.missing = list(o.missingNames); f.upgrade = rm(o.upgradeSen);
    return fill(o.kind === 'switch' ? cat.bundleText.switch : cat.bundleText.upgrade, f);
  }

  root.AHBundle = { offer: offer, apply: apply, text: text, line: line, conditions: conditions, facts: facts };
})(typeof window !== 'undefined' ? window : globalThis);
