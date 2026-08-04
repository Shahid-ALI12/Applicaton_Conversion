/** Simple in-process TTL cache with tag-based invalidation. */
const store = new Map<string, { value: unknown; expires: number; tags: string[] }>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) { store.delete(key); return undefined; }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number, tags: string[] = []): void {
  store.set(key, { value, expires: Date.now() + ttlMs, tags });
}

export function cacheInvalidate(tag: string): void {
  for (const [key, entry] of store) {
    if (entry.tags.includes(tag)) store.delete(key);
  }
}

export function cacheClear(): void {
  store.clear();
}
