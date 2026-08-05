export function validateBody(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const fields = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || 'root';
                fields[key] = issue.message;
            }
            // Build a readable message listing the failing fields so the user
            // sees exactly what went wrong (e.g. "Validation fail hui —
            // location_id: Required; customer_id: Required") instead of just
            // "Validation fail hui".
            const detail = Object.entries(fields)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ');
            const message = detail
                ? `Validation fail hui — ${detail}`
                : 'Validation fail hui.';
            throw Object.assign(new Error(message), { status: 422, code: 'VALIDATION', fields });
        }
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map