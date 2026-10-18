/**
 * User management — admin only. Passwords are never returned to the client.
 */
import express from 'express';
import { handler, httpError } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export default function userRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store), requireRole('admin'));

  router.get(
    '/',
    handler((req, res) => {
      res.json({ users: store.listUsers().map(sanitize) });
    }),
  );

  router.post(
    '/',
    handler((req, res) => {
      res.status(201).json({ user: sanitize(store.createUser(req.body ?? {})) });
    }),
  );

  router.patch(
    '/:id',
    handler((req, res) => {
      const isSelf = req.params.id === req.user.id;
      if (isSelf && req.body?.active === false) throw httpError(400, 'You cannot deactivate your own account.');
      if (isSelf && req.body?.role && req.body.role !== 'admin') {
        throw httpError(400, 'You cannot change your own role away from admin.');
      }
      res.json({ user: sanitize(store.updateUser(req.params.id, req.body ?? {})) });
    }),
  );

  // Deactivate instead of deleting: sales history references the user.
  router.delete(
    '/:id',
    handler((req, res) => {
      if (req.params.id === req.user.id) throw httpError(400, 'You cannot deactivate your own account.');
      res.json({ user: sanitize(store.updateUser(req.params.id, { active: false })) });
    }),
  );

  return router;
}
