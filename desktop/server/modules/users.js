import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
export const usersRouter = Router();
usersRouter.get('/', requireAuth, requireAdmin, (req, res) => {
    const { page, pageSize, search } = parsePage(req.query);
    let where = '1=1';
    const params = [];
    if (search) {
        where += ' AND (name LIKE ? OR username LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    const total = db.prepare(`SELECT COUNT(*) as c FROM users WHERE ${where}`).get(...params).c;
    const rows = db.prepare(`SELECT id, name, username, role, is_active, created_at FROM users WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});
usersRouter.post('/', requireAuth, requireAdmin, validateBody(z.object({
    name: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().min(6),
    role: z.enum(['admin', 'operator']),
})), (req, res) => {
    const { name, username, password, role } = req.body;
    const hash = bcrypt.hashSync(password, 11);
    const result = db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)').run(name, username, hash, role);
    res.status(201).json({ id: Number(result.lastInsertRowid), name, username, role });
});
usersRouter.put('/:id', requireAuth, requireAdmin, validateBody(z.object({
    name: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    role: z.enum(['admin', 'operator']).optional(),
    is_active: z.boolean().optional(),
})), (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.userId && req.body.is_active === false)
        throw AppError.badRequest('Apna account deactivate nahi kar sakte.');
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(req.body)) {
        sets.push(`${k} = ?`);
        vals.push(v);
    }
    if (sets.length === 0)
        throw AppError.badRequest('Kuch update nahi hai.');
    vals.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});
usersRouter.delete('/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.userId)
        throw AppError.badRequest('Apna account delete nahi kar sakte.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
});
//# sourceMappingURL=users.js.map