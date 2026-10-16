require('./scripts/env');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { NOW, all, get, run, tx, getSettings, setSetting, uniqueSlug, rowToProduct } = require('./src/db');
const media = require('./src/media');
const excel = require('./src/excel');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 200 } });

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(media.UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// ---------- helpers ----------
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const PUBLIC_SETTINGS = ['store_name', 'currency', 'delivery_fee', 'free_delivery_over', 'whatsapp', 'instagram', 'announcement', 'store_address', 'store_hours', 'welcome_popup', 'require_signup', 'cities', 'home', 'texts'];
const BIG_SETTINGS = { home: 60000, texts: 60000 };

async function saveImage(buffer, wide) {
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.webp`;
  const out = await sharp(buffer).rotate().resize(wide ? { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true } : { width: 1400, height: 1750, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
  return media.save(name, out);
}
async function fetchImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await saveImage(Buffer.from(await r.arrayBuffer()));
  } finally { clearTimeout(t); }
}
const removeUpload = url => media.remove(url);

// ---------- auth ----------
async function sign(payload) {
  const s = await getSettings();
  let secret = process.env.SESSION_SECRET || s.session_secret;
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); await setSetting('session_secret', secret); }
  return crypto.createHmac('sha256', secret + s.admin_password).update(payload).digest('hex');
}
async function makeToken() {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  return `${exp}.${await sign(String(exp))}`;
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
async function isAdmin(req) {
  const t = readCookie(req, 'th_admin');
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = await sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const requireAdmin = wrap(async (req, res, next) => {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Not signed in' });
  next();
});
async function setAuthCookie(res) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `th_admin=${encodeURIComponent(await makeToken())}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${30 * 24 * 3600}`);
}

const attempts = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  attempts.set(key, list);
  return list.length > max;
}

// ---------- public API ----------
const ACTIVE = 'SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, created_at DESC, id DESC';
app.get('/api/settings', wrap(async (req, res) => {
  const s = await getSettings();
  res.setHeader('Cache-Control', 'no-store');
  res.json(Object.fromEntries(PUBLIC_SETTINGS.map(k => [k, s[k]])));
}));

app.get('/api/products', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json((await all(ACTIVE)).map(rowToProduct));
}));

app.get('/api/products/:slug', wrap(async (req, res) => {
  const p = rowToProduct(await get('SELECT * FROM products WHERE slug = ? AND active = 1', req.params.slug));
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
}));

app.post('/api/subscribe', wrap(async (req, res) => {
  if (rateLimit('sub:' + req.ip, 20, 3600e3)) return res.status(429).json({ error: 'Too many attempts, try later.' });
  const b = req.body || {};
  const first = String(b.first_name || '').trim().slice(0, 60);
  const last = String(b.last_name || '').trim().slice(0, 60);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const phone = String(b.phone || '').replace(/[^\d+ ]/g, '').trim().slice(0, 24);
  const country = String(b.country || '').slice(0, 60);
  if (!first || !last) return res.status(400).json({ error: 'Please enter your first and family name.' });
  if (!/^\S+@\S+\.\S{2,}$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  // same person signing up again (other device / cleared browser) → update instead of duplicating
  const existing = await get('SELECT id FROM subscribers WHERE phone = ? OR lower(email) = ?', phone, email);
  if (existing) {
    await run('UPDATE subscribers SET first_name=?, last_name=?, email=?, country=?, phone=?, marketing=GREATEST(marketing, ?) WHERE id=?',
      first, last, email, country, phone, b.marketing ? 1 : 0, existing.id);
  } else {
    await run('INSERT INTO subscribers (first_name, last_name, email, country, phone, marketing) VALUES (?,?,?,?,?,?)',
      first, last, email, country, phone, b.marketing ? 1 : 0);
  }
  res.json({ ok: true });
}));

app.post('/api/orders', wrap(async (req, res) => {
  if (rateLimit('order:' + req.ip, 15, 3600e3)) return res.status(429).json({ error: 'Too many orders from this device. Please contact us on WhatsApp.' });
  const b = req.body || {};
  const c = b.customer || {};
  const name = String(c.name || '').trim().slice(0, 80);
  const phone = String(c.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  const address = String(c.address || '').trim().slice(0, 300);
  if (!name || phone.length < 7 || !address) return res.status(400).json({ error: 'Please fill your name, phone and address.' });
  if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'Your bag is empty.' });

  const s = await getSettings();
  try {
    const order = await tx(async t => {
      const items = [];
      let subtotal = 0;
      for (const it of b.items.slice(0, 50)) {
        // FOR UPDATE: two people buying the last piece at once can't both get it
        const row = await t.get('SELECT * FROM products WHERE id = ? AND active = 1 FOR UPDATE', Number(it.id) || 0);
        if (!row) throw new Error('One of the items is no longer available.');
        const p = rowToProduct(row);
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const size = p.sizes.find(x => x.size === it.size);
        if (!size) throw new Error(`Please choose a size for ${p.name}.`);
        if (size.stock < qty) throw new Error(`Only ${size.stock} left of ${p.name} (${size.size}).`);
        size.stock -= qty;
        await t.run(`UPDATE products SET sizes = ?, updated_at = ${NOW} WHERE id = ?`, JSON.stringify(p.sizes), p.id);
        const price = p.sale_price ?? p.price;
        subtotal += price * qty;
        items.push({ id: p.id, sku: p.sku, name: p.name, brand: p.brand, size: size.size, qty, price, image: p.images[0] || null });
      }
      const freeOver = Number(s.free_delivery_over) || 0;
      const fee = freeOver && subtotal >= freeOver ? 0 : Number(s.delivery_fee) || 0;
      const ins = await t.get(`INSERT INTO orders (number, customer_name, phone, email, city, address, notes, items, subtotal, delivery_fee, total)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, 'tmp-' + crypto.randomUUID(), name, phone, String(c.email || '').slice(0, 120),
        String(c.city || '').slice(0, 60), address, String(c.notes || '').slice(0, 500), JSON.stringify(items), subtotal, fee, subtotal + fee);
      const number = `TH${1000 + ins.id}`;
      await t.run('UPDATE orders SET number = ? WHERE id = ?', number, ins.id);
      return { number, total: subtotal + fee, subtotal, delivery_fee: fee, items };
    });
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ---------- admin API ----------
app.post('/api/admin/login', wrap(async (req, res) => {
  if (rateLimit('login:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const pw = String((req.body || {}).password || '');
  const real = (await getSettings()).admin_password || '';
  const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(real).digest();
  if (!real || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong password' });
  await setAuthCookie(res);
  res.json({ ok: true });
}));
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'th_admin=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', wrap(async (req, res) => res.json({ admin: await isAdmin(req) })));

app.use('/api/admin', requireAdmin);

app.get('/api/admin/stats', wrap(async (req, res) => {
  const orders = await all('SELECT status, total, created_at FROM orders');
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const list = orders.filter(o => o.created_at.startsWith(d) && o.status !== 'cancelled');
    days.push({ date: d, orders: list.length, revenue: list.reduce((a, o) => a + o.total, 0) });
  }
  const products = (await all('SELECT * FROM products')).map(rowToProduct);
  const live = orders.filter(o => o.status !== 'cancelled');
  res.json({
    ordersToday: orders.filter(o => o.created_at.startsWith(today)).length,
    pending: orders.filter(o => o.status === 'pending').length,
    toDeliver: orders.filter(o => o.status === 'confirmed' || o.status === 'shipped').length,
    revenueDelivered: orders.filter(o => o.status === 'delivered').reduce((a, o) => a + o.total, 0),
    revenueAll: live.reduce((a, o) => a + o.total, 0),
    totalOrders: orders.length,
    productCount: products.length,
    lowStock: products.filter(p => p.active && p.stock <= 3).map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, image: p.images[0] || null })).slice(0, 8),
    subscribers: Number((await get('SELECT COUNT(*) AS c FROM subscribers')).c),
    days,
  });
}));

// Products
const byId = async id => rowToProduct(await get('SELECT * FROM products WHERE id = ?', id));
app.get('/api/admin/products', wrap(async (req, res) => {
  res.json((await all('SELECT * FROM products ORDER BY created_at DESC, id DESC')).map(rowToProduct));
}));

function cleanProductInput(b) {
  const price = Number(b.price) || 0;
  const sale = b.sale_price === '' || b.sale_price == null ? null : Number(b.sale_price);
  return {
    sku: String(b.sku || '').trim().toUpperCase().slice(0, 40),
    name: String(b.name || '').trim().slice(0, 120),
    brand: String(b.brand || '').trim().slice(0, 60),
    category: String(b.category || '').trim().slice(0, 60),
    gender: ['Men', 'Women', 'Unisex'].includes(b.gender) ? b.gender : 'Unisex',
    color: String(b.color || '').trim().slice(0, 60),
    swatch: /^#[0-9a-f]{3,8}$/i.test(String(b.swatch || '').trim()) ? String(b.swatch).trim() : '',
    description: String(b.description || '').slice(0, 4000),
    price,
    sale_price: sale && sale > 0 && sale < price ? sale : null,
    sizes: JSON.stringify((Array.isArray(b.sizes) ? b.sizes : []).filter(s => s && String(s.size).trim())
      .map(s => ({ size: String(s.size).trim().slice(0, 20), stock: Math.max(0, parseInt(s.stock, 10) || 0) }))),
    images: JSON.stringify((Array.isArray(b.images) ? b.images : []).filter(u => typeof u === 'string').slice(0, 12)),
    cutout: media.owned(b.cutout) ? String(b.cutout) : '',
    featured: b.featured ? 1 : 0,
    active: b.active === false ? 0 : 1,
  };
}
async function nextSku(p) {
  const prefix = (p.brand || 'TH').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TH';
  let n = Number((await get('SELECT COUNT(*) AS c FROM products')).c) + 1;
  while (await get('SELECT 1 FROM products WHERE sku = ?', `${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
const INSERT = `INSERT INTO products (sku, name, slug, brand, category, gender, color, swatch, description, price, sale_price, sizes, images, cutout, featured, active)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`;
const insertArgs = (p, slug) => [p.sku, p.name, slug, p.brand, p.category, p.gender, p.color, p.swatch, p.description, p.price, p.sale_price, p.sizes, p.images, p.cutout, p.featured, p.active];

app.post('/api/admin/products', wrap(async (req, res) => {
  const p = cleanProductInput(req.body || {});
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  if (!p.sku) p.sku = await nextSku(p);
  if (await get('SELECT 1 FROM products WHERE sku = ?', p.sku)) return res.status(400).json({ error: `SKU ${p.sku} already exists.` });
  const r = await get(INSERT, ...insertArgs(p, await uniqueSlug(`${p.name} ${p.color}`)));
  res.json(await byId(r.id));
}));

app.put('/api/admin/products/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const old = await get('SELECT * FROM products WHERE id = ?', id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const p = cleanProductInput(req.body || {});
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  if (!p.sku) p.sku = old.sku;
  const clash = await get('SELECT id FROM products WHERE sku = ?', p.sku);
  if (clash && clash.id !== id) return res.status(400).json({ error: `SKU ${p.sku} is used by another product.` });
  const slug = old.name === p.name && old.color === p.color ? old.slug : await uniqueSlug(`${p.name} ${p.color}`, id);
  await run(`UPDATE products SET sku=?, name=?, slug=?, brand=?, category=?, gender=?, color=?, swatch=?, description=?, price=?, sale_price=?,
    sizes=?, images=?, cutout=?, featured=?, active=?, updated_at=${NOW} WHERE id=?`,
    p.sku, p.name, slug, p.brand, p.category, p.gender, p.color, p.swatch, p.description, p.price, p.sale_price, p.sizes, p.images, p.cutout, p.featured, p.active, id);
  if (old.cutout && old.cutout !== p.cutout) removeUpload(old.cutout);
  JSON.parse(old.images).filter(u => !JSON.parse(p.images).includes(u)).forEach(removeUpload);
  res.json(await byId(id));
}));

app.patch('/api/admin/products/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if ('active' in b) await run('UPDATE products SET active = ? WHERE id = ?', b.active ? 1 : 0, id);
  if ('featured' in b) await run('UPDATE products SET featured = ? WHERE id = ?', b.featured ? 1 : 0, id);
  res.json(await byId(id));
}));

app.post('/api/admin/products/bulk', wrap(async (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'No products selected' });
  const list = ids.map(Number).filter(Boolean);
  if (action === 'delete') {
    for (const row of await all('SELECT images, cutout FROM products WHERE id = ANY(?::int[])', list)) { JSON.parse(row.images).forEach(removeUpload); removeUpload(row.cutout); }
    await run('DELETE FROM products WHERE id = ANY(?::int[])', list);
  } else if (action === 'hide' || action === 'show') {
    await run('UPDATE products SET active = ? WHERE id = ANY(?::int[])', action === 'show' ? 1 : 0, list);
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/products/:id', wrap(async (req, res) => {
  const row = await get('SELECT images, cutout FROM products WHERE id = ?', Number(req.params.id));
  if (row) { JSON.parse(row.images).forEach(removeUpload); removeUpload(row.cutout); }
  await run('DELETE FROM products WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
}));

app.post('/api/admin/upload', upload.array('files', 20), wrap(async (req, res) => {
  const urls = [];
  let why = '';
  for (const f of req.files || []) {
    try { urls.push(await saveImage(f.buffer, req.query.wide === '1')); } catch (e) { why = e.message; }
  }
  if (!urls.length) return res.status(400).json({ error: /upload failed/i.test(why) ? why : 'Could not read those images. Use JPG, PNG, WEBP or HEIC.' });
  res.json({ urls });
}));

// Bulk photos: filenames like SKU.jpg, SKU-2.jpg, SKU_back.png get attached to that product.
app.post('/api/admin/bulk-photos', upload.array('files', 200), wrap(async (req, res) => {
  const products = await all('SELECT id, sku FROM products');
  const skus = products.map(p => p.sku).sort((a, b) => b.length - a.length);
  const matched = [], unmatched = [];
  const files = (req.files || []).sort((a, b) => a.originalname.localeCompare(b.originalname, undefined, { numeric: true }));
  for (const f of files) {
    const base = path.parse(f.originalname).name.toUpperCase().trim();
    const sku = skus.find(s => base === s || base.startsWith(s + '-') || base.startsWith(s + '_') || base.startsWith(s + ' ') || base.startsWith(s + '('));
    if (!sku) { unmatched.push(f.originalname); continue; }
    try {
      const url = await saveImage(f.buffer);
      const p = await get('SELECT id, images FROM products WHERE sku = ?', sku);
      const imgs = JSON.parse(p.images); imgs.push(url);
      await run('UPDATE products SET images = ? WHERE id = ?', JSON.stringify(imgs), p.id);
      matched.push({ file: f.originalname, sku });
    } catch { unmatched.push(f.originalname); }
  }
  res.json({ matched, unmatched });
}));

// Excel import / export
const xlsx = (res, name) => { res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); };
app.get('/api/admin/template.xlsx', wrap(async (req, res) => {
  const wb = await excel.productsWorkbook([]);
  xlsx(res, 'threads-products-template.xlsx');
  await wb.xlsx.write(res); res.end();
}));
app.get('/api/admin/products.xlsx', wrap(async (req, res) => {
  const wb = await excel.productsWorkbook((await all('SELECT * FROM products ORDER BY id')).map(rowToProduct));
  xlsx(res, `threads-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

app.post('/api/admin/import/preview', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let rows;
  try { rows = await excel.readRows(req.file.buffer, req.file.originalname); }
  catch (e) { return res.status(400).json({ error: e.message || 'Could not read that file. Save it as .xlsx or .csv.' }); }
  const have = new Set((await all('SELECT sku FROM products')).map(r => r.sku));
  for (const r of rows) r.action = r.sku && have.has(r.sku) ? 'update' : 'create';
  res.json({ rows });
}));

async function importRows(rows) {
  let created = 0, updated = 0;
  const imageErrors = [];
  for (const r of rows.filter(r => !r.errors || !r.errors.length)) {
    const existing = r.sku ? await get('SELECT * FROM products WHERE sku = ?', String(r.sku).toUpperCase()) : null;
    const images = existing ? JSON.parse(existing.images) : [];
    for (const url of (r.image_urls || []).slice(0, 8)) {
      try { images.push(await fetchImage(url)); } catch { imageErrors.push(`${r.sku || r.name}: ${url}`); }
    }
    const p = cleanProductInput({ ...r, images, cutout: existing ? existing.cutout : '' });
    if (existing) {
      await run(`UPDATE products SET name=?, brand=?, category=?, gender=?, color=?, description=?, price=?, sale_price=?, sizes=?, images=?, featured=?, active=?, updated_at=${NOW} WHERE id=?`,
        p.name, p.brand, p.category, p.gender, p.color, p.description || existing.description, p.price, p.sale_price, p.sizes, p.images, p.featured, p.active, existing.id);
      updated++;
    } else {
      if (!p.sku) p.sku = await nextSku(p);
      await run(INSERT, ...insertArgs(p, await uniqueSlug(`${p.name} ${p.color}`)));
      created++;
    }
  }
  return { created, updated, imageErrors };
}
app.post('/api/admin/import/commit', wrap(async (req, res) => res.json(await importRows((req.body || {}).rows || []))));

// Orders
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const parseOrder = o => ({ ...o, items: JSON.parse(o.items) });
app.get('/api/admin/orders', wrap(async (req, res) => {
  res.json((await all('SELECT * FROM orders ORDER BY id DESC')).map(parseOrder));
}));
app.get('/api/admin/orders.xlsx', wrap(async (req, res) => {
  const wb = await excel.ordersWorkbook((await all('SELECT * FROM orders ORDER BY id DESC')).map(parseOrder));
  xlsx(res, `threads-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));
app.patch('/api/admin/orders/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const o = await tx(async t => {
    const o = await t.get('SELECT * FROM orders WHERE id = ? FOR UPDATE', id);
    if (!o) return null;
    if (b.status && ORDER_STATUSES.includes(b.status) && b.status !== o.status) {
      const wasCancelled = o.status === 'cancelled', nowCancelled = b.status === 'cancelled';
      if (wasCancelled !== nowCancelled) {
        // Put stock back when cancelling, take it again when un-cancelling.
        for (const it of JSON.parse(o.items)) {
          const row = await t.get('SELECT sizes FROM products WHERE id = ? FOR UPDATE', it.id);
          if (!row) continue;
          const sizes = JSON.parse(row.sizes);
          const s = sizes.find(x => x.size === it.size);
          if (s) s.stock = Math.max(0, s.stock + (nowCancelled ? it.qty : -it.qty));
          await t.run('UPDATE products SET sizes = ? WHERE id = ?', JSON.stringify(sizes), it.id);
        }
      }
      await t.run(`UPDATE orders SET status = ?, updated_at = ${NOW} WHERE id = ?`, b.status, id);
    }
    if (typeof b.admin_note === 'string') await t.run('UPDATE orders SET admin_note = ? WHERE id = ?', b.admin_note.slice(0, 1000), id);
    return t.get('SELECT * FROM orders WHERE id = ?', id);
  });
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(parseOrder(o));
}));
app.delete('/api/admin/orders/:id', wrap(async (req, res) => {
  await run('DELETE FROM orders WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
}));

// Community sign-ups
app.get('/api/admin/subscribers', wrap(async (req, res) => res.json(await all('SELECT * FROM subscribers ORDER BY id DESC'))));
app.get('/api/admin/subscribers.xlsx', wrap(async (req, res) => {
  const wb = await excel.subscribersWorkbook(await all('SELECT * FROM subscribers ORDER BY id DESC'));
  xlsx(res, 'threads-community.xlsx');
  await wb.xlsx.write(res); res.end();
}));

// Settings
app.get('/api/admin/settings', wrap(async (req, res) => {
  const s = await getSettings();
  delete s.admin_password; delete s.session_secret;
  res.json(s);
}));
app.put('/api/admin/settings', wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of PUBLIC_SETTINGS) if (k in b) await setSetting(k, String(b[k]).slice(0, BIG_SETTINGS[k] || 1000));
  if (b.new_password) {
    if (process.env.ADMIN_PASSWORD) return res.status(400).json({ error: 'The password is set on the host (ADMIN_PASSWORD). Change it there.' });
    if (String(b.new_password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    await setSetting('admin_password', b.new_password);
    await setAuthCookie(res); // keep this browser signed in, sign out everyone else
  }
  res.json({ ok: true });
}));

// ---------- pages ----------
// read once and sent from memory: on Vercel the public/ files sit on the CDN, not next to this function
const PAGE = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const ADMIN_PAGE = require('fs').readFileSync(path.join(__dirname, 'public', 'admin', 'index.html'), 'utf8');
app.get(['/admin', '/admin/*'], (req, res) => res.type('html').send(ADMIN_PAGE));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.type('html').send(PAGE);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

module.exports = app;
module.exports.importRows = importRows;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`THREADS store running → http://localhost:${PORT}`);
    console.log(`Admin panel          → http://localhost:${PORT}/admin`);
  });
}
