export class AppError extends Error {
    status;
    code;
    fields;
    constructor(status, code, message, fields) {
        super(message);
        this.status = status;
        this.code = code;
        this.fields = fields;
    }
    static badRequest(message, fields) {
        return new AppError(400, 'BAD_REQUEST', message, fields);
    }
    static unauthorized(message = 'Login zaruri hai.') {
        return new AppError(401, 'UNAUTHORIZED', message);
    }
    static forbidden(message = 'Aap ko ye permission nahi hai.') {
        return new AppError(403, 'FORBIDDEN', message);
    }
    static notFound(message = 'Record nahi mila.') {
        return new AppError(404, 'NOT_FOUND', message);
    }
    static conflict(message) {
        return new AppError(409, 'CONFLICT', message);
    }
    static tooManyRequests(message) {
        return new AppError(429, 'RATE_LIMITED', message);
    }
    static internal(message = 'Server mein error aaya.') {
        return new AppError(500, 'INTERNAL', message);
    }
}
//# sourceMappingURL=errors.js.map