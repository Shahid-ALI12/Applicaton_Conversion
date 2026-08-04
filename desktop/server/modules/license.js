import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { validateBody } from '../middleware/validate.js';
import { activateLimiter } from '../middleware/rateLimit.js';
import { activateLicense, LicenseError, licenseStatus } from '../services/license.js';
import { AppError } from '../errors.js';
export const licenseRouter = Router();
licenseRouter.get('/status', (_req, res) => {
    const support = db.prepare("SELECT value FROM settings WHERE key = 'support_phone'").get();
    res.json({ ...licenseStatus(), support_phone: support?.value ?? '' });
});
licenseRouter.post('/activate', activateLimiter, validateBody(z.object({
    code: z.string().trim().min(20).max(1000),
})), (req, res) => {
    try {
        const status = activateLicense(req.body.code);
        res.json(status);
    }
    catch (err) {
        if (err instanceof LicenseError)
            throw AppError.badRequest(err.message);
        throw err;
    }
});
//# sourceMappingURL=license.js.map