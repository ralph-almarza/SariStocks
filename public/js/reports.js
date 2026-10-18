/**
 * Reports page — daily totals, best sellers, inventory value, and stock
 * movements, with CSV export and print-to-PDF.
 */
import { API } from './api.js';
import { toast, fmtPHP, fmtDateTime, escapeHtml, initPage, todayStr } from './ui.js';

const me = await initPage('manager');

if (me) main();

function main() {
  document.getElementById('from-date').value = todayStr(-6);
  document.getElementById('to-date').value = todayStr(0);

  document.getElementById('load-btn').addEventListener('click', loadAll);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.querySelectorAll('button[data-csv]').forEach((button) => {
    button.addEventListener('click', () => downloadCsv(button.dataset.csv));
  });

  loadAll();
}

const from = () => document.getElementById('from-date').value;
const to = () => document.getElementById('to-date').value;

async function loadAll() {
  const top = document.getElementById('top-select').value;
  try {
    const [daily, best, inventory, movements] = await Promise.all([
      API.get(`/api/reports/daily?from=${from()}&to=${to()}`),
      API.get(`/api/reports/best-sellers?from=${from()}&to=${to()}&top=${top}`),
      API.get('/api/reports/inventory-value'),
      API.get(`/api/movements?from=${from()}&to=${to()}&limit=100`),
    ]);

    renderDaily(daily.days);
    renderBest(best.bestSellers);
    renderInventory(inventory.inventory);
    renderMovements(movements.movements);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderDaily(days) {
  const body = document.getElementById('daily-body');
  if (days.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No sales in this range.</td></tr>';
    return;
  }
  body.innerHTML = days.map((day) => `
    <tr>
      <td>${day.date}</td>
      <td class="num">${day.transactions}</td>
      <td class="num">${day.items}</td>
      <td class="num">${fmtPHP(day.total)}</td>
    </tr>`).join('');
}

function renderBest(best) {
  const body = document.getElementById('best-body');
  if (best.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">No sales in this range.</td></tr>';
    return;
  }
  body.innerHTML = best.map((entry, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td class="mono">${escapeHtml(entry.code)}</td>
      <td class="num">${entry.qty}</td>
      <td class="num">${fmtPHP(entry.revenue)}</td>
    </tr>`).join('');
}

function renderInventory(inventory) {
  const body = document.getElementById('inventory-body');
  body.innerHTML = inventory.rows.map((row) => `
    <tr class="${row.low ? 'low' : ''} ${row.active ? '' : 'inactive'}">
      <td>${escapeHtml(row.name)}</td>
      <td class="mono">${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.categoryName)}</td>
      <td class="num">${row.stock} ${escapeHtml(row.unit)}</td>
      <td class="num">${fmtPHP(row.price)}</td>
      <td class="num">${fmtPHP(row.value)}</td>
      <td>${row.active ? (row.low ? '<span class="badge low">LOW</span>' : '<span class="badge ok">OK</span>') : '<span class="badge off">Archived</span>'}</td>
    </tr>`).join('');
  document.getElementById('inventory-total').textContent = fmtPHP(inventory.total);
}

function renderMovements(movements) {
  const body = document.getElementById('movements-body');
  if (movements.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No movements in this range.</td></tr>';
    return;
  }
  body.innerHTML = movements.map((m) => `
    <tr>
      <td>${fmtDateTime(m.at)}</td>
      <td>${escapeHtml(m.productName)}</td>
      <td class="num">${m.delta > 0 ? `+${m.delta}` : m.delta}</td>
      <td>${m.reason}</td>
      <td class="num">${m.stockAfter}</td>
      <td>${escapeHtml(m.refId ?? m.note ?? '—')}</td>
    </tr>`).join('');
}

function downloadCsv(report) {
  const params = new URLSearchParams({ report });
  if (report !== 'inventory') {
    params.set('from', from());
    params.set('to', to());
  }
  const link = document.createElement('a');
  link.href = `/api/reports/export.csv?${params.toString()}`;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
