/**
 * Auth routes: login, logout, and "who am I" for the frontend page guards.
 */
import express from 'express';
import { handler, httpError } from '../lib/util.js';
import { verifyPassword } from '../lib/password.js';
import { requireAuth } from '../middleware/auth.js';

export default function authRoutes(store) {
  const router = express.Router();

  router.post(
    '/login',
    handler((req, res) => {
      const { username, password } = req.body ?? {};
      const user = store.getUserByUsername(username);
      if (!user || !verifyPassword(password ?? '', user.passwordHash)) {
        throw httpError(401, 'Incorrect username or password.');
      }
      if (!user.active) throw httpError(403, 'This account has been deactivated.');
      req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
      res.json({ user: req.session.user });
    }),
  );

  router.post(
    '/logout',
    handler((req, res) => {
      if (req.session) req.session.destroy(() => {});
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    }),
  );

  router.get(
    '/me',
    requireAuth(store),
    handler((req, res) => {
      res.json({ user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role } });
    }),
  );

  return router;
}
