const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { db, UPLOAD_DIR, getSettings, setSetting, uniqueSlug, rowToProduct } = require('./src/db');
const excel = require('./src/excel');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 200 } });

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// ---------- helpers ----------
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const PUBLIC_SETTINGS = ['store_name', 'currency', 'delivery_fee', 'free_delivery_over', 'whatsapp', 'instagram', 'announcement', 'hero_image', 'welcome_popup', 'require_signup', 'cities', 'home'];

async function saveImage(buffer, wide) {
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.webp`;
  await sharp(buffer).rotate().resize(wide ? { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true } : { width: 1400, height: 1750, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toFile(path.join(UPLOAD_DIR, name));
  return `/uploads/${name}`;
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
function removeUpload(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    const f = path.join(UPLOAD_DIR, path.basename(url));
    fs.promises.unlink(f).catch(() => {});
  }
}

// ---------- auth ----------
function secret() {
  let s = getSettings().session_secret;
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting('session_secret', s); }
  return s;
}
function sign(payload) {
  const pw = getSettings().admin_password;
  return crypto.createHmac('sha256', secret() + pw).update(payload).digest('hex');
}
function makeToken() {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  return `${exp}.${sign(String(exp))}`;
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function isAdmin(req) {
  const t = readCookie(req, 'th_admin');
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });
  next();
}
function setAuthCookie(res) {
  res.setHeader('Set-Cookie', `th_admin=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`);
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
app.get('/api/settings', (req, res) => {
  const s = getSettings();
  res.json(Object.fromEntries(PUBLIC_SETTINGS.map(k => [k, s[k]])));
});

app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, created_at DESC, id DESC').all();
  res.json(rows.map(rowToProduct));
});

app.get('/api/products/:slug', (req, res) => {
  const p = rowToProduct(db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(req.params.slug));
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

app.post('/api/subscribe', (req, res) => {
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
  const existing = db.prepare('SELECT id FROM subscribers WHERE phone = ? OR lower(email) = ?').get(phone, email);
  if (existing) {
    db.prepare("UPDATE subscribers SET first_name=?, last_name=?, email=?, country=?, phone=?, marketing=MAX(marketing, ?), created_at=created_at WHERE id=?")
      .run(first, last, email, country, phone, b.marketing ? 1 : 0, existing.id);
  } else {
    db.prepare('INSERT INTO subscribers (first_name, last_name, email, country, phone, marketing) VALUES (?,?,?,?,?,?)')
      .run(first, last, email, country, phone, b.marketing ? 1 : 0);
  }
  res.json({ ok: true });
});

app.post('/api/orders', (req, res) => {
  if (rateLimit('order:' + req.ip, 15, 3600e3)) return res.status(429).json({ error: 'Too many orders from this device. Please contact us on WhatsApp.' });
  const b = req.body || {};
  const c = b.customer || {};
  const name = String(c.name || '').trim().slice(0, 80);
  const phone = String(c.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  const address = String(c.address || '').trim().slice(0, 300);
  if (!name || phone.length < 7 || !address) return res.status(400).json({ error: 'Please fill your name, phone and address.' });
  if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'Your bag is empty.' });

  const s = getSettings();
  try {
    const order = db.transaction(() => {
      const items = [];
      let subtotal = 0;
      for (const it of b.items.slice(0, 50)) {
        const row = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(it.id));
        if (!row) throw new Error('One of the items is no longer available.');
        const p = rowToProduct(row);
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const size = p.sizes.find(x => x.size === it.size);
        if (!size) throw new Error(`Please choose a size for ${p.name}.`);
        if (size.stock < qty) throw new Error(`Only ${size.stock} left of ${p.name} (${size.size}).`);
        size.stock -= qty;
        db.prepare("UPDATE products SET sizes = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(p.sizes), p.id);
        const price = p.sale_price ?? p.price;
        subtotal += price * qty;
        items.push({ id: p.id, sku: p.sku, name: p.name, brand: p.brand, size: size.size, qty, price, image: p.images[0] || null });
      }
      const freeOver = Number(s.free_delivery_over) || 0;
      const fee = freeOver && subtotal >= freeOver ? 0 : Number(s.delivery_fee) || 0;
      const info = db.prepare(`INSERT INTO orders (number, customer_name, phone, email, city, address, notes, items, subtotal, delivery_fee, total)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run('tmp-' + crypto.randomUUID(), name, phone, String(c.email || '').slice(0, 120),
        String(c.city || '').slice(0, 60), address, String(c.notes || '').slice(0, 500), JSON.stringify(items), subtotal, fee, subtotal + fee);
      const number = `TH${1000 + info.lastInsertRowid}`;
      db.prepare('UPDATE orders SET number = ? WHERE id = ?').run(number, info.lastInsertRowid);
      return { number, total: subtotal + fee, subtotal, delivery_fee: fee, items };
    })();
    res.json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- admin API ----------
app.post('/api/admin/login', (req, res) => {
  if (rateLimit('login:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const pw = String((req.body || {}).password || '');
  const real = getSettings().admin_password;
  const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(real).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong password' });
  setAuthCookie(res);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'th_admin=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

app.use('/api/admin', requireAdmin);

app.get('/api/admin/stats', (req, res) => {
  const orders = db.prepare('SELECT status, total, created_at FROM orders').all();
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const list = orders.filter(o => o.created_at.startsWith(d) && o.status !== 'cancelled');
    days.push({ date: d, orders: list.length, revenue: list.reduce((a, o) => a + o.total, 0) });
  }
  const products = db.prepare('SELECT * FROM products').all().map(rowToProduct);
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
    subscribers: db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,
    days,
  });
});

// Products
app.get('/api/admin/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY created_at DESC, id DESC').all().map(rowToProduct));
});

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
    featured: b.featured ? 1 : 0,
    active: b.active === false ? 0 : 1,
  };
}
function nextSku(p) {
  const prefix = (p.brand || 'TH').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TH';
  let n = db.prepare('SELECT COUNT(*) c FROM products').get().c + 1;
  while (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(`${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

app.post('/api/admin/products', (req, res) => {
  const p = cleanProductInput(req.body || {});
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  if (!p.sku) p.sku = nextSku(p);
  if (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(p.sku)) return res.status(400).json({ error: `SKU ${p.sku} already exists.` });
  const info = db.prepare(`INSERT INTO products (sku, name, slug, brand, category, gender, color, swatch, description, price, sale_price, sizes, images, featured, active)
    VALUES (@sku, @name, @slug, @brand, @category, @gender, @color, @swatch, @description, @price, @sale_price, @sizes, @images, @featured, @active)`)
    .run({ ...p, slug: uniqueSlug(`${p.name} ${p.color}`) });
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)));
});

app.put('/api/admin/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const p = cleanProductInput(req.body || {});
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  if (!p.sku) p.sku = old.sku;
  const clash = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku);
  if (clash && clash.id !== id) return res.status(400).json({ error: `SKU ${p.sku} is used by another product.` });
  const slug = old.name === p.name && old.color === p.color ? old.slug : uniqueSlug(`${p.name} ${p.color}`, id);
  db.prepare(`UPDATE products SET sku=@sku, name=@name, slug=@slug, brand=@brand, category=@category, gender=@gender, color=@color, swatch=@swatch,
    description=@description, price=@price, sale_price=@sale_price, sizes=@sizes, images=@images, featured=@featured, active=@active,
    updated_at=datetime('now') WHERE id=@id`).run({ ...p, slug, id });
  const removed = JSON.parse(old.images).filter(u => !JSON.parse(p.images).includes(u));
  removed.forEach(removeUpload);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
});

app.patch('/api/admin/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if ('active' in b) db.prepare('UPDATE products SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
  if ('featured' in b) db.prepare('UPDATE products SET featured = ? WHERE id = ?').run(b.featured ? 1 : 0, id);
  res.json(rowToProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
});

app.post('/api/admin/products/bulk', (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'No products selected' });
  const tx = db.transaction(() => {
    for (const id of ids) {
      if (action === 'delete') {
        const row = db.prepare('SELECT images FROM products WHERE id = ?').get(id);
        if (row) { JSON.parse(row.images).forEach(removeUpload); db.prepare('DELETE FROM products WHERE id = ?').run(id); }
      } else if (action === 'hide' || action === 'show') {
        db.prepare('UPDATE products SET active = ? WHERE id = ?').run(action === 'show' ? 1 : 0, id);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', (req, res) => {
  const row = db.prepare('SELECT images FROM products WHERE id = ?').get(Number(req.params.id));
  if (row) JSON.parse(row.images).forEach(removeUpload);
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/upload', upload.array('files', 20), wrap(async (req, res) => {
  const urls = [];
  for (const f of req.files || []) {
    try { urls.push(await saveImage(f.buffer, req.query.wide === '1')); } catch { /* skip unreadable files */ }
  }
  if (!urls.length) return res.status(400).json({ error: 'Could not read those images. Use JPG, PNG, WEBP or HEIC.' });
  res.json({ urls });
}));

// Bulk photos: filenames like SKU.jpg, SKU-2.jpg, SKU_back.png get attached to that product.
app.post('/api/admin/bulk-photos', upload.array('files', 200), wrap(async (req, res) => {
  const products = db.prepare('SELECT id, sku, images FROM products').all();
  const skus = products.map(p => p.sku).sort((a, b) => b.length - a.length);
  const matched = [], unmatched = [];
  const files = (req.files || []).sort((a, b) => a.originalname.localeCompare(b.originalname, undefined, { numeric: true }));
  for (const f of files) {
    const base = path.parse(f.originalname).name.toUpperCase().trim();
    const sku = skus.find(s => base === s || base.startsWith(s + '-') || base.startsWith(s + '_') || base.startsWith(s + ' ') || base.startsWith(s + '('));
    if (!sku) { unmatched.push(f.originalname); continue; }
    try {
      const url = await saveImage(f.buffer);
      const p = db.prepare('SELECT id, images FROM products WHERE sku = ?').get(sku);
      const imgs = JSON.parse(p.images); imgs.push(url);
      db.prepare('UPDATE products SET images = ? WHERE id = ?').run(JSON.stringify(imgs), p.id);
      matched.push({ file: f.originalname, sku });
    } catch { unmatched.push(f.originalname); }
  }
  res.json({ matched, unmatched });
}));

// Excel import / export
app.get('/api/admin/template.xlsx', wrap(async (req, res) => {
  const wb = await excel.productsWorkbook([]);
  res.setHeader('Content-Disposition', 'attachment; filename="threads-products-template.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res); res.end();
}));
app.get('/api/admin/products.xlsx', wrap(async (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all().map(rowToProduct);
  const wb = await excel.productsWorkbook(products);
  res.setHeader('Content-Disposition', `attachment; filename="threads-products-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res); res.end();
}));

app.post('/api/admin/import/preview', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let rows;
  try { rows = await excel.readRows(req.file.buffer, req.file.originalname); }
  catch (e) { return res.status(400).json({ error: e.message || 'Could not read that file. Save it as .xlsx or .csv.' }); }
  for (const r of rows) r.action = r.sku && db.prepare('SELECT 1 FROM products WHERE sku = ?').get(r.sku) ? 'update' : 'create';
  res.json({ rows });
}));

app.post('/api/admin/import/commit', wrap(async (req, res) => {
  const rows = ((req.body || {}).rows || []).filter(r => !r.errors || !r.errors.length);
  let created = 0, updated = 0;
  const imageErrors = [];
  for (const r of rows) {
    const existing = r.sku ? db.prepare('SELECT * FROM products WHERE sku = ?').get(String(r.sku).toUpperCase()) : null;
    let images = existing ? JSON.parse(existing.images) : [];
    for (const url of (r.image_urls || []).slice(0, 8)) {
      try { images.push(await fetchImage(url)); } catch { imageErrors.push(`${r.sku || r.name}: ${url}`); }
    }
    const p = cleanProductInput({ ...r, images });
    if (existing) {
      db.prepare(`UPDATE products SET name=@name, brand=@brand, category=@category, gender=@gender, color=@color, description=@description,
        price=@price, sale_price=@sale_price, sizes=@sizes, images=@images, featured=@featured, active=@active, updated_at=datetime('now') WHERE id=@id`)
        .run({ ...p, id: existing.id, description: p.description || existing.description });
      updated++;
    } else {
      if (!p.sku) p.sku = nextSku(p);
      db.prepare(`INSERT INTO products (sku, name, slug, brand, category, gender, color, description, price, sale_price, sizes, images, featured, active)
        VALUES (@sku, @name, @slug, @brand, @category, @gender, @color, @description, @price, @sale_price, @sizes, @images, @featured, @active)`)
        .run({ ...p, slug: uniqueSlug(`${p.name} ${p.color}`) });
      created++;
    }
  }
  res.json({ created, updated, imageErrors });
}));

// Orders
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const parseOrder = o => ({ ...o, items: JSON.parse(o.items) });
app.get('/api/admin/orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(parseOrder));
});
app.get('/api/admin/orders.xlsx', wrap(async (req, res) => {
  const wb = await excel.ordersWorkbook(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(parseOrder));
  res.setHeader('Content-Disposition', `attachment; filename="threads-orders-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res); res.end();
}));
app.patch('/api/admin/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  db.transaction(() => {
    if (b.status && ORDER_STATUSES.includes(b.status) && b.status !== o.status) {
      const wasCancelled = o.status === 'cancelled', nowCancelled = b.status === 'cancelled';
      if (wasCancelled !== nowCancelled) {
        // Put stock back when cancelling, take it again when un-cancelling.
        for (const it of JSON.parse(o.items)) {
          const row = db.prepare('SELECT sizes FROM products WHERE id = ?').get(it.id);
          if (!row) continue;
          const sizes = JSON.parse(row.sizes);
          const s = sizes.find(x => x.size === it.size);
          if (s) s.stock = Math.max(0, s.stock + (nowCancelled ? it.qty : -it.qty));
          db.prepare('UPDATE products SET sizes = ? WHERE id = ?').run(JSON.stringify(sizes), it.id);
        }
      }
      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(b.status, id);
    }
    if (typeof b.admin_note === 'string') db.prepare('UPDATE orders SET admin_note = ? WHERE id = ?').run(b.admin_note.slice(0, 1000), id);
  })();
  res.json(parseOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)));
});
app.delete('/api/admin/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Community sign-ups
app.get('/api/admin/subscribers', (req, res) => res.json(db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all()));
app.get('/api/admin/subscribers.xlsx', wrap(async (req, res) => {
  const wb = await excel.subscribersWorkbook(db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all());
  res.setHeader('Content-Disposition', 'attachment; filename="threads-community.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res); res.end();
}));

// Settings
app.get('/api/admin/settings', (req, res) => {
  const s = getSettings();
  delete s.admin_password; delete s.session_secret;
  res.json(s);
});
app.put('/api/admin/settings', (req, res) => {
  const b = req.body || {};
  for (const k of PUBLIC_SETTINGS) if (k in b) setSetting(k, String(b[k]).slice(0, k === 'home' ? 50000 : 1000));
  if (b.new_password) {
    if (String(b.new_password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    setSetting('admin_password', b.new_password);
    setAuthCookie(res); // keep this browser signed in, sign out everyone else
  }
  res.json({ ok: true });
});

// ---------- pages ----------
app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`THREADS store running → http://localhost:${PORT}`);
  console.log(`Admin panel          → http://localhost:${PORT}/admin`);
});
