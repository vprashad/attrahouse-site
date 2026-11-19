/* Bundle upgrade offer: pure rules, no page code. Shared by the basket page and the tests.
   Every amount is worked out from the catalogue's prices; none is typed here. */
(function (root) {
  function priceOf(cat, sku) { var p = cat.products.find(function (x) { return x.sku === sku; }); return p ? p.priceSen : 0; }
  function nameOf(cat, sku) { var p = cat.products.find(function (x) { return x.sku === sku; }); return p ? p.name : sku; }
  function qtyOf(items, sku) { return items.reduce(function (n, i) { return n + (i.sku === sku ? i.qty : 0); }, 0); }
  function bundleOf(cat) { var b = cat.bundleOffer && cat.products.find(function (x) { return x.sku === cat.bundleOffer.bundle; }); return b && b.contains ? b : null; }

  /** Saving when bought as the Bundle instead of its items separately. */
  function saving(cat) {
    var b = bundleOf(cat); if (!b) return 0;
    return b.contains.reduce(function (t, s) { return t + priceOf(cat, s); }, 0) - b.priceSen;
  }

  /**
   * The offer for this basket, or null. stock is /api/stock's items ({sku: {state, left?}});
   * with no stock information the offer is not made.
   */
  function offer(items, cat, stock, declined) {
    var b = bundleOf(cat), rule = cat.bundleOffer;
    if (!b || declined || !stock) return null;
    var different = rule.triggerSkus.filter(function (s) { return qtyOf(items, s) > 0; }).length;
    if (different < rule.minDifferent) return null;
    var s = stock[b.sku];
    if (!s || s.state === 'sold_out') return null;
    if (s.state === 'low' && s.left <= qtyOf(items, b.sku)) return null;
    var present = b.contains.filter(function (x) { return qtyOf(items, x) > 0; });
    var missing = b.contains.filter(function (x) { return qtyOf(items, x) === 0; });
    var upgradeSen = b.priceSen - present.reduce(function (t, x) { return t + priceOf(cat, x); }, 0);
    return {
      kind: missing.length ? 'add' : 'switch',
      bundleSku: b.sku, bundleName: b.name,
      present: present, missing: missing,
      missingNames: missing.map(function (x) { return nameOf(cat, x); }),
      upgradeSen: upgradeSen, savingSen: saving(cat),
    };
  }

  /** The basket after taking the upgrade: one of each matching item out, one Bundle in. Extra copies stay. */
  function apply(items, o) {
    var out = items.map(function (i) { return { sku: i.sku, qty: i.qty }; });
    o.present.forEach(function (s) { var hit = out.find(function (i) { return i.sku === s; }); if (hit) hit.qty -= 1; });
    out = out.filter(function (i) { return i.qty > 0; });
    var b = out.find(function (i) { return i.sku === o.bundleSku; });
    if (b) b.qty += 1; else out.push({ sku: o.bundleSku, qty: 1 });
    return out;
  }

  function list(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }
  function rm(sen) { return 'RM' + (sen / 100).toFixed(sen % 100 ? 2 : 0); }
  /** Panel text from the Design spec. Marketing may reword; the numbers stay computed. */
  function text(o) {
    return o.kind === 'switch'
      ? 'Switch to the ' + o.bundleName + ': same four items, ' + rm(o.savingSen) + ' less.'
      : 'Add ' + list(o.missingNames) + ' for ' + rm(o.upgradeSen) + ' more and get the ' + o.bundleName + '. Save ' + rm(o.savingSen) + ' on all four.';
  }

  root.AHBundle = { offer: offer, apply: apply, text: text, saving: saving };
})(typeof window !== 'undefined' ? window : globalThis);
