/* THREADS admin */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let SET = { currency: '$' };
  const money = n => `${SET.currency || '$'}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const BRAND_LOGOS = { nike: '/brand/brand-nike.png', adidas: '/brand/brand-adidas.png', on: '/brand/brand-on.png', 'the north face': '/brand/brand-tnf.png' };
  const brandLogo = b => BRAND_LOGOS[String(b || '').toLowerCase()] || '/brand/emblem.png';
  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const SIZE_PRESETS = { 'XS–XL': ['XS', 'S', 'M', 'L', 'XL'], 'S–XXL': ['S', 'M', 'L', 'XL', 'XXL'], 'Shoes 40–45': ['40', '41', '42', '43', '44', '45'], 'Shoes 36–41': ['36', '37', '38', '39', '40', '41'], 'One size': ['One Size'] };
  const CATEGORIES = ['T-Shirts', 'Tank Tops', 'Shorts', 'Leggings', 'Sports Bras', 'Hoodies', 'Jackets', 'Pants', 'Sets', 'Shoes', 'Accessories'];
  const fmtDate = s => { const d = new Date(s.replace(' ', 'T') + 'Z'); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  const thumb = (img, brand) => `<div class="thumb ${img ? 'has' : ''}" ${img ? `style="background-image:url('${esc(img)}')"` : ''}><img src="${brandLogo(brand)}" alt=""></div>`;

  async function api(url, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const r = await fetch(url, { ...opts, headers: isForm ? {} : { 'Content-Type': 'application/json' }, body: opts.body && !isForm && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
    if (r.status === 401 && !url.includes('/login')) { showLogin(); throw new Error('Please sign in'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const confirmBox = msg => window.confirm(msg);
  // Photos are shrunk in the browser and sent one at a time: phone photos are big and the host takes about 4 MB per request.
  async function shrink(f) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 900e3) return f;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, 'image/webp', 0.9));
      return b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : f;
    } catch { return f; }
  }
  async function sendPhotos(files, url, field = 'files') {
    const out = [];
    for (const f of files) {
      const small = await shrink(f);
      if (small.size > 4.3e6) throw new Error(`${f.name} is too big. Save it as a JPG under 4 MB and try again.`);
      const fd = new FormData(); fd.append(field, small, small.name);
      out.push(await api(url, { method: 'POST', body: fd }));
    }
    return out;
  }
  const uploadPhotos = async (files, wide) => (await sendPhotos(files, '/api/admin/upload' + (wide ? '?wide=1' : ''))).flatMap(r => r.urls);

  // ---------- auth ----------
  function showLogin() { $('#shell').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); $('#login').hidden = true; boot(); }
    catch (err) { $('#loginErr').textContent = err.message; }
  };
  $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.href = '/admin'; };

  // ---------- nav ----------
  function current() { return location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'home'; }
  function nav(to) { history.pushState({}, '', to === 'home' ? '/admin' : `/admin/${to}`); route(); }
  $$('[data-nav]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); $('#side').classList.remove('open'); nav(a.dataset.nav); }));
  window.addEventListener('popstate', route);
  $('#sideToggle').onclick = () => $('#side').classList.toggle('open');

  function route() {
    const v = current();
    $$('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === v));
    closeSheet();
    window.scrollTo(0, 0);
    ({ home: Home, orders: Orders, products: Products, homepage: Homepage, texts: Texts, import: Import, community: Community, settings: Settings }[v] || Home)();
  }
  async function refreshBadge() {
    try { const s = await api('/api/admin/stats'); const b = $('#pendingBadge'); b.hidden = !s.pending; b.textContent = s.pending; return s; } catch { return null; }
  }

  // ---------- sheet ----------
  function openSheet(html) {
    const sh = $('#sheet'); sh.innerHTML = html; sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false;
    return sh;
  }
  function closeSheet() { const sh = $('#sheet'); sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }
  $('#scrim').onclick = () => { if (!$('#sheet').dataset.dirty || confirmBox('Discard unsaved changes?')) closeSheet(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) $('#scrim').click(); });

  // =================== HOME ===================
  async function Home() {
    view.innerHTML = '<div class="empty"><div class="spinner" style="margin:auto"></div></div>';
    const s = await refreshBadge();
    if (!s) return;
    const max = Math.max(1, ...s.days.map(d => d.revenue));
    const recent = (await api('/api/admin/orders')).slice(0, 6);
    view.innerHTML = `
      <div class="welcome-card">
        <div><h2>Move your way 👋</h2><p>${s.pending ? `You have <b style="color:var(--green)">${s.pending} new order${s.pending > 1 ? 's' : ''}</b> waiting for confirmation.` : 'All caught up. No orders waiting.'}</p></div>
        <div class="actions">
          <button class="btn btn-green" id="hAdd"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add product</button>
          ${s.pending ? `<button class="btn btn-light" id="hOrders">Review orders</button>` : ''}
        </div>
      </div>
      <div class="stats">
        <div class="card stat dark"><div class="k">Pending orders</div><div class="v">${s.pending}</div></div>
        <div class="card stat"><div class="k">Orders today</div><div class="v">${s.ordersToday}</div></div>
        <div class="card stat"><div class="k">To deliver</div><div class="v">${s.toDeliver}</div></div>
        <div class="card stat"><div class="k">Cash collected</div><div class="v">${money(s.revenueDelivered)}</div></div>
      </div>
      <div class="dash">
        <div class="card card-pad"><h3>Sales, last 14 days <span class="right">${money(s.days.reduce((a, d) => a + d.revenue, 0))} · ${s.days.reduce((a, d) => a + d.orders, 0)} orders</span></h3>
          <div class="chart">${s.days.map((d, i) => `<div class="bar ${i === 13 ? 'today' : ''}" data-tip="${new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${money(d.revenue)} · ${d.orders} order${d.orders === 1 ? '' : 's'}">
            <i style="height:${Math.max(2, d.revenue / max * 100)}%"></i><span>${new Date(d.date).getDate()}</span></div>`).join('')}</div>
        </div>
        <div class="card card-pad"><h3>Low stock <span class="right">${s.productCount} products</span></h3>
          <div class="mini-list">${s.lowStock.length ? s.lowStock.map(p => `<div class="row click" data-pid="${p.id}" style="cursor:pointer">${thumb(p.image)}<div style="flex:1;min-width:0"><b style="display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b><small style="color:var(--muted)">${esc(p.sku)}</small></div><span class="stock-low">${p.stock} left</span></div>`).join('') : '<p style="color:var(--muted);margin:0">Everything is well stocked 💪</p>'}</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="card-pad" style="padding-bottom:0"><h3>Latest orders <span class="right"><a href="/admin/orders" id="hAll" style="text-decoration:underline">View all</a></span></h3></div>
        ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th class="hide-m">Date</th><th>Status</th><th style="text-align:right">Total</th></tr></thead><tbody>
          ${recent.map(o => `<tr class="click" data-oid="${o.id}"><td><b>${o.number}</b></td><td>${esc(o.customer_name)}</td><td class="hide-m">${fmtDate(o.created_at)}</td><td><span class="status s-${o.status}">${o.status}</span></td><td class="num" style="text-align:right">${money(o.total)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No orders yet. Share your store link on Instagram! 🚀</div>'}
      </div>`;
    $('#hAdd').onclick = () => editProduct(null);
    if ($('#hOrders')) $('#hOrders').onclick = () => nav('orders');
    $('#hAll').onclick = e => { e.preventDefault(); nav('orders'); };
    $$('[data-oid]').forEach(r => r.onclick = () => openOrder(recent.find(o => o.id == r.dataset.oid), Home));
    $$('[data-pid]').forEach(r => r.onclick = async () => { const all = await api('/api/admin/products'); editProduct(all.find(p => p.id == r.dataset.pid)); });
  }

  // =================== ORDERS ===================
  let orderTab = 'pending';
  async function Orders() {
    const orders = await api('/api/admin/orders');
    refreshBadge();
    let term = '';
    const counts = Object.fromEntries(STATUSES.map(s => [s, orders.filter(o => o.status === s).length]));
    view.innerHTML = `
      <div class="ph"><h1>Orders</h1><div class="actions"><a class="btn btn-light" href="/api/admin/orders.xlsx"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Export to Excel</a></div></div>
      <div class="card">
        <div class="tabs">${['all', ...STATUSES].map(s => `<button data-tab="${s}" class="${orderTab === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}<span class="c">${s === 'all' ? orders.length : counts[s]}</span></button>`).join('')}</div>
        <div class="toolbar"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg><input id="oq" placeholder="Search by order number, name or phone"></label></div>
        <div class="table-wrap" id="otable"></div>
      </div>`;
    const draw = () => {
      const list = orders.filter(o => (orderTab === 'all' || o.status === orderTab) &&
        (!term || `${o.number} ${o.customer_name} ${o.phone} ${o.city}`.toLowerCase().includes(term)));
      $('#otable').innerHTML = list.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th class="hide-m">Area</th><th class="hide-m">Items</th><th class="hide-m">Date</th><th>Status</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${list.map(o => `<tr class="click" data-oid="${o.id}"><td><b>${o.number}</b></td><td>${esc(o.customer_name)}<br><small style="color:var(--muted)">${esc(o.phone)}</small></td>
          <td class="hide-m">${esc(o.city)}</td><td class="hide-m">${o.items.reduce((a, i) => a + i.qty, 0)}</td><td class="hide-m">${fmtDate(o.created_at)}</td>
          <td><span class="status s-${o.status}">${o.status}</span></td><td class="num" style="text-align:right"><b>${money(o.total)}</b></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty"><h3>No ${orderTab === 'all' ? '' : orderTab} orders</h3>${orderTab === 'pending' ? 'New orders from the website will show up here.' : ''}</div>`;
      $$('[data-oid]').forEach(r => r.onclick = () => openOrder(orders.find(o => o.id == r.dataset.oid), Orders));
    };
    $$('[data-tab]').forEach(b => b.onclick = () => { orderTab = b.dataset.tab; $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#oq').oninput = e => { term = e.target.value.trim().toLowerCase(); draw(); };
    draw();
  }

  function openOrder(o, back) {
    const phone = o.phone.replace(/[^\d]/g, '');
    const waPhone = phone.startsWith('961') || phone.length > 9 ? phone : '961' + phone.replace(/^0/, '');
    const waMsg = encodeURIComponent(`Hi ${o.customer_name.split(' ')[0]}! This is THREADS 👋 We received your order ${o.number}:\n${o.items.map(i => `• ${i.qty}× ${i.name} (${i.size})`).join('\n')}\nTotal: ${money(o.total)} cash on delivery.\nDelivery to: ${o.city}, ${o.address}\nCan you confirm? 🙏`);
    const sh = openSheet(`
      <div class="sheet-head"><h2>Order ${o.number}</h2><span class="status s-${o.status}" id="oStatus">${o.status}</span><button class="icon-btn" id="sClose"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="sheet-body">
        <div class="card card-pad"><h3>Status</h3>
          <div class="steps">${STATUSES.map(s => `<button data-s="${s}" class="${s === 'cancelled' ? 'cancel' : ''} ${o.status === s ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
          <p class="hint">Cancelling puts the items back in stock automatically.</p>
        </div>
        <div class="card card-pad"><h3>Customer</h3>
          <dl class="kv"><dt>Name</dt><dd>${esc(o.customer_name)}</dd><dt>Phone</dt><dd><a href="tel:${esc(o.phone)}" style="text-decoration:underline">${esc(o.phone)}</a></dd>
          ${o.email ? `<dt>Email</dt><dd>${esc(o.email)}</dd>` : ''}<dt>Area</dt><dd>${esc(o.city)}</dd><dt>Address</dt><dd>${esc(o.address)}</dd>
          ${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}<dt>Placed</dt><dd>${fmtDate(o.created_at)}</dd></dl>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/${waPhone}?text=${waMsg}"><svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z"/></svg>Confirm on WhatsApp</a>
            <a class="btn btn-light" href="tel:${esc(o.phone)}">Call</a>
          </div>
        </div>
        <div class="card card-pad"><h3>Items</h3>
          <div class="o-items">${o.items.map(i => `<div class="row">${thumb(i.image, i.brand)}<div class="grow"><b>${esc(i.name)}</b><br><small style="color:var(--muted)">${esc(i.sku)} · Size <b>${esc(i.size)}</b> · Qty <b>${i.qty}</b></small></div><span class="num">${money(i.price * i.qty)}</span></div>`).join('')}</div>
          <div style="margin-top:10px"><div class="sumline"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="sumline"><span>Delivery</span><span>${o.delivery_fee ? money(o.delivery_fee) : 'Free'}</span></div>
          <div class="sumline total"><span>Cash to collect</span><span>${money(o.total)}</span></div></div>
        </div>
        <div class="card card-pad"><h3>Private note</h3><textarea class="input" id="oNote" placeholder="Only you can see this — e.g. driver name, delivery date">${esc(o.admin_note)}</textarea></div>
      </div>
      <div class="sheet-foot"><button class="btn btn-danger" id="oDel">Delete</button><span class="grow"></span><button class="btn btn-light" id="oPrint">Print</button><button class="btn btn-dark" id="oSave">Save note</button></div>`);
    $('#sClose', sh).onclick = closeSheet;
    $$('[data-s]', sh).forEach(b => b.onclick = async () => {
      try {
        const u = await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { status: b.dataset.s } });
        Object.assign(o, u);
        $$('[data-s]', sh).forEach(x => x.classList.toggle('on', x === b));
        $('#oStatus').className = `status s-${o.status}`; $('#oStatus').textContent = o.status;
        toast(`Order marked ${o.status}`); refreshBadge(); back && back();
      } catch (e) { toast(e.message, 1); }
    });
    $('#oSave', sh).onclick = async () => { await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { admin_note: $('#oNote').value } }); o.admin_note = $('#oNote').value; toast('Note saved'); };
    $('#oDel', sh).onclick = async () => {
      if (!confirmBox(`Delete order ${o.number} permanently? (Tip: use "Cancelled" instead to keep a record.)`)) return;
      await api(`/api/admin/orders/${o.id}`, { method: 'DELETE' }); closeSheet(); toast('Order deleted'); back && back();
    };
    $('#oPrint', sh).onclick = () => {
      const w = window.open('', '_blank');
      w.document.write(`<html><head><title>${o.number}</title><style>body{font:14px/1.5 system-ui;padding:30px;max-width:520px}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 0;border-bottom:1px solid #ddd}.r{text-align:right}.t{font-size:20px;font-weight:800}</style></head><body>
        <img src="/brand/logo-dark.png" style="height:34px"><h1>${o.number}</h1><div>${fmtDate(o.created_at)}</div><hr>
        <b>${esc(o.customer_name)}</b><br>${esc(o.phone)}<br>${esc(o.city)} — ${esc(o.address)}${o.notes ? '<br><i>' + esc(o.notes) + '</i>' : ''}
        <table>${o.items.map(i => `<tr><td>${i.qty}× ${esc(i.name)} (${esc(i.size)})</td><td class="r">${money(i.price * i.qty)}</td></tr>`).join('')}
        <tr><td>Delivery</td><td class="r">${money(o.delivery_fee)}</td></tr><tr><td class="t">CASH TO COLLECT</td><td class="r t">${money(o.total)}</td></tr></table>
        <script>onload=()=>print()<\/script></body></html>`);
      w.document.close();
    };
  }

  // =================== PRODUCTS ===================
  let prodFilter = { q: '', brand: '', status: '' };
  async function Products() {
    const products = await api('/api/admin/products');
    const selected = new Set();
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    view.innerHTML = `
      <div class="ph"><h1>Products</h1>
        <div class="actions">
          <button class="btn btn-light" id="pImport"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>Import Excel</button>
          <button class="btn btn-green" id="pAdd"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add product</button>
        </div></div>
      <div class="card" id="pcard">
        <div class="toolbar">
          <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg><input id="pq" placeholder="Search products or SKU" value="${esc(prodFilter.q)}"></label>
          <select class="input" id="pb" style="width:auto"><option value="">All brands</option>${brands.map(b => `<option ${prodFilter.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
          <select class="input" id="ps" style="width:auto"><option value="">All</option><option value="active" ${prodFilter.status === 'active' ? 'selected' : ''}>Visible</option><option value="hidden" ${prodFilter.status === 'hidden' ? 'selected' : ''}>Hidden</option><option value="low" ${prodFilter.status === 'low' ? 'selected' : ''}>Low stock</option></select>
        </div>
        <div id="bulk"></div>
        <div class="table-wrap" id="ptable"></div>
      </div>`;
    const draw = () => {
      const f = prodFilter, t = f.q.toLowerCase();
      const list = products.filter(p => (!t || `${p.name} ${p.sku} ${p.brand} ${p.category} ${p.color}`.toLowerCase().includes(t)) &&
        (!f.brand || p.brand === f.brand) && (!f.status || (f.status === 'active' ? p.active : f.status === 'hidden' ? !p.active : p.stock <= 3)));
      $('#bulk').innerHTML = selected.size ? `<div class="bulkbar"><b>${selected.size} selected</b><span style="flex:1"></span>
        <button class="btn btn-sm btn-light" data-b="show">Show</button><button class="btn btn-sm btn-light" data-b="hide">Hide</button><button class="btn btn-sm btn-danger" style="background:#fff" data-b="delete">Delete</button></div>` : '';
      $$('[data-b]').forEach(b => b.onclick = async () => {
        if (b.dataset.b === 'delete' && !confirmBox(`Delete ${selected.size} product(s)? This can't be undone.`)) return;
        await api('/api/admin/products/bulk', { method: 'POST', body: { ids: [...selected], action: b.dataset.b } });
        toast('Done'); Products();
      });
      $('#ptable').innerHTML = list.length ? `<table><thead><tr><th style="width:36px"><input type="checkbox" class="chk" id="pall"></th><th>Product</th><th class="hide-m">Status</th><th>Stock</th><th class="hide-m">Brand</th><th style="text-align:right">Price</th></tr></thead><tbody>
        ${list.map(p => `<tr class="click" data-pid="${p.id}"><td><input type="checkbox" class="chk" data-sel="${p.id}" ${selected.has(p.id) ? 'checked' : ''}></td>
          <td><div class="cell-prod">${thumb(p.images[0], p.brand)}<div><b>${esc(p.name)}${p.featured ? ' <span title="Featured on homepage">⭐</span>' : ''}</b><small>${esc(p.sku)}${p.color ? ' · ' + esc(p.color) : ''}${p.category ? ' · ' + esc(p.category) : ''}</small></div></div></td>
          <td class="hide-m"><span class="status ${p.active ? 's-active' : 's-hidden'}">${p.active ? 'Visible' : 'Hidden'}</span></td>
          <td><span class="${p.stock <= 3 ? 'stock-low' : ''}">${p.stock}</span> <small style="color:var(--muted)" class="hide-m">in ${p.sizes.length} size${p.sizes.length === 1 ? '' : 's'}</small></td>
          <td class="hide-m">${esc(p.brand)}</td>
          <td class="num" style="text-align:right">${p.sale_price != null ? `<b style="color:var(--red)">${money(p.sale_price)}</b> <s style="color:var(--muted)">${money(p.price)}</s>` : `<b>${money(p.price)}</b>`}</td></tr>`).join('')}
        </tbody></table>` : `<div class="empty"><h3>${products.length ? 'No matches' : 'No products yet'}</h3>${products.length ? 'Try a different search.' : 'Add your first product or import an Excel sheet.'}</div>`;
      $$('[data-pid]').forEach(r => r.onclick = e => { if (e.target.closest('.chk')) return; editProduct(products.find(p => p.id == r.dataset.pid)); });
      $$('[data-sel]').forEach(c => c.onchange = () => { c.checked ? selected.add(+c.dataset.sel) : selected.delete(+c.dataset.sel); draw(); });
      if ($('#pall')) { $('#pall').checked = list.length && list.every(p => selected.has(p.id)); $('#pall').onchange = e => { list.forEach(p => e.target.checked ? selected.add(p.id) : selected.delete(p.id)); draw(); }; }
    };
    $('#pq').oninput = e => { prodFilter.q = e.target.value; draw(); };
    $('#pb').onchange = e => { prodFilter.brand = e.target.value; draw(); };
    $('#ps').onchange = e => { prodFilter.status = e.target.value; draw(); };
    $('#pAdd').onclick = () => editProduct(null);
    $('#pImport').onclick = () => nav('import');
    draw();
  }

  function editProduct(p) {
    const isNew = !p;
    const d = p ? JSON.parse(JSON.stringify(p)) : { name: '', sku: '', brand: '', category: '', gender: 'Men', color: '', price: '', sale_price: null, sizes: SIZE_PRESETS['XS–XL'].map(size => ({ size, stock: 0 })), images: [], description: '', featured: false, active: true };
    const sh = openSheet(`
      <div class="sheet-head"><h2>${isNew ? 'New product' : esc(d.name)}</h2><button class="icon-btn" id="sClose"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <form class="sheet-body" id="pf">
        <div class="card card-pad"><h3>Photos <span class="right">Drag to reorder · first is the cover</span></h3>
          <div class="imgs" id="imgs"></div>
          <label class="drop" id="drop"><input type="file" accept="image/*" multiple id="files">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>
            <b>Add photos</b> or drag &amp; drop here<br><small>Straight from your phone is fine — we resize automatically</small></label>
        </div>
        <div class="card card-pad"><h3>3D cutout <span class="right">optional</span></h3>
          <p class="hint" style="margin:0 0 12px">A PNG of the piece alone on a <b>transparent background</b>. With one, the piece stands on the homepage's 3D stand and gets a 3D view on its page. Remove.bg or the iPhone "lift subject" tool make these in seconds.</p>
          <div class="cut-row" id="cutRow"></div>
        </div>
        <div class="card card-pad"><h3>Details</h3>
          <label class="field"><span>Product name</span><input class="input" name="name" required value="${esc(d.name)}" placeholder="e.g. Dri-FIT Training Tee"></label>
          <div class="g3">
            <label class="field"><span>Brand</span><input class="input" name="brand" list="dlBrands" value="${esc(d.brand)}" placeholder="Nike"></label>
            <label class="field"><span>Category</span><input class="input" name="category" list="dlCats" value="${esc(d.category)}" placeholder="T-Shirts"></label>
            <label class="field"><span>Color</span><div style="display:flex;gap:6px"><input class="input" name="color" value="${esc(d.color)}" placeholder="Black"><input type="color" name="swatch" value="${esc(d.swatch || '#16161a')}" title="Swatch colour shown in the shop" style="width:44px;height:42px;padding:2px;border:1px solid var(--line);border-radius:10px;background:#fff;flex:none;cursor:pointer"></div></label>
          </div>
          <p class="hint" style="margin:-4px 0 12px">Same brand + same name = shown as colour options of one product (e.g. 5 colours of the same shorts).</p>
          <div class="field"><span>For</span><div class="seg" id="gender">${['Men', 'Women', 'Unisex'].map(g => `<button type="button" data-g="${g}" class="${d.gender === g ? 'on' : ''}">${g}</button>`).join('')}</div></div>
          <label class="field" style="margin:0"><span>Description <small>(optional)</small></span><textarea class="input" name="description" placeholder="Fabric, fit, what it's great for…">${esc(d.description)}</textarea></label>
        </div>
        <div class="card card-pad"><h3>Price</h3>
          <div class="g2">
            <label class="field"><span>Price</span><div class="prefix"><span>${esc(SET.currency)}</span><input class="input" name="price" type="number" step="0.01" min="0" inputmode="decimal" required value="${d.price}"></div></label>
            <label class="field"><span>Sale price <small>(optional)</small></span><div class="prefix"><span>${esc(SET.currency)}</span><input class="input" name="sale_price" type="number" step="0.01" min="0" inputmode="decimal" value="${d.sale_price ?? ''}" placeholder="—"></div></label>
          </div>
        </div>
        <div class="card card-pad"><h3>Sizes &amp; stock <span class="right" id="stockTotal"></span></h3>
          <div class="size-presets">${Object.keys(SIZE_PRESETS).map(k => `<button type="button" data-preset="${k}">${k}</button>`).join('')}</div>
          <div class="size-grid" id="sizes"></div>
          <p class="hint">Left box = size, right box = how many you have. Stock goes down automatically when someone orders.</p>
        </div>
        <div class="card card-pad">
          <label class="toggle"><div><b>Visible in store</b><small>Turn off to hide without deleting</small></div><span class="switch"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}><i></i></span></label>
          <label class="toggle"><div><b>Feature on homepage</b><small>Shows first in “New in” on the homepage</small></div><span class="switch"><input type="checkbox" name="featured" ${d.featured ? 'checked' : ''}><i></i></span></label>
          <label class="field" style="margin:10px 0 0"><span>SKU <small>(product code — auto-generated if empty)</small></span><input class="input" name="sku" value="${esc(d.sku)}" placeholder="Auto" style="text-transform:uppercase"></label>
        </div>
        <datalist id="dlBrands">${['Nike', 'Adidas', 'On', 'The North Face', 'Puma', 'Under Armour', 'New Balance', 'Asics', 'THREADS'].map(b => `<option value="${b}">`).join('')}</datalist>
        <datalist id="dlCats">${[...new Set([...(() => { try { return (JSON.parse(SET.home || '{}').categories || (window.HOME_DEFAULTS || {}).categories || []).map(c => c.name); } catch { return []; } })(), ...CATEGORIES])].map(c => `<option value="${c}">`).join('')}</datalist>
      </form>
      <div class="sheet-foot">${isNew ? '' : '<button class="btn btn-danger" id="pDel">Delete</button>'}${isNew ? '' : `<a class="btn btn-light" href="/p/${esc(d.slug)}" target="_blank">View</a>`}<span class="grow"></span><button class="btn btn-light" id="pCancel">Cancel</button><button class="btn btn-dark" id="pSave">${isNew ? 'Add product' : 'Save'}</button></div>`);
    sh.dataset.dirty = '';
    $('#pf').addEventListener('input', () => sh.dataset.dirty = '1');
    $('#sClose').onclick = $('#pCancel').onclick = () => $('#scrim').click();

    // gender
    $$('[data-g]').forEach(b => b.onclick = () => { d.gender = b.dataset.g; $$('[data-g]').forEach(x => x.classList.toggle('on', x === b)); sh.dataset.dirty = '1'; });

    // sizes
    const drawSizes = () => {
      $('#sizes').innerHTML = d.sizes.map((s, i) => `<div class="size-cell"><input class="sz" value="${esc(s.size)}" data-i="${i}" aria-label="Size"><input class="st" type="number" min="0" inputmode="numeric" value="${s.stock}" data-i="${i}" aria-label="Stock"><button type="button" class="rm" data-rm="${i}" aria-label="Remove">×</button></div>`).join('') +
        `<button type="button" class="add-size" id="addSize">+ Size</button>`;
      $('#stockTotal').textContent = `${d.sizes.reduce((a, s) => a + (+s.stock || 0), 0)} in stock`;
      $$('#sizes .sz').forEach(el => el.oninput = () => { d.sizes[el.dataset.i].size = el.value.toUpperCase(); });
      $$('#sizes .st').forEach(el => el.oninput = () => { d.sizes[el.dataset.i].stock = Math.max(0, parseInt(el.value, 10) || 0); $('#stockTotal').textContent = `${d.sizes.reduce((a, s) => a + (+s.stock || 0), 0)} in stock`; });
      $$('#sizes [data-rm]').forEach(b => b.onclick = () => { d.sizes.splice(+b.dataset.rm, 1); drawSizes(); });
      $('#addSize').onclick = () => { d.sizes.push({ size: '', stock: 0 }); drawSizes(); $$('#sizes .sz').pop().focus(); };
    };
    $$('[data-preset]').forEach(b => b.onclick = () => {
      const old = Object.fromEntries(d.sizes.map(s => [s.size, s.stock]));
      d.sizes = SIZE_PRESETS[b.dataset.preset].map(size => ({ size, stock: old[size] || 0 }));
      drawSizes(); sh.dataset.dirty = '1';
    });
    drawSizes();

    // images
    let dragFrom = null;
    const drawImgs = (loading = 0) => {
      $('#imgs').innerHTML = d.images.map((u, i) => `<div class="img-tile" draggable="true" data-i="${i}"><img src="${esc(u)}" alt=""><button type="button" class="x" data-x="${i}" aria-label="Remove photo"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('') +
        '<div class="img-tile loading"><div class="spinner"></div></div>'.repeat(loading);
      $$('#imgs [data-x]').forEach(b => b.onclick = e => { e.stopPropagation(); d.images.splice(+b.dataset.x, 1); sh.dataset.dirty = '1'; drawImgs(); });
      $$('#imgs .img-tile[draggable]').forEach(t => {
        t.ondragstart = () => { dragFrom = +t.dataset.i; t.classList.add('dragging'); };
        t.ondragend = () => t.classList.remove('dragging');
        t.ondragover = e => { e.preventDefault(); t.classList.add('over'); };
        t.ondragleave = () => t.classList.remove('over');
        t.ondrop = e => { e.preventDefault(); e.stopPropagation(); const to = +t.dataset.i; if (dragFrom == null || dragFrom === to) return; const [m] = d.images.splice(dragFrom, 1); d.images.splice(to, 0, m); dragFrom = null; sh.dataset.dirty = '1'; drawImgs(); };
        // tap to make cover (mobile friendly)
        t.ondblclick = () => { const i = +t.dataset.i; const [m] = d.images.splice(i, 1); d.images.unshift(m); drawImgs(); };
      });
    };
    async function addFiles(files) {
      files = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (!files.length) return;
      drawImgs(files.length);
      try { d.images.push(...await uploadPhotos(files)); sh.dataset.dirty = '1'; }
      catch (e) { toast(e.message, 1); }
      drawImgs();
    }
    $('#files').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
    drawImgs();

    // the 3D cutout
    const drawCut = (busy) => {
      $('#cutRow').innerHTML = busy ? '<div class="cut-prev"><div class="spinner"></div></div>'
        : d.cutout ? `<div class="cut-prev"><img src="${esc(d.cutout)}" alt=""></div><button type="button" class="btn btn-light btn-sm" id="cutX">Remove</button>`
        : '<label class="drop" style="padding:14px;flex:1"><input type="file" accept="image/png,image/webp" id="cutFile"><b>Add cutout PNG</b></label>';
      if ($('#cutX')) $('#cutX').onclick = () => { d.cutout = ''; sh.dataset.dirty = '1'; drawCut(); };
      if ($('#cutFile')) $('#cutFile').onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        drawCut(true);
        try { d.cutout = (await uploadPhotos([file]))[0]; sh.dataset.dirty = '1'; }
        catch (err) { toast(err.message, 1); }
        drawCut();
      };
    };
    drawCut();

    // save
    $('#pSave').onclick = async () => {
      const f = $('#pf');
      if (!f.name.value.trim()) { f.name.focus(); return toast('Give the product a name', 1); }
      if (!(+f.price.value > 0)) { f.price.focus(); return toast('Add a price', 1); }
      const body = { name: f.name.value, brand: f.brand.value, category: f.category.value, color: f.color.value, swatch: f.swatch.value, gender: d.gender, description: f.description.value,
        price: f.price.value, sale_price: f.sale_price.value, sizes: d.sizes, images: d.images, cutout: d.cutout || '', active: f.active.checked, featured: f.featured.checked, sku: f.sku.value };
      const btn = $('#pSave'); btn.disabled = true;
      try {
        await api(isNew ? '/api/admin/products' : `/api/admin/products/${d.id}`, { method: isNew ? 'POST' : 'PUT', body });
        sh.dataset.dirty = ''; closeSheet(); toast(isNew ? 'Product added 🎉' : 'Saved');
        if (current() === 'products') Products(); else if (current() === 'home') Home();
      } catch (e) { toast(e.message, 1); btn.disabled = false; }
    };
    if (!isNew) $('#pDel').onclick = async () => {
      if (!confirmBox(`Delete "${d.name}"? This can't be undone.\n\nTip: turn off "Visible in store" to just hide it.`)) return;
      await api(`/api/admin/products/${d.id}`, { method: 'DELETE' }); sh.dataset.dirty = ''; closeSheet(); toast('Product deleted');
      if (current() === 'products') Products(); else Home();
    };
  }

  // =================== HOMEPAGE ===================
  const LINKS = ['/shop', '/shop?gender=Women', '/shop?gender=Men', '/shop?sale=1', '/shop?sort=new', '/shop?brand=Nike', '/shop?brand=Adidas', '/shop?brand=On', '/shop?brand=The%20North%20Face', '/shop?category=Shorts', '/shop?category=Tracksuits'];
  const POSITIONS = [['center', 'Center'], ['50% 20%', 'Top'], ['50% 80%', 'Bottom'], ['25% 50%', 'Left'], ['75% 50%', 'Right'], ['70% 30%', 'Top right'], ['30% 30%', 'Top left']];
  const preview = url => !url ? '' : url.includes('images.unsplash.com') ? `${url.split('?')[0]}?auto=format&fit=crop&w=600&q=60` : url;
  async function Homepage() {
    const s = await api('/api/admin/settings');
    let H; try { H = JSON.parse(s.home || '{}'); } catch { H = {}; }
    H.slides = H.slides || []; H.brands = H.brands || []; H.story = H.story || {};
    while (H.slides.length < 3) H.slides.push({});   // hero, then the two banners
    const D = JSON.parse(JSON.stringify(window.HOME_DEFAULTS || {}));
    for (const k of ['promises', 'wall', 'categories', 'faq', 'brands']) if (!Array.isArray(H[k]) || !H[k].length) H[k] = D[k] || [];
    H.sections = { ...(D.sections || {}), ...(H.sections || {}) };
    const PRODS = await api('/api/admin/products').catch(() => []);
    const SECTIONS = [['promises', 'The three bars (3D promises)'], ['wall', 'On the wall'], ['banner1', 'Banner 1'], ['categories', 'Shop by category'], ['brands', 'Four brands'], ['pick', 'Pick your colour'], ['banner2', 'Banner 2'], ['how', 'Cash on delivery steps'], ['visit', 'Visit the store'], ['faq', 'Questions']];
    // a list the owner can grow, shrink and reorder
    const rowHead = (list, i, title) => `<div class="hp-slide-head"><b>${title}</b><span style="flex:1"></span>
      <button type="button" class="btn btn-light btn-sm" data-lmv="${list}" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn btn-light btn-sm" data-lmv="${list}" data-i="${i}" data-d="1" ${i < H[list].length - 1 ? '' : 'disabled'}>↓</button>
      <button type="button" class="btn btn-danger btn-sm" data-lrm="${list}" data-i="${i}">Remove</button></div>`;
    const BLANK = { wall: { image: '', caption: '', sku: '', link: '' }, categories: { name: '', image: '' }, faq: { q: '', a: '' }, brands: { name: '', logo: '', image: '' } };
    const get = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), H);
    const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), H)[last] = v; };
    const inp = (path, label, ph = '', list = '') => `<label class="field"><span>${label}</span><input class="input" data-k="${path}" value="${esc(get(path) || '')}" placeholder="${esc(ph)}" ${list ? `list="${list}"` : ''}></label>`;
    const imgField = (path, label, wide) => `<div class="field"><span>${label}</span>
      <div class="hp-img"><div class="hp-prev" style="background-image:url('${esc(preview(get(path)))}')"></div>
        <div style="flex:1;min-width:0"><input class="input" data-k="${path}" data-img value="${esc(get(path) || '')}" placeholder="Paste an image link, or upload">
        <label class="btn btn-light btn-sm" style="position:relative;margin-top:8px">Upload photo<input type="file" accept="image/*" data-up="${path}" ${wide ? 'data-wide' : ''} style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div></div></div>`;
    const draw = () => {
      view.innerHTML = `
        <div class="ph"><h1>Homepage</h1><p class="sub">The words and photos on the front page. Wrap a word in *stars* to make it green.</p>
          <div class="actions"><a class="btn btn-light" href="/" target="_blank">Preview store</a><button class="btn btn-dark" id="hpSave">Save homepage</button></div></div>
        <div style="display:grid;gap:14px;max-width:900px">
          <div class="card card-pad"><h3>Top of the page</h3>
            <p class="hint" style="margin:0 0 12px">The hero shows the logos of your brands turning in 3D (the brands listed under Brands below), so it has no photo.</p>
            <div class="g2">${inp('slides.0.kicker', 'Small label', 'Activewear & lifestyle · Lebanon')}${inp('slides.0.title', 'Headline', 'Move your *way.*')}</div>
            ${inp('slides.0.text', 'Text', 'One or two short sentences')}
            <div class="g2">${inp('slides.0.button', 'Button', 'Shop women')}${inp('slides.0.link', 'Button link', '/shop?gender=Women', 'dlLinks')}</div>
            <div class="g2">${inp('slides.0.button2', 'Second button', 'Shop men')}${inp('slides.0.link2', 'Second link', '/shop?gender=Men', 'dlLinks')}</div>
          </div>
          ${[1, 2].map(i => `<div class="card card-pad"><h3>${i === 1 ? 'Banner 1 <span class="right">after “On the wall”</span>' : 'Banner 2 <span class="right">after the colour picker</span>'}</h3>
            <p class="hint" style="margin:0 0 12px">A full-width photo with a headline. Leave the photo empty to use the campaign photo; leave headline and text empty to hide the banner.</p>
            ${imgField(`slides.${i}.image`, 'Photo (wide, at least 2000px)', true)}
            <label class="field"><span>Photo focus <small>(which part stays visible on phones)</small></span><select class="input" data-k="slides.${i}.pos">${POSITIONS.map(([v, l]) => `<option value="${v}" ${((H.slides[i] || {}).pos || 'center') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <div class="g2">${inp(`slides.${i}.kicker`, 'Small label', 'New season')}${inp(`slides.${i}.title`, 'Headline', 'Run the *city.*')}</div>
            ${inp(`slides.${i}.text`, 'Text', 'One short sentence')}
            <div class="g2">${inp(`slides.${i}.button`, 'Button', 'Shop running')}${inp(`slides.${i}.link`, 'Button link', '/shop', 'dlLinks')}</div>
          </div>`).join('')}
          <div class="card card-pad"><h3>Sections <span class="right">turn parts of the homepage on or off</span></h3><div class="hp-grid">
            ${SECTIONS.map(([k, l]) => `<label class="toggle" style="margin:0"><div><b>${l}</b></div><span class="switch"><input type="checkbox" data-check="sections.${k}" ${H.sections[k] !== false ? 'checked' : ''}><i></i></span></label>`).join('')}
          </div></div>
          <div class="card card-pad"><h3>The three bars <span class="right">the logo's bars pull apart to tell these</span></h3>
            ${[0, 1, 2].map(i => `<div class="g2">${inp(`promises.${i}.title`, `Bar ${i + 1}${i === 1 ? ' (green)' : ''}`, '100% original')}${inp(`promises.${i}.text`, 'Line', 'One short sentence')}</div>`).join('')}
          </div>
          <div class="card card-pad"><h3>On the wall <span class="right">${H.wall.length} photo${H.wall.length === 1 ? '' : 's'}</span></h3>
            <p class="hint" style="margin:0 0 12px">Photos from the shop. Pick the product each one shows and it links straight to it with its price; otherwise add any link (an Instagram post, WhatsApp).</p>
            ${H.wall.map((w, i) => `<div class="hp-slide">${rowHead('wall', i, `Photo ${i + 1}`)}
              ${imgField(`wall.${i}.image`, 'Photo (portrait)')}
              <div class="g2">${inp(`wall.${i}.caption`, 'Caption', 'Black or taupe?')}
                <label class="field"><span>Product</span><select class="input" data-k="wall.${i}.sku"><option value="">— none, use the link —</option>${PRODS.map(p => `<option value="${esc(p.sku)}" ${p.sku === w.sku ? 'selected' : ''}>${esc(`${p.brand} ${p.name}, ${p.color}`)}</option>`).join('')}</select></label></div>
              ${inp(`wall.${i}.link`, 'Link <small>(when no product is picked)</small>', 'https://www.instagram.com/p/...')}
            </div>`).join('')}
            <button type="button" class="btn btn-light" data-ladd="wall">+ Add photo</button>
          </div>
          <div class="card card-pad"><h3>Categories <span class="right">menu, footer and the homepage index</span></h3>
            <p class="hint" style="margin:0 0 12px">A category shows on the site once a product uses it (Products → edit → Category). Only categories with products appear.</p>
            ${H.categories.map((c, i) => `<div class="hp-slide">${rowHead('categories', i, `${esc(c.name || 'New category')} <small style="font-weight:500;color:var(--muted)">${PRODS.filter(p => (p.category || '').toLowerCase() === (c.name || '').toLowerCase()).length} products</small>`)}
              <div class="g2">${inp(`categories.${i}.name`, 'Name', 'Tracksuits')}${imgField(`categories.${i}.image`, 'Photo <small>(optional)</small>')}</div></div>`).join('')}
            <button type="button" class="btn btn-light" data-ladd="categories">+ Add category</button>
          </div>
          <div class="card card-pad"><h3>Brands <span class="right">logos and photos</span></h3>
            <p class="hint" style="margin:0 0 12px">The brand's name must match the Brand field on its products. Logos look best as white PNGs on a transparent background. Leave a photo empty to use the brand's campaign photo.</p>
            ${H.brands.map((b, i) => `<div class="hp-slide">${rowHead('brands', i, esc(b.name || 'New brand'))}
              ${inp(`brands.${i}.name`, 'Name', 'Nike')}
              <div class="g2">${imgField(`brands.${i}.logo`, 'Logo')}${imgField(`brands.${i}.image`, 'Photo')}</div></div>`).join('')}
            <button type="button" class="btn btn-light" data-ladd="brands">+ Add brand</button>
          </div>
          <div class="card card-pad"><h3>Questions <span class="right">${H.faq.length}</span></h3>
            <p class="hint" style="margin:0 0 12px">In answers, <b>{fee}</b>, <b>{free}</b>, <b>{cities}</b> and <b>{address}</b> are filled in from Settings.</p>
            ${H.faq.map((q, i) => `<div class="hp-slide">${rowHead('faq', i, `Question ${i + 1}`)}
              ${inp(`faq.${i}.q`, 'Question', 'How do I pay?')}
              <label class="field"><span>Answer</span><textarea class="input" data-k="faq.${i}.a" style="min-height:70px">${esc(q.a || '')}</textarea></label></div>`).join('')}
            <button type="button" class="btn btn-light" data-ladd="faq">+ Add question</button>
          </div>
          <div class="card card-pad"><h3>Women &amp; Men</h3><p class="hint" style="margin:0 0 12px">Leave empty to use the campaign photos.</p><div class="g2">${imgField('women_image', 'Women photo')}${imgField('men_image', 'Men photo')}</div></div>
          <div class="card card-pad"><h3>Green ticker</h3>${inp('ticker', 'Words separated by ·', 'Cash on delivery · Nike · Adidas')}</div>
        </div>
        <datalist id="dlLinks">${LINKS.map(l => `<option value="${l}">`).join('')}</datalist>`;
      $$('[data-k]').forEach(el => el.addEventListener('input', () => {
        set(el.dataset.k, el.value);
        if (el.dataset.img !== undefined) el.closest('.hp-img').querySelector('.hp-prev').style.backgroundImage = `url('${preview(el.value)}')`;
      }));
      $$('[data-k]').forEach(el => el.tagName === 'SELECT' && el.addEventListener('change', () => set(el.dataset.k, el.value)));
      $$('[data-up]').forEach(el => el.onchange = async () => {
        if (!el.files[0]) return;
        el.parentElement.firstChild.textContent = 'Uploading…';
        try { set(el.dataset.up, (await uploadPhotos([el.files[0]], el.dataset.wide !== undefined))[0]); draw(); toast('Photo uploaded — remember to Save'); }
        catch (e) { toast(e.message, 1); el.parentElement.firstChild.textContent = 'Upload photo'; }
      });
      $$('[data-check]').forEach(el => el.onchange = () => set(el.dataset.check, el.checked));
      $$('[data-ladd]').forEach(b => b.onclick = () => { H[b.dataset.ladd].push({ ...BLANK[b.dataset.ladd] }); draw(); });
      $$('[data-lrm]').forEach(b => b.onclick = () => { if (confirmBox('Remove this?')) { H[b.dataset.lrm].splice(+b.dataset.i, 1); draw(); } });
      $$('[data-lmv]').forEach(b => b.onclick = () => { const L = H[b.dataset.lmv], i = +b.dataset.i, j = i + +b.dataset.d; [L[i], L[j]] = [L[j], L[i]]; draw(); });
      $$('[data-rm]').forEach(b => b.onclick = () => { if (confirmBox('Remove this slide?')) { H.slides.splice(+b.dataset.rm, 1); draw(); } });
      $$('[data-mv]').forEach(b => b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [H.slides[i], H.slides[j]] = [H.slides[j], H.slides[i]]; draw(); });
      if ($('#hpAdd')) $('#hpAdd').onclick = () => { H.slides.push({ image: '', pos: 'center', kicker: '', title: 'New *slide*', text: '', button: 'Shop now', link: '/shop' }); draw(); };
      $('#hpSave').onclick = async () => {
        H.slides = H.slides.slice(0, 3);
        H.wall = H.wall.filter(w => w.image); H.categories = H.categories.filter(c => (c.name || '').trim()); H.brands = H.brands.filter(b => (b.name || '').trim()); H.faq = H.faq.filter(q => (q.q || '').trim());
        try { await api('/api/admin/settings', { method: 'PUT', body: { home: JSON.stringify(H) } }); toast('Homepage saved 🎉'); draw(); }
        catch (e) { toast(e.message, 1); }
      };
    };
    draw();
  }

  // =================== SITE TEXTS ===================
  // Every fixed word on the site (js/site-texts.js). Empty = the original wording.
  async function Texts() {
    const s = await api('/api/admin/settings');
    let TX; try { TX = JSON.parse(s.texts || '{}') || {}; } catch { TX = {}; }
    const groups = window.SITE_TEXTS || [], images = window.SITE_IMAGES || [];
    let q = '';
    const changed = k => typeof TX[k] === 'string' && TX[k].trim() !== '';
    const field = ([k, label, def]) => {
      const long = def.length > 70 || def.includes('\n');
      const val = esc(TX[k] || '');
      return `<label class="field tx-field" data-find="${esc((label + ' ' + def + ' ' + (TX[k] || '')).toLowerCase())}"><span>${esc(label)}${changed(k) ? ' <small class="tx-changed">changed</small> <button type="button" class="tx-reset" data-reset="' + k + '">use original</button>' : ''}</span>
        ${long ? `<textarea class="input" data-tx="${k}" placeholder="${esc(def)}" rows="3">${val}</textarea>` : `<input class="input" data-tx="${k}" placeholder="${esc(def)}" value="${val}">`}</label>`;
    };
    const draw = () => {
      const n = Object.keys(TX).filter(changed).length;
      view.innerHTML = `
        <div class="ph"><h1>Site texts</h1><p class="sub">Every word on the website. The grey text is what the site says now: type over it to change it, clear the box to go back. Words in {braces} are filled in by the site (prices, names), keep them. Wrap a word in *stars* in a title to make it green.</p>
          <div class="actions"><a class="btn btn-light" href="/" target="_blank">Preview store</a><button class="btn btn-dark" id="txSave">Save texts</button></div></div>
        <div style="display:grid;gap:14px;max-width:900px">
          <div class="card card-pad" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <input class="input" id="txFind" placeholder="Find a word on the site, e.g. delivery" value="${esc(q)}" style="flex:1;min-width:220px">
            <small style="color:var(--muted)">${n ? `${n} text${n === 1 ? '' : 's'} changed` : 'Nothing changed yet'}</small>
          </div>
          <div class="card card-pad"><h3>Logo</h3>
            ${images.map(([k, label, def]) => `<div class="field"><span>${esc(label)}</span><div class="hp-img"><div class="hp-prev" style="background:#1c1d20 url('${esc(TX[k] || def)}') center/contain no-repeat"></div>
              <div style="flex:1;min-width:0"><input class="input" data-tx="${k}" value="${esc(TX[k] || '')}" placeholder="${esc(def)}">
              <label class="btn btn-light btn-sm" style="position:relative;margin-top:8px">Upload<input type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" data-txup="${k}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div></div></div>`).join('')}
          </div>
          ${groups.map(g => `<details class="card card-pad tx-group" ${q ? 'open' : ''}><summary><h3 style="display:inline">${esc(g.group)}</h3> <span class="right" style="color:var(--muted)">${g.items.filter(([k]) => changed(k)).length ? g.items.filter(([k]) => changed(k)).length + ' changed · ' : ''}${g.items.length}</span></summary>
            <div style="margin-top:12px">${g.items.map(field).join('')}</div></details>`).join('')}
        </div>`;
      const filter = () => {
        $$('.tx-field').forEach(f => { f.hidden = !!q && !f.dataset.find.includes(q); });
        $$('.tx-group').forEach(d => { const any = $$('.tx-field', d).some(f => !f.hidden); d.hidden = !any; if (q) d.open = true; });
      };
      $('#txFind').oninput = e => { q = e.target.value.trim().toLowerCase(); filter(); };
      $$('[data-tx]').forEach(el => el.addEventListener('input', () => { TX[el.dataset.tx] = el.value; }));
      $$('[data-reset]').forEach(b => b.onclick = e => { e.preventDefault(); delete TX[b.dataset.reset]; draw(); });
      $$('[data-txup]').forEach(el => el.onchange = async () => {
        if (!el.files[0]) return;
        try { TX[el.dataset.txup] = (await uploadPhotos([el.files[0]]))[0]; draw(); toast('Uploaded — remember to Save'); } catch (e) { toast(e.message, 1); }
      });
      $('#txSave').onclick = async () => {
        const clean = Object.fromEntries(Object.entries(TX).filter(([, v]) => typeof v === 'string' && v.trim()));
        try { await api('/api/admin/settings', { method: 'PUT', body: { texts: JSON.stringify(clean) } }); TX = clean; toast('Texts saved 🎉'); draw(); }
        catch (e) { toast(e.message, 1); }
      };
      filter();
    };
    draw();
  }

  // =================== IMPORT ===================
  function Import() {
    view.innerHTML = `
      <div class="ph"><h1>Excel import</h1><p class="sub">Add or update lots of products at once. Same SKU = update the existing product.</p></div>
      <div class="steps-row">
        <div class="card step-card"><div class="n">1</div><h3>Get the template</h3><p>One row per product. Sizes go like <b>S:5, M:10, L:3</b>.</p>
          <a class="btn btn-light btn-block" href="/api/admin/template.xlsx"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download template</a>
          <a class="btn btn-light btn-block" style="margin-top:8px" href="/api/admin/products.xlsx">Export current products</a></div>
        <div class="card step-card"><div class="n">2</div><h3>Upload your sheet</h3><p>Excel (.xlsx) or CSV. You'll see a preview before anything changes.</p>
          <label class="drop" id="xdrop" style="padding:16px"><input type="file" id="xfile" accept=".xlsx,.csv">
            <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg><b>Choose file</b> or drop it here</label></div>
        <div class="card step-card"><div class="n">3</div><h3>Bulk photos</h3><p>Name photos by SKU, like <b>NK-TEE-001.jpg</b>, <b>NK-TEE-001-2.jpg</b>, then drop them all here.</p>
          <label class="drop" id="bdrop" style="padding:16px"><input type="file" id="bfile" accept="image/*" multiple>
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg><b>Choose photos</b> or drop them here</label></div>
      </div>
      <div id="xresult"></div>`;
    const wireDrop = (zone, input, fn) => {
      input.onchange = () => { fn([...input.files]); input.value = ''; };
      ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('over')));
      zone.addEventListener('drop', e => { e.preventDefault(); fn(e.dataTransfer.files); });
    };
    wireDrop($('#xdrop'), $('#xfile'), async files => {
      const file = files[0];   // keep it: the picker is emptied right after, which empties this list too
      if (!file) return;
      $('#xresult').innerHTML = '<div class="card empty"><div class="spinner" style="margin:auto"></div><p>Reading your sheet…</p></div>';
      const fd = new FormData(); fd.append('file', file);
      try { const { rows } = await api('/api/admin/import/preview', { method: 'POST', body: fd }); showPreview(rows, file.name); }
      catch (e) { $('#xresult').innerHTML = `<div class="card card-pad" style="color:var(--red)"><b>Couldn't import:</b> ${esc(e.message)}</div>`; }
    });
    wireDrop($('#bdrop'), $('#bfile'), async files => {
      if (!files.length) return;
      $('#xresult').innerHTML = `<div class="card empty"><div class="spinner" style="margin:auto"></div><p>Uploading ${files.length} photo(s)…</p></div>`;
      try {
        const rs = await sendPhotos([...files], '/api/admin/bulk-photos');
        const r = { matched: rs.flatMap(x => x.matched), unmatched: rs.flatMap(x => x.unmatched) };
        $('#xresult').innerHTML = `<div class="result-box">✅ <b>${r.matched.length}</b> photo(s) attached to ${new Set(r.matched.map(m => m.sku)).size} product(s).</div>
          ${r.unmatched.length ? `<div class="card card-pad"><h3>No matching SKU for ${r.unmatched.length} file(s)</h3><p class="hint" style="margin-top:0">Rename them to start with the product SKU and try again:</p><p style="margin:0">${r.unmatched.map(esc).join(', ')}</p></div>` : ''}`;
      } catch (e) { $('#xresult').innerHTML = `<div class="card card-pad" style="color:var(--red)">${esc(e.message)}</div>`; }
    });
  }
  function showPreview(rows, fname) {
    const ok = rows.filter(r => !r.errors.length);
    const c = ok.filter(r => r.action === 'create').length, u = ok.filter(r => r.action === 'update').length, bad = rows.length - ok.length;
    $('#xresult').innerHTML = `
      <div class="card">
        <div class="card-pad" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line-2)">
          <div><h3 style="margin:0">Preview · ${esc(fname)}</h3><small style="color:var(--muted)"><span class="pill create">${c} new</span> <span class="pill update">${u} update</span> ${bad ? `<span class="pill error">${bad} with errors (skipped)</span>` : ''}</small></div>
          <span style="flex:1"></span><button class="btn btn-light" id="xCancel">Cancel</button><button class="btn btn-green" id="xGo" ${ok.length ? '' : 'disabled'}>Import ${ok.length} product${ok.length === 1 ? '' : 's'}</button>
        </div>
        <div class="table-wrap"><table class="preview-table"><thead><tr><th>Row</th><th></th><th>SKU</th><th>Name</th><th>Brand</th><th>Price</th><th>Sizes</th><th>Stock</th></tr></thead><tbody>
          ${rows.map(r => `<tr class="${r.errors.length ? 'err-row' : ''}"><td>${r.line}</td><td>${r.errors.length ? `<span class="pill error" title="${esc(r.errors.join(', '))}">${esc(r.errors[0])}</span>` : `<span class="pill ${r.action}">${r.action}</span>`}</td>
            <td>${esc(r.sku || 'auto')}</td><td><b>${esc(r.name)}</b><br><small style="color:var(--muted)">${esc([r.gender, r.category, r.color].filter(Boolean).join(' · '))}</small></td><td>${esc(r.brand)}</td>
            <td class="num">${r.sale_price ? `<b style="color:var(--red)">${money(r.sale_price)}</b> <s>${money(r.price)}</s>` : money(r.price)}</td>
            <td>${r.sizes.map(s => esc(s.size)).join(', ') || '—'}</td><td class="num">${r.sizes.reduce((a, s) => a + s.stock, 0)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
    $('#xCancel').onclick = () => { $('#xresult').innerHTML = ''; };
    $('#xGo').onclick = async () => {
      $('#xGo').disabled = true; $('#xGo').textContent = 'Importing…';
      try {
        const r = await api('/api/admin/import/commit', { method: 'POST', body: { rows: ok } });
        $('#xresult').innerHTML = `<div class="result-box">🎉 Imported! <b>${r.created}</b> new, <b>${r.updated}</b> updated.${r.imageErrors.length ? `<br><small>${r.imageErrors.length} image link(s) couldn't be downloaded.</small>` : ''}</div>
          <button class="btn btn-dark" id="xSee">See products</button>`;
        $('#xSee').onclick = () => nav('products');
      } catch (e) { toast(e.message, 1); $('#xGo').disabled = false; }
    };
  }

  // =================== COMMUNITY ===================
  async function Community() {
    const subs = await api('/api/admin/subscribers');
    view.innerHTML = `
      <div class="ph"><h1>Community</h1><p class="sub">Everyone who left their details in the sign-up popup — export to Excel for WhatsApp broadcasts, Meta/Instagram custom audiences and retargeting.</p>
        <div class="actions"><a class="btn btn-light" href="/api/admin/subscribers.xlsx"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Export to Excel</a></div></div>
      <div class="card"><div class="table-wrap">${subs.length ? `<table><thead><tr><th>Name</th><th>Phone</th><th class="hide-m">Email</th><th class="hide-m">Country</th><th>Offers</th><th class="hide-m">Joined</th></tr></thead><tbody>
        ${subs.map(s => `<tr><td><b>${esc(s.first_name)} ${esc(s.last_name)}</b></td><td><a href="https://wa.me/${esc(s.phone.replace(/\D/g, ''))}" target="_blank" style="text-decoration:underline">${esc(s.phone)}</a></td><td class="hide-m">${esc(s.email)}</td><td class="hide-m">${esc(s.country)}</td>
          <td>${s.marketing ? '<span class="status s-active">Yes</span>' : '<span class="status s-hidden">No</span>'}</td><td class="hide-m">${fmtDate(s.created_at)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty"><h3>No sign-ups yet</h3>They\'ll appear here when visitors fill the welcome popup.</div>'}</div></div>`;
  }

  // =================== SETTINGS ===================
  async function Settings() {
    const s = await api('/api/admin/settings');
    view.innerHTML = `
      <div class="ph"><h1>Settings</h1></div>
      <form id="sf" style="display:grid;gap:14px;max-width:760px">
        <div class="card card-pad"><h3>Delivery</h3>
          <div class="g3">
            <label class="field"><span>Currency symbol</span><input class="input" name="currency" value="${esc(s.currency)}"></label>
            <label class="field"><span>Delivery fee</span><input class="input" name="delivery_fee" type="number" step="0.5" min="0" value="${esc(s.delivery_fee)}"></label>
            <label class="field"><span>Free delivery over <small>(0 = never)</small></span><input class="input" name="free_delivery_over" type="number" min="0" value="${esc(s.free_delivery_over)}"></label>
          </div>
          <label class="field" style="margin:0"><span>Delivery areas <small>(comma separated, shown at checkout)</small></span><textarea class="input" name="cities" style="min-height:70px">${esc(s.cities)}</textarea></label>
        </div>
        <div class="card card-pad"><h3>Store</h3>
          <label class="field"><span>WhatsApp number <small>(country code, no + or spaces, e.g. 96170123456)</small></span><input class="input" name="whatsapp" value="${esc(s.whatsapp)}" inputmode="numeric"></label>
          <label class="field"><span>Instagram link</span><input class="input" name="instagram" value="${esc(s.instagram)}"></label>
          <label class="field"><span>Store address <small>(shown on the homepage, in the footer and on directions — leave empty to hide)</small></span><input class="input" name="store_address" value="${esc(s.store_address || '')}" placeholder="Ste. Takla Centre, Wadi Chahrour El Soufla, Main Road"></label>
          <label class="field"><span>Opening hours <small>(optional, e.g. Mon–Sat 10:00–21:00)</small></span><input class="input" name="store_hours" value="${esc(s.store_hours || '')}"></label>
          <label class="field"><span>Announcement bar <small>(green strip at the top — leave empty to hide)</small></span><input class="input" name="announcement" value="${esc(s.announcement)}"></label>
          <label class="toggle"><div><b>Welcome popup</b><small>Invite visitors to join when they arrive (they can skip and browse)</small></div><span class="switch"><input type="checkbox" name="welcome_popup" ${s.welcome_popup === '1' ? 'checked' : ''}><i></i></span></label>
          <label class="toggle"><div><b>Ask for details before shopping</b><small>Name, family name, email, country &amp; phone required before add to bag, checkout or WhatsApp enquiries</small></div><span class="switch"><input type="checkbox" name="require_signup" ${s.require_signup !== '0' ? 'checked' : ''}><i></i></span></label>
        </div>
        <div class="card card-pad"><h3>Order alerts on WhatsApp</h3>
          <p class="hint" style="margin:0 0 12px">Get a WhatsApp message on your phone for every new order. It's free, set it up once:<br>
            1. Open <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noopener" style="text-decoration:underline">callmebot.com</a>, add their WhatsApp number to your contacts and send it the activation message they show.<br>
            2. They reply on WhatsApp with your <b>API key</b>. Paste it below with your number, Save, then press Send test.</p>
          <div class="g2">
            <label class="field"><span>Your WhatsApp number <small>(gets the alerts)</small></span><input class="input" name="notify_phone" value="${esc(s.notify_phone || '')}" placeholder="+961 71 043 048" inputmode="tel"></label>
            <label class="field"><span>CallMeBot API key</span><input class="input" name="callmebot_key" value="${esc(s.callmebot_key || '')}" placeholder="e.g. 1234567" autocomplete="off"></label>
          </div>
          <button type="button" class="btn btn-light" id="testAlert">Send test</button>
        </div>
        <div class="card card-pad"><h3>Admin password</h3>
          <label class="field" style="margin:0"><span>New password <small>(leave empty to keep the current one)</small></span><input class="input" name="new_password" type="password" autocomplete="new-password" minlength="6"></label>
        </div>
        <div><button class="btn btn-dark" type="submit">Save settings</button></div>
      </form>`;
    const f = $('#sf');
    f.onsubmit = async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      body.welcome_popup = f.welcome_popup.checked ? '1' : '0';
      body.require_signup = f.require_signup.checked ? '1' : '0';
      body.whatsapp = (body.whatsapp || '').replace(/\D/g, '');
      try { await api('/api/admin/settings', { method: 'PUT', body }); SET = { ...SET, ...body }; f.new_password.value = ''; toast('Settings saved'); }
      catch (err) { toast(err.message, 1); }
    };
    $('#testAlert').onclick = async () => {
      const b = $('#testAlert'); b.disabled = true; b.textContent = 'Sending…';
      try {
        await api('/api/admin/settings', { method: 'PUT', body: { notify_phone: f.notify_phone.value, callmebot_key: f.callmebot_key.value } });
        await api('/api/admin/test-alert', { method: 'POST' }); toast('Sent! Check WhatsApp on that phone');
      } catch (err) { toast(err.message, 1); }
      b.disabled = false; b.textContent = 'Send test';
    };
  }

  // ---------- boot ----------
  async function boot() {
    const me = await api('/api/admin/me');
    if (!me.admin) return showLogin();
    $('#shell').hidden = false;
    try { SET = await api('/api/admin/settings'); } catch {}
    route();
  }
  boot();
})();
