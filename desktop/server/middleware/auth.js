import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { config } from '../config.js';
export function requireAuth(req, _res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer '))
        throw AppError.unauthorized();
    try {
        const payload = jwt.verify(auth.slice(7), config.jwtSecret);
        const row = db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(payload.userId);
        if (!row)
            throw AppError.unauthorized('User nahi mila.');
        if (!row.is_active)
            throw AppError.unauthorized('Account deactivate hai.');
        req.user = { userId: row.id, role: row.role, name: row.name, isActive: !!row.is_active };
        next();
    }
    catch (err) {
        if (err instanceof AppError)
            throw err;
        throw AppError.unauthorized('Session khatam — dobara login karein.');
    }
}
export function requireAdmin(req, _res, next) {
    if (!req.user)
        throw AppError.unauthorized();
    if (req.user.role !== 'admin')
        throw AppError.forbidden('Sirf admin ye kar sakta hai.');
    next();
}
//# sourceMappingURL=auth.js.map