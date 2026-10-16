// Loads products from an admin import file (.xlsx) straight into the database, every row visible in the shop.
//   node scripts/import-file.js "<file.xlsx>"      (uses DATABASE_URL from .env when it is set)
require('./env');
const fs = require('fs');
const excel = require('../src/excel');
const { importRows } = require('../server');

(async () => {
  const file = process.argv[2];
  const rows = await excel.readRows(fs.readFileSync(file), file);
  rows.forEach(r => { r.active = true; });
  const bad = rows.filter(r => r.errors.length);
  const out = await importRows(rows);
  console.log(`${out.created} added, ${out.updated} updated, ${bad.length} skipped${bad.length ? ': ' + bad.map(r => `row ${r.line} (${r.errors.join(', ')})`).join('; ') : ''}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
