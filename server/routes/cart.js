/**
 * Cart routes — the active cart lives on the server, one per cashier
 * session. Every endpoint returns the updated snapshot so the frontend
 * always renders straight arrays.
 */
import express from 'express';
import { handler } from '../lib/util.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export default function cartRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store), requireRole('cashier'));
  const sid = (req) => req.session.id;

  router.get(
    '/',
    handler((req, res) => {
      res.json({ cart: store.cartSnapshot(sid(req)) });
    }),
  );

  // Add a product by code with an optional quantity (default 1). Adding N at
  // once is still a single undoable action.
  router.post(
    '/items',
    handler((req, res) => {
      res.json({ cart: store.addToCart(sid(req), req.body?.code, req.body?.qty ?? 1) });
    }),
  );

  router.patch(
    '/items/:code',
    handler((req, res) => {
      res.json({ cart: store.setCartQty(sid(req), req.params.code, req.body?.qty) });
    }),
  );

  router.delete(
    '/items/:code',
    handler((req, res) => {
      res.json({ cart: store.removeFromCart(sid(req), req.params.code) });
    }),
  );

  // Two-stack undo/redo: pops the last action and reverses it.
  router.post(
    '/undo',
    handler((req, res) => {
      res.json({ cart: store.undoCart(sid(req)) });
    }),
  );

  router.post(
    '/redo',
    handler((req, res) => {
      res.json({ cart: store.redoCart(sid(req)) });
    }),
  );

  router.delete(
    '/',
    handler((req, res) => {
      res.json({ cart: store.clearCart(sid(req)) });
    }),
  );

  return router;
}
