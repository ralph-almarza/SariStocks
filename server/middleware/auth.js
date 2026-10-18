/**
 * Authentication and role-based access control middleware.
 *
 * Roles are hierarchical: cashier(1) < manager(2) < admin(3). A route that
 * requires "manager" is also reachable by admins, never by cashiers.
 */
import { httpError } from '../lib/util.js';

export const ROLE_LEVEL = { cashier: 1, manager: 2, admin: 3 };

/** Require an authenticated (and still-active) user. */
export function requireAuth(store) {
  return (req, res, next) => {
    const sessionUser = req.session?.user;
    if (!sessionUser) return next(httpError(401, 'Not logged in.'));
    // Re-check the account on every request so deactivated users are cut off.
    const user = store.getUserById(sessionUser.id);
    if (!user || !user.active) {
      req.session.destroy(() => next(httpError(401, 'Account is disabled or no longer exists.')));
      return;
    }
    req.user = user;
    next();
  };
}

/** Require at least the given role. Must run after requireAuth. */
export function requireRole(minimum) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Not logged in.'));
    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minimum]) {
      return next(httpError(403, `This action requires the ${minimum} role.`));
    }
    next();
  };
}
