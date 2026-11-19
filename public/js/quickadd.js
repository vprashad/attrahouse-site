/* Quick add on home-page cards: Add to basket, then a − n + stepper; a pair chooser for holders.
   Uses live stock from /js/stock.js (event "ah:stock"). The server checks stock again at checkout. */
(function () {
  var B = window.AHBasket; if (!B) return;
  var MAX = 20, stock = null, checkout = false, toastTimer;
  var toast = document.getElementById('qa-toast');

  function qty(sku) { return B.read().reduce(function (n, i) { return n + (i.sku === sku ? i.qty : 0); }, 0); }
  function setQty(sku, n) {
    var b = B.read().filter(function (i) { return i.sku !== sku; });
    if (n > 0) b.push({ sku: sku, qty: n });
    B.write(b);
  }
  function cap(sku) { var s = stock && stock[sku]; return s && s.state === 'low' ? Math.min(MAX, s.left) : MAX; }
  function out(sku) { var s = stock && stock[sku]; return !!s && s.state === 'sold_out'; }
  function say(msg) {
    if (!toast) return;
    toast.querySelector('[data-toast-msg]').textContent = msg;
    toast.hidden = false; toast.classList.remove('gone');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.add('gone'); setTimeout(function () { toast.hidden = true; }, 200); }, 4000);
  }

  function paint() {
    [].forEach.call(document.querySelectorAll('[data-qa]'), function (el) {
      var sku = el.getAttribute('data-qa'), n = qty(sku), sold = out(sku), max = cap(sku);
      var add = el.querySelector('[data-qa-add]'), step = el.querySelector('[data-qa-step]');
      el.querySelector('[data-qa-out]').hidden = !sold;
      add.hidden = sold || n > 0; add.disabled = !checkout;
      step.hidden = sold || n === 0;
      el.querySelector('[data-qa-n]').textContent = n;
      el.querySelector('[data-qa-more]').disabled = n >= max;
    });
    [].forEach.call(document.querySelectorAll('[data-qa-holders]'), function (el) {
      var pOut = out('pouch-holder'), jOut = out('juicebox-holder'), all = pOut && jOut;
      el.querySelector('[data-qa-out]').hidden = !all;
      var open = el.querySelector('[data-qa-open]'); open.hidden = all; open.disabled = !checkout;
      if (all) el.querySelector('[data-qa-pick]').hidden = true;
      [].forEach.call(el.querySelectorAll('[data-qa-pair]'), function (b) {
        var need = b.getAttribute('data-qa-pair').split(',').map(function (x) { var p = x.split(':'); return { sku: p[0], n: +p[1] }; });
        b.disabled = need.some(function (x) { return out(x.sku) || qty(x.sku) + x.n > cap(x.sku); });
      });
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t || t.disabled) return;
    var card = t.closest('[data-qa]');
    if (card) {
      var sku = card.getAttribute('data-qa'), name = card.getAttribute('data-qa-name'), n = qty(sku);
      if (t.hasAttribute('data-qa-add')) { setQty(sku, 1); say(name + ' added'); paint(); card.querySelector('[data-qa-more]').focus(); }
      else if (t.hasAttribute('data-qa-more')) { setQty(sku, Math.min(cap(sku), n + 1)); paint(); }
      else if (t.hasAttribute('data-qa-less')) { setQty(sku, n - 1); paint(); if (n - 1 === 0) card.querySelector('[data-qa-add]').focus(); }
      return;
    }
    var h = t.closest('[data-qa-holders]');
    if (h) {
      var pick = h.querySelector('[data-qa-pick]');
      if (t.hasAttribute('data-qa-open')) { pick.hidden = !pick.hidden; t.setAttribute('aria-expanded', String(!pick.hidden)); if (!pick.hidden) pick.querySelector('button:not([disabled])') && pick.querySelector('button:not([disabled])').focus(); return; }
      if (t.hasAttribute('data-qa-pair')) {
        t.getAttribute('data-qa-pair').split(',').forEach(function (x) { var p = x.split(':'); B.add(p[0], +p[1]); });
        pick.hidden = true; h.querySelector('[data-qa-open]').setAttribute('aria-expanded', 'false');
        say(t.textContent + ' added'); paint(); h.querySelector('[data-qa-open]').focus();
      }
    }
  });

  document.addEventListener('ah:stock', function (e) { stock = e.detail.items; checkout = e.detail.checkout; paint(); });
  if (window.AHStock) { stock = window.AHStock.items; checkout = window.AHStock.checkout; }
  window.addEventListener('storage', paint);
  paint();
})();
