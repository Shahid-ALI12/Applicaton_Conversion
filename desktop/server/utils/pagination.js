export function parsePage(query) {
    return {
        page: Math.max(1, Number(query.page) || 1),
        pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 50)),
        search: String(query.search ?? '').trim(),
    };
}
//# sourceMappingURL=pagination.js.map