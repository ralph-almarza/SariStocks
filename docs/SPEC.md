# SariStocks

**Business Management and Sales Inventory System — Project Specification**

| | |
|---|---|
| Course / Subject | ______________________ |
| Team Members | ______________________ |
| Date | October 2026 |
| Version | 1.0 — finalized |

---

## 1. Concise Description

SariStocks is a local, web-based business management and sales inventory system for small retail stores such as sari-sari stores. It unifies the point of sale with real-time inventory: every completed checkout automatically deducts stock, records the transaction in an audit log, and raises an alert when an item falls to or below its minimum stock threshold. The system runs entirely on one store computer with no internet required, is accessed through a browser on the store's local network, and enforces role-based access for Cashiers, Managers, and Admins.

## 2. Overview

**The problem.** Small retailers typically track stock by hand or in paper notebooks. The result is slow checkout, mis-tallied inventory, stockouts discovered too late, no reliable sales history, and no early warning when fast-moving items run out. Full commercial POS/ERP suites are too expensive and too complex for a single sari-sari store, and spreadsheets offer no checkout speed and no automatic stock updates.

**Intended users.**
- **Cashier** — operates the point of sale during the day's selling.
- **Manager / Owner** — manages products and stock, monitors the dashboard, and produces reports.
- **Admin** — a single trusted person who manages user accounts and system settings.

**Purpose.** Deliver a reliable, offline, low-cost system that:
1. Makes checkout fast through instant code lookup and a keyboard-friendly interface.
2. Keeps stock accurate by construction — one sale, one automatic deduction.
3. Warns management automatically about critical stock levels.
4. Produces accurate, exportable reports from real-time transaction data.

The project is also a deliberate exercise in applying core data structures (hash tables, heaps, stacks, queues, linked lists, sorting) to real features, with written complexity analysis for each decision.

## 3. Objectives

**General objective.** To design, develop, and evaluate a reliable system that streamlines point-of-sale transactions and automates inventory tracking for retail businesses.

**Specific objectives.**
1. To implement a fast, intuitive graphical user interface that reduces cashier checkout times (target: complete a 5-item sale in under 30 seconds).
2. To apply appropriate data structures and algorithms — hash maps, heaps, stacks, queues, and a doubly linked list — to optimize product search, cart operations, and alert prioritization.
3. To develop an automated alert subsystem that notifies management of critical stock levels, ordered by urgency.
4. To generate accurate, exportable (CSV / printable PDF) financial and inventory reports based on real-time transaction data.

## 4. Scope and Limitations

### 4.1 In Scope

- Core inventory CRUD (Create, Read, Update, Delete) for products and categories.
- Restocking and stock adjustments with a full stock-movement audit trail.
- Point of sale: searchable product list with quantity add, camera-based item lookup, cart management with undo/redo, checkout, and receipt printing.
- QR label generation for products that have no manufacturer barcode (loose goods, sachets, repacked items).
- Automated low-stock alerts with urgency ordering and a resolve workflow.
- Analytics dashboard: daily revenue, best sellers, low-stock warnings.
- Exportable reports: CSV download and print-to-PDF, driven by real-time data.
- Authentication and user role management for in-store staff (Cashier, Manager, Admin).
- Operation on a single store computer, reachable by other devices on the same local network.

### 4.2 Out of Scope / Limitations

- **No e-commerce integration.** The system does not connect to online storefronts (e.g., Shopify, WooCommerce).
- **Camera-based scanning only.** Product codes are captured with a device camera (counter webcam or phone camera) to show a product's information. Dedicated barcode-scanner hardware (USB keyboard-wedge scanners) is not a supported input path; searching by name or typing a code remains available as a fallback, and adding to the cart is done from the searchable product list, not by scanning. Standard 1D barcodes (EAN/UPC) can be decoded from the camera, but generated QR labels are the more reliable scanning target and the primary demo path.
- **No advanced accounting.** No tax filing, payroll, or multi-branch syncing. The system assumes a single store on a local network.
- **No refunds or sale voiding in v1.** Mistakes before payment are corrected with cart undo/redo. After checkout, discrepancies are fixed by a manager through a stock adjustment (logged as a movement).
- **File-based persistence, not a DBMS.** Data is stored as JSON files and loaded into in-memory structures. There is no automatic crash protection beyond the atomic write strategy described in Section 13; the system assumes one writer (one server process).
- **Sessions and carts are volatile.** Users must log in again after a server restart. Completed sales, stock, and alerts are persisted; mid-transaction carts are not.
- **No user self-registration.** Accounts are created by the Admin.
- **Camera access requires a secure context.** Browsers only expose the camera on `https://` pages or on `localhost`. See Section 13 for the demo plan.

### 4.3 Assumptions

- One store, one server computer, a handful of concurrent users.
- Store prices are final consumer prices in Philippine pesos (₱); no tax computation.
- Timestamps come from the server's system clock (ISO 8601, +08:00).

## 5. Features

### 5.1 Role-Based Access Control (RBAC)
Three distinct interfaces and permission sets: Cashiers get the POS only; Managers get inventory, dashboard, and reports; Admins additionally get user management and system settings. Every endpoint is protected server-side (Section 6); the UI hides what a role cannot do, but the API is the actual gate.

### 5.2 Interactive Dashboard
Visualizes the store's pulse on one screen:
- Daily revenue trend (line/bar chart over a selectable date range).
- Best-selling items (top-N ranking chart).
- Low-stock warnings list, ordered by urgency.
- KPI cards: today's revenue, number of transactions, items sold, open alerts.

### 5.3 Barcode / QR Code Scanning (Item Information)
Item information retrieval using the device camera (counter webcam or a phone on the same network):
- Decodes QR codes and common 1D barcode formats via a QR/barcode decoding library (`html5-qrcode`, vendored locally so no internet is needed).
- A scan opens the **item information card** — name, code, category, price, unit, stock on hand, minimum stock, and a status badge (in stock / low / out of stock). Scanning never changes the cart by itself.
- The decoded string flows through exactly the same lookup path as a typed code — one endpoint, one hash-table lookup.
- Manager-facing **QR label generator**: prints a sheet of labels for products without manufacturer barcodes; each label carries the product code as a QR plus the human-readable name and code.
- Searching by name or typing a code in the POS is the always-available fallback.

### 5.4 Automated Alerts
- Each product has a `minStock` threshold.
- After every sale, restock, or adjustment, the system checks whether stock has fallen to or below the threshold and creates an alert if so.
- Open alerts are kept in a min-heap ordered by urgency (largest shortfall below the threshold first; zero stock always surfaces first).
- Alerts appear as a navbar badge count and a dashboard warning panel.
- A Manager resolves alerts manually after restocking, or the system auto-resolves an alert when stock rises above the threshold. Resolved alerts are retained for history.

### 5.5 Product and Category Management
- Full CRUD for products and categories.
- Restock action (quantity received + optional note) that writes a stock movement.
- Products referenced by sales history are archived (marked inactive) rather than deleted, so reports stay truthful.
- Validation: unique barcodes/names where required, non-negative stock, no negative adjustments.

### 5.6 Point of Sale and Checkout
- Searchable product list (by name or code) with a per-row quantity stepper and one-click Add — the primary way to fill the cart. Out-of-stock items are disabled.
- Item information card (opened by scanning, by typing a code, or by clicking a product): price, unit, stock on hand, minimum stock, and a status badge.
- Cart with quantity editing, line removal, and instant running total.
- Undo/redo for every cart action (add — including multi-unit adds — remove, change quantity).
- Amount-tendered input with automatic change computation.
- Receipt view with store name, transaction number, timestamp, cashier, line items, total, tendered, and change.
- Receipt print queue: print jobs are processed strictly first-in-first-out, keeping receipt order aligned with purchase order.

### 5.7 Reporting and Transaction Log
- Daily/weekly sales totals and per-cashier sales.
- Best-sellers ranking over a date range.
- Inventory value report (quantity × price).
- Stock movement history — what changed, why, by whom, and when.
- CSV export for any report; PDF output via the browser's print-to-PDF on a print-styled report page.

### 5.8 Data Safety and Backup
- Every persist operation writes to a temporary file and atomically renames it over the target, keeping a `.bak` of the previous good file.
- Admin can download a backup of all JSON collections in one action.

## 6. Roles and Permissions

Roles are hierarchical: **Cashier ⊂ Manager ⊂ Admin**. A Manager can always cover the POS in a rush; an Admin can do everything except be locked out of the audit trail.

| Capability | Minimum role |
|---|---|
| Log in; use POS (search, item info, cart, checkout, print receipt) | Cashier |
| Undo/redo cart actions in own session | Cashier |
| View receipt for own completed sales | Cashier |
| View all sales, dashboard, and reports | Manager |
| Product and category CRUD; restock; stock adjustments | Manager |
| Generate QR labels; resolve alerts | Manager |
| Export CSV reports; print-to-PDF reports | Manager |
| Create/edit/deactivate user accounts | Admin |
| System settings (store name, receipt header/footer, default threshold) | Admin |
| Backup download of all data collections | Admin |

## 7. System Architecture

Three layers, each with one responsibility:

1. **Presentation (browser).** Static HTML/CSS/vanilla-JS pages served by Express (`login`, `pos`, `inventory`, `dashboard`, `reports`, `admin`). Shared JS modules handle API calls and rendering. No business rules live here.
2. **Application (Node.js + Express).** REST API under `/api`. Session cookie identifies the user; role middleware authorizes every request; input validation (no negative stock, non-empty cart, unique codes); orchestrates the all-or-nothing checkout. Serves the static frontend.
3. **Data layer (plain JS module).** Owns all in-memory structures and all JSON persistence. Exposes functions such as `getProductByCode`, `completeSale`, `restock`, `listOpenAlerts`. Nothing outside this module touches the structures directly, so the storage method can be swapped later without rewriting the app.

**Example request flow:** cashier finds the item via the search bar, sets a quantity, and clicks Add → `POST /api/cart/items { code, qty }` → data layer looks up the product in the hash table in O(1) → appends to the cart's doubly linked list or bumps an existing line via the cart map → pushes one inverse action onto the undo stack → returns a plain array snapshot for rendering.

## 8. Technology Stack

**Frontend**
- HTML5 and CSS3 (custom responsive design for counter monitor and phone)
- Vanilla JavaScript (ES modules, `fetch` API) — no framework
- Chart.js — dashboard and report charts (vendored locally)
- html5-qrcode — camera QR/barcode decoding (vendored locally)
- Browser print-to-PDF — PDF output for receipts and reports

**Backend**
- Node.js (LTS 20+) with Express — REST API, static hosting, cookie sessions
- `express-session` — session management (in-memory store)
- `node:crypto` (scrypt) — password hashing
- `node-qrcode` — server-side QR label image generation

**Database**
- None (deliberate). File-based JSON persistence in `/data`, loaded at startup into in-memory JavaScript data structures, saved atomically after every change. See Sections 9, 10, and 13 for the rationale and trade-offs.

**Tools**
- VS Code; Git + GitHub (one branch per feature); npm
- Postman / VS Code Thunder Client for API testing
- draw.io for the ERD, use-case diagram, and sale-process flowchart
- Node's built-in test runner (`node:test`) for unit tests of the data-structure modules
- Seed dataset of 50–100 realistic products for demo and dashboard quality

## 9. Data Structures and Algorithms

Six official structures, each tied to a specific feature. A plain array appears only where an ordered log is unavoidable (sales history), and is not claimed as a feature structure.

| Feature | Data Structure | Core operations (Big-O) | How it works |
|---|---|---|---|
| Barcode / QR lookup | Hash table (map: `code → product`) | get / put / delete: **O(1) average** (O(n) worst case with collisions) | The scanned or typed code is the key; the product record is retrieved directly during checkout. Implemented as a custom hash table with separate chaining for collision handling. |
| Unique barcodes, usernames | Set | has / add / delete: **O(1) average** | The server rejects duplicate barcodes and usernames before anything is saved. |
| Active cart | Doubly linked list + hash map (`code → node`) | append: **O(1)**; remove / update qty via node reference: **O(1)**; running total update: **O(1)** | The list preserves line order; the map finds any line instantly, so no searching and no array shifting. Totals are maintained incrementally instead of recomputed. |
| Cart undo / redo | Two stacks (undo, redo) | push / pop / peek: **O(1)** | Every cart mutation records an inverse action. Undo pops from the undo stack, reverses the action, and pushes onto the redo stack (and vice versa). A new action clears the redo stack. |
| Low-stock alerts | Binary min-heap | peek: **O(1)**; push / pop: **O(log n)**; load via heapify: **O(n)** | Priority = shortfall below the minimum (`minStock − stock`); zero stock surfaces first. The most urgent alert is always at the root. |
| Best sellers / top-N ranking | Hash aggregation + bounded heap (or merge sort) | aggregate: **O(n)**; top-N via k-sized heap: **O(n log k)**; full sort: **O(m log m)** | Quantities are summed per product in a map, then ranked. Merge sort (self-implemented) is used where stable full ordering is needed. |
| Receipt print jobs | Queue (FIFO) | enqueue / dequeue: **O(1)** | Receipts are printed in the exact order the sales occurred, even when several are queued at once. |
| Sales history / movement log (supporting) | Array (ordered log) | append: **O(1)** amortized; range scan: **O(n)** | Chronological audit trail in purchase order, used by reports. |

**Algorithms implemented by the team** (for the documentation and defense): custom hash table with separate chaining, heap bubble-up/bubble-down and heapify, merge sort, and quicksort.

**Defense notes (talking points).**
- *Why a doubly linked list for the cart?* Removal given a node reference is O(1) with no array shifting, and the paired map eliminates the O(n) search for "already in cart". A plain array would make removal O(n) and duplicate checks O(n).
- *Why two stacks instead of one?* Redo requires a second history. Adding an item that is already in the cart bumps its quantity, and adding N units is one action; undo reverses the whole increment, not the item itself.
- *Why a heap for alerts?* Management only needs the most urgent item next. Insert and removal stay O(log n) instead of re-sorting the whole list on every stock change.
- *Why a hash table, and what about collisions?* Lookup on the checkout hot path must be O(1); the custom implementation uses separate chaining and document its worst case.

## 10. Data Model

All collections are JSON files in `/data`, loaded into memory at startup.

**`users.json`**
```json
{ "id": "u_001", "name": "Ana Cruz", "username": "ana",
  "passwordHash": "scrypt$<salt>$<hash>", "role": "cashier",
  "active": true, "createdAt": "2026-10-18T08:00:00+08:00" }
```

**`categories.json`**
```json
{ "id": "c_drinks", "name": "Beverages" }
```

**`products.json`**
```json
{ "id": "p_0001", "code": "SS-0001", "name": "Coke Sakto 200ml",
  "categoryId": "c_drinks", "price": 20.00, "stock": 6, "minStock": 10,
  "unit": "pc", "active": true, "updatedAt": "2026-10-18T14:32:07+08:00" }
```
`code` is the manufacturer barcode when one exists, otherwise a generated house code (`SS-####`) printed on the QR label.

**`sales.json`** (one record per transaction, line items embedded)
```json
{ "id": "s_000001", "at": "2026-10-18T14:32:07+08:00", "cashierId": "u_001",
  "lines": [
    { "productId": "p_0001", "code": "SS-0001", "name": "Coke Sakto 200ml",
      "qty": 2, "unitPrice": 20.00, "lineTotal": 40.00 }
  ],
  "total": 40.00, "paid": 50.00, "change": 10.00 }
```
`unitPrice` snapshots the price at the time of sale, so editing a product price never changes old reports.

**`stock_movements.json`**
```json
{ "id": "m_000123", "at": "2026-10-18T14:32:07+08:00", "productId": "p_0001",
  "delta": -2, "reason": "sale", "refId": "s_000001", "userId": "u_001",
  "note": null, "stockAfter": 6 }
```
`reason` ∈ `sale | restock | adjustment | initial`. This collection is the audit trail behind the "transaction logging" requirement.

**`alerts.json`**
```json
{ "id": "a_0007", "productId": "p_0001", "createdAt": "2026-10-18T14:32:07+08:00",
  "severity": 4, "message": "Coke Sakto 200ml: stock 6 at/below minimum 10",
  "status": "open", "resolvedAt": null, "resolvedBy": null }
```
`severity = minStock − stock` is the heap's priority key.

**`settings.json`**
```json
{ "storeName": "_____ Sari-Sari Store", "receiptHeader": "Thank you!",
  "receiptFooter": "Please come again", "defaultMinStock": 5,
  "lowStockAlertsEnabled": true }
```

**In-memory only (never persisted):** sessions (`sessionId → { userId, role }`), carts (`sessionId → { list, map, undoStack, redoStack, total }`), and the min-heap of open alerts (rebuilt by heapify on startup).

## 11. Core Workflows

### 11.1 Completing a sale (all-or-nothing)
1. Cashier finds the item via the search bar (name or code), sets a quantity, and clicks Add; the browser sends `POST /api/cart/items { code, qty }`.
2. The data layer looks the product up in the hash table (O(1)). Unknown code → friendly "not found" prompt; inactive product → refused.
3. Existing line → quantity bumped via the cart map (O(1)); new line → appended to the linked list and map. One inverse action (covering the full quantity) goes onto the undo stack, the redo stack is cleared, and the running total is updated.
4. Cashier may undo/redo, edit quantities, or remove lines. Each mutation records its inverse action.
5. Checkout: the client sends the amount tendered. The server validates the cart is non-empty and every line's quantity is available in stock, then computes total and change.
6. Commit: the sale record is written with price snapshots; stock is deducted; stock movements are logged. All writes go through temp-file + atomic rename, with `.bak` kept for the previous good version.
7. For each line whose new stock ≤ `minStock`, an alert is created (or updated) and pushed onto the min-heap.
8. A receipt print job is enqueued; the receipt and change are returned to the client; the cart is reset.

### 11.2 Restocking
Manager selects a product and enters the quantity received → stock increases → a movement is logged (`reason: restock`) → if stock rises above the threshold, the related open alert auto-resolves.

### 11.3 Alert lifecycle
Stock ≤ threshold → alert created (priority = shortfall) → appears on the dashboard and as a navbar badge, heap-ordered → manager resolves after purchasing/restocking, or the system auto-resolves on restock → resolved alerts are retained in history.

## 12. API Surface (Contract Sketch)

Roles are minimums; higher roles inherit. All responses are JSON. Every mutating endpoint validates input and role server-side.

| Method | Path | Min role | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Start session |
| POST | `/api/auth/logout` | Cashier | End session |
| GET | `/api/auth/me` | Cashier | Current user and role |
| GET | `/api/products?search=&sort=&dir=` | Cashier | List/search products |
| GET | `/api/products/code/:code` | Cashier | O(1) lookup by barcode/QR/manual code |
| POST | `/api/products` | Manager | Create product |
| PATCH | `/api/products/:id` | Manager | Update product |
| DELETE | `/api/products/:id` | Manager | Archive/delete product |
| POST | `/api/products/:id/restock` | Manager | Stock in + movement log |
| GET | `/api/products/:id/label` | Manager | QR label image (PNG/data URL) |
| GET | `/api/categories` | Cashier | List categories |
| POST/PATCH/DELETE | `/api/categories[/:id]` | Manager | Category CRUD |
| GET | `/api/cart` | Cashier | Cart snapshot (array + totals) |
| POST | `/api/cart/items` | Cashier | Add item by code with optional `qty` (bumps qty if present; one undoable action) |
| PATCH | `/api/cart/items/:code` | Cashier | Set line quantity |
| DELETE | `/api/cart/items/:code` | Cashier | Remove line |
| POST | `/api/cart/undo` \| `/api/cart/redo` | Cashier | Replay inverse actions |
| DELETE | `/api/cart` | Cashier | Clear cart |
| POST | `/api/sales` | Cashier | Complete sale (all-or-nothing commit) |
| GET | `/api/sales?from=&to=&cashier=` | Manager | List sales |
| GET | `/api/sales/:id` | Cashier (own) | Receipt data |
| POST | `/api/sales/:id/print` | Cashier | Enqueue receipt print job (FIFO) |
| GET | `/api/print-jobs` | Cashier | Queue contents / next job |
| GET | `/api/dashboard/summary` | Manager | KPIs, revenue trend, top sellers, open alerts |
| GET | `/api/reports/daily?from=&to=` | Manager | Daily totals |
| GET | `/api/reports/best-sellers?top=10` | Manager | Top-N ranking |
| GET | `/api/reports/inventory-value` | Manager | Stock on hand × price |
| GET | `/api/reports/export.csv?report=` | Manager | CSV download |
| GET | `/api/movements?productId=&from=&to=` | Manager | Stock movement history |
| GET | `/api/alerts` | Manager | Open alerts (heap order) |
| POST | `/api/alerts/:id/resolve` | Manager | Resolve alert |
| GET/POST/PATCH/DELETE | `/api/users[/:id]` | Admin | User management |
| GET/PATCH | `/api/settings` | Admin (write) · any role (read) | Store and receipt settings; read access is required so the POS can print the receipt header/footer |
| GET | `/api/backup` | Admin | Download all collections |

## 13. Technical Considerations and Risks

1. **Camera secure context (primary risk).** Browsers expose the camera only on `https://` or `localhost`. Opening the app from a phone via `http://192.168.x.x:3000` will block the camera. Mitigations, in order: (a) demo the scan on the counter computer's own webcam at `http://localhost:3000` — guaranteed to work; (b) serve a self-signed HTTPS certificate from Node for genuine phone-camera use, accepting the certificate warning on the phone once; (c) the manual entry field is always available as a final fallback.
2. **Offline demo.** All frontend libraries (Chart.js, html5-qrcode) are vendored into the project; nothing is loaded from a CDN, so the demo works without internet.
3. **Write safety on JSON files.** Temp-file + atomic rename, `.bak` of the previous version, and in-memory rollback of a failed checkout. A crash can never leave a half-written file.
4. **Single writer.** One server process serves the store; concurrent cashiers hit the same process, whose JS event loop serializes commits. This is acceptable and documented for a single-store deployment; it would not scale to multiple branches.
5. **Demo reliability of scanning.** Printed QR labels are crisp and decode instantly; 1D barcodes caught on camera can be finicky under poor lighting. The demo script relies on QR labels, with manual entry as backup.
6. **Sample data and testing.** Seed 50–100 realistic products (with stock levels, some deliberately low) so the dashboard and alerts look real. Unit-test the data-structure modules (hash table, heap, stacks, queue, sorts) with `node:test`; verify every endpoint's role enforcement before the defense.

## 14. Future Enhancements

- Refunds / sale voiding with manager approval.
- USB keyboard-wedge scanner support and thermal receipt printer output.
- Migration of persistence to SQLite (the data layer's interface is designed for the swap).
- Sync queue for multi-terminal stores.
- Senior citizen / PWD discount rules.
- Supplier records and purchase orders.
- E-commerce integration.
