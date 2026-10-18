# SariStocks

**Business Management and Sales Inventory System for sari-sari stores** — a local, single-store POS and inventory tool with role-based access control, an interactive dashboard, QR/barcode scanning via phone camera, and automated low-stock alerts.

The academic centerpiece of this project is the **from-scratch data structures & algorithms layer** (see `docs/SPEC.md` for the full specification).

---

## Quick start

Requires **Node.js 20+**.

```bash
npm install     # installs dependencies + copies the frontend vendor libraries
npm start       # runs at http://localhost:3000
```

Open **http://localhost:3000** and log in:

| Role    | Username | Password     | Can do                                              |
| ------- | -------- | ------------ | --------------------------------------------------- |
| Admin   | `admin`  | `admin123`   | Everything, incl. users, settings, backup           |
| Manager | `maria`  | `manager123` | Dashboard, inventory, reports, alerts               |
| Cashier | `ana`    | `cashier123` | POS: search, add, checkout, receipts                 |

> On first run the server auto-seeds a demo dataset: 8 categories, 59 products, ~14 days of sales history, and stock movements — including a few items that are intentionally low on stock so the alerts and dashboard have content.

## Features

- **Role-based access control** — hierarchical roles (cashier < manager < admin), enforced on every API endpoint.
- **Interactive dashboard** — today's KPIs, 14-day revenue trend, best-seller ranking, and the live alert list.
- **Searchable POS catalog** — filter products by name or code, set a quantity, and add in one click; out-of-stock items are disabled.
- **QR / barcode scanning** — scan a product's QR label or barcode (webcam or phone camera) to pull up its **item information** — price, unit, stock on hand, minimum stock, and status; plus a **printable QR label sheet** for products without manufacturer barcodes.
- **POS with undo/redo** — the cart lives on the server (linked list + hash map) with a two-stack undo/redo history that treats a multi-unit add as one action; check out with stock validation, tendered amount, and change.
- **Automated low-stock alerts** — created/refreshed by sales and restocks, ordered by urgency (out-of-stock first), auto-resolved when stock recovers.
- **Receipts** — printable receipts and a **FIFO print queue** for queued reprints.
- **Reports** — daily sales, best sellers, inventory value, and the stock-movement audit trail; each exportable to **CSV**, printable to PDF.
- **Admin** — user management (create / edit / deactivate / reset password), store settings, and a full **JSON backup** download.

## Data structures (where they live)

| Structure            | File                             | Used for                                                    |
| -------------------- | -------------------------------- | ----------------------------------------------------------- |
| Hash table           | `server/lib/hashTable.js`        | Product lookup by code, users by username, cart line index  |
| Doubly linked list   | `server/lib/linkedList.js`       | Cart lines (O(1) append / remove / update via node refs)    |
| Stack ×2             | `server/lib/stack.js`            | Cart undo / redo                                            |
| Queue                | `server/lib/queue.js`            | Receipt print jobs (FIFO)                                   |
| Min-heap             | `server/lib/minHeap.js`          | Low-stock alert priority, bounded top-N best sellers        |
| Merge / quick sort   | `server/lib/sorting.js`          | Product sorting, report ranking, transaction logs           |
| Hash table + set     | `server/data/store.js` (indexes) | O(1) validation of unique product codes                     |

## Project structure

```
SariStocks/
├── server/
│   ├── index.js            # Express app entry point
│   ├── seed.js             # Demo-data reset script
│   ├── lib/                # Data structures + helpers (hash table, heap, stacks…)
│   ├── data/               # Store layer, JSON persistence, seed dataset
│   ├── middleware/         # Auth + RBAC middleware
│   └── routes/             # REST route modules
├── public/                 # Frontend — HTML + CSS + vanilla JS modules
│   ├── login.html · pos.html · inventory.html · dashboard.html · reports.html · admin.html
│   ├── css/style.css
│   ├── js/                 # api.js, ui.js + one module per page
│   └── vendor/             # Chart.js + html5-qrcode (offline, no CDN)
├── data/                   # JSON collections (auto-generated, atomic writes, .bak kept)
├── docs/SPEC.md            # Project specification
└── scripts/                # vendor copy + end-to-end smoke test
```

## NPM scripts

| Command          | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `npm start`      | Start the server at http://localhost:3000               |
| `npm run seed`   | Reset the demo dataset to a fresh state                 |
| `npm run vendor` | Re-copy Chart.js and html5-qrcode into `public/vendor`  |
| `npm run smoke`  | End-to-end API test (server must be running)            |

## Notes

- **Camera scanning needs a secure context.** Browsers only allow camera access on `https://` pages or `http://localhost`. On the counter PC (localhost) scanning just works; to use a phone as the scanner, serve the app over HTTPS or demo with the webcam. Searching by name or typing a code in the scan dialog always works as a fallback.
- **Storage:** all data lives in `data/*.json`. Writes are crash-safe (temp file → rename, previous version kept as `.bak`).
- **Reset for a demo:** `npm run seed` restores the pristine 59-product dataset.
- Sessions are kept in memory (fine for a single-store deployment and for this course demo).
