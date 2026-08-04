export function validateBody(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const fields = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || 'root';
                fields[key] = issue.message;
            }
            throw Object.assign(new Error('Validation fail hui.'), { status: 422, code: 'VALIDATION', fields });
        }
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map