/* THREADS storefront — vanilla SPA */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let S = {}, HOME = {}, PRODUCTS = [];
  let cart = load('th_cart', []);
  const timers = new Set();

  const BRAND_LOGOS = { nike: '/brand/brand-nike.png', adidas: '/brand/brand-adidas.png', on: '/brand/brand-on.png', 'the north face': '/brand/brand-tnf.png' };
  const BRANDS = ['Nike', 'Adidas', 'On', 'The North Face'];
  const brandLogo = b => BRAND_LOGOS[String(b || '').toLowerCase()] || '/brand/emblem.png';
  const money = n => `${S.currency || '$'}${Number(n || 0).toFixed(Number(n) % 1 ? 2 : 0)}`;
  const priceOf = p => p.sale_price ?? p.price;

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  // On GitHub Pages there is no server: the build sets these two meta tags, products come from
  // data/*.json and the order is handed to the owner on WhatsApp instead of the admin panel.
  const BASE = (document.querySelector('meta[name="th-base"]') || {}).content || '';
  const STATIC = !!document.querySelector('meta[name="th-static"]');
  const here = () => location.pathname.slice(BASE.length) || '/';
  function staticApi(url, opts) {
    if (url === '/api/settings') return fetch('data/settings.json').then(r => r.json());
    if (url === '/api/products') return fetch('data/products.json').then(r => r.json());
    if (url === '/api/subscribe') return Promise.resolve({ ok: true });
    if (url === '/api/orders') {
      const b = JSON.parse(opts.body), c = b.customer || {};
      const items = (b.items || []).map(it => { const p = PRODUCTS.find(x => x.id === it.id); return p && { name: `${p.brand} ${p.name}`, color: p.color, size: it.size, qty: it.qty, price: priceOf(p) }; }).filter(Boolean);
      const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
      const freeOver = Number(S.free_delivery_over) || 0;
      const fee = freeOver && subtotal >= freeOver ? 0 : Number(S.delivery_fee) || 0;
      const number = 'TH' + Date.now().toString(36).toUpperCase().slice(-6);
      const text = [`New order ${number}`, ...items.map(i => `${i.qty} x ${i.name}, ${i.color}, size ${i.size}: ${money(i.price * i.qty)}`),
        `Delivery: ${fee ? money(fee) : 'free'}`, `Total cash on delivery: ${money(subtotal + fee)}`, '',
        `Name: ${c.name}`, `Phone: ${c.phone}`, c.email ? `Email: ${c.email}` : '', `Area: ${c.city}`, `Address: ${c.address}`, c.notes ? `Notes: ${c.notes}` : ''].filter(x => x !== '').join('\n');
      const wa = `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text)}`;
      const w = window.open(wa, '_blank', 'noopener');
      return Promise.resolve({ number, subtotal, delivery_fee: fee, total: subtotal + fee, items, via: 'whatsapp', wa, opened: !!w });
    }
    return Promise.reject(new Error('This action needs the full store server.'));
  }
  async function api(url, opts = {}) {
    if (STATIC) return staticApi(url, opts);
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || (r.status >= 500 ? "The store couldn't process that. Please try again in a moment." : "That request didn't go through. Please try again."));
    return data;
  }

  // Unsplash and other CDNs get resized on the fly; local files are served as-is.
  function src(url, w) {
    if (!url) return '';
    if (url.includes('images.unsplash.com')) return `${url.split('?')[0]}?auto=format&fit=crop&w=${w}&q=72`;
    return url;
  }
  function srcset(url, widths = [480, 800, 1200, 1800]) {
    if (!url || !url.includes('images.unsplash.com')) return '';
    return `srcset="${widths.map(w => `${src(url, w)} ${w}w`).join(', ')}"`;
  }
  const rich = t => esc(t).replace(/\*(.+?)\*/g, '<em>$1</em>');   // *word* → green accent

  function toast(html, img) {
    const t = $('#toast');
    t.innerHTML = (img ? `<img src="${esc(img)}" alt="">` : '') + `<span>${html}</span>`;
    t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const ICON = {
    truck: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    cash: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 19l1.3-3.9A7.5 7.5 0 1 1 8.6 18z"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z"/><path d="M9.2 8.6c.2 2.6 3.4 5.9 6 6.2l1-1.2-2-1-1 .8c-1-.4-2.3-1.7-2.8-2.8l.8-1-1-2z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  // ---------- colour grouping ----------
  const NAMED = { black: '#16161a', white: '#f4f4f2', cream: '#efeae0', 'off white': '#ece8df', grey: '#8b8d92', gray: '#8b8d92', charcoal: '#3a3b40', graphite: '#3a3b40', navy: '#1f2a44', blue: '#2f5fd0', red: '#c8281d', coral: '#d9473a', pink: '#e8a3b5', blush: '#d79b8f', olive: '#5d6450', sage: '#9aa58e', green: '#3a7d44', khaki: '#a89a6e', beige: '#d8cbb2', brown: '#6b4a32', purple: '#6a4c93', lavender: '#a8a3f0', plum: '#5a4a52', yellow: '#f2c230', orange: '#ec7a2c' };
  function hexOf(p) {
    if (p.swatch) return p.swatch;
    const c = String(p.color || '').toLowerCase().split('/')[0].trim();
    return NAMED[c] || Object.entries(NAMED).find(([k]) => c.includes(k))?.[1] || '#9a9ca1';
  }
  const gkey = p => `${p.brand}|${p.name}`.toLowerCase().trim();
  const siblings = p => PRODUCTS.filter(x => gkey(x) === gkey(p));
  function groupsOf(list) {
    const m = new Map();
    for (const p of list) { const k = gkey(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
    return [...m.values()].map(v => v.sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.featured - a.featured));
  }

  // ---------- cards ----------
  function media(p, w = 700) {
    const imgs = p.images || [];
    if (!imgs.length) return `<div class="ph"><img src="${brandLogo(p.brand)}" alt="" loading="lazy"></div>`;
    return `<img class="pi" src="${esc(src(imgs[0], w))}" alt="${esc(p.name)} — ${esc(p.color)}" loading="lazy">` +
      (imgs[1] ? `<img class="pi alt" src="${esc(src(imgs[1], w))}" alt="" loading="lazy">` : '');
  }
  function priceHtml(p) {
    return p.sale_price != null
      ? `<span class="price"><span class="now-sale">${money(p.sale_price)}</span><s>${money(p.price)}</s></span>`
      : `<span class="price">${money(p.price)}</span>`;
  }
  const isNew = p => Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z') < 30 * 864e5;
  function card(variants, i = 0) {
    const p = variants[i];
    const tags = [];
    if (p.stock === 0) tags.push('<span class="tag dark">Sold out</span>');
    else if (p.sale_price != null) tags.push(`<span class="tag red">-${Math.round((1 - p.sale_price / p.price) * 100)}%</span>`);
    if (p.stock > 0 && isNew(p)) tags.push('<span class="tag">New</span>');
    const sizes = p.sizes.length && p.stock > 0
      ? `<div class="quick"><small>Quick add, ${esc(p.color || 'pick a size')}</small><div class="quick-sizes">${p.sizes.map(s => `<button type="button" data-qa="${p.id}" data-size="${esc(s.size)}" ${s.stock > 0 ? '' : 'disabled'}>${esc(s.size)}</button>`).join('')}</div></div>` : '';
    return `<a class="card" href="/p/${esc(p.slug)}" data-link data-g="${esc(gkey(p))}" data-i="${i}">
      <div class="card-media">${media(p)}<div class="card-tags">${tags.join('')}</div>${sizes}</div>
      <div class="card-body">
        <div class="card-top"><span class="card-brand">${esc(p.brand)}</span>${priceHtml(p)}</div>
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-meta">${variants.length > 1 ? `${variants.length} colours` : esc(p.color || p.category)}</div>
        ${variants.length > 1 ? `<div class="swatches">${variants.map((v, j) => `<button type="button" class="sw ${j === i ? 'on' : ''}" style="--c:${esc(hexOf(v))}" data-sw="${j}" aria-label="${esc(v.color)}" title="${esc(v.color)}"></button>`).join('')}</div>` : ''}
      </div></a>`;
  }
  // swatch + quick-add clicks inside cards (delegated)
  document.addEventListener('click', e => {
    const sw = e.target.closest('.sw[data-sw]');
    if (sw) {
      e.preventDefault(); e.stopPropagation();
      const el = sw.closest('.card');
      const variants = groupsOf(PRODUCTS.filter(p => gkey(p) === el.dataset.g))[0];
      const tmp = document.createElement('div'); tmp.innerHTML = card(variants, +sw.dataset.sw);
      el.replaceWith(tmp.firstElementChild);
      return;
    }
    const qa = e.target.closest('[data-qa]');
    if (qa) {
      e.preventDefault(); e.stopPropagation();
      const p = PRODUCTS.find(x => x.id === +qa.dataset.qa);
      if (p) gate(() => addToCart(p, qa.dataset.size, 1, false));
    }
  }, true);
  // hover a swatch to preview that colour
  document.addEventListener('mouseover', e => {
    const sw = e.target.closest('.sw[data-sw]');
    if (!sw || sw.classList.contains('on')) return;
    const el = sw.closest('.card');
    const variants = groupsOf(PRODUCTS.filter(p => gkey(p) === el.dataset.g))[0];
    const v = variants[+sw.dataset.sw];
    const img = el.querySelector('img.pi:not(.alt)');
    if (img && v.images[0]) img.src = src(v.images[0], 700);
  });

  // ---------- router ----------
  function go(url, replace) {
    const swap = () => {
      if (replace) history.replaceState({}, '', BASE + url); else history.pushState({}, '', BASE + url);
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    if (!replace && window.FX && FX.transition) FX.transition(swap); else swap();
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('a[data-gate]');
    if (g && gateOn() && !member) {
      e.preventDefault();
      const href = g.href;
      gate(() => { const w = window.open(href, '_blank', 'noopener'); if (!w) location.href = href; }, 'Fill in your details and we will connect you on WhatsApp.');
      return;
    }
    const co = e.target.closest('a[href="/checkout"]');
    if (co && gateOn() && !member) { e.preventDefault(); gate(() => go('/checkout')); return; }
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    e.preventDefault();
    closeAll();
    const href = a.getAttribute('href');
    if (href === here() + location.search) return window.scrollTo({ top: 0, behavior: 'smooth' });
    go(href);
  });
  window.addEventListener('popstate', render);

  let overHeader = false;
  function setOver() {}

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  function reveal() { $$('.reveal, .rise', document).forEach(el => io ? io.observe(el) : el.classList.add('in')); }

  function render() {
    timers.forEach(t => clearInterval(t)); timers.clear();
    const path = here(), q = new URLSearchParams(location.search);
    $$('.nav > a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === path + location.search));
    if (path !== '/') { $('#topbar').classList.remove('minimal'); if (pinObs) pinObs.disconnect(); const th = $('.pl-thumb'); if (th) th.classList.remove('on'); }
    if (path === '/') renderHome();
    else if (path === '/shop') renderShop(q);
    else if (path.startsWith('/p/')) renderProduct(decodeURIComponent(path.slice(3)));
    else if (path === '/checkout') { renderCheckout(); if (cart.length) gate(() => {}); }
    else if (path === '/privacy') renderPrivacy();
    else if (path.startsWith('/order/')) renderDone(decodeURIComponent(path.slice(7)));
    else { setOver(false); app.innerHTML = `<div class="wrap empty"><h3>Page not found</h3><a href="/" data-link class="btn btn-dark">Back home</a></div>`; }
    reveal();
  }

  // ---------- home: the pinned poster ----------
  // Built from the live catalogue, so it follows whatever the owner stocks.
  const FULL = { 'NK-SET-WHT': '/products/full-nike.webp', 'ON-SHT-OLV': '/products/full-olive.webp' };
  const PAPER = { 'TNF-SET-LAV': '#eeeae7', 'ON-SET-CRL': '#e7e5e1', 'ON-SHT-OLV': '#f3efea', 'ON-SHT-BLS': '#efece9', 'ON-SHT-CRM': '#f1efec', 'ON-SHT-BLK': '#f4f0ed', 'ON-SHT-PLM': '#f4f0eb' };
  const LEBANON = [
    { verb: 'Order', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Beirut_Corniche%2C_Beirut%2C_Lebanon.jpg/1920px-Beirut_Corniche%2C_Beirut%2C_Lebanon.jpg', credit: 'Beirut Corniche, Vyacheslav Argenberg, CC BY 4.0' },
    { verb: 'Confirm', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Beirut_Corniche_at_Night.JPG/1920px-Beirut_Corniche_at_Night.JPG', credit: 'Beirut Corniche at night, Wusel007, CC BY-SA 3.0' },
    { verb: 'Deliver', img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Zig-zag_lebanese_mountain_road.jpg/1920px-Zig-zag_lebanese_mountain_road.jpg', credit: 'Mountain road, Peripitus, CC BY-SA 3.0' },
    { verb: 'Pay', img: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Aley_Lebanon_Houses_and_hillside.jpg', credit: 'Aley, Peripitus, CC BY-SA 3.0' },
  ];
  const E_SVG = '<svg class="pin-e" viewBox="0 0 100 100" aria-hidden="true"><path d="M30 0h70l-9 22H21z" fill="currentColor"/><path class="mid" d="M18 39h70l-9 22H9z"/><path d="M6 78h70l-9 22H-3z" fill="currentColor"/></svg>';
  const sizeList = p => p.sizes.map(s => s.stock > 0 ? esc(s.size) : `<s>${esc(s.size)}</s>`).join(' ');
  const VERB_TEXT = (fee, freeOver) => [
    'Pick your size and place the order in a minute. No account, no card.',
    'We call or message you on WhatsApp to confirm the order and your address.',
    `Our driver brings it anywhere in Lebanon, from Beirut to the mountains. Delivery is ${money(fee)}${freeOver ? `, free over ${money(freeOver)}` : ''}.`,
    'Pay cash at your door when it arrives. That is the whole process.',
  ];

  function renderHome() {
    document.title = 'THREADS — Activewear & Lifestyle';
    const groups = groupsOf(PRODUCTS);
    const live = [...groups].sort((a, b) => b.length - a.length)[0] || [];
    const singles = groups.filter(g => g !== live).map(g => g[0]);
    const featured = singles.filter(p => p.featured).concat(singles.filter(p => !p.featured));
    const first = PRODUCTS.find(p => p.sku === 'TNF-SET-LAV') || featured[0] || live[0];
    const pinned = featured.filter(p => p !== first)[0];
    const show = [PRODUCTS.find(p => p.sku === 'NK-SET-WHT'), live.find(p => FULL[p.sku])].filter(Boolean);
    for (const p of featured) { if (show.length >= 2) break; if (!show.includes(p) && p !== first && p !== pinned) show.push(p); }
    const intro = ((HOME.slides || [])[0] || {}).text || 'Original Nike, Adidas, On and The North Face, delivered anywhere in Lebanon. You pay cash at the door.';
    const freeOver = Number(S.free_delivery_over) || 0;
    const fee = Number(S.delivery_fee) || 0;
    const byBrand = [...new Set(PRODUCTS.map(p => p.brand))].map(b => [b, PRODUCTS.filter(p => p.brand === b)]);
    const frameImgs = PRODUCTS.filter(p => p.images[0]);
    const off = p => p.sale_price != null ? `<s>${money(p.price)}</s>` : '';
    const words = VERB_TEXT(fee, freeOver);
    const cities = (S.cities || '').split(',').map(c => c.trim()).filter(Boolean).slice(0, 8).join(', ');

    app.innerHTML = `
      <section class="pin" id="pin" aria-label="THREADS">
        <h1 class="sr-only">THREADS Activewear &amp; Lifestyle: original Nike, Adidas, On and The North Face with cash on delivery in Lebanon</h1>
        <div class="pin-layer" aria-hidden="true">
          <div class="pin-word pin-a">THR${E_SVG}</div>
          <div class="pin-word pin-b">ADS</div>
        </div>

        <div class="pin-panel panel-first">
          <div class="pf-main">
            <div class="pf-text rise">
              <p>${esc(intro)}</p>
              <div class="cta-row">
                <a class="btn btn-green" href="/shop" data-link>Shop the collection</a>
                <a class="link" href="/shop?gender=Women" data-link>Women</a>
              </div>
            </div>
            <nav class="pf-links" aria-label="Shop by">
              <a href="/shop?gender=Women" data-link>Women</a>
              <a href="/shop?gender=Men" data-link>Men</a>
              <a href="/shop?sale=1" data-link>Sale</a>
            </nav>
          </div>
          ${first ? `<a class="pf-photo" href="/p/${esc(first.slug)}" data-link aria-label="${esc(`${first.brand} ${first.name}`)}"><img src="${esc(first.images[0])}" alt="${esc(`${first.brand} ${first.name} in ${first.color}`)}" fetchpriority="high"></a>` : '<div class="pf-photo"></div>'}
        </div>

        ${live.length ? `<div class="pin-panel panel-live" id="live" style="--panel:${PAPER[live[0].sku] || '#f1eeea'}">
          <div class="live-photo">${live.map((p, i) => `<img src="${esc(p.images[0])}" alt="${esc(`${p.brand} ${p.name} in ${p.color}`)}" data-v="${i}" class="${i ? 'out' : ''}">`).join('')}</div>
          <div class="live-info rise">
            <h2>${esc(live[0].name).replace(/-/g, '\u2011')}</h2>
            <p>${esc(live[0].brand)}, in ${live.length} colours. Pick one.</p>
            <div class="live-price tnum" id="livePrice"></div>
            <div class="swatch-row" role="group" aria-label="Colour">${live.map((p, i) => `<button type="button" class="swatch" style="--c:${esc(hexOf(p))}" data-v="${i}" aria-pressed="${i === 0}" aria-label="${esc(p.color)}"></button>`).join('')}</div>
            <p class="live-colour" id="liveColour"></p>
            <div class="live-sizes" id="liveSizes" role="group" aria-label="Size"></div>
            <p class="live-note" id="liveNote" aria-live="polite"></p>
            <div class="cta-row"><button class="btn btn-green" id="liveAdd">Add to bag</button><a class="link" id="liveLink" data-link>Details</a></div>
          </div>
        </div>` : ''}

        ${pinned ? `<div class="pin-panel panel-photo" style="--panel:${PAPER[pinned.sku] || '#e9e7e3'}">
          <a class="pp-photo" href="/p/${esc(pinned.slug)}" data-link><img src="${esc(pinned.images[0])}" alt="${esc(`${pinned.brand} ${pinned.name} in ${pinned.color}`)}" loading="lazy"></a>
          <p class="pp-cap">${esc(pinned.brand)} ${esc(pinned.name)} in ${esc(pinned.color.toLowerCase())}, ${money(priceOf(pinned))}${pinned.sale_price != null ? ` instead of ${money(pinned.price)}` : ''}. <a href="/p/${esc(pinned.slug)}" data-link>See it</a></p>
        </div>` : ''}
      </section>

      ${show.map((p, i) => `<section class="sc-frame">
        <img src="${esc(FULL[p.sku] || p.images[0])}" alt="" loading="lazy">
        <div class="sc-card c${i + 2} rise">
          ${i === 0 ? `<h2>${esc(p.name)}</h2>` : `<h3>${esc(p.name)}</h3>`}
          <p>${esc(p.brand)}, ${esc(p.color.toLowerCase())}</p>
          <p class="tnum">${money(priceOf(p))} ${p.sale_price != null ? `<s style="opacity:.6">${money(p.price)}</s>` : ''}</p>
          <div class="whole"><img src="${esc(p.images[0])}" alt="${esc(`${p.brand} ${p.name}`)}" loading="lazy"></div>
          <a class="btn btn-green" href="/p/${esc(p.slug)}" data-link>Choose your size</a>
        </div>
      </section>`).join('')}

      <section class="pricelist" aria-label="Everything in stock">
        <h2 class="sr-only">Everything in stock</h2>
        ${byBrand.map(([b, list]) => `<div class="pl-group">
          <h3 class="pl-brand">${esc(b)}</h3>
          ${list.map(p => `<a class="pl-row" href="/p/${esc(p.slug)}" data-link data-img="${esc(p.images[0] || '')}">
            <span>${esc(p.name)}, ${esc(p.color.toLowerCase())}</span>
            <span class="pl-cat">${esc(p.category)}</span>
            <span class="pl-sizes">${p.stock ? sizeList(p) : 'Sold out'}</span>
            <span class="pl-price">${off(p)}${money(priceOf(p))}</span>
          </a>`).join('')}
        </div>`).join('')}
      </section>

      <section aria-label="How ordering works">
        <h2 class="sr-only">How ordering works</h2>
        ${LEBANON.map((v, i) => `<div class="verb-panel">
          <img src="${v.img}" alt="" loading="lazy">
          <div class="verb-word">${v.verb}</div>
          <p class="verb-text">${words[i]}</p>
          <span class="verb-credit">${esc(v.credit)}</span>
        </div>`).join('')}
      </section>

      ${frameImgs.length ? `<section class="frame-sec" aria-label="Every piece in stock">
        <p class="frame-intro rise"><span>${frameImgs.length} pieces in stock right now. Tap to see the next one.</span></p>
        <div class="frame" id="frame" role="button" tabindex="0" aria-label="Next piece">${frameImgs.map((p, i) => `<img src="${esc(p.images[0])}" alt="${esc(`${p.brand} ${p.name} in ${p.color}`)}" class="${i ? '' : 'on'}" loading="lazy">`).join('')}</div>
        <p class="frame-cap" id="frameCap" aria-live="polite"></p>
      </section>` : ''}

      <section class="faq">
        <h2 class="rise"><span>Before you order</span></h2>
        <div class="faq-list">
          <details><summary>How do I pay?</summary><p>In cash, when the order reaches you. You never enter a card on this site.</p></details>
          <details><summary>How much is delivery, and where do you deliver?</summary><p>${money(fee)} anywhere in Lebanon${freeOver ? `, and free when your order is over ${money(freeOver)}` : ''}. We deliver to ${esc(cities)} and the rest of the country.</p></details>
          <details><summary>What happens after I order?</summary><p>We call or message you on WhatsApp to confirm the order and your address, then our driver brings it to you.</p></details>
          <details><summary>What if the size is wrong?</summary><p>Message us on WhatsApp within a few days of delivery. If the piece is unworn with its tags on, we arrange a size swap.</p></details>
          <details><summary>Are the products original?</summary><p>Yes. Everything we sell is original Nike, Adidas, On and The North Face.</p></details>
          <details><summary>Can I order on WhatsApp instead?</summary><p>Yes. Send us the product name and your size on <a class="link" href="https://wa.me/${esc(S.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a> and we take it from there.</p></details>
        </div>
      </section>`;

    wireLive(live);
    wireFrame(frameImgs);
    wirePriceList();
    wireMinimalBar();
  }

  function wireLive(variants) {
    const box = $('#live'); if (!box) return;
    let v = 0, size = null;
    const draw = () => {
      const p = variants[v];
      box.style.setProperty('--panel', PAPER[p.sku] || '#f1eeea');
      $$('.live-photo img', box).forEach(img => img.classList.toggle('out', +img.dataset.v !== v));
      $$('.swatch', box).forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === v));
      $('#livePrice').innerHTML = `${money(priceOf(p))}${p.sale_price != null ? `<s>${money(p.price)}</s>` : ''}`;
      $('#liveColour').textContent = `${p.color}${p.stock ? '' : ', sold out'}`;
      const s = p.sizes.find(x => x.size === size);
      if (!s || s.stock <= 0) size = null;
      $('#liveSizes').innerHTML = p.sizes.map(x => `<button type="button" data-s="${esc(x.size)}" aria-pressed="${x.size === size}" ${x.stock > 0 ? '' : 'disabled'}>${esc(x.size)}</button>`).join('');
      $$('#liveSizes button').forEach(b => b.onclick = () => { size = b.dataset.s; draw(); });
      const st = size ? (p.sizes.find(x => x.size === size) || {}).stock : 0;
      $('#liveNote').textContent = size && st <= 3 ? `Only ${st} left in ${size}.` : '';
      $('#liveLink').setAttribute('href', `/p/${p.slug}`);
    };
    $$('.swatch', box).forEach(b => b.onclick = () => { v = +b.dataset.v; draw(); });
    $('#liveAdd').onclick = () => {
      const p = variants[v];
      if (!size) { $('#liveNote').textContent = 'Choose your size first.'; $('#liveSizes').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 260); return; }
      const chosen = size;
      gate(() => addToCart(p, chosen, 1, true));
    };
    draw();
  }

  function wireFrame(list) {
    const frame = $('#frame'); if (!frame) return;
    const imgs = $$('img', frame); let i = 0;
    const cap = () => { const p = list[i]; $('#frameCap').textContent = `${p.brand} ${p.name}, ${p.color.toLowerCase()}, ${money(priceOf(p))}`; };
    const next = () => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); cap(); };
    cap();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setInterval(() => { if (document.body.contains(frame)) next(); }, 2400); timers.add(t);
    }
    frame.onclick = next;
    frame.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
  }

  function wirePriceList() {
    if (!matchMedia('(hover: hover)').matches) return;
    let thumb = $('.pl-thumb');
    if (!thumb) { thumb = document.createElement('div'); thumb.className = 'pl-thumb'; thumb.innerHTML = '<img alt="">'; document.body.appendChild(thumb); }
    $$('.pl-row').forEach(r => {
      r.addEventListener('mouseenter', () => { if (!r.dataset.img) return; thumb.firstChild.src = r.dataset.img; thumb.classList.add('on'); });
      r.addEventListener('mousemove', e => { thumb.style.left = e.clientX + 'px'; thumb.style.top = e.clientY + 'px'; });
      r.addEventListener('mouseleave', () => thumb.classList.remove('on'));
    });
  }

  // The pinned name stands in for the logo, so the bar shows only its actions until the pin has passed.
  let pinObs = null;
  function wireMinimalBar() {
    const bar = $('#topbar'), pin = $('#pin');
    if (pinObs) pinObs.disconnect();
    if (!pin) { bar.classList.remove('minimal'); return; }
    bar.classList.add('minimal');
    pinObs = new IntersectionObserver(([en]) => bar.classList.toggle('minimal', en.isIntersecting), { rootMargin: `0px 0px -${Math.max(0, innerHeight - 80)}px 0px` });
    pinObs.observe(pin);
  }

  function wireRail() {
    const rail = $('#rail'); if (!rail) return;
    const btns = $$('[data-rail]');
    const upd = () => { btns[0].disabled = rail.scrollLeft < 8; btns[1].disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8; };
    btns.forEach(b => b.onclick = () => rail.scrollBy({ left: +b.dataset.rail * rail.clientWidth * .9, behavior: 'smooth' }));
    rail.addEventListener('scroll', upd, { passive: true }); upd();
  }

  // ---------- shop ----------
  function renderShop(q) {
    const gender = q.get('gender') || '', brand = q.get('brand') || '', cat = q.get('category') || '';
    const sale = q.get('sale') === '1', term = (q.get('q') || '').trim().toLowerCase(), sort = q.get('sort') || '';
    const list = PRODUCTS.filter(p =>
      (!gender || p.gender === gender || p.gender === 'Unisex') &&
      (!brand || p.brand.toLowerCase() === brand.toLowerCase()) &&
      (!cat || p.category === cat) &&
      (!sale || p.sale_price != null) &&
      (!term || `${p.name} ${p.brand} ${p.category} ${p.color} ${p.sku} ${p.gender}`.toLowerCase().includes(term)));
    let groups = groupsOf(list);
    if (sort === 'low') groups.sort((a, b) => priceOf(a[0]) - priceOf(b[0]));
    else if (sort === 'high') groups.sort((a, b) => priceOf(b[0]) - priceOf(a[0]));
    else if (sort === 'new') groups.sort((a, b) => b[0].created_at.localeCompare(a[0].created_at) || b[0].id - a[0].id);
    else groups.sort((a, b) => b.some(p => p.featured) - a.some(p => p.featured));
    groups.sort((a, b) => (a[0].stock === 0) - (b[0].stock === 0));

    const pool = PRODUCTS.filter(p => (!gender || p.gender === gender || p.gender === 'Unisex') && (!brand || p.brand.toLowerCase() === brand.toLowerCase()));
    const cats = [...new Set(pool.map(p => p.category).filter(Boolean))].sort();
    const brandList = [...new Set([...BRANDS, ...PRODUCTS.map(p => p.brand).filter(Boolean)])];
    const title = term ? `“${q.get('q')}”` : cat || (sale ? 'Sale' : brand || (gender || 'Shop all'));
    const bt = (HOME.brands || []).find(b => b.name.toLowerCase() === brand.toLowerCase());
    const bg = bt ? bt.image : gender === 'Men' ? HOME.men_image : gender === 'Women' ? HOME.women_image : (HOME.story || {}).image;
    document.title = `${title} — THREADS`;
    const link = patch => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return '/shop' + (n.toString() ? '?' + n : ''); };
    const cols = load('th_cols', 4);

    app.innerHTML = `
      <section class="shop-head"><div class="wrap">
        ${brand && !cat && !term ? `<img src="${brandLogo(brand)}" alt="${esc(brand)}" style="height:clamp(40px,6vw,70px);width:auto;margin-bottom:10px;filter:invert(1)">` : ''}
        <h1 class="display split-me">${esc(title)}</h1>
        <div class="count">${groups.length} style${groups.length === 1 ? '' : 's'} in ${list.length} colour${list.length === 1 ? '' : 's'}</div>
        <div class="chips">
          ${['', 'Women', 'Men'].map(g => `<a class="chip ${gender === g ? 'on' : ''}" href="${link({ gender: g, category: '' })}" data-link>${g || 'Everyone'}</a>`).join('')}
          ${cats.length ? '<span class="chip-sep"></span>' : ''}
          ${cats.map(c => `<a class="chip ${cat === c ? 'on' : ''}" href="${link({ category: cat === c ? '' : c })}" data-link>${esc(c)}</a>`).join('')}
        </div>
      </div></section>
      <div class="wrap">
        <div class="toolbar">
          <select class="select" id="fBrand" aria-label="Brand"><option value="">All brands</option>${brandList.map(b => `<option ${b.toLowerCase() === brand.toLowerCase() ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
          <label class="toggle-chip"><input type="checkbox" id="fSale" ${sale ? 'checked' : ''}> On sale</label>
          <span class="spacer"></span>
          <div class="cols" role="group" aria-label="Products per row">${[2, 3, 4].map(n => `<button type="button" data-cols="${n}" class="${cols === n ? 'on' : ''}" aria-label="${n} per row" aria-pressed="${cols === n}">${'<i></i>'.repeat(n)}</button>`).join('')}</div>
          <select class="select" id="fSort" aria-label="Sort">
            <option value="">Featured</option><option value="new" ${sort === 'new' ? 'selected' : ''}>Newest</option>
            <option value="low" ${sort === 'low' ? 'selected' : ''}>Price: low to high</option><option value="high" ${sort === 'high' ? 'selected' : ''}>Price: high to low</option>
          </select>
        </div>
        ${groups.length ? `<div class="grid shop-grid" id="shopGrid" style="--cols:${cols}">${groups.map(g => card(g)).join('')}</div>` :
          `<div class="empty"><h3>${gender === 'Men' && !brand && !cat ? "Men's drop landing soon" : 'Nothing here yet'}</h3><p>${gender === 'Men' && !brand && !cat ? 'New pieces are on the way. Follow us on Instagram to be first.' : 'Try another filter.'}</p><a href="/shop" data-link class="btn btn-dark">See everything</a></div>`}
      </div>`;
    $('#fBrand').onchange = e => go(link({ brand: e.target.value }), true);
    $$('[data-cols]').forEach(b => b.onclick = () => { const n = +b.dataset.cols; save('th_cols', n); $('#shopGrid') && $('#shopGrid').style.setProperty('--cols', n); $$('[data-cols]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    $('#fSort').onchange = e => go(link({ sort: e.target.value }), true);
    $('#fSale').onchange = e => go(link({ sale: e.target.checked ? '1' : '' }), true);
  }

  // ---------- product ----------
  function renderProduct(slug) {
    setOver(false);
    const p = PRODUCTS.find(x => x.slug === slug);
    if (!p) { app.innerHTML = `<div class="wrap empty"><h3>Not available</h3><p>This product may have sold out or been removed.</p><a href="/shop" data-link class="btn btn-dark">Back to shop</a></div>`; return; }
    document.title = `${p.brand} ${p.name} — ${p.color} — THREADS`;
    const sibs = groupsOf(siblings(p))[0];
    let sel = p.sizes.length === 1 && p.sizes[0].stock > 0 ? p.sizes[0].size : null, qty = 1;
    const relatedGroups = groupsOf(PRODUCTS.filter(x => gkey(x) !== gkey(p) && (x.category === p.category || x.brand === p.brand || x.gender === p.gender))).slice(0, 4);
    const waText = encodeURIComponent(`Hi THREADS! I'm interested in the ${p.brand} ${p.name} (${p.color}, ${p.sku}). ${location.href}`);
    const imgs = p.images.length ? p.images : [null];
    const off = p.sale_price != null ? Math.round((1 - p.sale_price / p.price) * 100) : 0;

    app.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="/" data-link>Home</a> / <a href="/shop?gender=${p.gender === 'Unisex' ? '' : p.gender}" data-link>${p.gender === 'Unisex' ? 'Shop' : p.gender}</a>${p.category ? ` / <a href="/shop?category=${encodeURIComponent(p.category)}" data-link>${esc(p.category)}</a>` : ''} / <span style="color:var(--ink)">${esc(p.name)}</span></div>
        <div class="pdp">
          <div>
            <div class="gal" id="gal">${imgs.map((u, i) => `<figure data-i="${i}">${u ? `<img src="${esc(src(u, 1200))}" alt="${esc(p.name)} ${esc(p.color)} — photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>` : media(p)}</figure>`).join('')}</div>
            ${imgs.length > 1 ? `<div class="gal-dots" id="galDots">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
          </div>
          <div class="pdp-info">
            <a class="card-brand" href="/shop?brand=${encodeURIComponent(p.brand)}" data-link><img src="${brandLogo(p.brand)}" alt="">${esc(p.brand)}</a>
            <h1 class="split-me">${esc(p.name)}</h1>
            <div style="display:flex;gap:12px;align-items:center">${priceHtml(p)}${off ? `<span class="save-pill">SAVE ${off}%</span>` : ''}</div>
            ${sibs.length > 1 ? `<div class="pdp-block"><div class="label-row"><span>Colour</span><span>${esc(p.color)}</span></div>
              <div class="colors">${sibs.map(v => `<a class="color-opt ${v.id === p.id ? 'on' : ''}" href="/p/${esc(v.slug)}" data-swap title="${esc(v.color)}" aria-label="${esc(v.color)}">${v.images[0] ? `<img src="${esc(src(v.images[0], 200))}" alt="">` : `<span style="display:block;width:100%;height:100%;background:${esc(hexOf(v))}"></span>`}</a>`).join('')}</div></div>`
              : p.color ? `<div class="pdp-block" style="margin-top:12px;color:var(--muted)">Colour: ${esc(p.color)}</div>` : ''}
            ${p.sizes.length ? `<div class="pdp-block"><div class="label-row"><span>Size <span id="selLabel" style="color:var(--muted);letter-spacing:.02em;text-transform:none;font-weight:500;margin-left:6px">${sel ? esc(sel) : ''}</span></span><button type="button" id="sgOpen">Size guide</button></div>
              <div class="sizes">${p.sizes.map(s => `<button class="size ${s.stock <= 0 ? 'out' : ''} ${sel === s.size ? 'on' : ''}" data-size="${esc(s.size)}">${esc(s.size)}</button>`).join('')}</div>
              <div class="size-note" id="sizeNote"></div></div>` : ''}
            ${p.stock > 0 ? `
            <div class="buy-row">
              <div class="qty"><button id="qMinus" aria-label="Less">−</button><span id="qVal">1</span><button id="qPlus" aria-label="More">+</button></div>
              <button class="btn btn-dark" id="addBtn">Add to bag, ${money(priceOf(p))}</button>
            </div>` : `<button class="btn btn-dark btn-block" disabled style="margin-top:18px">Sold out</button>`}
            <a class="btn btn-wa btn-block wa-row" data-gate target="_blank" rel="noopener" href="https://wa.me/${esc(S.whatsapp)}?text=${waText}">${ICON.wa} ${p.stock > 0 ? 'Ask about this on WhatsApp' : "Ask when it's back"}</a>
            <div class="pdp-perks">
              <div>${ICON.cash} Pay cash on delivery — no card needed</div>
              <div>${ICON.truck} Delivery all over Lebanon${Number(S.free_delivery_over) ? `, free over ${money(S.free_delivery_over)}` : ''}</div>
              <div>${ICON.shield} 100% original ${esc(p.brand)}</div>
            </div>
            ${p.description ? `<details class="acc" open><summary>Details</summary><div>${esc(p.description)}</div></details>` : ''}
            <details class="acc"><summary>Delivery &amp; payment</summary><div>We deliver all over Lebanon. Delivery fee is ${money(S.delivery_fee)}${Number(S.free_delivery_over) ? `, free on orders over ${money(S.free_delivery_over)}` : ''}.\nYou pay in cash when your order arrives. We'll call or WhatsApp you to confirm before shipping.</div></details>
            <details class="acc"><summary>Size exchanges</summary><div>Not the right fit? Message us on WhatsApp within a few days of delivery and we'll arrange a size swap (item unworn, tags on).</div></details>
          </div>
        </div>
        ${relatedGroups.length ? `<section class="section on-light" style="padding-top:60px"><div class="sec-head"><div><h2 class="h2">You may also like</h2></div></div><div class="grid">${relatedGroups.map(g => card(g)).join('')}</div></section>` : ''}
      </div>`;

    // colour swap keeps scroll position
    $$('[data-swap]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const y = scrollY; history.replaceState({}, '', a.getAttribute('href')); render(); scrollTo(0, y); }, true));
    // gallery
    const gal = $('#gal');
    if ($('#galDots')) {
      const dots = $$('#galDots i');
      gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
    }
    $$('#gal figure').forEach(f => f.onclick = () => { if (matchMedia('(min-width: 961px)').matches && p.images.length) lightbox(p.images, +f.dataset.i); });
    // sizes
    const stockOf = s => (p.sizes.find(x => x.size === s) || {}).stock || 0;
    $$('.size').forEach(b => b.onclick = () => {
      sel = b.dataset.size; qty = 1;
      $$('.size').forEach(x => x.classList.toggle('on', x === b));
      $('#selLabel').textContent = sel;
      if ($('#qVal')) $('#qVal').textContent = qty;
      const st = stockOf(sel);
      $('#sizeNote').textContent = st <= 3 ? `Only ${st} left in ${sel} — order soon` : '';
    });
    if ($('#sgOpen')) $('#sgOpen').onclick = () => openSizeGuide(p.gender === 'Men' ? 'm' : 'w');
    if (p.stock > 0) {
      $('#qMinus').onclick = () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; };
      $('#qPlus').onclick = () => { qty = Math.min(sel ? stockOf(sel) : 10, qty + 1, 20); $('#qVal').textContent = qty; };
      $('#addBtn').onclick = () => {
        if (!sel) {
          $('#sizeNote').textContent = 'Please choose your size';
          $('.sizes').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], 300);
          $('.sizes').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const size = sel, n = qty;
        gate(() => addToCart(p, size, n, true));
      };
    }
  }

  function lightbox(images, i) {
    const el = document.createElement('div');
    el.className = 'lightbox';
    const draw = () => { el.innerHTML = `<img src="${esc(src(images[i], 2000))}" alt="">
      <button class="icon-btn lb-close" aria-label="Close">${ICON.close}</button>
      ${images.length > 1 ? `<button class="icon-btn lb-prev" aria-label="Previous">${ICON.left}</button><button class="icon-btn lb-next" aria-label="Next">${ICON.right}</button>` : ''}`; };
    draw();
    const close = () => { el.remove(); document.removeEventListener('keydown', key); };
    const step = d => { i = (i + d + images.length) % images.length; draw(); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    el.onclick = e => { if (e.target.closest('.lb-prev')) step(-1); else if (e.target.closest('.lb-next')) step(1); else close(); };
    document.addEventListener('keydown', key);
    document.body.appendChild(el);
  }

  // ---------- size guide ----------
  const SG = {
    w: [['Size', 'Bust', 'Waist', 'Hips'], ['XS', '78–82', '60–64', '86–90'], ['S', '82–86', '64–68', '90–94'], ['M', '86–90', '68–72', '94–98'], ['L', '90–96', '72–78', '98–104'], ['XL', '96–102', '78–84', '104–110']],
    m: [['Size', 'Chest', 'Waist', 'Hips'], ['S', '88–96', '74–82', '90–98'], ['M', '96–104', '82–90', '98–106'], ['L', '104–112', '90–98', '106–114'], ['XL', '112–120', '98–106', '114–122'], ['XXL', '120–128', '106–114', '122–130']],
  };
  function openSizeGuide(t = 'w') {
    const draw = k => { $('#sgTable').innerHTML = `<table>${SG[k].map((r, i) => `<tr>${r.map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('')}</table>`; $$('#sgSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); };
    $$('#sgSeg button').forEach(b => b.onclick = () => draw(b.dataset.t));
    draw(t); $('#sizeGuide').hidden = false;
  }
  $('#sgClose').onclick = () => { $('#sizeGuide').hidden = true; };
  $('#sizeGuide').onclick = e => { if (e.target.id === 'sizeGuide') $('#sizeGuide').hidden = true; };
  $('#footSize').onclick = e => { e.preventDefault(); openSizeGuide(); };

  // ---------- cart ----------
  function cartLines() {
    return cart.map(l => {
      const p = PRODUCTS.find(x => x.id === l.id);
      if (!p) return null;
      const s = p.sizes.find(x => x.size === l.size);
      return { ...l, p, max: s ? s.stock : 0 };
    }).filter(Boolean);
  }
  function totals() {
    const lines = cartLines();
    const sub = lines.reduce((a, l) => a + priceOf(l.p) * l.qty, 0);
    const freeOver = Number(S.free_delivery_over) || 0;
    const fee = !lines.length ? 0 : freeOver && sub >= freeOver ? 0 : Number(S.delivery_fee) || 0;
    return { lines, sub, fee, total: sub + fee, freeOver, count: lines.reduce((a, l) => a + l.qty, 0) };
  }
  function addToCart(p, size, qty, openBag) {
    const s = p.sizes.find(x => x.size === size);
    if (!s || s.stock <= 0) return;
    const ex = cart.find(l => l.id === p.id && l.size === size);
    if (ex) ex.qty = Math.min(s.stock, ex.qty + qty); else cart.push({ id: p.id, size, qty: Math.min(qty, s.stock) });
    save('th_cart', cart);
    updateBadge(true);
    if (openBag) openDrawer();
    else toast(`Added ${esc(p.name)}, size ${esc(size)}. <a href="#" id="tView" style="color:var(--green)">View bag</a>`, p.images[0] && src(p.images[0], 120));
    const tv = $('#tView'); if (tv) tv.onclick = e => { e.preventDefault(); openDrawer(); };
  }
  function updateBadge(bump) {
    const n = cart.reduce((a, l) => a + l.qty, 0);
    const b = $('#bagCount');
    b.hidden = !n; b.textContent = n;
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  function renderDrawer() {
    const { lines, sub, fee, total, freeOver, count } = totals();
    $('#drawerTitle').innerHTML = `Your bag${count ? ` <small>${count} item${count > 1 ? 's' : ''}</small>` : ''}`;
    if (!lines.length) {
      $('#drawerBody').innerHTML = `<div class="drawer-empty"><h3>Your bag is empty</h3><p>Find your next favorite fit.</p></div>`;
      $('#drawerFoot').innerHTML = `<a href="/shop" data-link class="btn btn-dark btn-block">Start shopping</a>`;
      return;
    }
    $('#drawerBody').innerHTML = lines.map((l, i) => `
      <div class="line">
        <a class="line-img" href="/p/${esc(l.p.slug)}" data-link>${l.p.images[0] ? `<img class="pi" src="${esc(src(l.p.images[0], 240))}" alt="">` : media(l.p)}</a>
        <div><div class="line-name">${esc(l.p.name)}</div><div class="line-meta">${esc(l.p.color)}, size ${esc(l.size)}</div>
          <div class="qty"><button data-dec="${i}" aria-label="Less">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="More">+</button></div></div>
        <div class="line-right"><b>${money(priceOf(l.p) * l.qty)}</b><button class="remove" data-rm="${i}">Remove</button></div>
      </div>`).join('');
    const left = freeOver - sub;
    $('#drawerFoot').innerHTML = `
      ${freeOver ? `<div class="free-bar">${left > 0 ? `You're <b>${money(left)}</b> away from free delivery` : '<b>Free delivery</b> unlocked'}
        <div class="track"><div class="fill" style="width:${Math.min(100, sub / freeOver * 100)}%"></div></div></div>` : ''}
      <div class="sum-row"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="sum-row"><span>Delivery</span><span>${fee ? money(fee) : 'Free'}</span></div>
      <div class="sum-row total"><span>Total</span><span>${money(total)}</span></div>
      <a href="/checkout" data-link class="btn btn-green btn-block">Checkout and pay on delivery</a>`;
    const lineAt = i => cart.find(c => c.id === lines[i].id && c.size === lines[i].size);
    $$('[data-inc]').forEach(b => b.onclick = () => { const l = lineAt(b.dataset.inc); l.qty = Math.min(lines[b.dataset.inc].max, l.qty + 1); afterCart(); });
    $$('[data-dec]').forEach(b => b.onclick = () => { const l = lineAt(b.dataset.dec); l.qty = Math.max(1, l.qty - 1); afterCart(); });
    $$('[data-rm]').forEach(b => b.onclick = () => { const l = lineAt(b.dataset.rm); cart = cart.filter(x => x !== l); afterCart(); });
  }
  function afterCart() { save('th_cart', cart); updateBadge(); renderDrawer(); if (here() === '/checkout') renderCheckout(); }
  function lockScroll(v) { document.documentElement.style.overflow = v ? 'hidden' : ''; }
  function openDrawer() { renderDrawer(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; lockScroll(true); }
  function closeAll() {
    $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    $('#mmenu').classList.remove('open'); $('#mmenu').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true; $('#searchOv').hidden = true; lockScroll(false);
  }

  // ---------- checkout ----------
  function renderCheckout() {
    setOver(false);
    document.title = 'Checkout — THREADS';
    const { lines, sub, fee, total } = totals();
    if (!lines.length) { app.innerHTML = `<div class="wrap empty"><h3>Your bag is empty</h3><a href="/shop" data-link class="btn btn-dark">Go shopping</a></div>`; return; }
    const saved = load('th_customer', {});
    const cities = (S.cities || '').split(',').map(c => c.trim()).filter(Boolean);
    const existing = $('#coForm') ? Object.fromEntries(new FormData($('#coForm'))) : null;
    const v = k => esc((existing || saved)[k] || '');
    app.innerHTML = `
      <div class="wrap co">
        <form id="coForm" novalidate>
          <h1 class="split-me">Checkout</h1><p style="color:var(--muted);margin:0 0 24px">No account needed. Pay cash when your order arrives.</p>
          <div id="coErr"></div>
          <div class="panel"><h3><span class="n">1</span> Your details</h3>
            <label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" required value="${v('name')}"></label>
            <div class="f2">
              <label class="field"><span>Phone (WhatsApp)</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+961 70 123 456" required value="${v('phone')}"></label>
              <label class="field"><span>Email <small style="color:var(--muted);font-weight:400">(optional)</small></span><input class="input" name="email" type="email" autocomplete="email" value="${v('email')}"></label>
            </div>
          </div>
          <div class="panel"><h3><span class="n">2</span> Delivery address</h3>
            <label class="field"><span>Area</span><select class="input" name="city" required>
              <option value="">Choose your area</option>${cities.map(c => `<option ${(existing || saved).city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Full address</span><textarea class="input" name="address" autocomplete="street-address" placeholder="Town, street, building, floor, nearby landmark" required>${v('address')}</textarea></label>
            <label class="field" style="margin:0"><span>Notes <small style="color:var(--muted);font-weight:400">(optional)</small></span><input class="input" name="notes" placeholder="Best time to call, etc." value="${v('notes')}"></label>
          </div>
          <div class="panel"><h3><span class="n">3</span> Payment</h3>
            <div class="pay-opt"><span class="radio"></span><div><b>Cash on delivery</b><small>Pay ${money(total)} in cash when you receive your order.</small></div>${ICON.cash}</div>
          </div>
        </form>
        <aside class="co-summary panel">
          <h3>Order summary</h3>
          ${lines.map(l => `<div class="line"><div class="line-img">${l.p.images[0] ? `<img class="pi" src="${esc(src(l.p.images[0], 200))}" alt="">` : media(l.p)}</div>
            <div><div class="line-name">${esc(l.p.name)}</div><div class="line-meta">${esc(l.p.color)}, size ${esc(l.size)}, qty ${l.qty}</div></div><b>${money(priceOf(l.p) * l.qty)}</b></div>`).join('')}
          <div style="height:14px"></div>
          <div class="sum-row"><span>Subtotal</span><span>${money(sub)}</span></div>
          <div class="sum-row"><span>Delivery</span><span>${fee ? money(fee) : 'Free'}</span></div>
          <div class="sum-row total"><span>Total</span><span>${money(total)}</span></div>
          <button class="btn btn-green btn-block" id="placeBtn" form="coForm" type="submit">Place order, ${money(total)}</button>
          <div class="trust"><span>${ICON.lock} Secure</span><span>${ICON.cash} Pay on delivery</span><span>${ICON.shield} 100% original</span></div>
        </aside>
      </div>`;
    $('#coForm').onsubmit = async e => {
      e.preventDefault();
      if (gateOn() && !member) return gate(() => $('#coForm').requestSubmit());
      const f = Object.fromEntries(new FormData(e.target));
      const missing = [!f.name && 'your name', (f.phone || '').replace(/\D/g, '').length < 7 && 'a valid phone number', !f.city && 'your area', !f.address && 'your address'].filter(Boolean);
      if (missing.length) { $('#coErr').innerHTML = `<div class="form-err">Please add ${missing.join(', ')}.</div>`; window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'Placing order…';
      try {
        const o = await api('/api/orders', { method: 'POST', body: JSON.stringify({ customer: f, items: cart }) });
        save('th_customer', { name: f.name, phone: f.phone, email: f.email, city: f.city, address: f.address });
        save('th_last_order', { ...o, customer: f });
        cart = []; save('th_cart', cart); updateBadge();
        PRODUCTS = await api('/api/products');
        go(`/order/${o.number}`, true);
      } catch (err) {
        $('#coErr').innerHTML = `<div class="form-err">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = `Place order, ${money(total)}`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }

  function renderPrivacy() {
    setOver(false);
    document.title = 'Privacy Policy — THREADS';
    app.innerHTML = `<div class="wrap legal">
      <h1>Privacy Policy</h1>
      <p>THREADS Activewear &amp; Lifestyle (Lebanon) respects your privacy. This page explains what we collect and why.</p>
      <h3>What we collect</h3><p>When you join the THREADS community or place an order we collect your name, family name, email address, country, phone number and, for orders, your delivery address.</p>
      <h3>How we use it</h3><p>To process and deliver your orders, contact you about them (by phone or WhatsApp), and — only if you ticked the box — send you offers and new arrivals. We may use your details to show you relevant THREADS ads on social media.</p>
      <h3>Sharing</h3><p>We never sell your data. We only share what is needed with our delivery partners to get your order to you.</p>
      <h3>Your choices</h3><p>You can ask us at any time to update or delete your details, or to stop marketing messages, by contacting us on <a href="https://wa.me/${esc(S.whatsapp)}" target="_blank" rel="noopener" style="text-decoration:underline">WhatsApp</a> or <a href="${esc(S.instagram)}" target="_blank" rel="noopener" style="text-decoration:underline">Instagram</a>.</p>
    </div>`;
  }

  function renderDone(num) {
    setOver(false);
    const o = load('th_last_order', null);
    const mine = o && o.number === num;
    document.title = 'Order placed — THREADS';
    const wa = encodeURIComponent(mine ? `Hi THREADS! I just placed order ${num} (${money(o.total)}). Name: ${o.customer.name}` : `Hi THREADS! About my order ${num}`);
    if (mine && o.via === 'whatsapp') {
      app.innerHTML = `<div class="wrap done">
        <div class="done-badge">${ICON.check}</div>
        <h1>Send it on WhatsApp</h1>
        <div class="num">Order ${esc(num)}</div>
        <p>Your order is written in a WhatsApp message to THREADS. Press send and it is placed. Have <b>${money(o.total)}</b> in cash ready on delivery.</p>
        <div class="cta-row">
          <a class="btn btn-green" target="_blank" rel="noopener" href="${esc(o.wa)}">${ICON.wa} Send order on WhatsApp</a>
          <a class="btn btn-outline" href="/shop" data-link>Keep shopping</a>
        </div></div>`;
      return;
    }
    app.innerHTML = `<div class="wrap done">
      <div class="done-badge">${ICON.check}</div>
      <h1>You're all set${mine ? ', ' + esc(o.customer.name.split(' ')[0]) : ''}!</h1>
      <div class="num">Order ${esc(num)}</div>
      <p>${mine ? `Have <b>${money(o.total)}</b> in cash ready on delivery.` : ''}</p>
      <ol class="steps-done">
        <li><b>Confirm</b>We call or message you on ${mine ? `<b>${esc(o.customer.phone)}</b>` : 'your phone'} to confirm.</li>
        <li><b>Deliver</b>Your order is packed and handed to our driver.</li>
        <li><b>Pay</b>Pay cash at your door when it arrives.</li>
      </ol>
      <div class="cta-row">
        <a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/${esc(S.whatsapp)}?text=${wa}">${ICON.wa} Message us</a>
        <a class="btn btn-dark" href="/shop" data-link>Keep shopping</a>
      </div></div>`;
  }

  // ---------- search ----------
  function openSearch() {
    $('#searchOv').hidden = false; lockScroll(true);
    const inp = $('#searchInput'); inp.value = ''; drawSearch(''); setTimeout(() => inp.focus(), 50);
  }
  function drawSearch(t) {
    t = t.trim().toLowerCase();
    if (!t) {
      const cats = [...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
      $('#searchRes').innerHTML = `<div class="search-hint">Popular: ${[...BRANDS, ...cats].map(x => `<button type="button" data-s="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
      $$('[data-s]').forEach(b => b.onclick = () => { $('#searchInput').value = b.dataset.s; drawSearch(b.dataset.s); });
      return;
    }
    const groups = groupsOf(PRODUCTS.filter(p => `${p.name} ${p.brand} ${p.category} ${p.color} ${p.gender}`.toLowerCase().includes(t))).slice(0, 12);
    $('#searchRes').innerHTML = groups.length ? `<div class="search-res">${groups.map(g => { const p = g[0]; return `<a href="/p/${esc(p.slug)}" data-link><div class="im">${p.images[0] ? `<img src="${esc(src(p.images[0], 300))}" alt="">` : media(p)}</div><b>${esc(p.name)}</b>${esc(p.brand)}, ${money(priceOf(p))}</a>`; }).join('')}</div>
      <div class="search-hint"><a href="/shop?q=${encodeURIComponent(t)}" data-link class="link-u" style="color:#fff">See all results</a></div>`
      : `<div class="search-hint">No results for “${esc(t)}”. Try a brand or a category.</div>`;
  }
  $('#searchBtn').onclick = openSearch;
  $('#searchClose').onclick = closeAll;
  $('#searchOv').onclick = e => { if (e.target.id === 'searchOv') closeAll(); };
  $('#searchInput').oninput = e => drawSearch(e.target.value);
  $('#searchForm').onsubmit = e => { e.preventDefault(); const v = $('#searchInput').value.trim(); closeAll(); go('/shop' + (v ? '?q=' + encodeURIComponent(v) : '')); };

  // ---------- sign-up popup + activity gate ----------
  // Visitors can skip and browse freely. Any shopping activity (add to bag, checkout, WhatsApp enquiry)
  // asks for their details once; after that they're remembered on this device.
  const COUNTRIES = [['Lebanon', '+961'], ['United Arab Emirates', '+971'], ['Saudi Arabia', '+966'], ['Qatar', '+974'], ['Kuwait', '+965'], ['Bahrain', '+973'], ['Oman', '+968'], ['Jordan', '+962'], ['Syria', '+963'], ['Iraq', '+964'], ['Egypt', '+20'], ['Cyprus', '+357'], ['Turkey', '+90'], ['Greece', '+30'], ['France', '+33'], ['Germany', '+49'], ['Italy', '+39'], ['Spain', '+34'], ['Netherlands', '+31'], ['Belgium', '+32'], ['Switzerland', '+41'], ['Sweden', '+46'], ['United Kingdom', '+44'], ['United States', '+1'], ['Canada', '+1'], ['Australia', '+61'], ['Brazil', '+55'], ['Mexico', '+52'], ['Ivory Coast', '+225'], ['Nigeria', '+234'], ['Senegal', '+221'], ['Ghana', '+233'], ['South Africa', '+27']];
  let member = load('th_member', null);
  let pending = null;
  const gateOn = () => S.require_signup !== '0';
  function sess(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } }

  function openSignup(action, hint) {
    pending = action || null;
    const m = $('#welcome');
    $('#welcomeStep1').hidden = !!action;
    $('#welcomeForm').hidden = !action;
    $('#wHint').textContent = hint || 'Fill in your details to continue with your shopping activity.';
    $('#wErr').textContent = '';
    m.hidden = false; lockScroll(true);
    if (action) setTimeout(() => $('#welcomeForm input').focus(), 60);
  }
  function closeSignup() { $('#welcome').hidden = true; pending = null; sess('th_skipped', '1'); if ($('#drawer').classList.contains('open') || !$('#searchOv').hidden) return; lockScroll(false); }
  // Run `fn` now if we know the visitor, otherwise ask for details first.
  function gate(fn, hint) {
    if (!gateOn() || member) return fn();
    closeAll();
    openSignup(fn, hint);
  }

  function setupWelcome() {
    $('#wCountry').innerHTML = COUNTRIES.map(([n, d]) => `<option value="${esc(n)}" data-dial="${d}">${esc(n)} (${d})</option>`).join('');
    $('#wCountry').onchange = e => { $('#wDial').textContent = e.target.selectedOptions[0].dataset.dial; };
    $('#wGetStarted').onclick = () => { $('#welcomeStep1').hidden = true; $('#welcomeForm').hidden = false; $('#welcomeForm input').focus(); };
    $('#wBrowse').onclick = closeSignup;
    $('#wSkip').onclick = closeSignup;
    $('#welcome').onclick = e => { if (e.target.id === 'welcome') closeSignup(); };
    $$('#welcomeForm input').forEach(i => i.addEventListener('input', () => i.classList.remove('bad')));
    $('#welcomeForm').onsubmit = async e => {
      e.preventDefault();
      const form = e.target;
      const f = Object.fromEntries(new FormData(form));
      const bad = [];
      if (!f.first_name.trim()) bad.push('first_name');
      if (!f.last_name.trim()) bad.push('last_name');
      if (!/^\S+@\S+\.\S{2,}$/.test(f.email.trim())) bad.push('email');
      const digits = f.phone.replace(/\D/g, '').replace(/^0+/, '');
      if (digits.length < 6 || digits.length > 12) bad.push('phone');
      $$('#welcomeForm input').forEach(i => i.classList.toggle('bad', bad.includes(i.name)));
      if (bad.length) {
        $('#wErr').textContent = bad.includes('email') && bad.length === 1 ? 'Please enter a valid email address.' : bad.includes('phone') && bad.length === 1 ? 'Please enter a valid phone number.' : 'Please fill in all the fields.';
        form.querySelector(`[name="${bad[0]}"]`).focus();
        return;
      }
      const dial = $('#wDial').textContent;
      const body = { first_name: f.first_name.trim(), last_name: f.last_name.trim(), email: f.email.trim(), country: f.country, phone: `${dial} ${digits}`, marketing: !!f.marketing };
      $('#wSubmit').disabled = true;
      try {
        await api('/api/subscribe', { method: 'POST', body: JSON.stringify(body) });
        member = body; save('th_member', member);
        // pre-fill checkout with what they just told us
        const c = load('th_customer', {});
        save('th_customer', { ...c, name: c.name || `${body.first_name} ${body.last_name}`, phone: c.phone || body.phone, email: c.email || body.email });
        const fn = pending; pending = null;
        $('#welcome').hidden = true; lockScroll(false);
        toast(`Welcome to THREADS, ${esc(body.first_name)}!`);
        if (fn) fn();
      } catch (err) { $('#wErr').textContent = err.message; }
      $('#wSubmit').disabled = false;
    };
    // first visit in this session: show the invite (skippable)
    const quiet = /^\/(checkout|order|privacy)/.test(here());
    if (S.welcome_popup === '1' && !member && !sess('th_skipped') && !quiet) {
      setTimeout(() => { if (!member && $('#welcome').hidden && $('#searchOv').hidden && !$('#drawer').classList.contains('open') && !sess('th_skipped')) openSignup(null); }, 3500);
    }
  }

  // ---------- chrome ----------
  $('#bagBtn').onclick = openDrawer;
  $('#closeDrawer').onclick = closeAll;
  $('#scrim').onclick = closeAll;
  $('#menuBtn').onclick = () => { $('#mmenu').classList.add('open'); $('#mmenu').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; lockScroll(true); };
  $('#closeMenu').onclick = closeAll;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); $('#sizeGuide').hidden = true; } if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); } });
  $('#year').textContent = new Date().getFullYear();

  (async function init() {
    app.innerHTML = `<div style="height:calc(100svh - 34px);margin-top:calc(var(--head-h) * -1)" class="skeleton"></div>`;
    try {
      [S, PRODUCTS] = await Promise.all([api('/api/settings'), api('/api/products')]);
    } catch { app.innerHTML = '<div class="wrap empty"><h3>Could not load the store</h3><p>Please refresh the page.</p></div>'; return; }
    try { HOME = JSON.parse(S.home || '{}'); } catch { HOME = {}; }
    $('#announce').textContent = S.announcement || '';
    const wa = `https://wa.me/${S.whatsapp}`;
    ['#footWa', '#footWaBtn', '#mmWa'].forEach(s => $(s).href = wa);
    $('#footIg').href = S.instagram || '#';
    const tiles = (HOME.brands || []).length ? HOME.brands : BRANDS.map(name => ({ name }));
    const tileHtml = b => `<a href="/shop?brand=${encodeURIComponent(b.name)}" data-link>${b.image ? `<img class="bg" src="${esc(src(b.image, 400))}" alt="" loading="lazy">` : ''}<img class="lg" src="${brandLogo(b.name)}" alt="${esc(b.name)}"></a>`;
    $('#ddBrands').innerHTML = tiles.map(tileHtml).join('');
    $('#mmenuBrands').innerHTML = tiles.map(tileHtml).join('');
    cart = cart.filter(l => PRODUCTS.some(p => p.id === l.id));
    save('th_cart', cart);
    updateBadge();
    render();
    if (window.FX) FX.introDone();
    setupWelcome();
  })();
})();
