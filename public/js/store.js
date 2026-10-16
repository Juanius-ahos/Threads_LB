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
  // a logo uploaded in the admin wins over the built-in ones
  const brandLogo = b => { const k = String(b || '').toLowerCase(); const hb = (HOME.brands || []).find(x => (x.name || '').toLowerCase() === k); return (hb && hb.logo) || BRAND_LOGOS[k] || '/brand/emblem.png'; };
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
  // Every fixed word on the site comes from js/site-texts.js, unless the owner changed it in Admin → Site texts.
  const TEXT_DEFAULTS = Object.fromEntries((window.SITE_TEXTS || []).flatMap(g => g.items.map(([k, , d]) => [k, d])));
  let TX = {};
  const T = (k, vars) => {
    const own = TX[k];
    let t = typeof own === 'string' && own.trim() ? own : (TEXT_DEFAULTS[k] ?? '');
    return vars ? t.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? String(vars[v]) : m)) : t;
  };
  const tx = (k, vars) => esc(T(k, vars));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
    if (window.FX) FX.leave();
    const cf = $('.cat-float'); if (cf) cf.classList.remove('on');
    const path = here(), q = new URLSearchParams(location.search);
    $$('.nav > a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === path + location.search));
    if (path === '/') renderHome();
    else if (path === '/shop') renderShop(q);
    else if (path.startsWith('/p/')) renderProduct(decodeURIComponent(path.slice(3)));
    else if (path === '/checkout') { renderCheckout(); if (cart.length) gate(() => {}); }
    else if (path === '/privacy') renderPrivacy();
    else if (path.startsWith('/order/')) renderDone(decodeURIComponent(path.slice(7)));
    else { setOver(false); app.innerHTML = `<div class="wrap empty"><h3>Page not found</h3><a href="/" data-link class="btn btn-dark">Back home</a></div>`; }
    reveal();
    if (window.FX) FX.enter(path, app);
  }

  // ---------- home ----------
  // Campaign photography (see campaign/SOURCES.md) and the shop's own photos (instore/). Everything the owner
  // sets in Admin → Homepage replaces these defaults; the very first placeholder photos count as "not set".
  const C = n => `/campaign/${n}.webp`, Cs = n => `/campaign/${n}-sm.webp`;
  const OLD_DEFAULTS = /images\.unsplash\.com\/photo-(1574680088814|1552674605|1608748180154|1726195222023|1511746315387|1718248028293|1618329918461|1556705634|1784924176852|1541534741688)/;
  const own = (url, fallback) => url && !OLD_DEFAULTS.test(url) ? src(url, 1800) : fallback;
  const BRAND_ART = { nike: 'nike-vest', adidas: 'adidas-studio', on: 'on-jump', 'the north face': 'tnf-orange' };
  const BRAND_BANNER = { nike: 'nike-sprint', adidas: 'adidas-gym', on: 'on-runner', 'the north face': 'tnf-shell' };
  const BRAND_NAME = { nike: 'Nike', adidas: 'adidas', on: 'On', 'the north face': 'The North Face' };
  const CAT_ART = { tracksuits: 'nike-run-pair', shorts: 'nike-run-group', jackets: 'tnf-red', tops: 'nike-iridescent', hoodies: 'tnf-hoodie', leggings: 'adidas-squat' };
  const BANNERS = ['nike-trail-run', 'tnf-summit'];
  const MAP = a => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`THREADS Activewear ${a || 'Wadi Chahrour'} Lebanon`)}`;
  // transparent cutouts of the shop's own photos: these stand on the 3D stand
  const CUTS = { 'TNF-SET-LAV': '/products/cut-tnf.webp', 'ON-SET-CRL': '/products/cut-on.webp', 'ON-SHT-BLK': '/products/cut-shorts-black.webp', 'ON-SHT-OLV': '/products/cut-shorts-olive.webp', 'ON-SHT-PLM': '/products/cut-shorts-plum.webp' };
  const cutOf = p => p.cutout || CUTS[p.sku] || '';
  // the hero stand shows the brands the shop carries, as 3D logos (outlines in js/logo-shapes.js)
  const LOGO_KEY = b => ({ nike: 'nike', adidas: 'adidas', on: 'on', 'the north face': 'tnf' })[String(b).toLowerCase()];

  const HOME_DEFAULTS = window.HOME_DEFAULTS || {};
  const H = k => (HOME[k] != null && (!Array.isArray(HOME[k]) || HOME[k].length)) ? HOME[k] : HOME_DEFAULTS[k];
  const on = k => ({ ...HOME_DEFAULTS.sections, ...(HOME.sections || {}) })[k] !== false;
  const brandNames = () => (H('brands') || []).map(b => b.name).filter(Boolean);
  const categoryList = () => (H('categories') || []).filter(c => c.name);

  const pic = (name, alt = '', sizes = '100vw', lazy = true) => `<img src="${C(name)}" srcset="${Cs(name)} 900w, ${C(name)} 1800w" sizes="${sizes}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''}>`;
  const ownPic = (url, name, sizes) => url && !OLD_DEFAULTS.test(url) ? `<img src="${esc(src(url, 1600))}" ${srcset(url, [800, 1200, 1800])} sizes="${sizes}" alt="" loading="lazy">` : pic(name, '', sizes);
  const logoRow = () => brandNames().map(b => `<a href="/shop?brand=${encodeURIComponent(b)}" data-link><img src="${brandLogo(b)}" alt="${esc(b)}"></a>`).join('');
  // {fee} {free} {cities} {address} in FAQ answers are filled in from the settings
  const fill = t => esc(t)
    .replace(/\{fee\}/g, money(Number(S.delivery_fee) || 0))
    .replace(/\{free\}/g, Number(S.free_delivery_over) ? `, and free when your order is over ${money(S.free_delivery_over)}` : '')
    .replace(/\{cities\}/g, esc((S.cities || '').split(',').map(c => c.trim()).filter(Boolean).slice(0, 8).join(', ')))
    .replace(/\{address\}/g, esc(S.store_address || 'our store'));
  const E_BARS = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 0h70l-9 22H21z"/><path class="mid" d="M18 39h70l-9 22H9z"/><path d="M6 78h70l-9 22H-3z"/></svg>';

  function renderHome() {
    document.title = T('meta.title');
    const groups = groupsOf(PRODUCTS);
    const freeOver = Number(S.free_delivery_over) || 0;
    const fee = Number(S.delivery_fee) || 0;
    const slides = HOME.slides || [];
    const lead = slides[0] || {};
    const stage = brandNames().filter(LOGO_KEY).map(b => ({ brand: b, logo: LOGO_KEY(b), cut: brandLogo(b) }));
    const live = [...groups].sort((a, b) => b.length - a.length)[0] || [];
    const newIn = [...groups].sort((a, b) => b.some(p => p.featured) - a.some(p => p.featured) || new Date(b[0].created_at) - new Date(a[0].created_at) || b.length - a.length);
    const tiles = H('brands') || brandNames().map(name => ({ name }));
    const inBrand = b => PRODUCTS.filter(p => p.brand.toLowerCase() === b.toLowerCase()).length;
    const inCat = c => PRODUCTS.filter(p => (p.category || '').toLowerCase() === c.toLowerCase()).length;
    const cats = categoryList().filter(c => inCat(c.name));
    const tickerBits = String(HOME.ticker || '100% original · Cash on delivery · Delivery all over Lebanon').split('·').map(t => t.trim()).filter(Boolean);
    const tickerRun = `<span>${tickerBits.map(t => `${esc(t)}<i></i>`).join('')}</span>`.repeat(3);
    const banner = (sl, i) => sl && (sl.title || sl.text) ? `<section class="banner${i ? ' banner-r' : ''}">
        ${ownPic(sl.image, BANNERS[i], '100vw')}
        <div class="banner-copy">
          ${sl.kicker ? `<p class="banner-kicker">${esc(sl.kicker)}</p>` : ''}
          ${sl.title ? `<h2>${rich(sl.title)}</h2>` : ''}
          ${sl.text ? `<p>${esc(sl.text)}</p>` : ''}
          <div class="cta-row">
            ${sl.button ? `<a class="btn btn-green" href="${esc(sl.link || '/shop')}" data-link>${esc(sl.button)}</a>` : ''}
            ${sl.button2 ? `<a class="btn btn-ghost-d" href="${esc(sl.link2 || '/shop')}" data-link>${esc(sl.button2)}</a>` : ''}
          </div>
        </div>
      </section>` : '';
    const words = [1, 2, 3, 4].map(i => T(`home.step${i}`, { fee: money(fee), free: freeOver ? `, free over ${money(freeOver)}` : '' }));
    const wall = H('wall').filter(w => w.image);
    const promises = H('promises').slice(0, 3);
    const outline = t => `<span class="outline" aria-hidden="true">${esc(t)}</span>`;

    app.innerHTML = `
      <section class="hero" id="hero">
        <div class="stand-word" id="standWord" aria-hidden="true"></div>
        <div class="hero-gl" aria-hidden="true"></div>
        ${stage.length ? `<img class="hero-flat" src="${stage[0].cut}" alt="" aria-hidden="true">` : ''}
        <div class="hero-copy">
          <p class="hero-kicker">${esc(lead.kicker || 'Activewear & lifestyle · Lebanon')}</p>
          <h1>${lead.title ? rich(lead.title) : 'Move your <em>way.</em>'}</h1>
          <p class="hero-sub">${esc(lead.text || 'Original Nike, adidas, On and The North Face, delivered anywhere in Lebanon. You pay cash at the door.')}</p>
          <div class="cta-row">
            <a class="btn btn-green" href="${esc(lead.link || '/shop?gender=Women')}" data-link>${esc(lead.button || 'Shop women')}</a>
            <a class="btn btn-ghost-d" href="${esc(lead.link2 || '/shop?gender=Men')}" data-link>${esc(lead.button2 || 'Shop men')}</a>
          </div>
          <nav class="hero-brands" aria-label="Brands">${logoRow()}</nav>
        </div>
        ${stage.length ? `<div class="hero-stand" id="stand" aria-live="polite">
          <div class="stand-cap" id="standCap">
            <span class="stand-brand" id="standBrand"></span>
            <a class="stand-name" id="standName" data-link></a>
            <span class="stand-price tnum" id="standPrice"></span>
          </div>
          <div class="stand-nav">
            <button type="button" class="icon-btn" data-stand="-1" aria-label="Previous piece"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button>
            <span class="stand-count tnum"><b id="standI">01</b> / ${String(stage.length).padStart(2, '0')}</span>
            <button type="button" class="icon-btn" data-stand="1" aria-label="Next piece"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>
          </div>
          <p class="stand-hint">Drag to spin</p>
        </div>` : ''}
      </section>

      <div class="ticker"><p class="sr-only">${esc(tickerBits.join(', '))}</p><div class="ticker-run" aria-hidden="true">${tickerRun}${tickerRun}</div></div>

      <section class="duo" aria-label="Shop women and men">
        ${[['Women', HOME.women_image, 'adidas-squat'], ['Men', HOME.men_image, 'nike-run-man']].map(([g, url, art]) => `<a class="duo-tile" href="/shop?gender=${g}" data-link data-cursor="Shop">
          ${ownPic(url, art, '(max-width: 640px) 100vw, 50vw')}
          <span class="duo-label"><b>${g}</b><span class="duo-n">${(n => n ? plural(n, 'piece', 'pieces') : tx('home.soon'))(PRODUCTS.filter(p => p.gender === g || p.gender === 'Unisex').length)}</span></span>
        </a>`).join('')}
      </section>

      <section class="rail-sec">
        <div class="sec-row"><div><h2 class="h-sec">${rich(T('home.rail_title'))}</h2><p class="sec-sub">${tx('home.rail_sub')}</p></div><a class="link" href="/shop" data-link>${tx('home.rail_link')}</a></div>
        <div class="rail" id="rail">${newIn.map(v => card(v)).join('')}</div>
        <div class="rail-btns"><button type="button" class="icon-btn" data-rail="-1" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" class="icon-btn" data-rail="1" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
      </section>

      ${on('promises') && promises.length ? `<section class="promises" id="promises" aria-label="The THREADS promise">
        <div class="promises-stage">
          <div class="promises-gl" aria-hidden="true"><span class="promises-flat">${E_BARS}</span></div>
          <p class="promises-kick">${outline(T('home.promises_word'))}</p>
          <ol class="promises-list">${promises.map((p, i) => `<li data-step="${i}"><b>${esc(p.title)}</b><span>${esc(p.text)}</span></li>`).join('')}</ol>
        </div>
      </section>` : ''}

      ${on('wall') && wall.length ? `<section class="wall-sec">
        <div class="wall-back" aria-hidden="true">${outline(Array(3).fill(T('home.wall_back') + ' ·').join(' '))}</div>
        <div class="sec-row"><div><h2 class="h-sec">${rich(T('home.wall_title'))}</h2><p class="sec-sub">${tx('home.wall_sub')}</p></div><a class="link" href="${esc(S.instagram || '#')}" target="_blank" rel="noopener">@threadsactivewear</a></div>
        <div class="wall" id="wall" data-cursor="Drag">${wall.map(w => { const p = w.sku && PRODUCTS.find(x => x.sku === w.sku); const href = p ? `/p/${p.slug}` : (w.link || S.instagram || '#'); const ext = !p && /^https?:/.test(href); return `<a class="wall-item" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener"' : 'data-link'}><img src="${esc(own(w.image, w.image))}" alt="${esc(p ? `${p.brand} ${p.name}` : w.caption || '')}" loading="lazy" draggable="false"><span class="wall-cap">${esc(w.caption || (p ? p.name : ''))}</span><span class="wall-go">${p ? money(priceOf(p)) : tx('home.wall_ask')}</span></a>`; }).join('')}</div>
      </section>` : ''}

      ${on('banner1') ? banner(slides[1], 0) : ''}

      ${on('categories') && cats.length ? `<section class="cat-sec">
        <div class="sec-row"><div><h2 class="h-sec">${rich(T('home.cats_title'))}</h2><p class="sec-sub">${tx('home.cats_sub')}</p></div></div>
        <ol class="cat-index">${cats.map((c, i) => `<li><a href="/shop?category=${encodeURIComponent(c.name)}" data-link data-img="${esc(own(c.image, C(CAT_ART[c.name.toLowerCase()] || 'nike-trail-run')))}">
          <span class="cat-i tnum">${String(i + 1).padStart(2, '0')}</span><span class="cat-name">${esc(c.name)}</span><span class="cat-n tnum">${inCat(c.name)}</span>
          <img class="cat-thumb" src="${esc(own(c.image, Cs(CAT_ART[c.name.toLowerCase()] || 'nike-trail-run')))}" alt="" loading="lazy">
        </a></li>`).join('')}</ol>
      </section>` : ''}

      ${on('brands') ? `<section class="brand-sec">
        <div class="sec-row"><div><h2 class="h-sec">${rich(T('home.brands_title'))}</h2><p class="sec-sub">${tx('home.brands_sub')}</p></div></div>
        <div class="brand-grid">
          ${tiles.map(b => `<a class="brand-tile" href="/shop?brand=${encodeURIComponent(b.name)}" data-link data-cursor="Shop">
            ${ownPic(b.image, BRAND_ART[b.name.toLowerCase()] || 'nike-vest', '(max-width: 640px) 50vw, 25vw')}
            <span class="brand-tile-in">
              <img class="brand-tile-logo" src="${brandLogo(b.name)}" alt="${esc(b.name)}">
              <span class="brand-tile-tag">${esc(BRAND_NAME[b.name.toLowerCase()] || b.name)}</span>
              <span class="brand-tile-n">${inBrand(b.name) ? plural(inBrand(b.name), 'piece', 'pieces') : tx('home.soon')}</span>
            </span>
          </a>`).join('')}
        </div>
      </section>` : ''}

      ${on('pick') && live.length > 1 ? `<section class="pick" id="live">
        <div class="pick-photo live-photo">${live.map((p, i) => `<img src="${esc(p.images[0])}" alt="${esc(`${p.brand} ${p.name} in ${p.color}`)}" data-v="${i}" class="${i ? 'out' : ''}" loading="lazy">`).join('')}</div>
        <div class="pick-info">
          <p class="pick-count">${tx('home.pick_count', { n: live.length })}</p>
          <h2 class="h-sec">${esc(live[0].name).replace(/-/g, '‑')}</h2>
          <div class="live-price tnum" id="livePrice"></div>
          <div class="swatch-row" role="group" aria-label="Colour">${live.map((p, i) => `<button type="button" class="swatch" style="--c:${esc(hexOf(p))}" data-v="${i}" aria-pressed="${i === 0}" aria-label="${esc(p.color)}"></button>`).join('')}</div>
          <p class="live-colour" id="liveColour"></p>
          <div class="live-sizes" id="liveSizes" role="group" aria-label="Size"></div>
          <p class="live-note" id="liveNote" aria-live="polite"></p>
          <p class="pick-copy">${tx('home.pick_copy')}</p>
          <div class="cta-row"><button class="btn btn-green" id="liveAdd">${tx('home.pick_add')}</button><a class="link" id="liveLink" data-link>${tx('home.pick_link')}</a></div>
        </div>
      </section>` : ''}

      ${on('banner2') ? banner(slides[2], 1) : ''}

      ${on('how') ? `<section class="how" aria-label="How ordering works">
        <div class="sec-row"><div><h2 class="h-sec">${rich(T('home.how_title'))}</h2><p class="sec-sub">${tx('home.how_sub')}</p></div></div>
        <ol class="how-steps">${words.map((w, i) => `<li><b class="tnum">${i + 1}</b><h3>${tx(`home.step${i + 1}_t`)}</h3><p>${esc(w)}</p></li>`).join('')}</ol>
      </section>` : ''}

      ${on('visit') && S.store_address ? `<section class="visit">
        <div class="visit-copy">
          <h2 class="h-sec">${rich(T('home.visit_title'))}</h2>
          <p>${tx('home.visit_text')}</p>
          <address>THREADS Activewear &amp; Lifestyle<br>${esc(S.store_address)}${S.store_hours ? `<br><span>${esc(S.store_hours)}</span>` : ''}</address>
          <div class="cta-row">
            <a class="btn btn-green" href="${MAP(S.store_address)}" target="_blank" rel="noopener">${tx('home.visit_dir')}</a>
            <a class="btn btn-ghost-d" href="https://wa.me/${esc(S.whatsapp)}" target="_blank" rel="noopener">${tx('home.visit_msg')}</a>
          </div>
        </div>
        <div class="visit-photos" aria-hidden="true">${wall.slice(3, 6).map(w => `<img src="${esc(own(w.image, w.image))}" alt="" loading="lazy">`).join('')}</div>
      </section>` : ''}

      ${on('faq') ? `<section class="faq">
        <div><h2 class="h-sec">${rich(T('home.faq_title'))}</h2><p class="sec-sub">${tx('home.faq_sub')} <a class="link" href="https://wa.me/${esc(S.whatsapp)}" target="_blank" rel="noopener">${tx('home.faq_link')}</a></p></div>
        <div class="faq-list">${H('faq').filter(f => f.q && (f.a || '').trim()).filter(f => S.store_address || !/\{address\}/.test(f.a)).map(f => `<details><summary>${esc(f.q)}</summary><p>${fill(f.a)}</p></details>`).join('')}</div>
      </section>` : ''}`;

    wireStand(stage);
    wireLive(live);
    wireRail();
    wireCats();
  }

  // the category index: the photo follows the pointer over the list
  function wireCats() {
    const list = $('.cat-index'); if (!list || !matchMedia('(hover: hover)').matches) return;
    let float = $('.cat-float');
    if (!float) { float = document.createElement('div'); float.className = 'cat-float'; float.innerHTML = '<img alt="">'; document.body.appendChild(float); }
    const img = float.firstChild;
    $$('a', list).forEach(a => {
      a.addEventListener('mouseenter', () => { img.src = a.dataset.img; float.classList.add('on'); });
      a.addEventListener('mouseleave', () => float.classList.remove('on'));
    });
    list.addEventListener('mousemove', e => { float.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });
  }

  // the 3D stand: caption, arrows and dragging; FX does the drawing
  function wireStand(items) {
    const box = $('#stand'); if (!box) return;
    let cur = 0;
    const draw = i => {
      cur = (i + items.length) % items.length;
      const { p, brand } = items[cur];
      const cap = $('#standCap');
      cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
      $('#standI').textContent = String(cur + 1).padStart(2, '0');
      const name = $('#standName');
      if (brand) {
        const n = PRODUCTS.filter(x => x.brand.toLowerCase() === brand.toLowerCase()).length;
        $('#standBrand').textContent = T('stand.kicker');
        name.textContent = T('stand.shop', { brand: BRAND_NAME[brand.toLowerCase()] || brand });
        const word = $('#standWord');
        if (word) { word.textContent = BRAND_NAME[brand.toLowerCase()] || brand; word.classList.remove('swap'); void word.offsetWidth; word.classList.add('swap'); }
        name.setAttribute('href', `/shop?brand=${encodeURIComponent(brand)}`);
        $('#standPrice').textContent = n ? T('stand.count', { n }) : T('stand.soon');
        return;
      }
      $('#standBrand').textContent = p.brand;
      name.textContent = p.name; name.setAttribute('href', `/p/${p.slug}`);
      $('#standPrice').innerHTML = `${money(priceOf(p))}${p.sale_price != null ? ` <s>${money(p.price)}</s>` : ''}`;
    };
    draw(0);
    const ctl = window.FX ? FX.stand($('#hero'), items, draw) : null;
    $$('[data-stand]', box).forEach(b => b.onclick = () => { if (ctl) ctl.go(+b.dataset.stand); else draw(cur + +b.dataset.stand); });
  }

  const PAPER = { 'ON-SHT-OLV': '#f3efea', 'ON-SHT-BLS': '#efece9', 'ON-SHT-CRM': '#f1efec', 'ON-SHT-BLK': '#f4f0ed', 'ON-SHT-PLM': '#f4f0eb' };
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
      if (!size) { $('#liveNote').textContent = T('pdp.choose_size'); $('#liveSizes').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 260); return; }
      const chosen = size;
      gate(() => addToCart(p, chosen, 1, true));
    };
    draw();
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
    const brandList = [...new Set([...brandNames(), ...PRODUCTS.map(p => p.brand).filter(Boolean)])];
    const title = term ? `“${q.get('q')}”` : cat || (sale ? T('nav.sale') : brand || (gender ? T(gender === 'Women' ? 'nav.women' : 'nav.men') : T('nav.all')));
    const bkey = brand.toLowerCase(), bname = BRAND_NAME[bkey] || brand;
    const bt = (HOME.brands || []).find(b => b.name.toLowerCase() === bkey);
    const art = term ? '' : brand ? own(bt && bt.image, C(BRAND_BANNER[bkey] || 'nike-trail-run')) : gender === 'Women' ? own(HOME.women_image, C('adidas-squat')) : gender === 'Men' ? own(HOME.men_image, C('nike-run-man')) : cat === 'Shorts' ? C('nike-run-group') : cat ? C('tnf-puffer') : C('nike-trail-run');
    const line = term ? '' : brand ? tx('shop.line_brand', { brand: bname }) : sale ? tx('shop.line_sale') : gender === 'Women' ? tx('shop.line_women') : gender === 'Men' ? tx('shop.line_men') : cat ? tx('shop.line_cat', { category: cat.toLowerCase() }) : tx('shop.line_all');
    document.title = `${title} — THREADS`;
    const link = patch => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return '/shop' + (n.toString() ? '?' + n : ''); };
    const cols = load('th_cols', 4);

    app.innerHTML = `
      <section class="shop-head${art ? ' has-art' : ''}">${art ? `<img class="shop-art" src="${art}" alt="">` : ''}<div class="wrap">
        ${brand && !cat && !term ? `<img class="shop-logo" src="${brandLogo(brand)}" alt="${esc(bname)}">` : ''}
        <h1 class="display">${esc(brand && !cat && !term ? bname : title)}</h1>
        ${line ? `<p class="shop-line">${line}</p>` : ''}
        <div class="count">${groups.length} style${groups.length === 1 ? '' : 's'} in ${list.length} colour${list.length === 1 ? '' : 's'}</div>
        <div class="chips">
          ${['', 'Women', 'Men'].map(g => `<a class="chip ${gender === g ? 'on' : ''}" href="${link({ gender: g, category: '' })}" data-link>${g ? tx(g === 'Women' ? 'nav.women' : 'nav.men') : tx('shop.everyone')}</a>`).join('')}
          ${cats.length ? '<span class="chip-sep"></span>' : ''}
          ${cats.map(c => `<a class="chip ${cat === c ? 'on' : ''}" href="${link({ category: cat === c ? '' : c })}" data-link>${esc(c)}</a>`).join('')}
        </div>
      </div></section>
      <div class="wrap">
        <div class="toolbar">
          <select class="select" id="fBrand" aria-label="Brand"><option value="">${tx('shop.all_brands')}</option>${brandList.map(b => `<option ${b.toLowerCase() === brand.toLowerCase() ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
          <label class="toggle-chip"><input type="checkbox" id="fSale" ${sale ? 'checked' : ''}> ${tx('shop.on_sale')}</label>
          <span class="spacer"></span>
          <div class="cols" role="group" aria-label="Products per row">${[2, 3, 4].map(n => `<button type="button" data-cols="${n}" class="${cols === n ? 'on' : ''}" aria-label="${n} per row" aria-pressed="${cols === n}">${'<i></i>'.repeat(n)}</button>`).join('')}</div>
          <select class="select" id="fSort" aria-label="Sort">
            <option value="">Featured</option><option value="new" ${sort === 'new' ? 'selected' : ''}>Newest</option>
            <option value="low" ${sort === 'low' ? 'selected' : ''}>Price: low to high</option><option value="high" ${sort === 'high' ? 'selected' : ''}>Price: high to low</option>
          </select>
        </div>
        ${groups.length ? `<div class="grid shop-grid" id="shopGrid" style="--cols:${cols}">${groups.map(g => card(g)).join('')}</div>` :
          `<div class="empty"><h3>${gender === 'Men' && !brand && !cat ? tx('shop.empty_men_t') : tx('shop.empty')}</h3><p>${gender === 'Men' && !brand && !cat ? tx('shop.empty_men') : brand ? tx('shop.empty_brand', { brand: bname }) : tx('shop.empty_text')}</p><a href="/shop" data-link class="btn btn-dark">${tx('shop.see_all')}</a></div>`}
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
    const relatedGroups = groupsOf(PRODUCTS.filter(x => gkey(x) !== gkey(p) && (x.category === p.category || x.brand === p.brand || x.gender === p.gender))).slice(0, 8);
    const waText = encodeURIComponent(`Hi THREADS! I'm interested in the ${p.brand} ${p.name} (${p.color}, ${p.sku}). ${location.href}`);
    const imgs = p.images.length ? p.images : [null];
    const cut = cutOf(p);
    const bkey = p.brand.toLowerCase(), bname = BRAND_NAME[bkey] || p.brand;
    const inBrand = PRODUCTS.filter(x => x.brand.toLowerCase() === bkey).length;
    const off = p.sale_price != null ? Math.round((1 - p.sale_price / p.price) * 100) : 0;

    app.innerHTML = `
      <div class="wrap">
        <div class="crumbs"><a href="/" data-link>Home</a> / <a href="/shop?gender=${p.gender === 'Unisex' ? '' : p.gender}" data-link>${p.gender === 'Unisex' ? 'Shop' : p.gender}</a>${p.category ? ` / <a href="/shop?category=${encodeURIComponent(p.category)}" data-link>${esc(p.category)}</a>` : ''} / <span style="color:var(--ink)">${esc(p.name)}</span></div>
        <div class="pdp">
          <div>
            <div class="gal" id="gal">${cut ? `<figure class="g3d" aria-label="${esc(`${p.brand} ${p.name}`)} in 3D"><div class="g3d-gl"></div><img class="g3d-flat" src="${cut}" alt=""><span class="g3d-tag"><i></i>3D view</span></figure>` : ''}${imgs.map((u, i) => `<figure data-i="${i}">${u ? `<img src="${esc(src(u, 1200))}" alt="${esc(p.name)} ${esc(p.color)} — photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>` : media(p)}</figure>`).join('')}</div>
            ${imgs.length + (cut ? 1 : 0) > 1 ? `<div class="gal-dots" id="galDots">${[...(cut ? [0] : []), ...imgs].map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
          </div>
          <div class="pdp-info">
            <a class="card-brand" href="/shop?brand=${encodeURIComponent(p.brand)}" data-link><img src="${brandLogo(p.brand)}" alt="">${esc(p.brand)}</a>
            <h1 class="pdp-title">${esc(p.name)}</h1>
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
              <button class="btn btn-green" id="addBtn">${tx('pdp.add', { price: money(priceOf(p)) })}</button>
            </div>` : `<button class="btn btn-dark btn-block" disabled style="margin-top:18px">${tx('pdp.sold_out')}</button>`}
            <a class="btn btn-wa btn-block wa-row" data-gate target="_blank" rel="noopener" href="https://wa.me/${esc(S.whatsapp)}?text=${waText}">${ICON.wa} ${p.stock > 0 ? tx('pdp.wa') : tx('pdp.wa_back')}</a>
            <div class="pdp-perks">
              <div>${ICON.cash} ${tx('pdp.perk1')}</div>
              <div>${ICON.truck} ${tx('pdp.perk2', { free: Number(S.free_delivery_over) ? `, free over ${money(S.free_delivery_over)}` : '' })}</div>
              <div>${ICON.shield} ${tx('pdp.perk3', { brand: p.brand })}</div>
            </div>
            ${p.description ? `<details class="acc" open><summary>${tx('pdp.details')}</summary><div>${esc(p.description)}</div></details>` : ''}
            <details class="acc"><summary>${tx('pdp.delivery_t')}</summary><div>${tx('pdp.delivery', { fee: money(S.delivery_fee), free: Number(S.free_delivery_over) ? `, free on orders over ${money(S.free_delivery_over)}` : '' })}</div></details>
            <details class="acc"><summary>${tx('pdp.swap_t')}</summary><div>${tx('pdp.swap')}</div></details>
          </div>
        </div>
      </div>
      ${relatedGroups.length ? `<section class="rail-sec">
        <div class="sec-row"><h2 class="h-sec">${rich(T('pdp.related'))}</h2><a class="link" href="/shop" data-link>${tx('home.rail_link')}</a></div>
        <div class="rail" id="rail">${relatedGroups.map(g => card(g)).join('')}</div>
        <div class="rail-btns"><button type="button" class="icon-btn" data-rail="-1" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" class="icon-btn" data-rail="1" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
      </section>` : ''}
      ${BRAND_BANNER[bkey] ? `<section class="banner">
        ${pic(BRAND_BANNER[bkey], '', '100vw')}
        <div class="banner-copy">
          <h2>More <em>${esc(bname)}</em></h2>
          <p>${tx('pdp.more_text', { n: inBrand, brand: bname })}</p>
          <div class="cta-row"><a class="btn btn-green" href="/shop?brand=${encodeURIComponent(p.brand)}" data-link>${tx('stand.shop', { brand: bname })}</a></div>
        </div>
      </section>` : ''}`;

    // colour swap keeps scroll position
    $$('[data-swap]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const y = scrollY; history.replaceState({}, '', a.getAttribute('href')); render(); scrollTo(0, y); }, true));
    // gallery
    const gal = $('#gal');
    if ($('#galDots')) {
      const dots = $$('#galDots i');
      gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / gal.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
    }
    $$('#gal figure[data-i]').forEach(f => f.onclick = () => { if (matchMedia('(min-width: 961px)').matches && p.images.length) lightbox(p.images, +f.dataset.i); });
    if (matchMedia('(hover: hover) and (min-width: 961px)').matches) $$('#gal figure[data-i]').forEach(f => {
      const img = $('img', f); if (!img) return;
      f.addEventListener('mouseenter', () => f.classList.add('zoom'));
      f.addEventListener('mouseleave', () => f.classList.remove('zoom'));
      f.addEventListener('mousemove', e => { const r = f.getBoundingClientRect(); img.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`; });
    });
    wireRail();
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
          $('#sizeNote').textContent = T('pdp.choose_size');
          $('.sizes').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], 300);
          $('.sizes').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const size = sel, n = qty;
        gate(() => {
          const from = $('#gal figure[data-i] img') || $('#gal img');
          if (window.FX && from) FX.fly(from, $('#bagBtn')).then(() => addToCart(p, size, n, true));
          else addToCart(p, size, n, true);
        });
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
    $('#drawerTitle').innerHTML = `${tx('bag.title')}${count ? ` <small>${count} item${count > 1 ? 's' : ''}</small>` : ''}`;
    if (!lines.length) {
      $('#drawerBody').innerHTML = `<div class="drawer-empty"><h3>${tx('bag.empty_t')}</h3><p>${tx('bag.empty')}</p></div>`;
      $('#drawerFoot').innerHTML = `<a href="/shop" data-link class="btn btn-dark btn-block">${tx('bag.start')}</a>`;
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
      ${freeOver ? `<div class="free-bar">${left > 0 ? tx('bag.free_left', { amount: '\u0000' }).replace('\u0000', `<b>${money(left)}</b>`) : `<b>${tx('bag.free_done')}</b>`}
        <div class="track"><div class="fill" style="width:${Math.min(100, sub / freeOver * 100)}%"></div></div></div>` : ''}
      <div class="sum-row"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="sum-row"><span>Delivery</span><span>${fee ? money(fee) : 'Free'}</span></div>
      <div class="sum-row total"><span>Total</span><span>${money(total)}</span></div>
      <a href="/checkout" data-link class="btn btn-green btn-block">${tx('bag.checkout')}</a>`;
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
    if (!lines.length) { app.innerHTML = `<div class="wrap empty"><h3>${tx('bag.empty_t')}</h3><a href="/shop" data-link class="btn btn-dark">Go shopping</a></div>`; return; }
    const saved = load('th_customer', {});
    const cities = (S.cities || '').split(',').map(c => c.trim()).filter(Boolean);
    const existing = $('#coForm') ? Object.fromEntries(new FormData($('#coForm'))) : null;
    const v = k => esc((existing || saved)[k] || '');
    app.innerHTML = `
      <div class="wrap co">
        <form id="coForm" novalidate>
          <h1 class="split-me">${tx('co.title')}</h1><p style="color:var(--muted);margin:0 0 24px">${tx('co.sub')}</p>
          <div id="coErr"></div>
          <div class="panel"><h3><span class="n">1</span> ${tx('co.details')}</h3>
            <label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" required value="${v('name')}"></label>
            <div class="f2">
              <label class="field"><span>Phone (WhatsApp)</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+961 70 123 456" required value="${v('phone')}"></label>
              <label class="field"><span>Email <small style="color:var(--muted);font-weight:400">(optional)</small></span><input class="input" name="email" type="email" autocomplete="email" value="${v('email')}"></label>
            </div>
          </div>
          <div class="panel"><h3><span class="n">2</span> ${tx('co.address')}</h3>
            <label class="field"><span>Area</span><select class="input" name="city" required>
              <option value="">Choose your area</option>${cities.map(c => `<option ${(existing || saved).city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Full address</span><textarea class="input" name="address" autocomplete="street-address" placeholder="Town, street, building, floor, nearby landmark" required>${v('address')}</textarea></label>
            <label class="field" style="margin:0"><span>Notes <small style="color:var(--muted);font-weight:400">(optional)</small></span><input class="input" name="notes" placeholder="Best time to call, etc." value="${v('notes')}"></label>
          </div>
          <div class="panel"><h3><span class="n">3</span> ${tx('co.payment')}</h3>
            <div class="pay-opt"><span class="radio"></span><div><b>${tx('co.cod')}</b><small>${tx('co.cod_text', { total: money(total) })}</small></div>${ICON.cash}</div>
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
          <button class="btn btn-green btn-block" id="placeBtn" form="coForm" type="submit">${tx('co.place', { total: money(total) })}</button>
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
        btn.disabled = false; btn.textContent = T('co.place', { total: money(total) });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }

  function renderPrivacy() {
    setOver(false);
    document.title = 'Privacy Policy — THREADS';
    app.innerHTML = `<div class="wrap legal">
      <h1>Privacy Policy</h1>
      <p>${tx('privacy.intro')}</p>
      <h3>What we collect</h3><p>${tx('privacy.collect')}</p>
      <h3>How we use it</h3><p>${tx('privacy.use')}</p>
      <h3>Sharing</h3><p>${tx('privacy.share')}</p>
      <h3>Your choices</h3><p>${tx('privacy.choices')}</p>
      <p><a href="https://wa.me/${esc(S.whatsapp)}" target="_blank" rel="noopener" style="text-decoration:underline">WhatsApp</a> · <a href="${esc(S.instagram)}" target="_blank" rel="noopener" style="text-decoration:underline">Instagram</a></p>
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
      <h1>${tx('done.title')}${mine ? ', ' + esc(o.customer.name.split(' ')[0]) : ''}!</h1>
      <div class="num">Order ${esc(num)}</div>
      <p>${mine ? tx('done.cash', { total: money(o.total) }) : ''}</p>
      <ol class="steps-done">
        <li><b>${tx('home.step2_t')}</b>${tx('done.confirm', { phone: mine ? o.customer.phone : 'your phone' })}</li>
        <li><b>${tx('home.step3_t')}</b>${tx('done.deliver')}</li>
        <li><b>${tx('home.step4_t')}</b>${tx('done.pay')}</li>
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
      $('#searchRes').innerHTML = `<div class="search-hint">Popular: ${[...brandNames(), ...cats].map(x => `<button type="button" data-s="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
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
    $('#wHint').textContent = hint || T('pop.hint');
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
        toast(tx('pop.welcome', { name: body.first_name }));
        if (fn) fn();
      } catch (err) { $('#wErr').textContent = err.message; }
      $('#wSubmit').disabled = false;
    };
    // first visit in this session: show the invite (skippable)
    const quiet = /^\/(checkout|order|privacy)/.test(here());
    if (S.welcome_popup === '1' && !member && !sess('th_skipped') && !quiet) {
      // not over the first screen: once they've scrolled past it, or after 20 seconds
      const invite = () => { removeEventListener('scroll', onScroll); clearTimeout(t); if (!member && $('#welcome').hidden && $('#searchOv').hidden && !$('#drawer').classList.contains('open') && !sess('th_skipped') && !document.documentElement.classList.contains('th-intro')) openSignup(null); };
      const onScroll = () => { if (scrollY > innerHeight * 0.9) invite(); };
      const t = setTimeout(invite, 20000);
      addEventListener('scroll', onScroll, { passive: true });
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
    try { TX = JSON.parse(S.texts || '{}') || {}; } catch { TX = {}; }
    // the header, footer, popup and size guide are in index.html: fill their words and pictures
    $$('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
    $$('[data-t-ph]').forEach(el => { el.placeholder = T(el.dataset.tPh); });
    $$('[data-img]').forEach(el => { const u = TX[el.dataset.img]; if (u && u.trim()) el.src = u; });
    const md = $('meta[name="description"]'); if (md) md.content = T('meta.description');
    $('#announce').textContent = S.announcement || '';
    const wa = `https://wa.me/${S.whatsapp}`;
    ['#footWa', '#footWaBtn', '#mmWa'].forEach(s => $(s).href = wa);
    $('#footIg').href = S.instagram || '#';
    const addr = S.store_address || '';
    ['#footMap', '#footMapBtn'].forEach(id => { $(id).href = MAP(addr); $(id).hidden = !addr; });
    $('#fAddress').innerHTML = addr ? `THREADS Activewear &amp; Lifestyle<br>${esc(addr)}${S.store_hours ? `<br>${esc(S.store_hours)}` : ''}` : '';
    const catLinks = categoryList().filter(c => PRODUCTS.some(p => (p.category || '').toLowerCase() === c.name.toLowerCase()));
    const catA = c => `<a href="/shop?category=${encodeURIComponent(c.name)}" data-link>${esc(c.name)}</a>`;
    $('#fCats').innerHTML = catLinks.map(catA).join('');
    $('#ddCats').innerHTML = catLinks.map(c => `<a href="/shop?category=${encodeURIComponent(c.name)}" data-link><b>${esc(c.name)}</b><small>${PRODUCTS.filter(p => (p.category || '').toLowerCase() === c.name.toLowerCase()).length} pieces</small></a>`).join('') + '<a href="/shop" data-link><b>Shop all</b><small>Everything in store</small></a>';
    $('#mmenuCats').innerHTML = catLinks.map(catA).join('');
    $('#fBrands').innerHTML = H('brands').map(b => `<a href="/shop?brand=${encodeURIComponent(b.name)}" data-link>${esc(BRAND_NAME[b.name.toLowerCase()] || b.name)}</a>`).join('');
    const tiles = H('brands');
    const tileHtml = b => `<a href="/shop?brand=${encodeURIComponent(b.name)}" data-link><img class="bg" src="${esc(own(b.image, Cs(BRAND_ART[b.name.toLowerCase()] || 'nike-vest')))}" alt="" loading="lazy"><img class="lg" src="${brandLogo(b.name)}" alt="${esc(b.name)}"></a>`;
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
