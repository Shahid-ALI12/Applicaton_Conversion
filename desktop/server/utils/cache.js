/** Simple in-process TTL cache with tag-based invalidation. */
const store = new Map();
export function cacheGet(key) {
    const entry = store.get(key);
    if (!entry)
        return undefined;
    if (Date.now() > entry.expires) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}
export function cacheSet(key, value, ttlMs, tags = []) {
    store.set(key, { value, expires: Date.now() + ttlMs, tags });
}
export function cacheInvalidate(tag) {
    for (const [key, entry] of store) {
        if (entry.tags.includes(tag))
            store.delete(key);
    }
}
export function cacheClear() {
    store.clear();
}
//# sourceMappingURL=cache.js.map