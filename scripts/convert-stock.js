// Turns the shop's own stock sheet (Code Threads | CODE # | Items | Color | Units | Prices | Sizes)
// into the admin's product import file, plus a "Check these" sheet listing anything that needs a human.
//   node scripts/convert-stock.js "<stock.xlsx>" "<out.xlsx>"
const ExcelJS = require('exceljs');
const { readRows } = require('../src/excel');

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node scripts/convert-stock.js <stock.xlsx> <out.xlsx>'); process.exit(1); }

const text = v => v == null ? '' : typeof v === 'object' ? String(v.result ?? v.text ?? '') : String(v).trim();
const title = s => s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bT-shirts?\b/gi, m => m.replace(/^t/i, 'T').replace('-s', '-S'));

const BRANDS = [
  [/\bthe north face\b/i, 'The North Face'], [/\b(nike|nk)\b/i, 'Nike'], [/\badidas\b/i, 'Adidas'],
  [/\bunder armour\b/i, 'Under Armour'], [/\balo\b/i, 'Alo'], [/\boysho\b/i, 'Oysho'], [/\boc\b/i, 'OC'],
];
const CATEGORIES = [
  [/sock|towel|bottle/i, 'Accessories'], [/\bset\b|\bsuit\b/i, 'Sets'], [/double face/i, 'Jackets'],
  [/legging/i, 'Leggings'], [/short|cyclist/i, 'Shorts'], [/\bpants?\b/i, 'Pants'],
  [/t-?shirt|shirt|sleeve|polo|crop|felpa|zip|compression/i, 'Tops'],
];
const SIZE = /^(XS|S|M|L|XL|[2-5]XL)$/;

// "M / L / 3 XL" or "2L / 4XL / 3 2XL" -> [{size, stock}] adding up to `units` where the sheet says how
function sizes(raw, units) {
  const toks = raw.split(/\s*\/\s*/).map(t => t.trim().toUpperCase()).filter(Boolean);
  if (!toks.length) return null;
  // each token reads as a size, or as "<count> <size>"; "3 XL" could be either, so try both
  const reads = toks.map(t => {
    const opts = [];
    const flat = t.replace(/\s+/g, '');
    if (SIZE.test(flat)) opts.push({ size: flat, n: null });
    const m = t.match(/^(\d+)\s*(.+)$/);
    if (m && SIZE.test(m[2].replace(/\s+/g, ''))) opts.push({ size: m[2].replace(/\s+/g, ''), n: +m[1] });
    return opts;
  });
  if (reads.some(r => !r.length)) return null;
  const combos = reads.reduce((acc, r) => acc.flatMap(a => r.map(o => [...a, o])), [[]]);
  const fill = c => {
    const fixed = c.reduce((s, o) => s + (o.n || 0), 0), free = c.filter(o => o.n == null);
    let left = units - fixed;
    if (left < 0 || (!free.length && left)) return null;
    if (new Set(c.map(o => o.size)).size !== c.length) return null;
    const each = free.length ? Math.floor(left / free.length) : 0; let extra = free.length ? left % free.length : 0;
    // leftover pieces go to the middle of the run, where most people are
    const mid = free.map((o, i) => [Math.abs(i - (free.length - 1) / 2), o]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const add = new Map(); mid.forEach(o => { add.set(o, each + (extra-- > 0 ? 1 : 0)); });
    return c.map(o => ({ size: o.size, stock: o.n ?? add.get(o) }));
  };
  // when the sheet writes counts ("3S", "2 XL"), a bare size means one piece: prefer the reading where that holds,
  // otherwise read every token as a size and spread the units over them
  const ok = combos.map(c => [c, fill(c)]).filter(([, r]) => r);
  const counted = ok.find(([c, r]) => c.some(o => o.n != null) && r.every((x, i) => c[i].n != null || x.stock === 1));
  if (counted) return counted[1];
  ok.sort((a, b) => a[0].filter(o => o.n != null).length - b[0].filter(o => o.n != null).length);
  return ok.length ? ok[0][1] : null;
}

(async () => {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(src);
  const ws = wb.worksheets[0];
  const products = [], notes = [];
  const note = (row, item, msg) => notes.push({ row, item, msg });

  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    const [no, code, item, color, units, price, sz] = [1, 2, 3, 4, 5, 6, 7].map(i => text(row.getCell(i).value));
    if (!item) { if (no || code) note(r, code || no, 'Only a code, no item name, units or price: skipped'); return; }
    const brand = (BRANDS.find(([re]) => re.test(item)) || [, 'Threads'])[1];
    const category = (CATEGORIES.find(([re]) => re.test(item)) || [, 'Tops'])[1];
    const qty = Number(units) || 0;
    let gender = /\bwom[ae]n|ladies|crop|oysho/i.test(item) ? 'Women' : /\bm[ae]n\b/i.test(item) ? 'Men' : 'Unisex';

    let name = item.replace(/\bNk\b/i, 'Nike').replace(/\s+/g, ' ').trim();
    let list = null, active = true;
    if (category === 'Accessories') {
      // for socks the Sizes column holds who they're for; for the towel the lengths; for the bottle its volume
      if (/^men$/i.test(sz)) gender = 'Men'; else if (/^women$/i.test(sz)) gender = 'Women';
      if (/&/.test(sz)) { const parts = sz.split('&').map(s => title(s.trim())); list = parts.map((p, i) => ({ size: p, stock: Math.floor(qty / parts.length) + (i < qty % parts.length ? 1 : 0) })); }
      else { if (/ml$/i.test(sz)) name += ` ${sz.toLowerCase()}`; list = [{ size: 'One Size', stock: qty }]; }
    } else if (sz) {
      list = sizes(sz, qty);
      if (!list) { note(r, item, `Couldn't read the sizes "${sz}" for ${qty} units: imported hidden, set the sizes in the admin`); active = false; }
      else if (list.reduce((s, x) => s + x.stock, 0) !== qty) note(r, item, `Sizes "${sz}" don't add up to ${qty} units`);
      else if (/\d/.test(sz.replace(/\d?XL/gi, ''))) note(r, item, `Read "${sz}" as ${list.map(x => `${x.stock}×${x.size}`).join(', ')}: please check`);
    } else {
      note(r, item, `No sizes on the sheet (${qty} units): imported hidden, add the sizes in the admin to put it on sale`);
      active = false;
    }
    if (!list) list = [{ size: 'One Size', stock: qty }];
    // no gender in the name: leggings and Alo are women's; a run that starts at M and goes past XL is men's
    if (gender === 'Unisex' && category !== 'Accessories') {
      if (category === 'Leggings' || brand === 'Alo') gender = 'Women';
      else if (sz && !/\b(XS|S)\b/i.test(sz.replace(/\d\s*S\b/i, ' S')) && /[2-5]\s*XL/i.test(sz)) gender = 'Men';
    }
    if (brand === 'Oysho' && code && !code.toUpperCase().includes(color.toUpperCase().slice(0, 3))) note(r, item, `Code "${code}" and colour "${color}" don't seem to match (row may be shifted): check name, colour and price`);

    products.push({
      sku: `TH-${no}`, name: title(name).replace(/\bOc\b/g, 'OC').replace(/\b(\d)Xl\b/g, '$1XL').replace(/650Ml/, '650ml'),
      brand, category, gender, color: color ? title(color) : '',
      price: Number(price.replace(/[^0-9.]/g, '')) || '', sizes: list.map(s => `${s.size}:${s.stock}`).join(', '),
      description: code ? `Ref ${code}` : '', featured: 'no', active: active ? 'yes' : 'no',
    });
  });

  // the same item in several colours at prices that climb by $1 a row: usually an Excel drag-fill slip
  for (let i = 1; i < products.length; i++) {
    const g = [products[i - 1]]; while (i < products.length && products[i].name === g[0].name && products[i].price === g[g.length - 1].price + 1) g.push(products[i++]);
    if (g.length > 2) note(g.map(p => p.sku).join(', '), g[0].name, `Prices go ${g.map(p => '$' + p.price).join(', ')} across colours: drag-fill slip? set the right price`);
  }

  // codes that appear more than once on the sheet
  const seen = {};
  ws.eachRow((row, r) => { const c = text(row.getCell(2).value); if (r > 1 && c && text(row.getCell(3).value)) (seen[c] = seen[c] || []).push(r); });
  for (const [c, rs] of Object.entries(seen)) if (rs.length > 1) note(rs.join(', '), c, `Same CODE # on ${rs.length} different items: check the codes`);

  // write it in the admin's import format
  const outWb = new ExcelJS.Workbook();
  const ps = outWb.addWorksheet('Products');
  ps.columns = ['SKU', 'Name', 'Brand', 'Category', 'Gender', 'Color', 'Price', 'Sale Price', 'Sizes', 'Description', 'Image URLs', 'Featured', 'Active']
    .map(h => ({ header: h, key: h === 'Sale Price' ? 'sale_price' : h === 'Image URLs' ? 'images' : h.toLowerCase(), width: { Name: 34, Sizes: 34, Description: 18, Brand: 15, Category: 13 }[h] || 11 }));
  products.forEach(p => ps.addRow(p));
  const cn = outWb.addWorksheet('Check these');
  cn.columns = [{ header: 'Sheet row', key: 'row', width: 10 }, { header: 'Item / code', key: 'item', width: 34 }, { header: 'What to check', key: 'msg', width: 90 }];
  notes.forEach(n => cn.addRow(n));
  for (const s of [ps, cn]) {
    const h = s.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1D20' } }; s.views = [{ state: 'frozen', ySplit: 1 }];
  }
  await outWb.xlsx.writeFile(out);

  // read it back through the real importer, so what the admin will see is what we checked
  const rows = await readRows(await outWb.xlsx.writeBuffer(), out);
  const bad = rows.filter(r => r.errors.length);
  console.log(`${products.length} products (${products.filter(p => p.active === 'yes').length} on sale, ${products.filter(p => p.active === 'no').length} hidden), ${notes.length} notes, importer errors: ${bad.length}`);
  bad.forEach(r => console.log('  line', r.line, r.errors.join('; ')));
})();
