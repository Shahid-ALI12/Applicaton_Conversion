import { Database as BetterSqlite3Database } from 'better-sqlite3';
/**
 * Close the current DB connection and open a fresh one pointing at the
 * same path. Used by the restore flow after swapping the .db file on
 * disk — the running process needs to re-open the file to see the new
 * contents (and on Windows you cannot rename/replace an open file, so
 * close is mandatory BEFORE the swap too).
 *
 * Returns true if the reopen succeeded; throws otherwise.
 */
export declare function reopenDatabase(): boolean;
/**
 * Close the current DB connection WITHOUT reopening. Used right before
 * a file-swap on Windows (you cannot rename/replace an open file).
 * Caller MUST call `reopenDatabase()` afterwards.
 */
export declare function closeDatabase(): void;
export declare const db: BetterSqlite3Database;
/** Round to 2 decimal places — money safety */
export declare function round2(n: number): number;
