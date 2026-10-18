/**
 * Login page. Redirects to the right home page after authentication:
 * cashiers land on the POS, managers/admins on the dashboard.
 */
import { API } from './api.js';
import { toast } from './ui.js';

// If a stray native submission ever put credentials in the query string,
// scrub them so the address bar and history stay clean.
if (location.search) history.replaceState(null, '', location.pathname);

const form = document.getElementById('login-form');

// Attach the handler immediately — never let the form fall back to a native
// GET submission (the password would end up in the URL).
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { user } = await API.post('/api/auth/login', {
      username: form.username.value,
      password: form.password.value,
    });
    location.replace(user.role === 'cashier' ? 'pos.html' : 'dashboard.html');
  } catch (error) {
    toast(error.message, 'error');
    button.disabled = false;
  }
});

// Already logged in? Skip the form (checked only after the handler is bound).
try {
  const { user } = await API.get('/api/auth/me');
  location.replace(user.role === 'cashier' ? 'pos.html' : 'dashboard.html');
} catch { /* not logged in — show the form */ }
