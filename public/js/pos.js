/**
 * POS page — searchable product list with per-row quantity add, item-info
 * lookup (camera scan or typed code), the server-side cart (undo/redo),
 * payment, and receipts from the FIFO print queue.
 */
import { API } from './api.js';
import { toast, fmtPHP, fmtDateTime, escapeHtml, initPage, openModal, closeModal, printElement } from './ui.js';

const me = await initPage('cashier');

let settings = null;
let cart = { lines: [], total: 0, itemCount: 0, canUndo: false, canRedo: false };
let lastSale = null;
let scanner = null;
let scanning = false;
let scanBusy = false;
let searchTimer = null;
let searchSeq = 0; // guards against out-of-order search responses
let results = []; // current product list (also used for Enter-to-info)
let infoProduct = null; // product shown in the item-info modal

if (me) main();

async function main() {
  settings = (await API.get('/api/settings')).settings;
  wireEvents();
  await Promise.all([loadProducts(''), refreshCart(), refreshPrintJobs()]);
  document.getElementById('product-search').focus();
}

function wireEvents() {
  const searchInput = document.getElementById('product-search');

  // Live search with a small debounce so we fetch once typing pauses.
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadProducts(searchInput.value), 180);
  });

  // Enter refreshes the list, then opens the info card for an exact code (or
  // the only match) — the typed equivalent of scanning.
  document.getElementById('find-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadProducts(searchInput.value);
    const query = searchInput.value.trim().toUpperCase();
    const target = results.find((p) => p.code.toUpperCase() === query)
      ?? (results.length === 1 ? results[0] : null);
    if (target) openItemInfo(target);
  });

  // Product list: click a name for info, click Add to add that row's quantity.
  const list = document.getElementById('product-list');
  list.addEventListener('click', (event) => {
    const infoButton = event.target.closest('button[data-info]');
    if (infoButton) {
      const product = results.find((p) => p.code === infoButton.dataset.info);
      if (product) openItemInfo(product);
      return;
    }
    const addButton = event.target.closest('button[data-add]');
    if (addButton) {
      const row = addButton.closest('.product-row');
      const qty = Number(row.querySelector('input.qty-input').value) || 1;
      addToCart(addButton.dataset.add, qty, productName(addButton.dataset.add));
    }
  });
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest('input.qty-input');
    if (!input) return;
    event.preventDefault();
    const row = input.closest('.product-row');
    addToCart(row.dataset.code, Number(input.value) || 1, productName(row.dataset.code));
  });

  // Camera: a scan opens the item info card (it never adds by itself).
  document.getElementById('camera-btn').addEventListener('click', openScanner);
  document.getElementById('camera-cancel').addEventListener('click', closeScanner);
  document.getElementById('camera-lookup-btn').addEventListener('click', () => {
    const code = document.getElementById('camera-code').value.trim();
    if (code) showItemInfo(code);
  });
  document.getElementById('camera-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('camera-lookup-btn').click();
    }
  });

  // Item info modal: add the chosen quantity straight from the card.
  document.getElementById('info-add-btn').addEventListener('click', () => {
    if (!infoProduct) return;
    const qty = Number(document.getElementById('info-qty').value) || 1;
    addToCart(infoProduct.code, qty, infoProduct.name, true);
  });

  document.getElementById('undo-btn').addEventListener('click', () => cartAction(() => API.post('/api/cart/undo')));
  document.getElementById('redo-btn').addEventListener('click', () => cartAction(() => API.post('/api/cart/redo')));
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (cart.lines.length === 0) return;
    if (confirm('Clear the whole cart?')) cartAction(() => API.del('/api/cart'));
  });

  // Quantity edits and removals inside the cart table (event delegation).
  document.getElementById('cart-body').addEventListener('change', (event) => {
    const input = event.target.closest('input.qty-input');
    if (!input) return;
    const qty = Number(input.value);
    cartAction(() => API.patch(`/api/cart/items/${encodeURIComponent(input.dataset.code)}`, { qty }));
  });
  document.getElementById('cart-body').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-remove]');
    if (!button) return;
    cartAction(() => API.del(`/api/cart/items/${encodeURIComponent(button.dataset.remove)}`));
  });

  const paidInput = document.getElementById('paid-input');
  paidInput.addEventListener('input', updateChangeLine);
  document.querySelectorAll('.quick-cash button').forEach((button) => {
    button.addEventListener('click', () => {
      paidInput.value = button.dataset.amount === 'exact'
        ? (cart.total > 0 ? cart.total.toFixed(2) : '')
        : button.dataset.amount;
      updateChangeLine();
    });
  });

  document.getElementById('checkout-btn').addEventListener('click', checkout);
  document.getElementById('print-next-btn').addEventListener('click', printNextJob);
  document.getElementById('receipt-print-btn').addEventListener('click', () => {
    if (lastSale) printElement(buildReceiptHtml(lastSale));
  });
  document.getElementById('receipt-reprint-btn').addEventListener('click', async () => {
    if (!lastSale) return;
    try {
      await API.post(`/api/sales/${lastSale.id}/print`);
      toast(`Receipt ${lastSale.id} queued for printing.`, 'success');
      await refreshPrintJobs();
    } catch (error) { toast(error.message, 'error'); }
  });

  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });
}

// ---------------------------------------------------------------- product list

const productName = (code) => results.find((p) => p.code === code)?.name ?? code;

async function loadProducts(query = '') {
  const seq = ++searchSeq;
  const list = document.getElementById('product-list');
  try {
    const { products } = await API.get(`/api/products?search=${encodeURIComponent(query)}&sort=name`);
    if (seq !== searchSeq) return; // a newer search already replaced this one
    results = products;
    renderProducts(products);
  } catch (error) {
    if (seq !== searchSeq) return;
    list.innerHTML = '<div class="empty">Could not load products.</div>';
    toast(error.message, 'error');
  }
}

function renderProducts(products) {
  const list = document.getElementById('product-list');
  if (products.length === 0) {
    list.innerHTML = '<div class="empty">No products match. Try another name or code.</div>';
    return;
  }
  list.innerHTML = products.map((p) => {
    const out = p.stock === 0;
    const badge = out
      ? '<span class="badge out">OUT</span>'
      : p.low ? '<span class="badge low">LOW</span>' : '';
    return `
      <div class="product-row" data-code="${escapeHtml(p.code)}">
        <div class="product-main">
          <button class="product-name" type="button" data-info="${escapeHtml(p.code)}" title="View item information">${escapeHtml(p.name)}</button>
          <div class="hint">${escapeHtml(p.code)} · ${escapeHtml(p.categoryName)} · ${fmtPHP(p.price)} / ${escapeHtml(p.unit)} · stock ${p.stock}</div>
        </div>
        ${badge}
        <div class="product-add">
          <input class="qty-input" type="number" min="1" max="${Math.max(1, p.stock)}" value="1" aria-label="Quantity to add" ${out ? 'disabled' : ''}>
          <button class="btn small" type="button" data-add="${escapeHtml(p.code)}" ${out ? 'disabled' : ''}>Add</button>
        </div>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------- cart

async function addToCart(code, qty, name, closeInfo = false) {
  try {
    const { cart: updated } = await API.post('/api/cart/items', { code, qty });
    cart = updated;
    renderCart();
    if (closeInfo) closeModal('modal-item-info');
    toast(`Added ${qty} × ${name ?? code}.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function cartAction(action) {
  try {
    const { cart: updated } = await action();
    cart = updated;
    renderCart();
  } catch (error) {
    toast(error.message, 'error');
    await refreshCart();
  }
}

async function refreshCart() {
  const { cart: fresh } = await API.get('/api/cart');
  cart = fresh;
  renderCart();
}

function renderCart() {
  const body = document.getElementById('cart-body');
  if (cart.lines.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Cart is empty — add products from the list.</td></tr>';
  } else {
    body.innerHTML = cart.lines.map((line) => `
      <tr>
        <td>
          ${escapeHtml(line.name)}
          ${line.overStock ? `<div class="warn-text">Only ${line.stockAvailable} in stock</div>` : ''}
          ${!line.active ? '<div class="warn-text">Archived product — remove it</div>' : ''}
        </td>
        <td class="num">${fmtPHP(line.price)}</td>
        <td><input class="qty-input" type="number" min="0" value="${line.qty}" data-code="${escapeHtml(line.code)}" aria-label="Quantity"></td>
        <td class="num">${fmtPHP(line.lineTotal)}</td>
        <td><button class="btn small secondary" data-remove="${escapeHtml(line.code)}" type="button" title="Remove line">✕</button></td>
      </tr>`).join('');
  }

  document.getElementById('cart-count').textContent = `${cart.itemCount} item(s)`;
  document.getElementById('subtotal').textContent = fmtPHP(cart.total);
  document.getElementById('total').textContent = fmtPHP(cart.total);
  document.getElementById('undo-btn').disabled = !cart.canUndo;
  document.getElementById('redo-btn').disabled = !cart.canRedo;
  updateChangeLine();
}

function updateChangeLine() {
  const el = document.getElementById('change-line');
  const paid = Number(document.getElementById('paid-input').value);
  if (cart.total <= 0 || !Number.isFinite(paid) || paid <= 0) {
    el.textContent = '';
    el.className = 'totals-row';
    return;
  }
  const change = Math.round((paid - cart.total) * 100) / 100;
  if (change < 0) {
    el.textContent = `Insufficient — short by ${fmtPHP(-change)}`;
    el.className = 'totals-row warn-text';
  } else {
    el.textContent = `Change: ${fmtPHP(change)}`;
    el.className = 'totals-row';
  }
}

async function checkout() {
  if (cart.lines.length === 0) return toast('The cart is empty.', 'error');
  const paid = Number(document.getElementById('paid-input').value);
  if (!Number.isFinite(paid) || paid <= 0) return toast('Enter the amount tendered.', 'error');
  if (paid < cart.total) return toast('Amount tendered is less than the total.', 'error');

  const button = document.getElementById('checkout-btn');
  button.disabled = true;
  try {
    const { sale } = await API.post('/api/sales', { paid });
    lastSale = sale;
    document.getElementById('receipt-content').innerHTML = buildReceiptHtml(sale);
    openModal('modal-receipt');
    toast(`Sale ${sale.id} saved. Change: ${fmtPHP(sale.change)}`, 'success');
    document.getElementById('paid-input').value = '';
    await refreshCart();
    await refreshPrintJobs();
  } catch (error) {
    toast(error.message, 'error');
  }
  button.disabled = false;
}

// ---------------------------------------------------------------- receipts & queue

function buildReceiptHtml(sale) {
  const s = settings ?? {};
  const lines = sale.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.name)}<br>&nbsp;&nbsp;${line.qty} x ${line.unitPrice.toFixed(2)}</td>
      <td class="right">${line.lineTotal.toFixed(2)}</td>
    </tr>`).join('');

  return `
    <div class="receipt">
      <h2>${escapeHtml(s.storeName ?? 'SariStocks')}</h2>
      <div class="center">${escapeHtml(s.receiptHeader ?? '')}</div>
      <div class="line"></div>
      <div>Receipt: ${escapeHtml(sale.id)}<br>${fmtDateTime(sale.at)}<br>Cashier: ${escapeHtml(sale.cashierName)}</div>
      <div class="line"></div>
      <table>${lines}</table>
      <div class="line"></div>
      <table>
        <tr><td>TOTAL</td><td class="right"><b>${sale.total.toFixed(2)}</b></td></tr>
        <tr><td>Tendered</td><td class="right">${sale.paid.toFixed(2)}</td></tr>
        <tr><td>Change</td><td class="right">${sale.change.toFixed(2)}</td></tr>
      </table>
      <div class="line"></div>
      <div class="center">${escapeHtml(s.receiptFooter ?? '')}</div>
    </div>`;
}

async function refreshPrintJobs() {
  try {
    const { jobs } = await API.get('/api/print-jobs');
    document.getElementById('job-count').textContent = jobs.length;
    document.getElementById('print-jobs').innerHTML = jobs.length === 0
      ? '<div class="empty">No queued receipts.</div>'
      : jobs.map((job) => `
        <div class="job-item">
          <span>${escapeHtml(job.saleId)}<br><span class="hint">${fmtDateTime(job.queuedAt)}</span></span>
          <span class="badge info">queued</span>
        </div>`).join('');
    document.getElementById('print-next-btn').disabled = jobs.length === 0;
  } catch { /* queue panel is best-effort */ }
}

async function printNextJob() {
  try {
    const { job } = await API.post('/api/print-jobs/next');
    if (job?.sale) printElement(buildReceiptHtml(job.sale));
    await refreshPrintJobs();
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ---------------------------------------------------------------- item info

function openItemInfo(product) {
  infoProduct = product;
  const unit = escapeHtml(product.unit ?? 'pc');
  const badge = product.active === false
    ? '<span class="badge off">ARCHIVED</span>'
    : product.stock === 0
      ? '<span class="badge out">OUT OF STOCK</span>'
      : product.low
        ? '<span class="badge low">LOW STOCK</span>'
        : '<span class="badge ok">IN STOCK</span>';

  document.getElementById('item-info-content').innerHTML = `
    <div class="info-head">
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="hint">${escapeHtml(product.code)} · ${escapeHtml(product.categoryName ?? 'Uncategorized')}</div>
      </div>
      ${badge}
    </div>
    <table class="table" style="margin-top: 0.5rem">
      <tbody>
        <tr><td>Price</td><td class="num"><b>${fmtPHP(product.price)}</b> per ${unit}</td></tr>
        <tr><td>Stock on hand</td><td class="num"><b>${product.stock}</b> ${unit}</td></tr>
        <tr><td>Minimum stock</td><td class="num">${product.minStock} ${unit}</td></tr>
      </tbody>
    </table>`;

  const addButton = document.getElementById('info-add-btn');
  const qtyInput = document.getElementById('info-qty');
  const sellable = product.active !== false && product.stock > 0;
  addButton.disabled = !sellable;
  qtyInput.disabled = !sellable;
  qtyInput.value = 1;
  qtyInput.max = Math.max(1, product.stock);
  openModal('modal-item-info');
}

async function showItemInfo(code) {
  try {
    const { product } = await API.get(`/api/products/code/${encodeURIComponent(code)}`);
    await closeScanner();
    openItemInfo(product);
  } catch (error) {
    // Keep the camera modal open so the cashier can retry.
    toast(error.message, 'error');
  }
}

// ---------------------------------------------------------------- camera scanner

async function openScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    return toast('Scanner library is not loaded.', 'error');
  }
  document.getElementById('camera-error').textContent = '';
  openModal('modal-camera');

  const formats = Html5QrcodeSupportedFormats;
  scanner = new Html5Qrcode('qr-reader', {
    formatsToSupport: [
      formats.QR_CODE, formats.CODE_128, formats.CODE_39,
      formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.UPC_E, formats.ITF,
    ],
    verbose: false,
  });

  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      onScanSuccess,
      () => { /* per-frame decode misses are normal — ignore */ },
    );
    scanning = true;
  } catch (error) {
    console.warn(error);
    document.getElementById('camera-error').textContent =
      'Camera unavailable. Open the app at http://localhost:3000 (or an HTTPS address), allow camera access, and try again — or type the code below.';
  }
}

async function closeScanner() {
  if (scanner && scanning) {
    try {
      await scanner.stop();
      scanner.clear();
    } catch { /* already stopped */ }
  }
  scanning = false;
  closeModal('modal-camera');
}

function onScanSuccess(decodedText) {
  if (scanBusy) return; // ignore repeat frames while a lookup is in flight
  scanBusy = true;
  showItemInfo(decodedText).finally(() => { scanBusy = false; });
}
