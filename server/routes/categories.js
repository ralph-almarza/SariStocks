/**
 * Category routes — list for everyone, manage for managers.
 */
import express from 'express';
import { handler } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function categoryRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store));

  router.get(
    '/',
    handler((req, res) => {
      res.json({ categories: store.listCategories() });
    }),
  );

  router.post(
    '/',
    requireRole('manager'),
    handler((req, res) => {
      res.status(201).json({ category: store.createCategory(req.body?.name) });
    }),
  );

  router.patch(
    '/:id',
    requireRole('manager'),
    handler((req, res) => {
      res.json({ category: store.renameCategory(req.params.id, req.body?.name) });
    }),
  );

  router.delete(
    '/:id',
    requireRole('manager'),
    handler((req, res) => {
      res.json(store.deleteCategory(req.params.id));
    }),
  );

  return router;
}
