/**
 * End-to-end smoke test for SariStocks.
 *
 * Usage: start the server in one terminal (npm start), then run:
 *   npm run smoke
 *
 * It exercises the real API the way the frontend does: login, lookup,
 * cart + undo/redo, checkout (with stock deduction and alert creation),
 * RBAC denial, alerts, reports, CSV export, print queue, users, backup.
 * Exits with code 1 if any check fails.
 *
 * Best run against fresh demo data: npm run seed  →  npm start  →  npm run smoke
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function cookieFrom(response) {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const session = cookies.find((value) => value.startsWith('connect.sid'));
  return session ? session.split(';')[0] : null;
}

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, cookie: cookieFrom(response), contentType };
}

const section = (title) => console.log(`\n== ${title} ==`);

// ------------------------------------------------------------------
section('Static frontend + anonymous access');

{
  const page = await request('/login.html');
  check('login.html is served', page.status === 200 && page.data.includes('SariStocks'));

  const script = await request('/js/ui.js');
  check('frontend modules are served', script.status === 200);

  const me = await request('/api/auth/me');
  check('anonymous /api/auth/me → 401', me.status === 401);

  const products = await request('/api/products');
  check('anonymous /api/products → 401', products.status === 401);
}

// ------------------------------------------------------------------
section('Login and role guards');

let cashier;
let manager;
let admin;

{
  const wrong = await request('/api/auth/login', { method: 'POST', body: { username: 'ana', password: 'nope' } });
  check('wrong password → 401', wrong.status === 401);

  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'ana', password: 'cashier123' } });
  cashier = login.cookie;
  check('cashier logs in', login.status === 200 && login.data.user.role === 'cashier');

  const mgr = await request('/api/auth/login', { method: 'POST', body: { username: 'maria', password: 'manager123' } });
  manager = mgr.cookie;
  check('manager logs in', mgr.status === 200 && mgr.data.user.role === 'manager');

  const adm = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  admin = adm.cookie;
  check('admin logs in', adm.status === 200 && adm.data.user.role === 'admin');

  const users = await request('/api/users', { cookie: cashier });
  check('cashier blocked from /api/users (403)', users.status === 403);

  const summary = await request('/api/dashboard/summary', { cookie: cashier });
  check('cashier blocked from dashboard (403)', summary.status === 403);

  const alerts = await request('/api/alerts', { cookie: cashier });
  check('cashier blocked from alerts (403)', alerts.status === 403);

  const settings = await request('/api/settings', { cookie: cashier });
  check('cashier can read store settings (for receipts)', settings.status === 200 && settings.data.settings.storeName.length > 0);
}

// ------------------------------------------------------------------
section('O(1) product lookup');

let coke;
let cokeStock;
{
  const found = await request('/api/products/code/SS-0001', { cookie: cashier });
  coke = found.data.product;
  cokeStock = coke.stock;
  check('lookup by code works', found.status === 200 && coke.name.includes('Coke'));
  check('lookup is case-insensitive for typed codes', (await request('/api/products/code/ss-0001', { cookie: cashier })).status === 200);

  const missing = await request('/api/products/code/DOES-NOT-EXIST', { cookie: cashier });
  check('unknown code → 404', missing.status === 404);

  const search = await request('/api/products?search=coke', { cookie: cashier });
  check(
    'cashier can search the product list for the POS',
    search.status === 200 && search.data.products.some((p) => p.code === 'SS-0001'),
  );
}

// ------------------------------------------------------------------
section('Cart: doubly linked list + hash map + undo/redo stacks');

{
  const add = await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0001' }, cookie: cashier });
  check('add item to cart', add.status === 200 && add.data.cart.lines.length === 1 && add.data.cart.lines[0].qty === 1);

  const addAgain = await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0001' }, cookie: cashier });
  check('duplicate scan bumps quantity (map hit)', addAgain.data.cart.lines[0].qty === 2);

  const undo = await request('/api/cart/undo', { method: 'POST', body: {}, cookie: cashier });
  check('undo reverses the increment', undo.data.cart.lines[0].qty === 1 && undo.data.cart.canRedo === true);

  const redo = await request('/api/cart/redo', { method: 'POST', body: {}, cookie: cashier });
  check('redo re-applies the increment', redo.data.cart.lines[0].qty === 2 && redo.data.cart.canUndo === true);

  // Batch add: adding N at once is a single action on the undo stack.
  const batch = await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0001', qty: 4 }, cookie: cashier });
  check('add-to-cart accepts a quantity (2 + 4 = 6)', batch.data.cart.lines[0].qty === 6);

  const undoBatch = await request('/api/cart/undo', { method: 'POST', body: {}, cookie: cashier });
  check('undo reverses the whole batch add', undoBatch.data.cart.lines[0].qty === 2);

  const redoBatch = await request('/api/cart/redo', { method: 'POST', body: {}, cookie: cashier });
  check('redo restores the whole batch add', redoBatch.data.cart.lines[0].qty === 6);

  const setQty = await request('/api/cart/items/SS-0001', { method: 'PATCH', body: { qty: 3 }, cookie: cashier });
  check('set quantity updates the running total', setQty.data.cart.total === 60);

  const remove = await request('/api/cart/items/SS-0001', { method: 'DELETE', cookie: cashier });
  check('remove line leaves an empty cart', remove.data.cart.lines.length === 0);

  await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0001' }, cookie: cashier });
  const afterNewAction = await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0002' }, cookie: cashier });
  check('a new action clears the redo stack', afterNewAction.data.cart.canRedo === false);

  await request('/api/cart', { method: 'DELETE', cookie: cashier });
}

// ------------------------------------------------------------------
section('Checkout: stock deduction + low-stock alert + print queue');

{
  // Sell 2 Royal (SS-0003) then 46 Coke (SS-0001) to push Coke to stock 2
  // (below its minimum of 12) and trigger a fresh alert.
  const royalBefore = (await request('/api/products/code/SS-0003', { cookie: cashier })).data.product.stock;

  await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0003' }, cookie: cashier });
  await request('/api/cart/items/SS-0003', { method: 'PATCH', body: { qty: 2 }, cookie: cashier });
  const royalSale = await request('/api/sales', { method: 'POST', body: { paid: 50 }, cookie: cashier });
  check('sale completes (Royal 2 × ₱20)', royalSale.status === 201 && royalSale.data.sale.total === 40 && royalSale.data.change === 10);

  const royalAfter = (await request('/api/products/code/SS-0003', { cookie: cashier })).data.product.stock;
  check('stock deducted after sale', royalAfter === royalBefore - 2, `expected ${royalBefore - 2}, got ${royalAfter}`);

  const emptyCart = await request('/api/cart', { cookie: cashier });
  check('cart resets after checkout', emptyCart.data.cart.lines.length === 0);

  const underpaid = await request('/api/cart/items', { method: 'POST', body: { code: 'SS-0001' }, cookie: cashier });
  check('cart accepts an item again', underpaid.status === 200);
  const badPaid = await request('/api/sales', { method: 'POST', body: { paid: 1 }, cookie: cashier });
  check('checkout rejects insufficient tender', badPaid.status === 400);

  await request('/api/cart/items/SS-0001', { method: 'PATCH', body: { qty: 46 }, cookie: cashier });
  const cokeSale = await request('/api/sales', { method: 'POST', body: { paid: 1000 }, cookie: cashier });
  check('big sale completes (Coke 46 × ₱20)', cokeSale.status === 201 && cokeSale.data.change === 80);

  const cokeNow = (await request('/api/products/code/SS-0001', { cookie: cashier })).data.product;
  check('Coke is now below its minimum', cokeNow.stock === cokeStock - 46 && cokeNow.stock <= cokeNow.minStock);
}

{
  const jobs = await request('/api/print-jobs', { cookie: cashier });
  check('checkouts enqueue receipt print jobs (FIFO)', jobs.status === 200 && jobs.data.jobs.length >= 2);

  const before = jobs.data.jobs.length;
  const next = await request('/api/print-jobs/next', { method: 'POST', body: {}, cookie: cashier });
  check('dequeue returns the next job with its sale', next.status === 200 && next.data.job.sale.total > 0);

  const after = await request('/api/print-jobs', { cookie: cashier });
  check('dequeue shrinks the queue by one', after.data.jobs.length === before - 1);
}

// ------------------------------------------------------------------
section('Alerts: urgency order + resolve + auto-resolve');

{
  const alerts = await request('/api/alerts', { cookie: manager });
  check('manager sees open alerts', alerts.status === 200 && alerts.data.count > 0);
  check('zero-stock alert sorts first in the min-heap order', alerts.data.alerts[0].stock === 0);

  const cokeAlert = alerts.data.alerts.find((a) => a.productName.includes('Coke'));
  check('Coke low-stock alert was created by the sale', Boolean(cokeAlert) && cokeAlert.stock === 2 && cokeAlert.severity === 10);

  const resolve = await request(`/api/alerts/${cokeAlert.id}/resolve`, { method: 'POST', body: {}, cookie: manager });
  check('manager resolves the alert', resolve.status === 200 && resolve.data.alert.status === 'resolved');

  const resolveAgain = await request(`/api/alerts/${cokeAlert.id}/resolve`, { method: 'POST', body: {}, cookie: manager });
  check('resolving twice is rejected (409)', resolveAgain.status === 409);

  // Restock Neozep above its minimum; its alert must auto-resolve.
  const neozep = (await request('/api/products?search=Neozep', { cookie: manager })).data.products[0];
  check('Neozep is currently below minimum', neozep.stock <= neozep.minStock);

  const restock = await request(`/api/products/${neozep.id}/restock`, { method: 'POST', body: { qty: 100, note: 'smoke test delivery' }, cookie: manager });
  check('restock raises stock and logs a movement', restock.status === 200 && restock.data.product.stock === neozep.stock + 100 && restock.data.movement.reason === 'restock');

  const all = await request('/api/alerts?status=all', { cookie: manager });
  const neozepAlert = all.data.alerts.find((a) => a.productId === neozep.id);
  check('alert auto-resolved after restock', neozepAlert?.status === 'auto-resolved');
}

// ------------------------------------------------------------------
section('Dashboard + reports + CSV');

{
  const summary = await request('/api/dashboard/summary?days=14', { cookie: manager });
  check('dashboard summary returns a 14-day trend', summary.data.summary.trend.length === 14);
  check('today has revenue (seeded + test sales)', summary.data.summary.today.revenue >= 40);
  check('best sellers ranking is present', summary.data.summary.bestSellers.length > 0 && summary.data.summary.bestSellers[0].qty > 0);

  const csv = await request('/api/reports/export.csv?report=daily', { cookie: manager });
  check('daily CSV export works', csv.status === 200 && csv.contentType.includes('text/csv') && csv.data.includes('Date,Transactions'));

  const csvInventory = await request('/api/reports/export.csv?report=inventory', { cookie: manager });
  check('inventory CSV export works', csvInventory.status === 200 && csvInventory.data.includes('TOTAL'));

  const label = await request(`/api/products/${coke.id}/label`, { cookie: manager });
  check('QR label endpoint returns a PNG data URL', label.status === 200 && label.data.label.dataUrl.startsWith('data:image/png;base64,'));
}

// ------------------------------------------------------------------
section('Product create/archive via API');

{
  const created = await request('/api/products', {
    method: 'POST',
    cookie: manager,
    body: { name: 'Smoke Test Item', code: 'TESTCODE1', categoryId: 'c_snack', price: 5, stock: 0, minStock: 1 },
  });
  check('manager creates a product', created.status === 201 && created.data.product.code === 'TESTCODE1');

  const broken = await request('/api/products', {
    method: 'POST',
    cookie: manager,
    body: { name: 'Duplicate code', code: 'TESTCODE1', categoryId: 'c_snack', price: 5 },
  });
  check('duplicate code is rejected (409)', broken.status === 409);

  const deleted = await request(`/api/products/${created.data.product.id}`, { method: 'DELETE', cookie: manager });
  check('unreferenced product is hard-deleted', deleted.status === 200 && deleted.data.deleted === true);

  const archived = await request(`/api/products/${coke.id}`, { method: 'DELETE', cookie: manager });
  check('product with sales history is archived, not deleted', archived.status === 200 && archived.data.archived === true);

  const reactivated = await request(`/api/products/${coke.id}`, { method: 'PATCH', cookie: manager, body: { active: true } });
  check('archived product can be reactivated', reactivated.status === 200 && reactivated.data.product.active === true);
}

// ------------------------------------------------------------------
section('Admin: users, settings, backup');

{
  const users = await request('/api/users', { cookie: admin });
  check('admin lists users', users.status === 200 && users.data.users.length >= 3);
  check('password hashes never leave the server', users.data.users.every((u) => u.passwordHash === undefined));

  const createdUser = await request('/api/users', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Temp Cashier', username: 'tempcashier', password: 'temp1234', role: 'cashier' },
  });
  check('admin creates a user', createdUser.status === 201);

  const tempLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'tempcashier', password: 'temp1234' } });
  check('new user can log in', tempLogin.status === 200);

  const deactivate = await request(`/api/users/${createdUser.data.user.id}`, { method: 'DELETE', cookie: admin });
  check('admin deactivates the user', deactivate.status === 200 && deactivate.data.user.active === false);

  const deadLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'tempcashier', password: 'temp1234' } });
  check('deactivated user is refused at login (403)', deadLogin.status === 403);

  const selfDeactivate = await request('/api/users/u_001', { method: 'DELETE', cookie: admin });
  check('admin cannot deactivate themselves', selfDeactivate.status === 400);

  const settings = await request('/api/settings', { method: 'PATCH', cookie: admin, body: { storeName: 'Smoke Test Store' } });
  check('admin updates settings', settings.status === 200 && settings.data.settings.storeName === 'Smoke Test Store');
  await request('/api/settings', { method: 'PATCH', cookie: admin, body: { storeName: "Aling Nena's Sari-Sari Store" } });

  const backup = await request('/api/backup', { cookie: admin });
  check('backup bundle contains every collection', backup.status === 200 && backup.data.data.products.length >= 59 && Array.isArray(backup.data.data.sales));
}

// ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All smoke tests passed.');
