/**
 * Product routes — lookup, CRUD, restock/adjust, QR labels.
 */
import express from 'express';
import QRCode from 'qrcode';
import { handler, httpError } from '../lib/util.js';
import { requireAuth, requireRole, ROLE_LEVEL } from '../middleware/auth.js';

function present(store, product) {
  return {
    ...product,
    categoryName: store.categoriesById.get(product.categoryId)?.name ?? 'Uncategorized',
    low: product.stock <= product.minStock,
  };
}

export default function productRoutes(store) {
  const router = express.Router();
  router.use(requireAuth(store));

  // List / search / sort products. Cashiers always see active products only.
  router.get(
    '/',
    handler((req, res) => {
      const { search = '', categoryId = '', sort = 'name', dir = 'asc', lowOnly = '', includeInactive = '' } = req.query;
      const wantsInactive = includeInactive === '1' || includeInactive === 'true';
      const canSeeInactive = ROLE_LEVEL[req.user.role] >= ROLE_LEVEL.manager;
      res.json({
        products: store.listProducts({
          search: String(search),
          categoryId: String(categoryId),
          sort: String(sort),
          dir: dir === 'desc' ? 'desc' : 'asc',
          includeInactive: wantsInactive && canSeeInactive,
          lowOnly: lowOnly === '1' || lowOnly === 'true',
        }),
      });
    }),
  );

  // O(1) lookup by barcode / QR code / manual entry.
  router.get(
    '/code/:code',
    handler((req, res) => {
      const product = store.getProductByCode(req.params.code);
      if (!product) throw httpError(404, `No product found for code "${req.params.code}".`);
      res.json({ product: present(store, product) });
    }),
  );

  // QR label image for printing (manager+).
  router.get(
    '/:id/label',
    requireRole('manager'),
    handler(async (req, res) => {
      const product = store.getProductById(req.params.id);
      if (!product) throw httpError(404, 'Product not found.');
      const dataUrl = await QRCode.toDataURL(product.code, { margin: 1, width: 240 });
      res.json({
        label: { id: product.id, code: product.code, name: product.name, price: product.price, unit: product.unit, dataUrl },
      });
    }),
  );

  router.post(
    '/',
    requireRole('manager'),
    handler((req, res) => {
      const product = store.createProduct(req.body ?? {});
      res.status(201).json({ product: present(store, product) });
    }),
  );

  router.patch(
    '/:id',
    requireRole('manager'),
    handler((req, res) => {
      const product = store.updateProduct(req.params.id, req.body ?? {});
      res.json({ product: present(store, product) });
    }),
  );

  // Archive when history references the product; hard-delete otherwise.
  router.delete(
    '/:id',
    requireRole('manager'),
    handler((req, res) => {
      const result = store.deleteProduct(req.params.id);
      res.json(result.archived ? { archived: true, product: present(store, result.product) } : { deleted: true });
    }),
  );

  router.post(
    '/:id/restock',
    requireRole('manager'),
    handler((req, res) => {
      const { qty, note } = req.body ?? {};
      res.json(store.restock(req.params.id, qty, note, req.user));
    }),
  );

  router.post(
    '/:id/adjust',
    requireRole('manager'),
    handler((req, res) => {
      const { delta, note } = req.body ?? {};
      res.json(store.adjustStock(req.params.id, delta, note, req.user));
    }),
  );

  return router;
}
