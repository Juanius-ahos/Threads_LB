// The store's data lives in Postgres: Supabase when DATABASE_URL is set (the live site),
// otherwise an embedded Postgres in data/pg, so the shop also runs on a laptop with nothing to install.
// Write SQL with ? placeholders; q() numbers them for Postgres.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const NOW = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";   // dates stay "YYYY-MM-DD HH:MM:SS" text in UTC

const numbered = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

let ready;
function connect() {
  return ready ||= (async () => {
    let conn;
    if (process.env.DATABASE_URL) {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      conn = {
        query: (sql, params) => pool.query(sql, params),
        async tx(fn) {
          const c = await pool.connect();
          try { await c.query('BEGIN'); const r = await fn(s => c.query(s.text, s.values)); await c.query('COMMIT'); return r; }
          catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
          finally { c.release(); }
        },
      };
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const pg = new PGlite(path.join(DATA_DIR, 'pg'));
      await pg.waitReady;
      conn = {
        query: (sql, params) => pg.query(sql, params),
        tx: fn => pg.transaction(t => fn(sql => t.query(sql.text, sql.values))),
      };
    }
    await migrate(conn);
    return conn;
  })();
}

// q`...` style helpers: all(sql, ...params) → rows, get → first row, run → { rows, count }
const shape = (sql, params) => ({ text: numbered(sql), values: params });
async function all(sql, ...params) { const c = await connect(); return (await c.query(numbered(sql), params)).rows; }
async function get(sql, ...params) { return (await all(sql, ...params))[0]; }
async function run(sql, ...params) { const c = await connect(); const r = await c.query(numbered(sql), params); return { rows: r.rows, count: r.rowCount ?? r.affectedRows }; }
// several statements that must all happen or none: tx(async t => { await t.get(...); await t.run(...) })
async function tx(fn) {
  const c = await connect();
  return c.tx(exec => {
    const q = async (sql, params) => (await exec(shape(sql, params))).rows;
    return fn({ all: (s, ...p) => q(s, p), get: async (s, ...p) => (await q(s, p))[0], run: (s, ...p) => q(s, p) });
  });
}

async function migrate(c) {
  const ex = sql => c.query(sql);
  await ex(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    brand TEXT DEFAULT '',
    category TEXT DEFAULT '',
    gender TEXT DEFAULT 'Unisex',
    color TEXT DEFAULT '',
    swatch TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    sale_price DOUBLE PRECISION,
    sizes TEXT NOT NULL DEFAULT '[]',
    images TEXT NOT NULL DEFAULT '[]',
    cutout TEXT DEFAULT '',
    featured INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT ${NOW},
    updated_at TEXT DEFAULT ${NOW})`);
  await ex(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    city TEXT DEFAULT '',
    address TEXT NOT NULL,
    notes TEXT DEFAULT '',
    items TEXT NOT NULL,
    subtotal DOUBLE PRECISION NOT NULL,
    delivery_fee DOUBLE PRECISION NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    admin_note TEXT DEFAULT '',
    created_at TEXT DEFAULT ${NOW},
    updated_at TEXT DEFAULT ${NOW})`);
  await ex(`CREATE TABLE IF NOT EXISTS subscribers (
    id SERIAL PRIMARY KEY,
    first_name TEXT, last_name TEXT, email TEXT, country TEXT, phone TEXT,
    marketing INTEGER DEFAULT 0,
    created_at TEXT DEFAULT ${NOW})`);
  await ex('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  // Supabase exposes tables to its public API unless row level security is on; the store only talks to them from the server
  if (process.env.DATABASE_URL) for (const t of ['products', 'orders', 'subscribers', 'settings']) await ex(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);

  const ins = (k, v) => c.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await ins(k, v);
  // First run: no password in the code. Use ADMIN_PASSWORD if the host sets one, otherwise create a random one
  // and write it to data/ADMIN_PASSWORD.txt (and the server log) so the owner can sign in and change it.
  if (process.env.ADMIN_PASSWORD) {
    await c.query("INSERT INTO settings (key, value) VALUES ('admin_password', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [process.env.ADMIN_PASSWORD]);
  } else if (!(await c.query("SELECT 1 FROM settings WHERE key = 'admin_password'")).rows.length) {
    const first = crypto.randomBytes(6).toString('base64url');
    await ins('admin_password', first);
    try { fs.writeFileSync(path.join(DATA_DIR, 'ADMIN_PASSWORD.txt'), first + '\n'); } catch {}
    console.log(`\n  Admin password created: ${first}\n  (also saved in ${path.join(DATA_DIR, 'ADMIN_PASSWORD.txt')}; change it in Admin > Settings)\n`);
  }
  const count = Number((await c.query('SELECT COUNT(*) AS c FROM products')).rows[0].c);
  if (count === 0) await seed(c);
}

// Empty photos fall back to the campaign photography in public/campaign.
const DEFAULT_HOME = {
  slides: [
    { kicker: 'Now open in Wadi Chahrour', title: 'Move your *way.*', text: 'Original Nike, adidas, On and The North Face. Order online and pay cash at your door anywhere in Lebanon, or come try it on in store.', button: 'Shop women', link: '/shop?gender=Women', button2: 'Shop men', link2: '/shop?gender=Men' },
    { image: '', pos: 'center', kicker: 'Running', title: 'Early miles. *Light layers.*', text: 'Windbreakers and 2-in-1 shorts from Nike and On, made for the Corniche at 6 am.', button: 'Shop running', link: '/shop?category=Shorts' },
    { image: '', pos: 'center', kicker: 'The North Face', title: 'Made for the *mountains.*', text: 'Warm, weather-ready sets for cold mornings in Faraya and long days outside.', button: 'Shop The North Face', link: '/shop?brand=The%20North%20Face' },
  ],
  brands: [{ name: 'Nike', image: '' }, { name: 'Adidas', image: '' }, { name: 'On', image: '' }, { name: 'The North Face', image: '' }],
  men_image: '',
  women_image: '',
  ticker: '100% original · Cash on delivery · Delivery all over Lebanon · Now open in Wadi Chahrour · Easy size swaps on WhatsApp',
};

const DEFAULT_SETTINGS = {
  store_name: 'THREADS Activewear & Lifestyle',
  currency: '$',
  delivery_fee: '4',
  free_delivery_over: '100',
  whatsapp: '96171043048',
  instagram: 'https://www.instagram.com/threadsactivewear/',
  announcement: 'Cash on delivery all over Lebanon · Free delivery on orders over $100',
  store_address: 'Ste. Takla Centre, Wadi Chahrour El Soufla, Main Road',
  store_hours: '',
  welcome_popup: '1',
  require_signup: '1',
  home: JSON.stringify(DEFAULT_HOME),
  texts: '{}',
  cities: 'Beirut, Mount Lebanon, Metn, Keserwan, Jbeil, Batroun, North Lebanon, Tripoli, Akkar, Bekaa, Zahle, Baalbek, South Lebanon, Saida, Tyre, Nabatieh',
};

async function getSettings() {
  const out = {};
  for (const r of await all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}
async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, String(value));
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'item';
}
async function uniqueSlug(base, ignoreId, t) {
  const g = t ? t.get : get;
  let slug = slugify(base), n = 1;
  while (true) {
    const row = await g('SELECT id FROM products WHERE slug = ?', slug);
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
async function seed(c) {
  const P = f => `/products/${f}.webp`;
  const women = 'XS:3,S:6,M:6,L:4';
  const shortsDesc = `Two-in-one running shorts with a lightweight woven outer and a supportive inner layer, so nothing rides up mid-run.

• Breathable, quick-dry fabric
• Wide elastic waistband
• Side splits for free movement
• Reflective details for early or late runs`;
  const CUT = { 'TNF-SET-LAV': '/products/cut-tnf.webp', 'ON-SET-CRL': '/products/cut-on.webp', 'ON-SHT-BLK': '/products/cut-shorts-black.webp', 'ON-SHT-OLV': '/products/cut-shorts-olive.webp', 'ON-SHT-PLM': '/products/cut-shorts-plum.webp' };
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
  for (const [sku, name, brand, cat, gender, color, swatch, price, sale, sizes, imgs, feat, desc] of demo) {
    const sz = sizes.split(',').map(p => { const [size, stock] = p.split(':'); return { size, stock: Number(stock) }; });
    await c.query(`INSERT INTO products (sku, name, slug, brand, category, gender, color, swatch, description, price, sale_price, sizes, images, cutout, featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [sku, name, slugify(`${name} ${color}`), brand, cat, gender, color, swatch, desc, price, sale, JSON.stringify(sz), JSON.stringify(imgs), CUT[sku] || '', feat]);
  }
}

module.exports = { DEFAULT_HOME, DATA_DIR, NOW, connect, all, get, run, tx, getSettings, setSetting, slugify, uniqueSlug, rowToProduct };
