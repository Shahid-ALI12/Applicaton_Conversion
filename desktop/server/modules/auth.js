import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { config } from '../config.js';
export const authRouter = Router();
authRouter.post('/login', loginLimiter, validateBody(z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
})), (req, res) => {
    const { username, password } = req.body;
    const row = db.prepare('SELECT id, name, username, password_hash, role, is_active FROM users WHERE username = ?').get(username);
    if (!row || !row.is_active || !bcrypt.compareSync(password, row.password_hash)) {
        throw AppError.unauthorized('Username ya password ghalat hai.');
    }
    const token = jwt.sign({ userId: row.id, role: row.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, user: { id: row.id, name: row.name, username: row.username, role: row.role } });
});
authRouter.get('/me', requireAuth, (req, res) => {
    const row = db.prepare('SELECT id, name, username, role, is_active FROM users WHERE id = ?').get(req.user.userId);
    res.json(row);
});
authRouter.post('/change-password', requireAuth, validateBody(z.object({
    current: z.string().min(1),
    newPassword: z.string().min(6, 'Password kam se kam 6 characters ka hona chahiye'),
})), (req, res) => {
    const { current, newPassword } = req.body;
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId);
    if (!bcrypt.compareSync(current, row.password_hash))
        throw AppError.badRequest('Current password ghalat hai.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 11), req.user.userId);
    res.json({ ok: true });
});
//# sourceMappingURL=auth.js.map