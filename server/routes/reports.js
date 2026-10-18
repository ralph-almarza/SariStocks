/**
 * Report routes — dashboard summary, daily totals, best sellers, inventory
 * value, stock movements, and CSV exports. Manager and above only.
 * Mounted at /api.
 */
import express from 'express';
import { handler, httpError, toCsv, todayStr } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function reportRoutes(store) {
  const router = express.Router();
  // This router is mounted at /api next to other routers, so the manager
  // requirement is attached per route. A router-level requireRole would also
  // guard paths owned by routers mounted after this one (e.g. /api/settings).
  router.use(requireAuth(store));

  router.get(
    '/dashboard/summary',
    requireRole('manager'),
    handler((req, res) => {
      res.json({ summary: store.dashboardSummary(req.query.days) });
    }),
  );

  router.get(
    '/reports/daily',
    requireRole('manager'),
    handler((req, res) => {
      const { from = '', to = '' } = req.query;
      res.json({ days: store.dailyTotals(from, to) });
    }),
  );

  router.get(
    '/reports/best-sellers',
    requireRole('manager'),
    handler((req, res) => {
      const { from = '', to = '', top = 10 } = req.query;
      res.json({ bestSellers: store.bestSellers(from, to, Number(top) || 10) });
    }),
  );

  router.get(
    '/reports/inventory-value',
    requireRole('manager'),
    handler((req, res) => {
      res.json({ inventory: store.inventoryValue() });
    }),
  );

  router.get(
    '/movements',
    requireRole('manager'),
    handler((req, res) => {
      const { productId = '', from = '', to = '', reason = '', limit = 300 } = req.query;
      res.json({ movements: store.listMovements({ productId, from, to, reason, limit: Number(limit) || 300 }) });
    }),
  );

  // CSV exports: /api/reports/export.csv?report=daily|best-sellers|inventory|movements|sales
  router.get(
    '/reports/export.csv',
    requireRole('manager'),
    handler((req, res) => {
      const report = String(req.query.report || 'daily');
      const { from = '', to = '' } = req.query;
      let name;
      let rows;

      if (report === 'daily') {
        name = 'daily-sales';
        rows = [
          ['Date', 'Transactions', 'Items sold', 'Total (PHP)'],
          ...store.dailyTotals(from, to).map((d) => [d.date, d.transactions, d.items, d.total.toFixed(2)]),
        ];
      } else if (report === 'best-sellers') {
        name = 'best-sellers';
        rows = [
          ['Rank', 'Product', 'Code', 'Quantity sold', 'Revenue (PHP)'],
          ...store.bestSellers(from, to, 100).map((b, i) => [i + 1, b.name, b.code, b.qty, b.revenue.toFixed(2)]),
        ];
      } else if (report === 'inventory') {
        name = 'inventory-value';
        const inventory = store.inventoryValue();
        rows = [
          ['Product', 'Code', 'Category', 'Stock', 'Unit', 'Price (PHP)', 'Value (PHP)', 'Min stock', 'Status'],
          ...inventory.rows.map((r) => [
            r.name, r.code, r.categoryName, r.stock, r.unit,
            r.price.toFixed(2), r.value.toFixed(2), r.minStock, r.low ? 'LOW' : 'OK',
          ]),
          ['', '', '', '', '', '', inventory.total.toFixed(2), '', 'TOTAL'],
        ];
      } else if (report === 'movements') {
        name = 'stock-movements';
        rows = [
          ['Date/time', 'Product', 'Change', 'Reason', 'Stock after', 'User', 'Reference', 'Note'],
          ...store.listMovements({ from, to, limit: 1000 }).map((m) => [
            m.at, m.productName, m.delta, m.reason, m.stockAfter, m.userId ?? '', m.refId ?? '', m.note ?? '',
          ]),
        ];
      } else if (report === 'sales') {
        name = 'sales';
        rows = [
          ['Sale', 'Date/time', 'Cashier', 'Items', 'Total (PHP)', 'Tendered (PHP)', 'Change (PHP)'],
          ...store.listSales({ from, to, limit: 1000 }).map((s) => [
            s.id, s.at, s.cashierName, s.lines.reduce((n, l) => n + l.qty, 0),
            s.total.toFixed(2), s.paid.toFixed(2), s.change.toFixed(2),
          ]),
        ];
      } else {
        throw httpError(400, `Unknown report type "${report}".`);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="saristocks-${name}-${todayStr()}.csv"`);
      res.send('\uFEFF' + toCsv(rows)); // BOM so Excel opens UTF-8 correctly
    }),
  );

  return router;
}
