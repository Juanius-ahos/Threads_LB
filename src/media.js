// Where uploaded photos go: Supabase Storage (bucket "media", public) on the live site,
// data/uploads on a laptop. save() returns the URL to store; remove() deletes a file we own.
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('./db');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = 'media';
const remote = !!(SB && KEY);
const PUBLIC = `${SB}/storage/v1/object/public/${BUCKET}/`;
// the newer sb_secret_ keys go in apikey only; the older service_role keys (JWTs) also as a Bearer token
const auth = KEY.startsWith('sb_') ? { apikey: KEY } : { Authorization: `Bearer ${KEY}`, apikey: KEY };

let bucket;
const ensureBucket = () => bucket ||= fetch(`${SB}/storage/v1/bucket`, {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
}).then(r => r.text()).catch(() => {});   // "already exists" is fine

async function save(name, buffer, type = 'image/webp') {
  if (!remote) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
    return `/uploads/${name}`;
  }
  await ensureBucket();
  const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': type, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' }, body: buffer,
  });
  if (!r.ok) throw new Error(`Photo upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return PUBLIC + name;
}

function remove(url) {
  if (typeof url !== 'string') return;
  if (url.startsWith('/uploads/')) fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {});
  else if (remote && url.startsWith(PUBLIC)) fetch(`${SB}/storage/v1/object/${BUCKET}/${url.slice(PUBLIC.length)}`, { method: 'DELETE', headers: auth }).catch(() => {});
}

// a photo URL we stored (local upload or our bucket), as opposed to a link typed by hand
const owned = url => typeof url === 'string' && (/^\/(uploads|products)\/[\w.-]+$/.test(url) || (remote && url.startsWith(PUBLIC) && /^[\w.-]+$/.test(url.slice(PUBLIC.length))));

module.exports = { UPLOAD_DIR, save, remove, owned, remote };
