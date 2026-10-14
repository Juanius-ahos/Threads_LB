const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'store.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  brand TEXT DEFAULT '',
  category TEXT DEFAULT '',
  gender TEXT DEFAULT 'Unisex',
  color TEXT DEFAULT '',
  swatch TEXT DEFAULT '',
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  sale_price REAL,
  sizes TEXT NOT NULL DEFAULT '[]',      -- JSON [{size, stock}]
  images TEXT NOT NULL DEFAULT '[]',     -- JSON ["/uploads/x.webp", ...]
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  address TEXT NOT NULL,
  notes TEXT DEFAULT '',
  items TEXT NOT NULL,                   -- JSON snapshot
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL,
  total REAL NOT NULL,
  admin_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT, last_name TEXT, email TEXT, country TEXT, phone TEXT,
  marketing INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);
if (!db.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'swatch')) {
  db.exec("ALTER TABLE products ADD COLUMN swatch TEXT DEFAULT ''");
}
// a transparent photo of the piece alone: it stands on the homepage's 3D stand and the product page's 3D view
if (!db.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'cutout')) {
  db.exec("ALTER TABLE products ADD COLUMN cutout TEXT DEFAULT ''");
}
const STARTER_CUTOUTS = { 'TNF-SET-LAV': '/products/cut-tnf.webp', 'ON-SET-CRL': '/products/cut-on.webp', 'ON-SHT-BLK': '/products/cut-shorts-black.webp', 'ON-SHT-OLV': '/products/cut-shorts-olive.webp', 'ON-SHT-PLM': '/products/cut-shorts-plum.webp' };

const U = id => `https://images.unsplash.com/${id}`;
const DEFAULT_HOME = {
  slides: [
    { image: U('photo-1574680088814-c9e8a10d8a4d'), pos: '70% 30%', title: 'Move your *way.*', text: 'Original Nike, Adidas, On and The North Face, delivered anywhere in Lebanon. You pay cash at the door.', button: 'Shop women', link: '/shop?gender=Women', button2: 'Shop men', link2: '/shop?gender=Men' },
    { image: U('photo-1552674605-db6ffd4facb5'), pos: '50% 60%', title: 'Run the *city.*', text: 'Lightweight layers and 2-in-1 shorts built for early miles and late laps.', button: 'Shop running', link: '/shop?category=Shorts', button2: '', link2: '' },
    { image: U('photo-1608748180154-b4eaa0da7634'), pos: '50% 35%', title: 'Built for *outside.*', text: 'Tracksuits and jackets that handle the weather — from Beirut streets to the mountains.', button: 'Shop The North Face', link: '/shop?brand=The%20North%20Face', button2: '', link2: '' },
  ],
  brands: [
    { name: 'Nike', image: U('photo-1726195222023-9016a7250717'), tagline: 'Just move' },
    { name: 'Adidas', image: U('photo-1511746315387-c4a76990fdce'), tagline: 'Three stripes' },
    { name: 'On', image: U('photo-1718248028293-934f04a578db'), tagline: 'Run on clouds' },
    { name: 'The North Face', image: U('photo-1618329918461-51bb072e0ea5'), tagline: 'Never stop exploring' },
  ],
  men_image: U('photo-1556705634-7754fc9519f9'),
  women_image: U('photo-1784924176852-72159d35e030'),
  story: { image: U('photo-1541534741688-6078c6bfb5c5'), title: 'Gear that *keeps up.*', text: '100% original pieces from the brands you trust, picked for training, running and everyday life. Order in a minute, pay cash on delivery, swap sizes easily on WhatsApp.', button: 'Shop all', link: '/shop' },
  ticker: 'Cash on delivery · Nike · Adidas · On · The North Face · Delivery all over Lebanon · 100% original',
};

const DEFAULT_SETTINGS = {
  store_name: 'THREADS Activewear & Lifestyle',
  currency: '$',
  delivery_fee: '4',
  free_delivery_over: '100',
  whatsapp: '96100000000',
  instagram: 'https://www.instagram.com/threadsactivewear/',
  announcement: 'Cash on delivery all over Lebanon · Free delivery on orders over $100',
  hero_image: '/brand/hero.jpg',
  welcome_popup: '1',
  require_signup: '1',
  home: JSON.stringify(DEFAULT_HOME),
  cities: 'Beirut, Mount Lebanon, Metn, Keserwan, Jbeil, Batroun, North Lebanon, Tripoli, Akkar, Bekaa, Zahle, Baalbek, South Lebanon, Saida, Tyre, Nabatieh',
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);
// First run: no password in the code. Use ADMIN_PASSWORD if the host sets one, otherwise create a random one
// and write it to data/ADMIN_PASSWORD.txt (and the server log) so the owner can sign in and change it.
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'admin_password'").get()) {
  const first = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(6).toString('base64url');
  insSetting.run('admin_password', first);
  if (!process.env.ADMIN_PASSWORD) {
    fs.writeFileSync(path.join(DATA_DIR, 'ADMIN_PASSWORD.txt'), first + '\n');
    console.log(`\n  Admin password created: ${first}\n  (also saved in ${path.join(DATA_DIR, 'ADMIN_PASSWORD.txt')}; change it in Admin > Settings)\n`);
  }
}
if (process.env.ADMIN_PASSWORD) {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password'").run(process.env.ADMIN_PASSWORD);
}

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';
}
function uniqueSlug(base, ignoreId) {
  let slug = slugify(base), n = 1;
  while (true) {
    const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
    if (!row || row.id === ignoreId) return slug;
    slug = `${slugify(base)}-${++n}`;
  }
}

function rowToProduct(r) {
  if (!r) return null;
  const sizes = JSON.parse(r.sizes || '[]');
  return {
    ...r,
    sizes,
    images: JSON.parse(r.images || '[]'),
    featured: !!r.featured,
    active: !!r.active,
    stock: sizes.reduce((a, s) => a + (Number(s.stock) || 0), 0),
  };
}

// Starter catalogue built from the store's own product photos (public/products) — edit or delete from the admin.
const count = db.prepare('SELECT COUNT(*) c FROM products').get().c;
if (count === 0) {
  const P = f => `/products/${f}.webp`;
  const women = 'XS:3,S:6,M:6,L:4';
  const shortsDesc = `Two-in-one running shorts with a lightweight woven outer and a supportive inner layer, so nothing rides up mid-run.

• Breathable, quick-dry fabric
• Wide elastic waistband
• Side splits for free movement
• Reflective details for early or late runs`;
  const demo = [
    ['ON-SHT-OLV', 'Running Shorts 2-in-1', 'On', 'Shorts', 'Women', 'Olive', '#5d6450', 55, null, women, [P('on-shorts-olive')], 1, shortsDesc],
    ['ON-SHT-BLS', 'Running Shorts 2-in-1', 'On', 'Shorts', 'Women', 'Blush', '#d79b8f', 55, null, women, [P('on-shorts-blush'), P('on-shorts-blush-cream-pair')], 1, shortsDesc],
    ['ON-SHT-CRM', 'Running Shorts 2-in-1', 'On', 'Shorts', 'Women', 'Cream', '#efeae0', 55, null, women, [P('on-shorts-cream'), P('on-shorts-blush-cream-pair')], 0, shortsDesc],
    ['ON-SHT-BLK', 'Running Shorts 2-in-1', 'On', 'Shorts', 'Women', 'Black', '#16161a', 55, null, women, [P('on-shorts-black'), P('on-shorts-black-plum-pair')], 0, shortsDesc],
    ['ON-SHT-PLM', 'Running Shorts 2-in-1', 'On', 'Shorts', 'Women', 'Plum', '#5a4a52', 55, 45, women, [P('on-shorts-plum'), P('on-shorts-black-plum-pair')], 0, shortsDesc],
    ['ON-SET-CRL', 'Windbreaker Tracksuit', 'On', 'Tracksuits', 'Women', 'Coral / Black', '#d9473a', 130, 110, 'XS:2,S:4,M:4,L:2',
      [P('on-windbreaker-coral'), P('on-windbreaker-coral-d1'), P('on-windbreaker-coral-d2'), P('on-windbreaker-coral-d3'), P('on-windbreaker-coral-d4')], 1,
      `Matching set: a light hooded windbreaker with adjustable toggles and elastic cuffs, plus straight-leg track pants with a drawcord waist.

• Water-resistant shell
• Zip pockets
• Packable and breathable`],
    ['NK-SET-WHT', 'Windrunner Tracksuit', 'Nike', 'Tracksuits', 'Women', 'White / Black', '#f4f4f2', 120, null, 'XS:2,S:4,M:5,L:3',
      [P('nike-windrunner-set'), P('nike-windrunner-set-d1')], 1,
      `A clean white Windrunner jacket with an adjustable hood and zip pockets, paired with tapered black woven pants.

• Lightweight woven fabric
• Elastic cuffs and hem
• Everyday and training fit`],
    ['TNF-SET-LAV', 'Hooded Tracksuit', 'The North Face', 'Tracksuits', 'Women', 'Lavender / Black', '#a8a3f0', 140, null, 'XS:2,S:3,M:4,L:2',
      [P('tnf-tracksuit-lavender'), P('tnf-tracksuit-lavender-d1'), P('tnf-tracksuit-lavender-d2'), P('tnf-tracksuit-lavender-d3'), P('tnf-tracksuit-lavender-d4')], 1,
      `Printed lavender hoodie with a colour-blocked black body, plus slim joggers with an elastic waist and cuffed ankles.

• Soft brushed-back fabric
• Zip hand pockets
• Ribbed cuffs`],
  ];
  const ins = db.prepare(`INSERT INTO products (sku, name, slug, brand, category, gender, color, swatch, description, price, sale_price, sizes, images, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [sku, name, brand, cat, gender, color, swatch, price, sale, sizes, imgs, feat, desc] of demo) {
    const sz = sizes.split(',').map(p => { const [size, stock] = p.split(':'); return { size, stock: Number(stock) }; });
    ins.run(sku, name, uniqueSlug(`${name} ${color}`), brand, cat, gender, color, swatch, desc, price, sale, JSON.stringify(sz), JSON.stringify(imgs), feat);
  }
}

{
  const fill = db.prepare("UPDATE products SET cutout = ? WHERE sku = ? AND (cutout IS NULL OR cutout = '')");
  for (const [sku, url] of Object.entries(STARTER_CUTOUTS)) fill.run(url, sku);
}

module.exports = { DEFAULT_HOME, db, DATA_DIR, UPLOAD_DIR, getSettings, setSetting, slugify, uniqueSlug, rowToProduct };
