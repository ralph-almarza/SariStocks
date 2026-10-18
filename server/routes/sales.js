/**
 * Sales routes — checkout, sale history, and the FIFO receipt print queue.
 * Mounted at /api (paths are spelled out here).
 */
import express from 'express';
import { handler, httpError } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function salesRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store));

  // Complete a sale. All-or-nothing: validate, then persist sale + stock +
  // movements + alerts, rolling back in memory if a write fails.
  router.post(
    '/sales',
    handler((req, res) => {
      const result = store.completeSale(req.session.id, req.user, req.body?.paid);
      res.status(201).json(result);
    }),
  );

  router.get(
    '/sales',
    requireRole('manager'),
    handler((req, res) => {
      const { from = '', to = '', cashierId = '', limit = '' } = req.query;
      res.json({ sales: store.listSales({ from, to, cashierId, limit: Number(limit) || 200 }) });
    }),
  );

  router.get(
    '/sales/:id',
    handler((req, res) => {
      const sale = store.getSale(req.params.id);
      if (!sale) throw httpError(404, 'Sale not found.');
      if (req.user.role === 'cashier' && sale.cashierId !== req.user.id) {
        throw httpError(403, 'You can only view your own sales.');
      }
      res.json({ sale });
    }),
  );

  // Reprint request: enqueue another receipt print job.
  router.post(
    '/sales/:id/print',
    handler((req, res) => {
      const sale = store.getSale(req.params.id);
      if (!sale) throw httpError(404, 'Sale not found.');
      if (req.user.role === 'cashier' && sale.cashierId !== req.user.id) {
        throw httpError(403, 'You can only print your own sales.');
      }
      store.enqueueReceipt(sale);
      res.status(201).json({ queued: true, queueLength: store.listPrintJobs().length });
    }),
  );

  // Current queue contents, in FIFO order.
  router.get(
    '/print-jobs',
    handler((req, res) => {
      res.json({ jobs: store.listPrintJobs() });
    }),
  );

  // Dequeue and return the next job in line.
  router.post(
    '/print-jobs/next',
    handler((req, res) => {
      const job = store.nextPrintJob();
      if (!job) throw httpError(404, 'The print queue is empty.');
      res.json({ job });
    }),
  );

  return router;
}
