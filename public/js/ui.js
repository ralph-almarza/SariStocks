/**
 * UI helpers shared by every page: page guard, navbar, toasts, modals,
 * formatting, and printing (receipts, labels, reports).
 */
import { API } from './api.js';

// Safety net: prevent any form from falling back to a native GET submission
// (which would reload the page with the input values — e.g. a password — in
// the URL) in the window before its page script attaches its own handler.
for (const form of document.querySelectorAll('form')) {
  form.addEventListener('submit', (event) => event.preventDefault());
}

export const ROLE_LEVEL = { cashier: 1, manager: 2, admin: 3 };

export function fmtPHP(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toast(message, type = '') {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/**
 * Print the given HTML by itself: fills #print-area, hides the page during
 * printing via a body class, then restores it.
 */
export function printElement(html) {
  const area = document.getElementById('print-area');
  if (!area) return;
  area.innerHTML = html;
  document.body.classList.add('print-only-area');
  const cleanup = () => document.body.classList.remove('print-only-area');
  window.onafterprint = cleanup;
  window.print();
  setTimeout(cleanup, 500);
}

/**
 * Page guard used by every protected page. Returns the current user or
 * redirects to the login page / the user's home page when the role is too low.
 */
export async function initPage(minimumRole = 'cashier') {
  let me;
  try {
    me = (await API.get('/api/auth/me')).user;
  } catch {
    location.replace('login.html');
    return null;
  }
  if (ROLE_LEVEL[me.role] < ROLE_LEVEL[minimumRole]) {
    location.replace(me.role === 'cashier' ? 'pos.html' : 'dashboard.html');
    return null;
  }
  renderNavbar(me);
  return me;
}

export function can(role, minimumRole) {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];
}

function renderNavbar(me) {
  const el = document.getElementById('navbar');
  if (!el) return;

  const file = location.pathname.split('/').pop() || 'pos.html';
  const links = [['pos.html', 'POS']];
  if (can(me.role, 'manager')) {
    links.push(['dashboard.html', 'Dashboard'], ['inventory.html', 'Inventory'], ['reports.html', 'Reports']);
  }
  if (me.role === 'admin') links.push(['admin.html', 'Admin']);

  el.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="${can(me.role, 'manager') ? 'dashboard.html' : 'pos.html'}">
        <span class="dot"></span>SariStocks
      </a>
      <nav class="nav-links">
        ${links.map(([href, label]) => `<a href="${href}" class="${href === file ? 'active' : ''}">${label}</a>`).join('')}
      </nav>
      <div class="nav-right">
        ${can(me.role, 'manager') ? '<a class="bell" href="dashboard.html" title="Open low-stock alerts">🔔<span class="count" id="alert-count" style="display:none">0</span></a>' : ''}
        <span>${escapeHtml(me.name)}</span>
        <span class="chip">${me.role}</span>
        <button class="btn small btn-ghost" id="logout-btn" type="button">Log out</button>
      </div>
    </div>`;

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await API.post('/api/auth/logout'); } catch { /* ignore */ }
    location.replace('login.html');
  });

  if (can(me.role, 'manager')) {
    refreshAlertBadge();
    setInterval(refreshAlertBadge, 30000);
  }
}

export async function refreshAlertBadge() {
  const badge = document.getElementById('alert-count');
  if (!badge) return;
  try {
    const { count } = await API.get('/api/alerts');
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  } catch { /* badge is decorative; ignore */ }
}
