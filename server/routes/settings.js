/**
 * Store settings — admin only.
 */
import express from 'express';
import { handler } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function settingsRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store));

  // Store info (name, receipt header/footer) is needed by the POS to render
  // receipts, so reading is open to any logged-in user; editing is admin-only.
  router.get(
    '/',
    handler((req, res) => {
      res.json({ settings: store.getSettings() });
    }),
  );

  router.patch(
    '/',
    requireRole('admin'),
    handler((req, res) => {
      res.json({ settings: store.updateSettings(req.body ?? {}) });
    }),
  );

  return router;
}
