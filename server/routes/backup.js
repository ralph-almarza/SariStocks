/**
 * Backup — admin only. Downloads every collection as one JSON file.
 */
import express from 'express';
import { handler, todayStr } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function backupRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store), requireRole('admin'));

  router.get(
    '/',
    handler((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="saristocks-backup-${todayStr()}.json"`);
      res.send(JSON.stringify(store.backupBundle(), null, 2));
    }),
  );

  return router;
}
