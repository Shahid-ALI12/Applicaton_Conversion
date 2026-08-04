export declare function cacheGet<T>(key: string): T | undefined;
export declare function cacheSet(key: string, value: unknown, ttlMs: number, tags?: string[]): void;
export declare function cacheInvalidate(tag: string): void;
export declare function cacheClear(): void;
