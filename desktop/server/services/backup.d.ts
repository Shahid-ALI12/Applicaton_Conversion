export declare function startBackupScheduler(): void;
export declare function stopBackupScheduler(): void;
/**
 * Create a timestamped backup of the current database.
 * NOTE: better-sqlite3's db.backup() is async (returns a Promise) — must be awaited.
 */
export declare function runBackup(): Promise<string>;
export declare function listBackups(): {
    name: string;
    size: number;
    date: string;
}[];
