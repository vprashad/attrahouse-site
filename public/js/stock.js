/* Live stock: asks /api/stock once on load and fills every [data-stock] tag.
   Sold out swaps the buy box for that product's waitlist form. */
(function () {
  var LABEL = { in_stock: 'In stock', sold_out: 'Sold out' };
  function apply(items) {
    Object.keys(items).forEach(function (sku) {
      var s = items[sku];
      [].forEach.call(document.querySelectorAll('[data-stock="' + sku + '"]'), function (t) {
        t.textContent = s.state === 'low' ? 'Only ' + s.left + ' left' : LABEL[s.state];
        t.classList.toggle('fill', s.state === 'sold_out');
        t.classList.toggle('low', s.state === 'low');
      });
      var out = s.state === 'sold_out';
      [].forEach.call(document.querySelectorAll('[data-buy-for="' + sku + '"]'), function (el) { el.hidden = out; });
      [].forEach.call(document.querySelectorAll('[data-wait-for="' + sku + '"]'), function (el) { el.hidden = !out; });
    });
  }
  fetch('/api/stock', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      if (d.items) apply(d.items);
      // Share the numbers with other scripts on the page (quick add).
      window.AHStock = { items: d.items || {}, checkout: !!d.checkout };
      document.dispatchEvent(new CustomEvent('ah:stock', { detail: window.AHStock }));
      [].forEach.call(document.querySelectorAll('[data-needs-checkout]'), function (b) { b.disabled = !d.checkout; });
      [].forEach.call(document.querySelectorAll('[data-checkout-closed]'), function (el) { el.hidden = !!d.checkout; });
    })
    .catch(function () { /* tags stay hidden; checkout re-checks stock anyway */ });

  [].forEach.call(document.querySelectorAll('form[data-waitlist]'), function (f) {
    f.addEventListener('submit', function (e) { e.preventDefault(); f.querySelector('[data-wl-msg]').hidden = false; });
  });
})();
