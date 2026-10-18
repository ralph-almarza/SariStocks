/**
 * Store — the data layer of SariStocks.
 *
 * Everything else (routes, business rules) asks this class for data; it never
 * touches the data structures directly. Responsibilities:
 *
 *   - Load JSON collections from disk at startup into in-memory structures
 *   - Keep the working copies: hash tables (products by code, users by
 *     username, cart lines by code), sets (used codes), a doubly linked list
 *     (cart lines), two stacks (cart undo/redo), a queue (receipt print
 *     jobs), and a min-heap (low-stock alert priority)
 *   - Apply every mutation to memory first, then persist the affected
 *     collection atomically (temp file + rename, .bak kept)
 *   - Provide the operations the API needs: lookup, cart, checkout,
 *     restock, adjustments, reports aggregation, alerts, backups
 */
import { HashTable } from '../lib/hashTable.js';
import { MinHeap } from '../lib/minHeap.js';
import { Stack } from '../lib/stack.js';
import { Queue } from '../lib/queue.js';
import { DoublyLinkedList } from '../lib/linkedList.js';
import { mergeSort, quickSort, topN } from '../lib/sorting.js';
import { hashPassword } from '../lib/password.js';
import { httpError, nowIso, round2, todayStr } from '../lib/util.js';
import { Persistence } from './persistence.js';
import { makeSeedData } from './seedData.js';

const ROLE_LEVEL = { cashier: 1, manager: 2, admin: 3 };

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function dateNDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function maxNumericId(items, prefix) {
  let max = 0;
  for (const item of items) {
    if (typeof item?.id === 'string' && item.id.startsWith(prefix)) {
      const n = Number.parseInt(item.id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

export class Store {
  constructor(dataDir) {
    this.persistence = new Persistence(dataDir);

    // In-memory structures.
    this.productsByCode = new HashTable(); // barcode/QR code -> product
    this.productsById = new Map();
    this.usersByUsername = new HashTable(); // username -> user
    this.usersById = new Map();
    this.categoriesById = new Map();
    this.salesById = new Map();
    this.alertsById = new Map();
    this.openAlertByProduct = new Map(); // productId -> open alert
    this.codesUsed = new Set(); // unique product codes
    this.carts = new Map(); // sessionId -> cart (volatile)
    this.printQueue = new Queue(); // FIFO receipt print jobs
    this.alertHeap = new MinHeap((a, b) => this.#alertCompare(a, b));
  }

  /**
   * Load collections from disk (seeding on first run), rebuild every index,
   * and reconcile alerts against current stock levels.
   */
  init() {
    if (!this.persistence.exists('users')) {
      const seed = makeSeedData();
      for (const [name, data] of Object.entries(seed)) this.persistence.save(name, data);
      console.log('[data] First run: seeded demo dataset (see README for accounts).');
    }

    this.settings = this.persistence.load('settings') ?? {
      storeName: 'SariStocks',
      receiptHeader: '',
      receiptFooter: '',
      defaultMinStock: 5,
      lowStockAlertsEnabled: true,
    };
    this.users = this.persistence.load('users') ?? [];
    this.categories = this.persistence.load('categories') ?? [];
    this.products = this.persistence.load('products') ?? [];
    this.sales = this.persistence.load('sales') ?? [];
    this.alerts = this.persistence.load('alerts') ?? [];
    this.movements = this.persistence.load('stock_movements') ?? [];

    this.#rebuildIndexes();

    this.ids = {
      product: maxNumericId(this.products, 'p_'),
      user: maxNumericId(this.users, 'u_'),
      category: maxNumericId(this.categories, 'c_'),
      sale: maxNumericId(this.sales, 's_'),
      movement: maxNumericId(this.movements, 'm_'),
      alert: maxNumericId(this.alerts, 'a_'),
      printJob: 0,
    };

    // Create alerts for anything already below its minimum, and clear
    // alerts that are no longer valid (e.g. after a manual file edit).
    const changed = this.#reconcileAlerts(
      this.products.filter((p) => p.active).map((p) => p.id),
      nowIso(),
    );
    if (changed) this.persistence.save('alerts', this.alerts);
  }

  #rebuildIndexes() {
    this.productsByCode = new HashTable();
    this.productsById = new Map();
    this.codesUsed = new Set();
    for (const p of this.products) {
      this.productsByCode.set(p.code, p);
      this.productsById.set(p.id, p);
      this.codesUsed.add(p.code);
    }

    this.usersByUsername = new HashTable();
    this.usersById = new Map();
    for (const u of this.users) {
      this.usersByUsername.set(u.username.toLowerCase(), u);
      this.usersById.set(u.id, u);
    }

    this.categoriesById = new Map(this.categories.map((c) => [c.id, c]));
    this.salesById = new Map(this.sales.map((s) => [s.id, s]));

    this.alertsById = new Map();
    this.openAlertByProduct = new Map();
    for (const a of this.alerts) {
      this.alertsById.set(a.id, a);
      if (a.status === 'open') this.openAlertByProduct.set(a.productId, a);
    }
    this.#rebuildAlertHeap();
  }

  #nextId(kind, prefix, padLength) {
    this.ids[kind] += 1;
    return `${prefix}_${String(this.ids[kind]).padStart(padLength, '0')}`;
  }

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  getUserByUsername(username) {
    return this.usersByUsername.get(String(username ?? '').trim().toLowerCase());
  }

  getUserById(id) {
    return this.usersById.get(id);
  }

  listUsers() {
    return mergeSort(this.users, (a, b) => a.name.localeCompare(b.name));
  }

  createUser({ name, username, password, role }) {
    const cleanName = String(name ?? '').trim();
    const cleanUsername = String(username ?? '').trim().toLowerCase();
    if (!cleanName) throw httpError(400, 'Name is required.');
    if (!cleanUsername) throw httpError(400, 'Username is required.');
    if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername)) {
      throw httpError(400, 'Username must be 3-24 characters: letters, numbers, dot, dash, underscore.');
    }
    if (String(password ?? '').length < 6) throw httpError(400, 'Password must be at least 6 characters.');
    if (!ROLE_LEVEL[role]) throw httpError(400, 'Role must be cashier, manager, or admin.');
    if (this.usersByUsername.has(cleanUsername)) throw httpError(409, `Username "${cleanUsername}" is already taken.`);

    const user = {
      id: this.#nextId('user', 'u', 3),
      name: cleanName,
      username: cleanUsername,
      passwordHash: hashPassword(password),
      role,
      active: true,
      createdAt: nowIso(),
    };
    this.users.push(user);
    this.usersByUsername.set(cleanUsername, user);
    this.usersById.set(user.id, user);
    this.persistence.save('users', this.users);
    return user;
  }

  updateUser(id, patch) {
    const user = this.usersById.get(id);
    if (!user) throw httpError(404, 'User not found.');
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) throw httpError(400, 'Name cannot be empty.');
      user.name = name;
    }
    if (patch.role !== undefined) {
      if (!ROLE_LEVEL[patch.role]) throw httpError(400, 'Role must be cashier, manager, or admin.');
      user.role = patch.role;
    }
    if (patch.active !== undefined) user.active = Boolean(patch.active);
    if (patch.password !== undefined && patch.password !== '') {
      if (String(patch.password).length < 6) throw httpError(400, 'Password must be at least 6 characters.');
      user.passwordHash = hashPassword(patch.password);
    }
    this.persistence.save('users', this.users);
    return user;
  }

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------

  listCategories() {
    return mergeSort(this.categories, (a, b) => a.name.localeCompare(b.name));
  }

  createCategory(name) {
    const clean = String(name ?? '').trim();
    if (!clean) throw httpError(400, 'Category name is required.');
    if (this.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw httpError(409, `A category named "${clean}" already exists.`);
    }
    const category = { id: this.#nextId('category', 'c', 3), name: clean };
    this.categories.push(category);
    this.categoriesById.set(category.id, category);
    this.persistence.save('categories', this.categories);
    return category;
  }

  renameCategory(id, name) {
    const category = this.categoriesById.get(id);
    if (!category) throw httpError(404, 'Category not found.');
    const clean = String(name ?? '').trim();
    if (!clean) throw httpError(400, 'Category name is required.');
    if (this.categories.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) {
      throw httpError(409, `A category named "${clean}" already exists.`);
    }
    category.name = clean;
    this.persistence.save('categories', this.categories);
    return category;
  }

  deleteCategory(id) {
    const category = this.categoriesById.get(id);
    if (!category) throw httpError(404, 'Category not found.');
    const inUse = this.products.filter((p) => p.categoryId === id).length;
    if (inUse > 0) throw httpError(409, `Cannot delete "${category.name}": it is used by ${inUse} product(s).`);
    this.categories = this.categories.filter((c) => c.id !== id);
    this.categoriesById.delete(id);
    this.persistence.save('categories', this.categories);
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Products
  // ------------------------------------------------------------------

  getProductByCode(code) {
    return this.productsByCode.get(normalizeCode(code));
  }

  getProductById(id) {
    return this.productsById.get(id);
  }

  listProducts({ search = '', categoryId = '', sort = 'name', dir = 'asc', includeInactive = false, lowOnly = false } = {}) {
    let list = this.products.filter((p) => includeInactive || p.active);
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (lowOnly) list = list.filter((p) => p.stock <= p.minStock);
    if (search) {
      const q = String(search).trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }

    const keyOf = {
      name: (p) => p.name.toLowerCase(),
      code: (p) => p.code.toLowerCase(),
      price: (p) => p.price,
      stock: (p) => p.stock,
      updated: (p) => p.updatedAt ?? '',
    }[sort] ?? ((p) => p.name.toLowerCase());

    const compare = (a, b) => {
      const va = keyOf(a);
      const vb = keyOf(b);
      let r = va < vb ? -1 : va > vb ? 1 : 0;
      if (r === 0) r = a.name.localeCompare(b.name);
      return dir === 'desc' ? -r : r;
    };

    return mergeSort(list, compare).map((p) => ({
      ...p,
      categoryName: this.categoriesById.get(p.categoryId)?.name ?? 'Uncategorized',
      low: p.stock <= p.minStock,
    }));
  }

  createProduct({ code, name, categoryId, price, stock = 0, minStock, unit = 'pc' }) {
    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw httpError(400, 'Product name is required.');
    if (!this.categoriesById.has(categoryId)) throw httpError(400, 'Please choose a valid category.');

    const cleanPrice = round2(Number(price));
    if (!Number.isFinite(cleanPrice) || cleanPrice < 0) throw httpError(400, 'Price must be zero or greater.');

    const cleanStock = Number.parseInt(stock, 10);
    if (!Number.isInteger(cleanStock) || cleanStock < 0) throw httpError(400, 'Stock must be a whole number of zero or greater.');

    const cleanMin = Number.parseInt(minStock ?? this.settings.defaultMinStock, 10);
    if (!Number.isInteger(cleanMin) || cleanMin < 0) throw httpError(400, 'Minimum stock must be a whole number of zero or greater.');

    let cleanCode = normalizeCode(code);
    if (cleanCode) {
      if (!/^[A-Z0-9][A-Z0-9.\-]{2,31}$/.test(cleanCode)) {
        throw httpError(400, 'Code must be 3-32 characters: letters, numbers, dot, or dash.');
      }
      if (this.codesUsed.has(cleanCode)) throw httpError(409, `Code "${cleanCode}" is already used by another product.`);
    } else {
      do {
        this.ids.product += 1;
        cleanCode = `SS-${String(this.ids.product).padStart(4, '0')}`;
      } while (this.codesUsed.has(cleanCode));
    }

    const product = {
      id: this.#nextId('product', 'p', 4),
      code: cleanCode,
      name: cleanName,
      categoryId,
      price: cleanPrice,
      stock: cleanStock,
      minStock: cleanMin,
      unit: String(unit ?? 'pc').trim() || 'pc',
      active: true,
      updatedAt: nowIso(),
    };

    this.products.push(product);
    this.productsById.set(product.id, product);
    this.productsByCode.set(product.code, product);
    this.codesUsed.add(product.code);

    if (cleanStock > 0) {
      this.#addMovement(product, cleanStock, 'initial', null, null, 'Initial stock on product creation');
    }
    const alertsChanged = this.#reconcileAlerts([product.id], nowIso());

    this.persistence.save('products', this.products);
    if (cleanStock > 0) this.persistence.save('stock_movements', this.movements);
    if (alertsChanged) this.persistence.save('alerts', this.alerts);
    return product;
  }

  updateProduct(id, patch) {
    const product = this.productsById.get(id);
    if (!product) throw httpError(404, 'Product not found.');
    if (patch.stock !== undefined) {
      throw httpError(400, 'Stock cannot be edited directly — use Restock or Adjust instead.');
    }
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) throw httpError(400, 'Product name cannot be empty.');
      product.name = name;
    }
    if (patch.categoryId !== undefined) {
      if (!this.categoriesById.has(patch.categoryId)) throw httpError(400, 'Please choose a valid category.');
      product.categoryId = patch.categoryId;
    }
    if (patch.price !== undefined) {
      const price = round2(Number(patch.price));
      if (!Number.isFinite(price) || price < 0) throw httpError(400, 'Price must be zero or greater.');
      product.price = price;
    }
    if (patch.minStock !== undefined) {
      const min = Number.parseInt(patch.minStock, 10);
      if (!Number.isInteger(min) || min < 0) throw httpError(400, 'Minimum stock must be a whole number of zero or greater.');
      product.minStock = min;
    }
    if (patch.unit !== undefined) product.unit = String(patch.unit).trim() || 'pc';
    if (patch.active !== undefined) product.active = Boolean(patch.active);
    if (patch.code !== undefined) {
      const code = normalizeCode(patch.code);
      if (!/^[A-Z0-9][A-Z0-9.\-]{2,31}$/.test(code)) {
        throw httpError(400, 'Code must be 3-32 characters: letters, numbers, dot, or dash.');
      }
      if (code !== product.code) {
        if (this.codesUsed.has(code)) throw httpError(409, `Code "${code}" is already used by another product.`);
        this.productsByCode.delete(product.code);
        this.codesUsed.delete(product.code);
        product.code = code;
        this.productsByCode.set(code, product);
        this.codesUsed.add(code);
      }
    }
    product.updatedAt = nowIso();
    const alertsChanged = this.#reconcileAlerts([product.id], nowIso());
    this.persistence.save('products', this.products);
    if (alertsChanged) this.persistence.save('alerts', this.alerts);
    return product;
  }

  /**
   * Archive a product when history references it, otherwise remove it.
   * Sales and movements must stay truthful, so referenced products are
   * never hard-deleted.
   */
  deleteProduct(id) {
    const product = this.productsById.get(id);
    if (!product) throw httpError(404, 'Product not found.');
    const referencedBySale = this.sales.some((s) => s.lines.some((l) => l.productId === id));
    const referencedByMovement = this.movements.some((m) => m.productId === id);
    if (referencedBySale || referencedByMovement) {
      product.active = false;
      product.updatedAt = nowIso();
      this.persistence.save('products', this.products);
      return { archived: true, product };
    }
    this.products = this.products.filter((p) => p.id !== id);
    this.productsById.delete(id);
    this.productsByCode.delete(product.code);
    this.codesUsed.delete(product.code);
    this.persistence.save('products', this.products);
    return { archived: false, product };
  }

  restock(id, qty, note, user) {
    const product = this.productsById.get(id);
    if (!product) throw httpError(404, 'Product not found.');
    if (!product.active) throw httpError(409, 'This product is archived — reactivate it first.');
    const amount = Number.parseInt(qty, 10);
    if (!Number.isInteger(amount) || amount <= 0) throw httpError(400, 'Quantity received must be a whole number of 1 or more.');
    product.stock += amount;
    product.updatedAt = nowIso();
    const movement = this.#addMovement(product, amount, 'restock', null, user.id, note || null);
    const alertsChanged = this.#reconcileAlerts([product.id], nowIso());
    this.persistence.save('products', this.products);
    this.persistence.save('stock_movements', this.movements);
    if (alertsChanged) this.persistence.save('alerts', this.alerts);
    return { product, movement };
  }

  adjustStock(id, delta, note, user) {
    const product = this.productsById.get(id);
    if (!product) throw httpError(404, 'Product not found.');
    const amount = Number.parseInt(delta, 10);
    if (!Number.isInteger(amount) || amount === 0) throw httpError(400, 'Adjustment must be a non-zero whole number (e.g. -3 or 5).');
    if (product.stock + amount < 0) {
      throw httpError(400, `Adjustment would make stock negative (current: ${product.stock}).`);
    }
    product.stock += amount;
    product.updatedAt = nowIso();
    const movement = this.#addMovement(product, amount, 'adjustment', null, user.id, note || null);
    const alertsChanged = this.#reconcileAlerts([product.id], nowIso());
    this.persistence.save('products', this.products);
    this.persistence.save('stock_movements', this.movements);
    if (alertsChanged) this.persistence.save('alerts', this.alerts);
    return { product, movement };
  }

  #addMovement(product, delta, reason, refId, userId, note) {
    const movement = {
      id: this.#nextId('movement', 'm', 6),
      at: nowIso(),
      productId: product.id,
      delta,
      reason,
      refId,
      userId,
      note,
      stockAfter: product.stock,
    };
    this.movements.push(movement);
    return movement;
  }

  listMovements({ productId = '', from = '', to = '', reason = '', limit = 300 } = {}) {
    let list = this.movements;
    if (productId) list = list.filter((m) => m.productId === productId);
    if (reason) list = list.filter((m) => m.reason === reason);
    if (from) list = list.filter((m) => m.at.slice(0, 10) >= from);
    if (to) list = list.filter((m) => m.at.slice(0, 10) <= to);
    const sorted = quickSort(list.slice(), (a, b) => b.id.localeCompare(a.id)); // newest first
    return sorted.slice(0, Number(limit) || 300).map((m) => ({
      ...m,
      productName: this.productsById.get(m.productId)?.name ?? 'Unknown',
    }));
  }

  // ------------------------------------------------------------------
  // Cart (per cashier session: doubly linked list + hash map + 2 stacks)
  // ------------------------------------------------------------------

  #createCart() {
    return {
      list: new DoublyLinkedList(),
      nodesByCode: new HashTable(), // code -> linked-list node (O(1) duplicate scans)
      undoStack: new Stack(),
      redoStack: new Stack(),
      total: 0, // maintained incrementally, never recomputed
    };
  }

  getOrCreateCart(sessionId) {
    if (!this.carts.has(sessionId)) this.carts.set(sessionId, this.#createCart());
    return this.carts.get(sessionId);
  }

  /** Add `qty` units of a product (by code) as one undoable cart action. */
  addToCart(sessionId, rawCode, rawQty = 1) {
    const code = normalizeCode(rawCode);
    if (!code) throw httpError(400, 'Product code is required.');
    const qty = Number.parseInt(rawQty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw httpError(400, 'Quantity must be a whole number between 1 and 999.');
    }
    const product = this.getProductByCode(code);
    if (!product) throw httpError(404, `No product found for code "${code}".`);
    if (!product.active) throw httpError(409, `"${product.name}" is archived and cannot be sold.`);

    const cart = this.getOrCreateCart(sessionId);
    const node = cart.nodesByCode.get(product.code);
    const action = {
      type: 'add',
      code: product.code,
      productId: product.id,
      name: product.name,
      price: product.price,
      qtyBefore: node ? node.value.qty : 0,
      qtyAdded: qty,
    };

    if (node) {
      node.value.qty += qty; // already in the cart: bump in O(1) via the hash map
    } else {
      const newNode = cart.list.append({
        productId: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        qty,
      });
      cart.nodesByCode.set(product.code, newNode);
    }
    cart.total = round2(cart.total + qty * product.price);
    this.#pushCartAction(cart, action);
    return this.cartSnapshot(sessionId);
  }

  setCartQty(sessionId, rawCode, qty) {
    const code = normalizeCode(rawCode);
    const cart = this.getOrCreateCart(sessionId);
    const node = cart.nodesByCode.get(code);
    if (!node) throw httpError(404, 'That item is not in the cart.');
    const amount = Number.parseInt(qty, 10);
    if (!Number.isInteger(amount) || amount < 0) throw httpError(400, 'Quantity must be a whole number of zero or more.');
    if (amount === 0) return this.removeFromCart(sessionId, rawCode);
    if (amount === node.value.qty) return this.cartSnapshot(sessionId);

    const action = { type: 'setQty', code, qtyBefore: node.value.qty, qtyAfter: amount, price: node.value.price };
    cart.total = round2(cart.total + (amount - node.value.qty) * node.value.price);
    node.value.qty = amount;
    this.#pushCartAction(cart, action);
    return this.cartSnapshot(sessionId);
  }

  removeFromCart(sessionId, rawCode) {
    const code = normalizeCode(rawCode);
    const cart = this.getOrCreateCart(sessionId);
    const node = cart.nodesByCode.get(code);
    if (!node) throw httpError(404, 'That item is not in the cart.');

    const action = {
      type: 'remove',
      snapshot: { ...node.value },
      prevCode: node.prev ? node.prev.value.code : null,
      nextCode: node.next ? node.next.value.code : null,
    };
    cart.total = round2(cart.total - node.value.qty * node.value.price);
    cart.list.remove(node);
    cart.nodesByCode.delete(code);
    this.#pushCartAction(cart, action);
    return this.cartSnapshot(sessionId);
  }

  undoCart(sessionId) {
    const cart = this.getOrCreateCart(sessionId);
    if (cart.undoStack.isEmpty()) throw httpError(400, 'Nothing to undo.');
    const action = cart.undoStack.pop();
    this.#revertCartAction(cart, action);
    cart.redoStack.push(action);
    return this.cartSnapshot(sessionId);
  }

  redoCart(sessionId) {
    const cart = this.getOrCreateCart(sessionId);
    if (cart.redoStack.isEmpty()) throw httpError(400, 'Nothing to redo.');
    const action = cart.redoStack.pop();
    this.#applyCartAction(cart, action);
    cart.undoStack.push(action);
    return this.cartSnapshot(sessionId);
  }

  clearCart(sessionId) {
    const cart = this.getOrCreateCart(sessionId);
    cart.list.clear();
    cart.nodesByCode.clear();
    cart.undoStack.clear();
    cart.redoStack.clear();
    cart.total = 0;
    return this.cartSnapshot(sessionId);
  }

  cartSnapshot(sessionId) {
    const cart = this.getOrCreateCart(sessionId);
    const lines = cart.list.toArray().map((line) => {
      const product = this.productsById.get(line.productId);
      const stockAvailable = product ? product.stock : 0;
      return {
        ...line,
        lineTotal: round2(line.price * line.qty),
        stockAvailable,
        overStock: line.qty > stockAvailable,
        active: product ? product.active : false,
      };
    });
    return {
      lines,
      total: cart.total,
      itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
      canUndo: !cart.undoStack.isEmpty(),
      canRedo: !cart.redoStack.isEmpty(),
    };
  }

  #pushCartAction(cart, action) {
    cart.undoStack.push(action);
    cart.redoStack.clear(); // a new action invalidates the redo history
  }

  /** Redo: re-apply the original effect of an action. */
  #applyCartAction(cart, action) {
    if (action.type === 'add') {
      const added = action.qtyAdded ?? 1;
      const node = cart.nodesByCode.get(action.code);
      if (node) {
        node.value.qty = action.qtyBefore + added;
      } else {
        const newNode = cart.list.append({
          productId: action.productId,
          code: action.code,
          name: action.name,
          price: action.price,
          qty: action.qtyBefore + added,
        });
        cart.nodesByCode.set(action.code, newNode);
      }
      cart.total = round2(cart.total + added * action.price);
    } else if (action.type === 'remove') {
      const node = cart.nodesByCode.get(action.snapshot.code);
      if (node) {
        cart.total = round2(cart.total - action.snapshot.qty * action.snapshot.price);
        cart.list.remove(node);
        cart.nodesByCode.delete(action.snapshot.code);
      }
    } else if (action.type === 'setQty') {
      const node = cart.nodesByCode.get(action.code);
      if (node) {
        cart.total = round2(cart.total + (action.qtyAfter - action.qtyBefore) * action.price);
        node.value.qty = action.qtyAfter;
      }
    }
  }

  /** Undo: reverse the effect of an action. */
  #revertCartAction(cart, action) {
    if (action.type === 'add') {
      const node = cart.nodesByCode.get(action.code);
      if (!node) return;
      if (action.qtyBefore === 0) {
        cart.list.remove(node);
        cart.nodesByCode.delete(action.code);
      } else {
        node.value.qty = action.qtyBefore;
      }
      cart.total = round2(cart.total - (action.qtyAdded ?? 1) * action.price);
    } else if (action.type === 'remove') {
      if (cart.nodesByCode.has(action.snapshot.code)) return;
      const nextNode = action.nextCode ? cart.nodesByCode.get(action.nextCode) : undefined;
      const prevNode = action.prevCode ? cart.nodesByCode.get(action.prevCode) : undefined;
      let node;
      if (nextNode) node = cart.list.insertBefore(nextNode, { ...action.snapshot });
      else if (prevNode) node = cart.list.insertAfter(prevNode, { ...action.snapshot });
      else node = cart.list.append({ ...action.snapshot });
      cart.nodesByCode.set(action.snapshot.code, node);
      cart.total = round2(cart.total + action.snapshot.qty * action.snapshot.price);
    } else if (action.type === 'setQty') {
      const node = cart.nodesByCode.get(action.code);
      if (node) {
        cart.total = round2(cart.total + (action.qtyBefore - action.qtyAfter) * action.price);
        node.value.qty = action.qtyBefore;
      }
    }
  }

  // ------------------------------------------------------------------
  // Checkout (all-or-nothing) + sales + reports
  // ------------------------------------------------------------------

  completeSale(sessionId, cashier, paidRaw) {
    const cart = this.getOrCreateCart(sessionId);
    if (cart.list.length === 0) throw httpError(400, 'The cart is empty.');

    const paid = round2(Number(paidRaw));
    if (!Number.isFinite(paid)) throw httpError(400, 'Amount tendered is required.');

    const lines = cart.list.toArray().map((line) => ({ ...line }));
    for (const line of lines) {
      const product = this.productsById.get(line.productId);
      if (!product || !product.active) throw httpError(409, `"${line.name}" is no longer available.`);
      if (product.stock < line.qty) {
        throw httpError(409, `Not enough stock for "${product.name}": ${product.stock} left, ${line.qty} in cart.`);
      }
    }

    const total = round2(lines.reduce((sum, l) => sum + round2(l.price * l.qty), 0));
    if (paid < total) throw httpError(400, `Amount tendered (${paid.toFixed(2)}) is less than the total (${total.toFixed(2)}).`);
    const change = round2(paid - total);

    const at = nowIso();
    const sale = {
      id: this.#nextId('sale', 's', 6),
      at,
      cashierId: cashier.id,
      cashierName: cashier.name,
      lines: lines.map((l) => ({
        productId: l.productId,
        code: l.code,
        name: l.name,
        qty: l.qty,
        unitPrice: l.price,
        lineTotal: round2(l.price * l.qty),
      })),
      total,
      paid,
      change,
    };

    // Snapshot everything we are about to touch so we can roll back in memory
    // if a disk write fails mid-commit.
    const stockBefore = new Map();
    for (const line of lines) stockBefore.set(line.productId, this.productsById.get(line.productId).stock);
    const alertsSnapshot = structuredClone(this.alerts);
    const movementCount = this.movements.length;

    // Apply the whole sale to memory first.
    this.sales.push(sale);
    this.salesById.set(sale.id, sale);
    const saleMovements = [];
    for (const line of lines) {
      const product = this.productsById.get(line.productId);
      product.stock -= line.qty;
      product.updatedAt = at;
      saleMovements.push(this.#addMovement(product, -line.qty, 'sale', sale.id, cashier.id, null));
    }
    const alertsChanged = this.#reconcileAlerts(lines.map((l) => l.productId), at);

    // Persist: if anything throws, restore memory and best-effort re-save.
    try {
      this.persistence.save('sales', this.sales);
      this.persistence.save('products', this.products);
      this.persistence.save('stock_movements', this.movements);
      if (alertsChanged) this.persistence.save('alerts', this.alerts);
    } catch (err) {
      for (const [productId, stock] of stockBefore) this.productsById.get(productId).stock = stock;
      this.sales.pop();
      this.salesById.delete(sale.id);
      this.movements.splice(movementCount);
      this.alerts = alertsSnapshot;
      this.#rebuildIndexes();
      try {
        this.persistence.save('sales', this.sales);
        this.persistence.save('products', this.products);
        this.persistence.save('stock_movements', this.movements);
        this.persistence.save('alerts', this.alerts);
      } catch {
        /* disk is failing; the .bak files still hold the previous good state */
      }
      throw httpError(500, 'Checkout could not be saved. No changes were committed.');
    }

    // Reset the cart and queue the receipt print job (FIFO).
    this.clearCart(sessionId);
    this.enqueueReceipt(sale);
    return { sale, change };
  }

  getSale(id) {
    return this.salesById.get(id);
  }

  listSales({ from = '', to = '', cashierId = '', limit = 200 } = {}) {
    let list = this.sales.filter(
      (s) => (!from || s.at.slice(0, 10) >= from) && (!to || s.at.slice(0, 10) <= to) && (!cashierId || s.cashierId === cashierId),
    );
    const sorted = quickSort(list.slice(), (a, b) => b.id.localeCompare(a.id)); // newest first
    return sorted.slice(0, Number(limit) || 200);
  }

  dailyTotals(from = '', to = '') {
    const table = new HashTable();
    for (const sale of this.sales) {
      const date = sale.at.slice(0, 10);
      if (from && date < from) continue;
      if (to && date > to) continue;
      const entry = table.get(date) ?? { date, total: 0, transactions: 0, items: 0 };
      entry.total = round2(entry.total + sale.total);
      entry.transactions += 1;
      entry.items += sale.lines.reduce((n, l) => n + l.qty, 0);
      table.set(date, entry);
    }
    return mergeSort(table.values(), (a, b) => a.date.localeCompare(b.date));
  }

  bestSellers(from = '', to = '', n = 10) {
    const agg = new HashTable();
    for (const sale of this.sales) {
      const date = sale.at.slice(0, 10);
      if (from && date < from) continue;
      if (to && date > to) continue;
      for (const line of sale.lines) {
        const entry = agg.get(line.productId) ?? { productId: line.productId, code: line.code, name: line.name, qty: 0, revenue: 0 };
        entry.qty += line.qty;
        entry.revenue = round2(entry.revenue + line.lineTotal);
        agg.set(line.productId, entry);
      }
    }
    const top = topN(agg.values(), Number(n) || 10, (x) => x.qty);
    return mergeSort(top, (a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }

  inventoryValue() {
    const rows = mergeSort(this.products, (a, b) => a.name.localeCompare(b.name)).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      categoryName: this.categoriesById.get(p.categoryId)?.name ?? 'Uncategorized',
      stock: p.stock,
      unit: p.unit,
      price: p.price,
      minStock: p.minStock,
      active: p.active,
      low: p.stock <= p.minStock,
      value: round2(p.stock * p.price),
    }));
    return { rows, total: round2(rows.reduce((sum, r) => sum + r.value, 0)) };
  }

  dashboardSummary(days = 14) {
    const span = Math.min(Math.max(Number(days) || 14, 1), 90);
    const today = todayStr();
    const from = dateNDaysAgo(span - 1);

    const totals = this.dailyTotals(from, today);
    const byDate = new Map(totals.map((t) => [t.date, t]));
    const trend = [];
    for (let i = span - 1; i >= 0; i--) {
      const date = dateNDaysAgo(i);
      const entry = byDate.get(date);
      trend.push({ date, total: entry?.total ?? 0, transactions: entry?.transactions ?? 0 });
    }

    const todayEntry = byDate.get(today) ?? { total: 0, transactions: 0, items: 0 };
    const root = this.alertHeap.peek();
    return {
      today: {
        revenue: todayEntry.total ?? 0,
        transactions: todayEntry.transactions ?? 0,
        items: todayEntry.items ?? 0,
      },
      trend,
      bestSellers: this.bestSellers(from, today, 5),
      lowStock: this.listAlerts('open').slice(0, 10),
      openAlertCount: this.alerts.filter((a) => a.status === 'open').length,
      mostUrgent: root
        ? { ...root, productName: this.productsById.get(root.productId)?.name ?? 'Unknown' }
        : null,
    };
  }

  // ------------------------------------------------------------------
  // Alerts (min-heap by urgency: zero stock first, then biggest shortfall)
  // ------------------------------------------------------------------

  #alertCompare(a, b) {
    const aZero = a.stock === 0 ? 1 : 0;
    const bZero = b.stock === 0 ? 1 : 0;
    if (aZero !== bZero) return bZero - aZero; // zero stock first
    if (b.severity !== a.severity) return b.severity - a.severity; // biggest gap first
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
  }

  #rebuildAlertHeap() {
    this.alertHeap.build(this.alerts.filter((a) => a.status === 'open'));
  }

  /**
   * Create, refresh, or auto-resolve alerts for the given products:
   * stock <= minStock creates/keeps an alert; stock above minimum resolves it.
   * Returns true when anything changed.
   */
  #reconcileAlerts(productIds, at) {
    let changed = false;
    for (const productId of new Set(productIds)) {
      const product = this.productsById.get(productId);
      if (!product || !product.active) continue;
      const open = this.openAlertByProduct.get(productId);
      const low = this.settings.lowStockAlertsEnabled && product.stock <= product.minStock;

      if (low) {
        const severity = product.minStock - product.stock;
        const message =
          product.stock === 0
            ? `${product.name} is OUT OF STOCK (minimum ${product.minStock}).`
            : `${product.name}: stock ${product.stock} at/below minimum ${product.minStock}.`;
        if (!open) {
          const alert = {
            id: this.#nextId('alert', 'a', 4),
            productId,
            createdAt: at,
            updatedAt: at,
            stock: product.stock,
            minStock: product.minStock,
            severity,
            message,
            status: 'open',
            resolvedAt: null,
            resolvedBy: null,
          };
          this.alerts.push(alert);
          this.alertsById.set(alert.id, alert);
          this.openAlertByProduct.set(productId, alert);
          changed = true;
        } else if (open.stock !== product.stock || open.minStock !== product.minStock) {
          open.stock = product.stock;
          open.minStock = product.minStock;
          open.severity = severity;
          open.message = message;
          open.updatedAt = at;
          changed = true;
        }
      } else if (open) {
        open.status = 'auto-resolved';
        open.resolvedAt = at;
        open.resolvedBy = null;
        open.resolvedByName = 'System (stock restored)';
        this.openAlertByProduct.delete(productId);
        changed = true;
      }
    }
    if (changed) this.#rebuildAlertHeap();
    return changed;
  }

  listAlerts(status = 'open') {
    const list = status === 'all' ? this.alerts : this.alerts.filter((a) => a.status === 'open');
    return mergeSort(
      list.map((a) => ({ ...a, productName: this.productsById.get(a.productId)?.name ?? 'Unknown' })),
      (a, b) => this.#alertCompare(a, b),
    );
  }

  resolveAlert(id, user) {
    const alert = this.alertsById.get(id);
    if (!alert) throw httpError(404, 'Alert not found.');
    if (alert.status !== 'open') throw httpError(409, 'This alert is already resolved.');
    alert.status = 'resolved';
    alert.resolvedAt = nowIso();
    alert.resolvedBy = user.id;
    alert.resolvedByName = user.name;
    this.openAlertByProduct.delete(alert.productId);
    this.#rebuildAlertHeap();
    this.persistence.save('alerts', this.alerts);
    return alert;
  }

  // ------------------------------------------------------------------
  // Receipt print queue (FIFO)
  // ------------------------------------------------------------------

  enqueueReceipt(sale) {
    this.ids.printJob += 1;
    this.printQueue.enqueue({ id: `pj_${String(this.ids.printJob).padStart(4, '0')}`, saleId: sale.id, queuedAt: nowIso() });
  }

  listPrintJobs() {
    return this.printQueue.toArray().map((job) => ({ ...job, sale: this.salesById.get(job.saleId) ?? null }));
  }

  nextPrintJob() {
    const job = this.printQueue.dequeue();
    if (!job) return null;
    return { ...job, sale: this.salesById.get(job.saleId) ?? null };
  }

  // ------------------------------------------------------------------
  // Settings + backup
  // ------------------------------------------------------------------

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch) {
    if (patch.storeName !== undefined) {
      const name = String(patch.storeName).trim();
      if (!name) throw httpError(400, 'Store name cannot be empty.');
      this.settings.storeName = name;
    }
    if (patch.receiptHeader !== undefined) this.settings.receiptHeader = String(patch.receiptHeader);
    if (patch.receiptFooter !== undefined) this.settings.receiptFooter = String(patch.receiptFooter);
    if (patch.defaultMinStock !== undefined) {
      const min = Number.parseInt(patch.defaultMinStock, 10);
      if (!Number.isInteger(min) || min < 0) throw httpError(400, 'Default minimum stock must be a whole number of zero or greater.');
      this.settings.defaultMinStock = min;
    }
    if (patch.lowStockAlertsEnabled !== undefined) {
      this.settings.lowStockAlertsEnabled = Boolean(patch.lowStockAlertsEnabled);
      // Turning alerts off clears the currently open ones; turning them on
      // re-checks every active product.
      const changed = this.#reconcileAlerts(this.products.filter((p) => p.active).map((p) => p.id), nowIso());
      if (changed) this.persistence.save('alerts', this.alerts);
    }
    this.persistence.save('settings', this.settings);
    return this.getSettings();
  }

  backupBundle() {
    return {
      app: 'SariStocks',
      exportedAt: nowIso(),
      data: {
        settings: this.settings,
        users: this.users,
        categories: this.categories,
        products: this.products,
        sales: this.sales,
        alerts: this.alerts,
        stock_movements: this.movements,
      },
    };
  }
}

/** Factory: create the store and load/seed the dataset. */
export function createStore(dataDir) {
  const store = new Store(dataDir);
  store.init();
  return store;
}
