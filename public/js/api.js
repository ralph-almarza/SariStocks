/**
 * Small fetch wrapper for the SariStocks API.
 * Sends/receives JSON, keeps the session cookie, and throws errors that
 * carry the server's message so pages can toast them directly.
 */

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    method: options.method ?? 'GET',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = (data && data.error) || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const API = {
  get: (path) => api(path),
  post: (path, body) => api(path, { method: 'POST', body }),
  patch: (path, body) => api(path, { method: 'PATCH', body }),
  del: (path) => api(path, { method: 'DELETE' }),
};
