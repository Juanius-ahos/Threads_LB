// Reads .env (KEY=value lines) into process.env for scripts run on this computer. The live site gets them from Vercel.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
