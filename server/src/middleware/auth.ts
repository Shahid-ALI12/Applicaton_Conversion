import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { config } from '../config.js';

interface JwtPayload {
  userId: number;
  role: 'admin' | 'operator';
}

declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; role: 'admin' | 'operator'; name: string; isActive: boolean };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw AppError.unauthorized();

  try {
    const payload = jwt.verify(auth.slice(7), config.jwtSecret) as JwtPayload;
    const row = db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(payload.userId) as
      | { id: number; name: string; role: string; is_active: number }
      | undefined;

    if (!row) throw AppError.unauthorized('User nahi mila.');
    if (!row.is_active) throw AppError.unauthorized('Account deactivate hai.');

    req.user = { userId: row.id, role: row.role as 'admin' | 'operator', name: row.name, isActive: !!row.is_active };
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Session khatam — dobara login karein.');
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role !== 'admin') throw AppError.forbidden('Sirf admin ye kar sakta hai.');
  next();
}
