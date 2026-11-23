/* Basket page: list, change quantities, and send the order to /api/checkout. */
(function () {
  var cat = window.AH_CAT, B = window.AHBasket;
  if (!cat || !B) return document.addEventListener('DOMContentLoaded', function () { location.reload(); });
  var bySku = {}; cat.products.forEach(function (p) { bySku[p.sku] = p; });
  var rm = function (sen) { return 'RM' + (sen / 100).toFixed(sen % 100 ? 2 : 0); };
  var stock = {}, checkoutOpen = false;
  var ERR = {
    name_missing: 'Enter your full name.', email_invalid: 'Check your email address.', phone_invalid: 'Enter a phone number we can reach you on.',
    address_missing: 'Enter your full delivery address.', postcode_invalid: 'Enter your 5-digit Malaysian postcode.', city_missing: 'Enter your city or town.', country_unsupported: 'We deliver within Malaysia only.', state_missing: 'Choose your state. We deliver within Malaysia only.', not_on_sale: 'Something in your basket is not on sale yet. Remove it to continue.', holders_in_pairs: 'Holders come in twos.',
    empty_basket: 'Your basket is empty.', checkout_not_open: 'Checkout opens at launch.', payment_unavailable: 'Payment is not available right now. Nothing was charged. Please try again in a few minutes, or message us on WhatsApp.',
    payment_not_configured: 'Test payments are not set up on this preview yet: the HitPay sandbox key is missing. Nothing was charged.',
    bot_check_failed: 'The security check did not go through. Nothing was charged. Please try again.',
    bot_check_unavailable: 'The security check is not answering right now. Nothing was charged. Please try again in a minute.',
    bot_check_not_configured: 'The security check is not set up on this preview yet. Nothing was charged.',
    delivery_fees_not_set: 'Delivery fees are not set yet, so we cannot take orders right now.', bad_request: 'Something went wrong. Please try again.',
  };

  // Cloudflare Turnstile writes a one-time token into the form; each token works once, so reset after every try.
  var botToken = '';
  window.ahBotOk = function (t) { botToken = t; };
  window.ahBotExpired = function () { botToken = ''; };
  window.ahBotError = function () { botToken = ''; };
  function botReset() { botToken = ''; try { if (window.turnstile) window.turnstile.reset(); } catch (e) {} }

  // Bundle upgrade offer (Design spec, 19 Nov 2026). Asked at most once per visit.
  var DECLINED = 'ah-bundle-answered';
  function answered() { try { return sessionStorage.getItem(DECLINED) === '1'; } catch (e) { return false; } }
  function setAnswered() { try { sessionStorage.setItem(DECLINED, '1'); } catch (e) {} }
  var stockKnown = false, pendingSubmit = false;
  function currentOffer() { return window.AHBundle && stockKnown ? window.AHBundle.offer(items(), cat, stock, answered()) : null; }
  function paintOffer() {
    var o = currentOffer(), box = document.getElementById('bk-offer');
    box.hidden = !o;
    if (!o) { pendingSubmit = false; return; }
    document.getElementById('bk-offer-t').textContent = window.AHBundle.text(o, cat);
    document.getElementById('bk-offer-h').textContent = pendingSubmit ? 'Before you pay' : (o.kind === 'switch' ? 'Switch to the Bundle' : 'Upgrade to the Bundle');
    document.getElementById('bk-offer-yes').textContent = o.kind === 'switch' ? 'Yes, switch to the Bundle' : 'Upgrade to the Bundle';
    document.getElementById('bk-offer-no').textContent = pendingSubmit ? 'No thanks, continue' : 'No thanks';
  }

  function items() { return B.read().filter(function (i) { return bySku[i.sku]; }); }
  function holders(list) { return list.filter(function (i) { return bySku[i.sku].group === 'holders'; }).reduce(function (n, i) { return n + i.qty; }, 0); }
  function subtotal(list) {
    var t = 0, h = holders(list);
    list.forEach(function (i) { var p = bySku[i.sku]; if (!p.group) t += p.priceSen * i.qty; });
    return t + Math.floor(h / 2) * cat.groups.holders.pairPriceSen;
  }
  // Delivery is within Malaysia only; the state chosen decides the delivery region.
  function val(id) { return document.getElementById(id).value; }
  function state() { return val('co-state'); }
  function region() { var s = (cat.states || []).find(function (x) { return x.name === state(); }); return s ? s.region : 'peninsular'; }
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
    paintOffer();
  }
  function change(sku, by) {
    var b = B.read(); b.forEach(function (i) { if (i.sku === sku) i.qty = Math.max(0, Math.min(20, i.qty + by)); });
    B.write(b.filter(function (i) { return i.qty > 0; })); render();
  }

  fetch('/api/stock').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d) { stock = d.items || {}; checkoutOpen = !!d.checkout; stockKnown = true; } render();
  }).catch(render);
  document.getElementById('co-state').addEventListener('change', render);

  document.getElementById('bk-offer-yes').addEventListener('click', function () {
    var o = currentOffer(); if (!o) return;
    B.write(window.AHBundle.apply(items(), o)); setAnswered(); pendingSubmit = false; render();
    var done = document.getElementById('bk-offer-done'); done.hidden = false; done.scrollIntoView({ block: 'center' });
  });
  document.getElementById('bk-offer-no').addEventListener('click', function () {
    var go = pendingSubmit; setAnswered(); pendingSubmit = false; render();
    if (go) document.getElementById('co').requestSubmit();
  });

  document.getElementById('co').addEventListener('submit', function (e) {
    e.preventDefault();
    document.getElementById('bk-offer-done').hidden = true;
    var err = document.getElementById('co-err'), btn = document.getElementById('co-pay');
    function fail(m, keepBot) { err.textContent = m; err.hidden = false; btn.disabled = false; btn.textContent = 'Go to payment'; if (!keepBot) botReset(); }
    var need = [['co-email', 'email_invalid'], ['co-last', 'name_missing'], ['co-address', 'address_missing'], ['co-postcode', 'postcode_invalid'], ['co-city', 'city_missing'], ['co-state', 'state_missing'], ['co-phone', 'phone_invalid']];
    for (var k = 0; k < need.length; k++) { var f = document.getElementById(need[k][0]); if (!f.value.trim()) { f.focus(); return fail(ERR[need[k][1]], true); } }
    if (!/^[0-9]{5}$/.test(document.getElementById('co-postcode').value.trim())) { document.getElementById('co-postcode').focus(); return fail(ERR.postcode_invalid, true); }
    if (!botToken) return fail('Wait a moment for the security check above the button to finish, then try again.', true);
    if (currentOffer()) {
      pendingSubmit = true; paintOffer();
      var h = document.getElementById('bk-offer-h'); h.scrollIntoView({ block: 'center' }); h.focus();
      return;
    }
    err.hidden = true; btn.disabled = true; btn.textContent = 'Opening payment…';
    var body = { items: items(), customer: {
      email: val('co-email'), country: val('co-country'), firstName: val('co-first'), lastName: val('co-last'),
      address: val('co-address'), address2: val('co-address2'), postcode: val('co-postcode'), city: val('co-city'), state: state(), phone: val('co-phone') }, turnstile: botToken };
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
