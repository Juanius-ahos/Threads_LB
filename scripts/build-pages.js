// Builds the storefront as static files for GitHub Pages.
//   node scripts/build-pages.js <out-dir> [repo-name]
// Products and settings are exported from the local database, so run it after editing products in the admin.
// On Pages, checkout sends the order to the shop's WhatsApp; the admin panel needs the real server.
const fs = require('fs');
const path = require('path');
const { db, getSettings, rowToProduct } = require('../src/db');

const out = path.resolve(process.argv[2] || 'dist');
// repo name without slashes (Git Bash rewrites arguments that start with "/")
const base = '/' + (process.argv[3] || 'Threads_LB').replace(/^.*[\\/]/, '').replace(/\/$/, '');
const pub = path.join(__dirname, '..', 'public');
const PUBLIC_KEYS = ['store_name', 'currency', 'delivery_fee', 'free_delivery_over', 'whatsapp', 'instagram', 'announcement', 'store_address', 'store_hours', 'welcome_popup', 'require_signup', 'cities', 'home'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(pub, out, { recursive: true, filter: src => !src.startsWith(path.join(pub, 'admin')) });

// root-absolute asset paths become relative to <base href>
const relative = text => text.replace(/(["'`(])\/(brand|products|campaign|instore|models|css|js|uploads)\//g, '$1$2/');

const html = relative(fs.readFileSync(path.join(pub, 'index.html'), 'utf8'))
  .replace('<head>', `<head>\n  <base href="${base}/">\n  <meta name="th-base" content="${base}">\n  <meta name="th-static" content="1">`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '404.html'), html);          // deep links like /shop open the app too
fs.writeFileSync(path.join(out, '.nojekyll'), '');
for (const js of ['store.js', 'home-defaults.js']) fs.writeFileSync(path.join(out, 'js', js), relative(fs.readFileSync(path.join(pub, 'js', js), 'utf8')));

// uploaded photos (from the admin) travel with the build
const uploads = path.join(require('../src/db').DATA_DIR, 'uploads');
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(out, 'uploads'), { recursive: true });

const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, created_at DESC, id DESC').all()
  .map(rowToProduct).map(p => ({ ...p, images: p.images.map(u => u.startsWith('/') ? u.slice(1) : u), cutout: (p.cutout || '').replace(/^\//, '') }));
const s = getSettings();
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.writeFileSync(path.join(out, 'data', 'products.json'), JSON.stringify(products));
// photos uploaded in the admin are stored as /uploads/...; on Pages they live next to the page
const pub2 = Object.fromEntries(PUBLIC_KEYS.map(k => [k, s[k]]));
if (pub2.home) pub2.home = pub2.home.replace(/"\/(brand|products|campaign|instore|uploads)\//g, '"$1/');
fs.writeFileSync(path.join(out, 'data', 'settings.json'), JSON.stringify(pub2));
console.log(`Built ${products.length} products into ${out} for ${base}/`);
