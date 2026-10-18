/**
 * SariStocks server entry point.
 *
 * Express serves the REST API under /api and the static frontend from
 * /public. The data layer (Store) is created once at startup and shared by
 * every route module.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';

import { createStore } from './data/store.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import cartRoutes from './routes/cart.js';
import salesRoutes from './routes/sales.js';
import reportRoutes from './routes/reports.js';
import alertRoutes from './routes/alerts.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import backupRoutes from './routes/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const store = createStore(path.join(ROOT, 'data'));

const app = express();
app.use(express.json());

app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'saristocks-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }, // 8-hour shift
  }),
);

app.use('/api/auth', authRoutes(store));
app.use('/api/products', productRoutes(store));
app.use('/api/categories', categoryRoutes(store));
app.use('/api/cart', cartRoutes(store));
app.use('/api', salesRoutes(store));
app.use('/api', reportRoutes(store));
app.use('/api/alerts', alertRoutes(store));
app.use('/api/users', userRoutes(store));
app.use('/api/settings', settingsRoutes(store));
app.use('/api/backup', backupRoutes(store));

// Static frontend.
app.use(express.static(path.join(ROOT, 'public')));
app.get('/', (req, res) => res.redirect('/login.html'));

// Unknown API paths get JSON, not HTML.
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// Central error handler: every route error becomes { error: message }.
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message ?? 'Server error.' });
});

app.listen(PORT, () => {
  console.log(`SariStocks running at http://localhost:${PORT}`);
  console.log('Demo accounts: admin/admin123 (admin), maria/manager123 (manager), ana/cashier123 (cashier)');
});
