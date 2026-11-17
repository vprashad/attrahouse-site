/* Basket: kept in this browser only. Adds, counts, and the Add to basket buttons. */
(function () {
  var KEY = 'ah-basket-v1';
  function read() { try { var b = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(b) ? b : []; } catch (e) { return []; } }
  function write(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} paint(); }
  function add(sku, qty) {
    var b = read(), hit = b.find(function (i) { return i.sku === sku; });
    if (hit) hit.qty = Math.min(20, hit.qty + qty); else b.push({ sku: sku, qty: qty });
    write(b);
  }
  function count() { return read().reduce(function (n, i) { return n + i.qty; }, 0); }
  function paint() {
    var n = count();
    [].forEach.call(document.querySelectorAll('[data-basket-count]'), function (el) { el.textContent = n ? '(' + n + ')' : ''; });
  }
  window.AHBasket = { read: read, write: write, add: add, clear: function () { write([]); } };

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (!b || b.disabled) return;
    var qty = +(b.getAttribute('data-qty') || 1);
    var skus = (b.getAttribute('data-add') || '').split(',');
    skus.forEach(function (s) {
      var sel = s.indexOf('?') === 0 ? document.getElementById(s.slice(1)) : null;
      if (sel) { if (+sel.value > 0) add(sel.getAttribute('data-sku'), +sel.value); }
      else add(s, qty);
    });
    var msg = b.closest('.buybox') && b.closest('.buybox').querySelector('[data-added]');
    if (msg) msg.hidden = false;
  });
  paint();
})();
