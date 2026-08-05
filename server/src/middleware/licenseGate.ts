import type { NextFunction, Request, Response } from 'express';
import { licenseStatus } from '../services/license.js';

/**
 * Jab license expired/tampered ho to sirf /license/ aur /health open
 * rehte hain. /auth/ bhi block ho jaata hai — user ko pehle naya
 * code activate karna padega, phir login ho sakta hai.
 */
const OPEN_PREFIXES = ['/license/', '/health'];

export function licenseGate(req: Request, res: Response, next: NextFunction): void {
  if (OPEN_PREFIXES.some(p => req.path.startsWith(p))) {
    next();
    return;
  }
  const status = licenseStatus();
  if (status.state === 'expired' || status.state === 'tampered') {
    res.status(403).json({
      error: {
        code: status.state === 'expired' ? 'LICENSE_EXPIRED' : 'LICENSE_TAMPERED',
        message: status.message,
      },
      license: status,
    });
    return;
  }
  next();
}
