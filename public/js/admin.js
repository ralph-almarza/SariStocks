/**
 * Admin page — user accounts, store settings, and data backup.
 */
import { API } from './api.js';
import { toast, fmtDate, escapeHtml, initPage, openModal, closeModal } from './ui.js';

const me = await initPage('admin');

let users = [];
let editingId = null;

if (me) main();

async function main() {
  wireEvents();
  await loadUsers();
  await loadSettings();
}

function wireEvents() {
  document.getElementById('new-user-btn').addEventListener('click', () => openUserModal(null));
  document.getElementById('users-body').addEventListener('click', onUsersClick);
  document.getElementById('user-form').addEventListener('submit', submitUser);
  document.getElementById('settings-form').addEventListener('submit', submitSettings);
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });
}

// ---------------------------------------------------------------- users

async function loadUsers() {
  const { users: list } = await API.get('/api/users');
  users = list;

  document.getElementById('users-body').innerHTML = users.map((user) => `
    <tr class="${user.active ? '' : 'inactive'}">
      <td>${escapeHtml(user.name)}${user.id === me.id ? ' <span class="badge info">you</span>' : ''}</td>
      <td class="mono">${escapeHtml(user.username)}</td>
      <td><span class="chip" style="background:#e0e7ff;color:#3730a3">${user.role}</span></td>
      <td>${user.active ? '<span class="badge ok">Active</span>' : '<span class="badge off">Disabled</span>'}</td>
      <td>${fmtDate(user.createdAt)}</td>
      <td>
        <button class="btn small secondary" data-action="edit" data-id="${user.id}" type="button">Edit</button>
        <button class="btn small ${user.active ? 'danger' : ''}" data-action="toggle" data-id="${user.id}" type="button">
          ${user.active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>`).join('');
}

function openUserModal(user) {
  editingId = user ? user.id : null;
  const form = document.getElementById('user-form');
  form.reset();

  document.getElementById('user-modal-title').textContent = user ? `Edit user — ${user.username}` : 'New user';
  document.getElementById('uf-username-wrap').style.display = user ? 'none' : '';
  document.getElementById('uf-password-wrap').style.display = '';
  document.getElementById('uf-password').required = !user;
  document.getElementById('uf-password').placeholder = user ? 'Leave blank to keep current' : 'At least 6 characters';
  document.getElementById('uf-active-wrap').style.display = user ? '' : 'none';

  form.name.value = user?.name ?? '';
  form.username.value = user?.username ?? '';
  form.role.value = user?.role ?? 'cashier';
  if (user) form.active.checked = user.active;

  openModal('modal-user');
}

async function submitUser(event) {
  event.preventDefault();
  const form = event.target;
  const payload = { name: form.name.value, role: form.role.value };

  try {
    if (editingId) {
      payload.active = form.active.checked;
      if (form.password.value) payload.password = form.password.value;
      const { user } = await API.patch(`/api/users/${editingId}`, payload);
      toast(`Saved "${user.name}".`, 'success');
    } else {
      payload.username = form.username.value;
      payload.password = form.password.value;
      const { user } = await API.post('/api/users', payload);
      toast(`Created user "${user.username}".`, 'success');
    }
    closeModal('modal-user');
    await loadUsers();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function onUsersClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const user = users.find((u) => u.id === button.dataset.id);
  if (!user) return;

  if (button.dataset.action === 'edit') {
    openUserModal(user);
    return;
  }
  if (button.dataset.action === 'toggle') {
    try {
      await API.patch(`/api/users/${user.id}`, { active: !user.active });
      toast(user.active ? `"${user.username}" deactivated.` : `"${user.username}" activated.`, 'success');
      await loadUsers();
    } catch (error) {
      toast(error.message, 'error');
    }
  }
}

// ---------------------------------------------------------------- settings

async function loadSettings() {
  const { settings } = await API.get('/api/settings');
  const form = document.getElementById('settings-form');
  form.storeName.value = settings.storeName;
  form.receiptHeader.value = settings.receiptHeader ?? '';
  form.receiptFooter.value = settings.receiptFooter ?? '';
  form.defaultMinStock.value = settings.defaultMinStock;
  form.lowStockAlertsEnabled.checked = settings.lowStockAlertsEnabled;
}

async function submitSettings(event) {
  event.preventDefault();
  const form = event.target;
  try {
    await API.patch('/api/settings', {
      storeName: form.storeName.value,
      receiptHeader: form.receiptHeader.value,
      receiptFooter: form.receiptFooter.value,
      defaultMinStock: form.defaultMinStock.value,
      lowStockAlertsEnabled: form.lowStockAlertsEnabled.checked,
    });
    toast('Settings saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}
