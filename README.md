# THREADS — Activewear & Lifestyle store

Online store with **cash on delivery** checkout and an admin panel.

- **Store:** `http://localhost:3000`
- **Admin:** `http://localhost:3000/admin`. On first start the server creates a random admin password, prints it in the log and saves it in `data/ADMIN_PASSWORD.txt`. Or set the `ADMIN_PASSWORD` environment variable to choose it. **Change it in Settings on day one.**

## Run it on a computer

1. Install Node.js 20 or newer (https://nodejs.org).
2. Double-click `start-windows.bat`, or run:

```
npm install
npm start
```

## What the owner can do in the admin

| Page | What it does |
|---|---|
| **Home** | New orders waiting, sales chart, low-stock warnings |
| **Orders** | Every COD order. Tap one to: confirm on WhatsApp with a pre-written message, call, set status (Pending → Confirmed → Shipped → Delivered / Cancelled), print a slip for the driver. Cancelling puts the stock back. Export to Excel. |
| **Products** | Add or edit products: drag & drop photos straight from the phone (resized automatically), sizes + stock, sale price, hide/show, feature on the homepage (featured pieces lead "New in"). Add a **3D cutout** (a PNG of the piece on a transparent background) and the piece stands on the homepage's 3D stand and gets a 3D view on its page. |
| **Site texts** | Every other word on the site (menu, section titles, product page, bag, checkout, popup, footer, privacy) and the logo. Grey text shows the current wording; type over it to change it, clear it to go back. |
| **Homepage** | The words and photos on the front page: the hero headline, label and buttons, the two campaign banners, brand and Women/Men photos, and the green ticker. Empty photos fall back to the brand campaign photos in `public/campaign/`. Wrap a word in `*stars*` to make it green. |
| **Excel import** | Download the template, fill one row per product (`Sizes` column like `S:5, M:10, L:3`), upload, preview, import. Same SKU updates the existing product. **Bulk photos:** name photos after the SKU (`NK-TEE-001.jpg`, `NK-TEE-001-2.jpg`) and drop them all at once. |
| **Community** | People who signed up through the "Your next favorite fit" popup. Export to Excel. |
| **Settings** | Delivery fee, free delivery threshold, delivery areas, WhatsApp number, announcement bar, welcome popup on/off, password |

Stock goes down automatically with each order. Sold-out sizes are crossed out in the store.

The store starts with **8 products made from the shop's own photos** (On shorts in 5 colours, On / Nike / The North Face tracksuits). **Prices and stock are placeholders, so check them.** Products with the same brand + name are grouped as colour options of one product.

**About the campaign photos:** the homepage uses brand campaign photography (Nike, adidas and On press rooms; The North Face from Unsplash), which THREADS has permission to use. Sources are listed in `public/campaign/SOURCES.md`. Upload your own in **Homepage** to replace any of them.

## Free version on GitHub Pages

The storefront also runs as plain files on GitHub Pages (no server): <https://juanius-ahos.github.io/Threads_LB/>

- Checkout opens WhatsApp with the full order (items, sizes, total, name, phone, address) addressed to the shop's number, and the customer presses send.
- Products and prices come from the local database at build time. After changing products in the admin, rebuild and push:

```
npm run build:pages
```

then publish the `dist` folder to the `gh-pages` branch. The admin panel, stock tracking and the sign-up list need the full server below.

## Put it online (free): Vercel + Supabase

The live site runs on **Vercel** (pages + API) with its data in **Supabase** (Postgres database + photo storage). Both have free plans.

1. **Supabase** → New project. From Project Settings copy the Project URL, the `service_role` key and the *Transaction pooler* connection string.
2. **Vercel** → Add New → Project → import this GitHub repo. Under Environment Variables add:
   - `DATABASE_URL`: the pooler connection string (with the database password in it)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `ADMIN_PASSWORD`: the admin password (change it here, not in the admin)
   - `SESSION_SECRET`: any long random text
3. Deploy. The first request creates the tables and the starter products. Every push to `main` deploys again.
4. Vercel → Project → Settings → Domains → add your domain and copy the DNS records it shows into your domain registrar.

Load products from an Excel file straight into the live database (put the four variables in a `.env` file first, it is never committed):

```
node scripts/import-file.js "products.xlsx"
```

`scripts/convert-stock.js` turns the shop's own stock sheet (Code / Items / Color / Units / Prices / Sizes) into that format.

**Running on a computer** needs no database: without `DATABASE_URL` the store keeps everything in `data/` (an embedded Postgres in `data/pg` and photos in `data/uploads`).

**Backups:** Supabase keeps daily backups on paid plans only; export products and orders to Excel from the admin from time to time.

## Files

```
server.js          API + pages (Vercel runs it as an Express service, see vercel.json)
src/db.js          Postgres (Supabase, or embedded in data/pg), settings, demo products
src/media.js       uploaded photos: Supabase Storage, or data/uploads
src/excel.js       Excel import/export
public/            storefront (index.html, css/, js/) and brand images
public/admin/      admin panel
public/js/site-texts.js   every editable word on the site and its original wording
data/              local only: pg/ database + uploads/ (don't delete!)
```
