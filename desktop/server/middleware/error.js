import { logger } from '../logger.js';
export function errorHandler(err, _req, res, _next) {
    // Zod / validation
    if ('status' in err && err.status === 422) {
        res.status(422).json({
            error: { code: 'VALIDATION', message: err.message, fields: err.fields },
        });
        return;
    }
    // AppError
    if ('status' in err && typeof err.status === 'number') {
        const { status, code, message, fields } = err;
        if (status >= 500)
            logger.error({ err }, message);
        res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
        return;
    }
    // SQLite constraint
    if (err.message?.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'Ye record pehle se mojood hai.' } });
        return;
    }
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'Related record nahi mila — delete nahi ho sakta.' } });
        return;
    }
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Server mein error aaya.' } });
}
//# sourceMappingURL=error.js.map