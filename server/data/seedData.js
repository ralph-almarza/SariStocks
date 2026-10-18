/**
 * Seed data — the demo dataset for SariStocks.
 *
 * Produces a coherent starting state:
 *   - 3 users (admin / manager / cashier)
 *   - 8 categories and 59 realistic sari-sari store products
 *   - ~14 days of sample sales with matching stock movements
 *   - intentionally low-stock items so alerts and the dashboard look real
 *
 * The sale history is generated with a deterministic RNG so every seed
 * produces the same demo data.
 */
import { hashPassword } from '../lib/password.js';
import { isoFrom } from '../lib/util.js';

export const SEED_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'System Admin' },
  { username: 'maria', password: 'manager123', role: 'manager', name: 'Maria Santos' },
  { username: 'ana', password: 'cashier123', role: 'cashier', name: 'Ana Cruz' },
];

const CATEGORIES = [
  { id: 'c_bev', name: 'Beverages' },
  { id: 'c_snack', name: 'Snacks' },
  { id: 'c_noodles', name: 'Noodles & Canned Goods' },
  { id: 'c_cond', name: 'Condiments' },
  { id: 'c_house', name: 'Household' },
  { id: 'c_care', name: 'Personal Care' },
  { id: 'c_health', name: 'Health & Medicine' },
  { id: 'c_essentials', name: 'Rice & Essentials' },
];

// [categoryId, name, price, stock, minStock, unit]
const PRODUCTS = [
  ['c_bev', 'Coke Sakto 200ml', 20, 48, 12, 'pc'],
  ['c_bev', 'Sprite Sakto 200ml', 20, 30, 12, 'pc'],
  ['c_bev', 'Royal Tru-Orange Sakto 200ml', 20, 8, 12, 'pc'],
  ['c_bev', 'C2 Green Tea 230ml', 25, 24, 8, 'pc'],
  ['c_bev', 'Kopiko 78°C Latte 180ml', 25, 36, 10, 'pc'],
  ['c_bev', 'Nescafé Original 3-in-1 Sachet', 12, 120, 40, 'pc'],
  ['c_bev', 'Kopiko Blanca Twin Pack', 12, 90, 30, 'pc'],
  ['c_bev', 'Milo 22g Sachet', 15, 80, 25, 'pc'],
  ['c_bev', 'Bear Brand Sterilized 300ml', 42, 14, 6, 'pc'],
  ['c_bev', "Nature's Spring Water 500ml", 15, 60, 20, 'bottle'],
  ['c_bev', 'Zest-O Orange Juice 250ml', 20, 26, 8, 'pc'],

  ['c_snack', 'Skyflakes Crackers 25g', 10, 140, 40, 'pc'],
  ['c_snack', 'Rebisco Sandwich 32g', 10, 100, 30, 'pc'],
  ['c_snack', 'Cream-O Vanilla 35g', 10, 150, 50, 'pc'],
  ['c_snack', 'Hansel Mocha Sandwich 30g', 9, 110, 40, 'pc'],
  ['c_snack', 'Chippy BBQ 110g', 28, 22, 8, 'pc'],
  ['c_snack', 'Nova Multigrain 78g', 28, 5, 8, 'pc'], // LOW: below minimum
  ['c_snack', 'Piattos Sour Cream 85g', 30, 18, 6, 'pc'],
  ['c_snack', 'Boy Bawang Cornick 100g', 25, 20, 8, 'pc'],
  ['c_snack', 'Nips Peanuts 30g', 13, 50, 15, 'pc'],
  ['c_snack', 'Pringles Sour Cream 107g', 89, 0, 4, 'pc'], // LOW: out of stock

  ['c_noodles', 'Lucky Me Pancit Canton Original', 17, 96, 36, 'pc'],
  ['c_noodles', 'Lucky Me Pancit Canton Chilimansi', 17, 84, 36, 'pc'],
  ['c_noodles', 'Lucky Me Beef Mami 55g', 12, 70, 30, 'pc'],
  ['c_noodles', 'Payless Xtra Big Pancit Canton', 15, 40, 15, 'pc'],
  ['c_noodles', '555 Sardines in Tomato Sauce 155g', 28, 26, 10, 'pc'],
  ['c_noodles', 'Ligo Sardines Green 155g', 30, 18, 10, 'pc'],
  ['c_noodles', 'Century Tuna Flakes 155g', 42, 12, 8, 'pc'],
  ['c_noodles', 'Argentina Corned Beef 150g', 55, 4, 6, 'pc'], // LOW
  ['c_noodles', 'Silver Swan Soy Sauce 200ml', 22, 15, 6, 'bottle'],
  ['c_noodles', 'Datu Puti Vinegar 200ml', 20, 14, 6, 'bottle'],

  ['c_cond', 'Magic Sarap 8g', 6, 200, 60, 'pc'],
  ['c_cond', 'Ajinomoto Ginisa Mix 8g', 7, 120, 40, 'pc'],
  ['c_cond', 'UFC Banana Ketchup 100g', 26, 16, 6, 'pc'],
  ['c_cond', 'Del Monte Tomato Ketchup 100g', 30, 12, 6, 'pc'],
  ['c_cond', "Lady's Choice Mayo Sachet 27ml", 12, 60, 20, 'pc'],

  ['c_house', 'Joy Dishwashing Liquid 45ml Sachet', 8, 90, 30, 'pc'],
  ['c_house', 'Tide Bar 130g', 20, 40, 15, 'pc'],
  ['c_house', 'Surf Powder 25g Sachet', 8, 80, 30, 'pc'],
  ['c_house', 'Downy Fabric Softener 25ml Sachet', 9, 70, 25, 'pc'],
  ['c_house', 'Zonrox Bleach 250ml', 25, 16, 6, 'bottle'],

  ['c_care', 'Colgate Toothpaste 10g Sachet', 10, 100, 30, 'pc'],
  ['c_care', 'Safeguard Soap 60g', 25, 18, 6, 'pc'],
  ['c_care', 'Palmolive Shampoo 12ml Sachet', 8, 120, 40, 'pc'],
  ['c_care', 'Rejoice Shampoo 12ml Sachet', 8, 60, 40, 'pc'],
  ['c_care', 'Rexona Deodorant 25ml Sachet', 12, 45, 15, 'pc'],

  ['c_health', 'Biogesic 500mg (per tablet)', 6, 150, 50, 'pc'],
  ['c_health', 'Neozep Forte (per tablet)', 9, 40, 60, 'pc'], // LOW
  ['c_health', 'Alaxan FR (per tablet)', 9, 30, 50, 'pc'], // LOW
  ['c_health', 'Bioflu (per tablet)', 9, 55, 50, 'pc'],
  ['c_health', 'Kremil-S (per tablet)', 12, 40, 20, 'pc'],
  ['c_health', 'Tuseran Forte (per tablet)', 10, 45, 40, 'pc'],

  ['c_essentials', 'Well-Milled Rice (per kilo)', 55, 40, 10, 'kg'],
  ['c_essentials', 'Brown Sugar 1/2 kilo', 45, 12, 4, 'pack'],
  ['c_essentials', 'White Sugar 1/2 kilo', 40, 10, 4, 'pack'],
  ['c_essentials', 'Cooking Oil 200ml', 30, 14, 5, 'bottle'],
  ['c_essentials', 'Egg (per piece)', 9, 60, 24, 'pc'],
  ['c_essentials', 'Rock Salt 200g', 15, 10, 4, 'pack'],
  ['c_essentials', 'Pancit Bihon 227g', 42, 8, 4, 'pack'],
];

/** Deterministic PRNG (mulberry32) so every seed produces the same demo. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateAt(daysAgo, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return isoFrom(d);
}

export function makeSeedData() {
  const days = 14;
  const now = isoFrom(new Date());
  const rng = mulberry32(20261018);

  const users = [
    {
      id: 'u_001',
      name: 'System Admin',
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
      active: true,
      createdAt: dateAt(days, 7, 0),
    },
    {
      id: 'u_002',
      name: 'Maria Santos',
      username: 'maria',
      passwordHash: hashPassword('manager123'),
      role: 'manager',
      active: true,
      createdAt: dateAt(days, 7, 5),
    },
    {
      id: 'u_003',
      name: 'Ana Cruz',
      username: 'ana',
      passwordHash: hashPassword('cashier123'),
      role: 'cashier',
      active: true,
      createdAt: dateAt(days, 7, 10),
    },
  ];

  const products = PRODUCTS.map(([categoryId, name, price, stock, minStock, unit], i) => ({
    id: `p_${String(i + 1).padStart(4, '0')}`,
    code: `SS-${String(i + 1).padStart(4, '0')}`,
    name,
    categoryId,
    price,
    stock,
    minStock,
    unit,
    active: true,
    updatedAt: now,
  }));

  // ---- Sample sales over the last `days` days -------------------------
  const sales = [];
  let saleSeq = 0;

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const salesToday = 2 + Math.floor(rng() * 5); // 2..6 sales per day
    for (let s = 0; s < salesToday; s++) {
      const at = dateAt(dayOffset, 7 + Math.floor(rng() * 12), Math.floor(rng() * 60));
      const lineCount = 1 + Math.floor(rng() * 4); // 1..4 lines
      const picked = new Set();
      const lines = [];
      for (let l = 0; l < lineCount; l++) {
        let idx = Math.floor(rng() * products.length);
        while (picked.has(idx)) idx = (idx + 1) % products.length;
        picked.add(idx);
        const p = products[idx];
        const qty = 1 + Math.floor(rng() * 3); // 1..3
        lines.push({
          productId: p.id,
          code: p.code,
          name: p.name,
          qty,
          unitPrice: p.price,
          lineTotal: Math.round(p.price * qty * 100) / 100,
        });
      }
      const total = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
      let paid = Math.ceil(total / 10) * 10;
      if (paid === total && rng() < 0.5) paid += 10;
      saleSeq++;
      const sale = {
        id: `s_${String(saleSeq).padStart(6, '0')}`,
        at,
        cashierId: 'u_003',
        cashierName: 'Ana Cruz',
        lines,
        total,
        paid,
        change: Math.round((paid - total) * 100) / 100,
      };
      sales.push(sale);
    }
  }

  // Put the whole history in true chronological order, then assign final
  // sale ids, so ids and timestamps always agree.
  sales.sort((a, b) => a.at.localeCompare(b.at));
  sales.forEach((sale, index) => {
    sale.id = `s_${String(index + 1).padStart(6, '0')}`;
  });
  const saleEvents = [];
  for (const sale of sales) {
    for (const line of sale.lines) {
      saleEvents.push({ saleId: sale.id, productId: line.productId, qty: line.qty, at: sale.at });
    }
  }

  // ---- Stock movements, consistent with current stock ------------------
  const soldByProduct = new Map();
  for (const ev of saleEvents) {
    soldByProduct.set(ev.productId, (soldByProduct.get(ev.productId) ?? 0) + ev.qty);
  }

  const movements = [];
  let movementSeq = 0;
  const nextMovementId = () => `m_${String(++movementSeq).padStart(6, '0')}`;
  const runningStock = new Map();

  // One "initial" movement per product: initial = current stock + total sold.
  const seedStart = dateAt(days, 6, 0);
  for (const p of products) {
    const sold = soldByProduct.get(p.id) ?? 0;
    const initialStock = p.stock + sold;
    runningStock.set(p.id, initialStock);
    movements.push({
      id: nextMovementId(),
      at: seedStart,
      productId: p.id,
      delta: initialStock,
      reason: 'initial',
      refId: null,
      userId: null,
      note: 'Initial stock (seed data)',
      stockAfter: initialStock,
    });
  }

  // Then one "-qty" movement per sale line, in chronological order.
  for (const ev of saleEvents) {
    const after = runningStock.get(ev.productId) - ev.qty;
    runningStock.set(ev.productId, after);
    movements.push({
      id: nextMovementId(),
      at: ev.at,
      productId: ev.productId,
      delta: -ev.qty,
      reason: 'sale',
      refId: ev.saleId,
      userId: 'u_003',
      note: null,
      stockAfter: after,
    });
  }

  return {
    settings: {
      storeName: "Aling Nena's Sari-Sari Store",
      receiptHeader: 'Salamat! Thank you for your purchase.',
      receiptFooter: 'Please come again!',
      defaultMinStock: 5,
      lowStockAlertsEnabled: true,
    },
    users,
    categories: CATEGORIES,
    products,
    sales,
    alerts: [],
    stock_movements: movements,
  };
}
