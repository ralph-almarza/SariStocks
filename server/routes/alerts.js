/**
 * Alert routes — the open alerts, ordered by urgency (zero stock first,
 * then biggest shortfall below the minimum), and manual resolution.
 */
import express from 'express';
import { handler } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function alertRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store), requireRole('manager'));

  router.get(
    '/',
    handler((req, res) => {
      const status = req.query.status === 'all' ? 'all' : 'open';
      res.json({
        count: store.listAlerts('open').length,
        alerts: store.listAlerts(status),
      });
    }),
  );

  router.post(
    '/:id/resolve',
    handler((req, res) => {
      res.json({ alert: store.resolveAlert(req.params.id, req.user) });
    }),
  );

  return router;
}
