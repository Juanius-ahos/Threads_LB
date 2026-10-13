const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'SKU', key: 'sku', width: 16, note: 'Unique code. Same SKU = update the existing product.' },
  { header: 'Name', key: 'name', width: 32 },
  { header: 'Brand', key: 'brand', width: 16 },
  { header: 'Category', key: 'category', width: 16, note: 'e.g. T-Shirts, Shorts, Leggings, Hoodies, Jackets, Sports Bras, Shoes, Accessories' },
  { header: 'Gender', key: 'gender', width: 10, note: 'Men, Women or Unisex' },
  { header: 'Color', key: 'color', width: 14 },
  { header: 'Price', key: 'price', width: 10 },
  { header: 'Sale Price', key: 'sale_price', width: 11, note: 'Optional. Leave empty if not on sale.' },
  { header: 'Sizes', key: 'sizes', width: 26, note: 'Size:Stock separated by commas, e.g.  S:5, M:10, L:3' },
  { header: 'Description', key: 'description', width: 40 },
  { header: 'Image URLs', key: 'images', width: 30, note: 'Optional. Links separated by commas. Or upload photos named by SKU in the admin.' },
  { header: 'Featured', key: 'featured', width: 10, note: 'yes / no — shows on the homepage' },
  { header: 'Active', key: 'active', width: 9, note: 'yes / no — hidden from the shop when no' },
];

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text) return String(v.text);
    if (v.hyperlink) return String(v.hyperlink);
    if (v.result != null) return String(v.result);
  }
  return String(v).trim();
}
const yes = v => /^(y|yes|true|1|x|✓)$/i.test(String(v).trim());

function parseSizes(s) {
  const out = [];
  for (const part of String(s || '').split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(.+?)\s*[:=x×-]\s*(\d+)$/i);
    if (m) out.push({ size: m[1].trim().toUpperCase() === 'ONE SIZE' ? 'One Size' : m[1].trim().toUpperCase(), stock: Number(m[2]) });
    else out.push({ size: p.toUpperCase(), stock: 0 });
  }
  return out;
}
function sizesToText(sizes) { return sizes.map(s => `${s.size}:${s.stock}`).join(', '); }

async function readRows(buffer, filename) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    const { Readable } = require('stream');
    await wb.csv.read(Readable.from(buffer));
  } else {
    await wb.xlsx.load(buffer);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheets.');
  // Find header row (first row containing "sku" or "name")
  let headerRow = 1;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const vals = ws.getRow(r).values.map(v => cellText(v).toLowerCase());
    if (vals.includes('sku') || vals.includes('name')) { headerRow = r; break; }
  }
  const map = {};
  ws.getRow(headerRow).eachCell((cell, col) => {
    const h = cellText(cell.value).toLowerCase().replace(/[^a-z]/g, '');
    const found = COLUMNS.find(c => c.header.toLowerCase().replace(/[^a-z]/g, '') === h)
      || (h === 'saleprice' || h === 'sale' ? COLUMNS.find(c => c.key === 'sale_price') : null)
      || (h.startsWith('image') ? COLUMNS.find(c => c.key === 'images') : null)
      || (h === 'stock' || h === 'size' ? COLUMNS.find(c => c.key === 'sizes') : null);
    if (found) map[col] = found.key;
  });
  if (!Object.values(map).includes('name')) throw new Error('Could not find a "Name" column. Download the template to see the expected format.');

  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => { if (map[col]) obj[map[col]] = cellText(cell.value); });
    if (!obj.name && !obj.sku) continue;
    const errors = [];
    const price = Number(String(obj.price || '').replace(/[^0-9.]/g, ''));
    const sale = obj.sale_price ? Number(String(obj.sale_price).replace(/[^0-9.]/g, '')) : null;
    if (!obj.name) errors.push('Missing name');
    if (!price) errors.push('Missing or invalid price');
    const gender = /^w|female|lad/i.test(obj.gender || '') ? 'Women' : /^m|male/i.test(obj.gender || '') ? 'Men' : 'Unisex';
    rows.push({
      line: r,
      sku: (obj.sku || '').toUpperCase(),
      name: obj.name || '',
      brand: obj.brand || '',
      category: obj.category || '',
      gender,
      color: obj.color || '',
      price: price || 0,
      sale_price: sale && sale < price ? sale : null,
      sizes: parseSizes(obj.sizes),
      description: obj.description || '',
      image_urls: String(obj.images || '').split(/[,\s]+/).filter(u => /^https?:\/\//i.test(u)),
      featured: obj.featured ? yes(obj.featured) : false,
      active: obj.active ? yes(obj.active) : true,
      errors,
    });
  }
  return rows;
}

function styleHeader(ws) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1D20' } };
  h.height = 22;
  h.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function productsWorkbook(products) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws);
  COLUMNS.forEach((c, i) => { if (c.note) ws.getRow(1).getCell(i + 1).note = c.note; });
  for (const p of products) {
    ws.addRow({
      ...p,
      sale_price: p.sale_price ?? '',
      sizes: sizesToText(p.sizes),
      images: p.images.filter(u => /^https?:/.test(u)).join(', '),
      featured: p.featured ? 'yes' : 'no',
      active: p.active ? 'yes' : 'no',
    });
  }
  if (!products.length) {
    ws.addRow({ sku: 'NK-TEE-100', name: 'Dri-FIT Training Tee', brand: 'Nike', category: 'T-Shirts', gender: 'Men', color: 'Black', price: 35, sale_price: '', sizes: 'S:5, M:10, L:8, XL:3', description: 'Lightweight training tee.', images: '', featured: 'yes', active: 'yes' });
    ws.addRow({ sku: 'ON-LEG-101', name: 'Movement Tights', brand: 'On', category: 'Leggings', gender: 'Women', color: 'Sage', price: 85, sale_price: 70, sizes: 'XS:2, S:5, M:5, L:2', description: '', images: '', featured: 'no', active: 'yes' });
  }
  const help = wb.addWorksheet('How to use');
  help.columns = [{ width: 18 }, { width: 90 }];
  help.addRow(['THREADS — product import guide']).font = { bold: true, size: 14 };
  help.addRow([]);
  for (const c of COLUMNS) help.addRow([c.header, c.note || '']);
  help.addRow([]);
  help.addRow(['Photos', 'Easiest way: in the admin go to Import → "Bulk photos" and drop photos named after the SKU, e.g. NK-TEE-100.jpg, NK-TEE-100-2.jpg']);
  return wb;
}

async function ordersWorkbook(orders) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orders');
  ws.columns = [
    { header: 'Order', key: 'number', width: 11 }, { header: 'Date', key: 'created_at', width: 18 },
    { header: 'Status', key: 'status', width: 11 }, { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 }, { header: 'City', key: 'city', width: 16 },
    { header: 'Address', key: 'address', width: 36 }, { header: 'Items', key: 'items', width: 50 },
    { header: 'Subtotal', key: 'subtotal', width: 10 }, { header: 'Delivery', key: 'delivery_fee', width: 9 },
    { header: 'Total', key: 'total', width: 10 }, { header: 'Notes', key: 'notes', width: 30 },
  ];
  styleHeader(ws);
  for (const o of orders) {
    ws.addRow({ ...o, items: o.items.map(i => `${i.qty}× ${i.name} (${i.size})`).join('; ') });
  }
  return wb;
}

async function subscribersWorkbook(subs) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Community');
  ws.columns = [
    { header: 'First name', key: 'first_name', width: 16 }, { header: 'Family name', key: 'last_name', width: 16 },
    { header: 'Email', key: 'email', width: 28 }, { header: 'Country', key: 'country', width: 16 },
    { header: 'Phone', key: 'phone', width: 18 }, { header: 'Marketing OK', key: 'marketing', width: 13 },
    { header: 'Joined', key: 'created_at', width: 18 },
  ];
  styleHeader(ws);
  for (const s of subs) ws.addRow({ ...s, marketing: s.marketing ? 'yes' : 'no' });
  return wb;
}

module.exports = { readRows, productsWorkbook, ordersWorkbook, subscribersWorkbook, parseSizes };
