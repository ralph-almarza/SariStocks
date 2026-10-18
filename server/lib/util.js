/**
 * Small shared helpers for the server.
 */

/** Create an Error carrying an HTTP status code for the error middleware. */
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Wrap a route handler so thrown errors (sync or async) reach Express. */
export function handler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/** Round to 2 decimal places (money). */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** A Date as ISO 8601 with the machine's UTC offset, e.g. 2026-10-18T14:32:07+08:00. */
export function isoFrom(date) {
  const d = date;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

/** Local time as ISO 8601 with the machine's UTC offset. */
export function nowIso() {
  return isoFrom(new Date());
}

/** Today's local date as YYYY-MM-DD. */
export function todayStr() {
  return nowIso().slice(0, 10);
}

/** Escape one CSV field. */
export function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Build CSV text from a matrix of rows. */
export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
