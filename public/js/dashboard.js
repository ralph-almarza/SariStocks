/**
 * Dashboard — KPIs, revenue trend, best sellers, and the low-stock alert
 * list (already ordered by urgency by the server's min-heap).
 */
import { API } from './api.js';
import { toast, fmtPHP, fmtDateTime, escapeHtml, initPage, refreshAlertBadge } from './ui.js';

const me = await initPage('manager');

let trendChart = null;
let topChart = null;

if (me) {
  main();
  document.getElementById('refresh-btn').addEventListener('click', main);
}

async function main() {
  try {
    const { summary } = await API.get('/api/dashboard/summary?days=14');

    document.getElementById('kpi-revenue').textContent = fmtPHP(summary.today.revenue);
    document.getElementById('kpi-transactions').textContent = summary.today.transactions;
    document.getElementById('kpi-items').textContent = summary.today.items;
    const alertsEl = document.getElementById('kpi-alerts');
    alertsEl.textContent = summary.openAlertCount;
    alertsEl.className = `value ${summary.openAlertCount > 0 ? 'red' : 'green'}`;

    renderTrend(summary.trend);
    renderTop(summary.bestSellers);
    renderAlerts(summary.lowStock, summary.mostUrgent);
    refreshAlertBadge();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderTrend(trend) {
  const ctx = document.getElementById('trend-chart');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map((point) => new Date(`${point.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Revenue (PHP)',
        data: trend.map((point) => point.total),
        borderColor: '#15803d',
        backgroundColor: 'rgba(21, 128, 61, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => `₱${v}` } } },
    },
  });
}

function renderTop(bestSellers) {
  const ctx = document.getElementById('top-chart');
  if (topChart) topChart.destroy();
  topChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bestSellers.map((entry) => entry.name),
      datasets: [{
        label: 'Units sold (14 days)',
        data: bestSellers.map((entry) => entry.qty),
        backgroundColor: '#f59e0b',
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

function renderAlerts(alerts, mostUrgent) {
  const urgentEl = document.getElementById('most-urgent');
  urgentEl.textContent = mostUrgent
    ? `Most urgent: ${mostUrgent.productName} — ${mostUrgent.message}`
    : 'No open alerts — all stock is above its minimum.';

  const list = document.getElementById('alert-list');
  if (alerts.length === 0) {
    list.innerHTML = '<div class="empty">No open alerts.</div>';
    return;
  }

  list.innerHTML = alerts.map((alert) => `
    <div class="job-item">
      <span>
        ${alert.stock === 0 ? '<span class="badge out">OUT</span>' : '<span class="badge low">LOW</span>'}
        ${escapeHtml(alert.message)}
        <br><span class="hint">since ${fmtDateTime(alert.createdAt)} · shortfall ${alert.severity}</span>
      </span>
      <button class="btn small" data-resolve="${alert.id}" type="button">Resolve</button>
    </div>`).join('');

  list.querySelectorAll('button[data-resolve]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await API.post(`/api/alerts/${button.dataset.resolve}/resolve`);
        toast('Alert resolved.', 'success');
        await main();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}
