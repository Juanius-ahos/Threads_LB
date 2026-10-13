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
| **Products** | Add or edit products: drag & drop photos straight from the phone (resized automatically), sizes + stock, sale price, hide/show, feature on the homepage |
| **Homepage** | Change every photo and headline on the front page: hero slides (add, remove, reorder), brand tiles, Women/Men photos, the story section and the green ticker. Upload a photo or paste an image link. Wrap a word in `*stars*` to make it green. |
| **Excel import** | Download the template, fill one row per product (`Sizes` column like `S:5, M:10, L:3`), upload, preview, import. Same SKU updates the existing product. **Bulk photos:** name photos after the SKU (`NK-TEE-001.jpg`, `NK-TEE-001-2.jpg`) and drop them all at once. |
| **Community** | People who signed up through the "Your next favorite fit" popup. Export to Excel. |
| **Settings** | Delivery fee, free delivery threshold, delivery areas, WhatsApp number, announcement bar, welcome popup on/off, password |

Stock goes down automatically with each order. Sold-out sizes are crossed out in the store.

The store starts with **8 products made from the shop's own photos** (On shorts in 5 colours, On / Nike / The North Face tracksuits). **Prices and stock are placeholders, so check them.** Products with the same brand + name are grouped as colour options of one product.

**About the lifestyle photos:** the homepage photos are from [Unsplash](https://unsplash.com/license), which is free for commercial use, loaded straight from Unsplash's CDN. They are *not* official Nike/Adidas/On/TNF campaign images, because those are copyrighted. If the brands or distributors provide official marketing assets, upload them in **Homepage**.

## Put it online

It's one Node app. All data (database + uploaded photos) lives in the `data/` folder, so the host **must have a persistent disk**.

**Railway (easiest, about $5/month):**
1. Push this `site` folder to a GitHub repo.
2. On railway.app: New Project → Deploy from GitHub.
3. Add a **Volume** mounted at `/data` and set the variable `DATA_DIR=/data`.
4. Optional: set `ADMIN_PASSWORD=...`. It overrides the admin password on every start.
5. Settings → Networking → Generate domain, or connect your own domain.

The same setup works on Render (with a disk), Fly.io (with a volume) or any VPS with `npm start` behind nginx.

**Backups:** download the `data/` folder from time to time. Exporting products and orders to Excel from the admin also works as a backup.

## Files

```
server.js          API + pages
src/db.js          SQLite database, settings, demo products
src/excel.js       Excel import/export
public/            storefront (index.html, css/, js/) and brand images
public/admin/      admin panel
data/              created at runtime: store.db + uploads/ (don't delete!)
```
