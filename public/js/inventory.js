/**
 * Inventory page — product & category management, restocking, stock
 * adjustments, and QR label printing.
 */
import { API } from './api.js';
import { toast, fmtPHP, escapeHtml, initPage, openModal, closeModal, printElement } from './ui.js';

const me = await initPage('manager');

let categories = [];
let products = [];
let editingId = null;

if (me) main();

async function main() {
  wireEvents();
  await loadCategories();
  await loadProducts();
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function wireEvents() {
  document.getElementById('prod-search').addEventListener('input', debounce(loadProducts, 250));
  for (const id of ['cat-filter', 'sort-select', 'dir-select', 'low-only', 'include-inactive']) {
    document.getElementById(id).addEventListener('change', loadProducts);
  }

  document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null));
  document.getElementById('print-labels-btn').addEventListener('click', printSelectedLabels);
  document.getElementById('products-body').addEventListener('click', onTableClick);
  document.getElementById('category-list').addEventListener('click', onCategoryClick);

  document.getElementById('product-form').addEventListener('submit', submitProduct);
  document.getElementById('restock-form').addEventListener('submit', submitRestock);
  document.getElementById('adjust-form').addEventListener('submit', submitAdjust);
  document.getElementById('category-form').addEventListener('submit', addCategory);

  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });
}

// ---------------------------------------------------------------- loading

async function loadCategories() {
  const { categories: list } = await API.get('/api/categories');
  categories = list;

  document.getElementById('category-list').innerHTML = categories.length === 0
    ? '<div class="empty">No categories yet.</div>'
    : categories.map((c) => `
        <div class="job-item">
          <span>${escapeHtml(c.name)}</span>
          <span>
            <button class="btn small secondary" data-rename="${c.id}" type="button">Rename</button>
            <button class="btn small danger" data-delete="${c.id}" type="button">Delete</button>
          </span>
        </div>`).join('');

  const filter = document.getElementById('cat-filter');
  filter.innerHTML = '<option value="">All categories</option>'
    + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  filter.value = document.getElementById('cat-filter').dataset.value ?? filter.value;

  const select = document.getElementById('pf-category');
  select.innerHTML = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function loadProducts() {
  const params = new URLSearchParams({
    search: document.getElementById('prod-search').value,
    categoryId: document.getElementById('cat-filter').value,
    sort: document.getElementById('sort-select').value,
    dir: document.getElementById('dir-select').value,
  });
  if (document.getElementById('low-only').checked) params.set('lowOnly', '1');
  if (document.getElementById('include-inactive').checked) params.set('includeInactive', '1');

  const { products: list } = await API.get(`/api/products?${params.toString()}`);
  products = list;
  renderProducts();
}

function renderProducts() {
  const body = document.getElementById('products-body');
  if (products.length === 0) {
    body.innerHTML = '<tr><td colspan="9" class="empty">No products match the filters.</td></tr>';
    return;
  }

  body.innerHTML = products.map((p) => {
    const stockBadge = p.stock === 0
      ? '<span class="badge out">Out</span>'
      : (p.low ? '<span class="badge low">Low</span>' : '');
    const status = p.active
      ? '<span class="badge ok">Active</span>'
      : '<span class="badge off">Archived</span>';
    const archiveButton = p.active
      ? `<button class="btn small danger" data-action="archive" data-id="${p.id}" type="button">Archive</button>`
      : `<button class="btn small" data-action="activate" data-id="${p.id}" type="button">Reactivate</button>`;

    return `
      <tr class="${p.low ? 'low' : ''} ${p.active ? '' : 'inactive'}">
        <td><input type="checkbox" class="row-check" data-id="${p.id}" aria-label="Select ${escapeHtml(p.name)}"></td>
        <td>${escapeHtml(p.name)}</td>
        <td class="mono">${escapeHtml(p.code)}</td>
        <td>${escapeHtml(p.categoryName)}</td>
        <td class="num">${fmtPHP(p.price)}</td>
        <td class="num">${p.stock} ${stockBadge}</td>
        <td class="num">${p.minStock}</td>
        <td>${status}</td>
        <td>
          <button class="btn small secondary" data-action="edit" data-id="${p.id}" type="button">Edit</button>
          <button class="btn small secondary" data-action="restock" data-id="${p.id}" type="button">Restock</button>
          <button class="btn small secondary" data-action="adjust" data-id="${p.id}" type="button">Adjust</button>
          <button class="btn small secondary" data-action="label" data-id="${p.id}" type="button">Label</button>
          ${archiveButton}
        </td>
      </tr>`;
  }).join('');
}

// ---------------------------------------------------------------- row actions

async function onTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  const product = products.find((p) => p.id === id);
  if (!product) return;

  if (action === 'edit') openProductModal(product);
  else if (action === 'restock') openRestock(product);
  else if (action === 'adjust') openAdjust(product);
  else if (action === 'label') printLabels([id]);
  else if (action === 'archive') await archiveProduct(product);
  else if (action === 'activate') await activateProduct(product);
}

// ---------------------------------------------------------------- product form

function openProductModal(product) {
  editingId = product ? product.id : null;
  const form = document.getElementById('product-form');
  form.reset();

  document.getElementById('product-modal-title').textContent = product ? `Edit — ${product.name}` : 'New product';
  form.name.value = product?.name ?? '';
  form.code.value = product?.code ?? '';
  form.categoryId.value = product?.categoryId ?? categories[0]?.id ?? '';
  form.price.value = product?.price ?? '';
  form.unit.value = product?.unit ?? 'pc';
  form.minStock.value = product?.minStock ?? 5;
  form.stock.value = product?.stock ?? 0;

  document.getElementById('pf-stock-wrap').style.display = product ? 'none' : '';
  document.getElementById('pf-active-wrap').style.display = product ? '' : 'none';
  if (product) form.active.checked = product.active;

  openModal('modal-product');
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    name: form.name.value,
    code: form.code.value,
    categoryId: form.categoryId.value,
    price: form.price.value,
    unit: form.unit.value,
    minStock: form.minStock.value,
  };

  try {
    if (editingId) {
      payload.active = form.active.checked;
      const { product } = await API.patch(`/api/products/${editingId}`, payload);
      toast(`Saved "${product.name}".`, 'success');
    } else {
      payload.stock = form.stock.value;
      const { product } = await API.post('/api/products', payload);
      toast(`Added "${product.name}" (${product.code}).`, 'success');
    }
    closeModal('modal-product');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function archiveProduct(product) {
  const ok = confirm(
    product.active
      ? `Archive "${product.name}"?\n\nProducts with sales history are archived (kept for reports); products without history are deleted.`
      : `Delete "${product.name}"?`,
  );
  if (!ok) return;
  try {
    const result = await API.del(`/api/products/${product.id}`);
    toast(result.archived ? `"${product.name}" archived.` : `"${product.name}" deleted.`, 'success');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function activateProduct(product) {
  try {
    await API.patch(`/api/products/${product.id}`, { active: true });
    toast(`"${product.name}" reactivated.`, 'success');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ---------------------------------------------------------------- restock & adjust

function openRestock(product) {
  const form = document.getElementById('restock-form');
  form.reset();
  form.id.value = product.id;
  document.getElementById('rs-name').textContent = `${product.name} (${product.code}) — current stock: ${product.stock} ${product.unit}`;
  openModal('modal-restock');
}

async function submitRestock(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const { product } = await API.post(`/api/products/${form.id.value}/restock`, {
      qty: form.qty.value,
      note: form.note.value,
    });
    toast(`${product.name} restocked — new stock: ${product.stock}.`, 'success');
    closeModal('modal-restock');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openAdjust(product) {
  const form = document.getElementById('adjust-form');
  form.reset();
  form.id.value = product.id;
  document.getElementById('ad-name').textContent = `${product.name} (${product.code}) — current stock: ${product.stock} ${product.unit}`;
  openModal('modal-adjust');
}

async function submitAdjust(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const { product } = await API.post(`/api/products/${form.id.value}/adjust`, {
      delta: form.delta.value,
      note: form.note.value,
    });
    toast(`${product.name} adjusted — new stock: ${product.stock}.`, 'success');
    closeModal('modal-adjust');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ---------------------------------------------------------------- QR labels

async function printSelectedLabels() {
  const ids = [...document.querySelectorAll('.row-check:checked')].map((cb) => cb.dataset.id);
  await printLabels(ids);
}

async function printLabels(ids) {
  if (ids.length === 0) return toast('Tick at least one product first.', 'error');
  try {
    const labels = [];
    for (const id of ids) {
      const { label } = await API.get(`/api/products/${id}/label`);
      labels.push(label);
    }
    const html = `<div class="label-sheet">
      ${labels.map((label) => `
        <div class="label">
          <img src="${label.dataUrl}" alt="${escapeHtml(label.code)}">
          <div class="name">${escapeHtml(label.name)}</div>
          <div class="code">${escapeHtml(label.code)}</div>
          <div class="price">${fmtPHP(label.price)} / ${escapeHtml(label.unit)}</div>
        </div>`).join('')}
    </div>`;
    printElement(html);
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ---------------------------------------------------------------- categories

async function addCategory(event) {
  event.preventDefault();
  const input = document.getElementById('category-name');
  try {
    await API.post('/api/categories', { name: input.value });
    input.value = '';
    toast('Category added.', 'success');
    await loadCategories();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function onCategoryClick(event) {
  const renameButton = event.target.closest('button[data-rename]');
  const deleteButton = event.target.closest('button[data-delete]');

  if (renameButton) {
    const category = categories.find((c) => c.id === renameButton.dataset.rename);
    const name = prompt('New category name:', category?.name ?? '');
    if (!name) return;
    try {
      await API.patch(`/api/categories/${category.id}`, { name });
      toast('Category renamed.', 'success');
      await loadCategories();
      await loadProducts();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  if (deleteButton) {
    const category = categories.find((c) => c.id === deleteButton.dataset.delete);
    if (!confirm(`Delete category "${category?.name}"?`)) return;
    try {
      await API.del(`/api/categories/${category.id}`);
      toast('Category deleted.', 'success');
      await loadCategories();
      await loadProducts();
    } catch (error) {
      toast(error.message, 'error');
    }
  }
}
