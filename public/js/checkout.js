/* Basket page: list, change quantities, and send the order to /api/checkout. */
(function () {
  var cat = window.AH_CAT, B = window.AHBasket;
  if (!cat || !B) return document.addEventListener('DOMContentLoaded', function () { location.reload(); });
  var bySku = {}; cat.products.forEach(function (p) { bySku[p.sku] = p; });
  var rm = function (sen) { return 'RM' + (sen / 100).toFixed(sen % 100 ? 2 : 0); };
  var stock = {}, checkoutOpen = false;
  var ERR = {
    name_missing: 'Enter your full name.', email_invalid: 'Check your email address.', phone_invalid: 'Enter a phone number we can reach you on.',
    address_missing: 'Enter your full delivery address.', region_missing: 'Choose where we are delivering to.', holders_in_pairs: 'Holders come in twos.',
    empty_basket: 'Your basket is empty.', checkout_not_open: 'Checkout opens at launch.', payment_unavailable: 'Payment is not available right now. Nothing was charged. Please try again in a few minutes, or message us on WhatsApp.',
    delivery_fees_not_set: 'Delivery fees are not set yet, so we cannot take orders right now.', bad_request: 'Something went wrong. Please try again.',
  };

  function items() { return B.read().filter(function (i) { return bySku[i.sku]; }); }
  function holders(list) { return list.filter(function (i) { return bySku[i.sku].group === 'holders'; }).reduce(function (n, i) { return n + i.qty; }, 0); }
  function subtotal(list) {
    var t = 0, h = holders(list);
    list.forEach(function (i) { var p = bySku[i.sku]; if (!p.group) t += p.priceSen * i.qty; });
    return t + Math.floor(h / 2) * cat.groups.holders.pairPriceSen;
  }
  function region() { var r = document.querySelector('input[name=region]:checked'); return r ? r.value : 'peninsular'; }
  function delivery() { var d = cat.delivery || {}; var v = region() === 'east' ? d.eastMalaysiaSen : d.peninsularSen; return typeof v === 'number' ? v : null; }

  function render() {
    var list = items(), el = document.getElementById('bk-list');
    document.getElementById('bk-empty').hidden = list.length > 0;
    document.getElementById('bk-full').hidden = list.length === 0;
    el.innerHTML = '';
    list.forEach(function (i) {
      var p = bySku[i.sku], row = document.createElement('div'); row.className = 'bk-row';
      var price = p.group ? 'Any 2 for ' + rm(cat.groups.holders.pairPriceSen) : rm(p.priceSen * i.qty);
      var s = stock[i.sku], warn = s && s.state === 'sold_out' ? ' <span class="tag fill">Sold out</span>' : s && s.state === 'low' && s.left < i.qty ? ' <span class="tag low">Only ' + s.left + ' left</span>' : '';
      row.innerHTML = '<div class="col" style="gap:2px;align-items:flex-start"><b></b><button class="rm" type="button">Remove</button></div>' +
        '<div class="step"><button type="button" aria-label="One fewer">−</button><span aria-live="polite"></span><button type="button" aria-label="One more">+</button></div><span class="pr"></span>';
      row.querySelector('b').textContent = p.name; row.querySelector('b').insertAdjacentHTML('beforeend', warn);
      row.querySelector('.step span').textContent = i.qty; row.querySelector('.pr').textContent = price;
      var bs = row.querySelectorAll('.step button');
      bs[0].onclick = function () { change(i.sku, -1); }; bs[1].onclick = function () { change(i.sku, 1); };
      row.querySelector('.rm').onclick = function () { change(i.sku, -i.qty); };
      el.appendChild(row);
    });
    var odd = holders(list) % 2 === 1;
    document.getElementById('bk-pairs').hidden = !odd;
    var sub = subtotal(list), d = delivery(), test = d === null;
    document.getElementById('bk-sum').innerHTML =
      '<span>Items</span><span>' + rm(sub) + '</span><span>Delivery</span><span>' + (test ? 'RM0 (test)' : rm(d)) + '</span>' +
      '<span class="tot">You pay</span><span class="tot">' + rm(sub + (d || 0)) + '</span>';
    document.getElementById('bk-test').hidden = !test;
    document.getElementById('co-pay').disabled = odd || !checkoutOpen;
    document.getElementById('co-closed').hidden = checkoutOpen;
  }
  function change(sku, by) {
    var b = B.read(); b.forEach(function (i) { if (i.sku === sku) i.qty = Math.max(0, Math.min(20, i.qty + by)); });
    B.write(b.filter(function (i) { return i.qty > 0; })); render();
  }

  fetch('/api/stock').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d) { stock = d.items || {}; checkoutOpen = !!d.checkout; } render();
  }).catch(render);
  document.querySelectorAll('input[name=region]').forEach(function (r) { r.addEventListener('change', render); });

  document.getElementById('co').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('co-err'), btn = document.getElementById('co-pay');
    function fail(m) { err.textContent = m; err.hidden = false; btn.disabled = false; btn.textContent = 'Go to payment'; }
    if (!document.getElementById('co-cs').checked) return fail('Tick the box to agree to the terms and privacy notice.');
    err.hidden = true; btn.disabled = true; btn.textContent = 'Opening payment…';
    var body = { items: items(), customer: {
      name: document.getElementById('co-name').value, email: document.getElementById('co-email').value,
      phone: document.getElementById('co-phone').value, address: document.getElementById('co-address').value, region: region() } };
    fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok && x.d.paymentUrl) { location.href = x.d.paymentUrl; return; }
        if (x.d.error === 'sold_out') {
          var names = (x.d.skus || []).map(function (s) { return bySku[s] ? bySku[s].name : s; }).join(', ');
          return fetch('/api/stock').then(function (r) { return r.json(); }).then(function (d) { stock = d.items || {}; render(); fail('Sold out while you were checking out: ' + names + '. Remove it to continue.'); });
        }
        fail(ERR[x.d.error] || ERR.bad_request);
      })
      .catch(function () { fail('No connection. Nothing was charged. Please try again.'); });
  });
})();
