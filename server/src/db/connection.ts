import BetterSqlite3, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * The active SQLite connection.
 *
 * NOTE: This is wrapped in a Proxy so that callers always reach the
 * *current* live connection, even after we close+reopen it (e.g. during
 * a database restore). All 20+ modules that do `import { db }` and call
 * `db.prepare(...)`, `db.pragma(...)`, `db.exec(...)` etc. will keep
 * working transparently — every property access / method call is
 * forwarded to whatever `liveDb` currently points to.
 */

function openConnection(): BetterSqlite3Database {
  const conn = new BetterSqlite3(config.dbFile);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  conn.pragma('synchronous = NORMAL');
  return conn;
}

let liveDb: BetterSqlite3Database = openConnection();
logger.info({ dbFile: config.dbFile }, 'SQLite connected (WAL mode)');

/**
 * Close the current DB connection and open a fresh one pointing at the
 * same path. Used by the restore flow after swapping the .db file on
 * disk — the running process needs to re-open the file to see the new
 * contents (and on Windows you cannot rename/replace an open file, so
 * close is mandatory BEFORE the swap too).
 *
 * Returns true if the reopen succeeded; throws otherwise.
 */
export function reopenDatabase(): boolean {
  try {
    try {
      liveDb.close();
    } catch (err: any) {
      // Ignore close errors — file may already be detached. Log and continue.
      logger.warn({ err }, 'DB close during reopen failed (continuing)');
    }
    liveDb = openConnection();
    logger.info({ dbFile: config.dbFile }, 'SQLite reconnected after restore');
    return true;
  } catch (err: any) {
    logger.error({ err }, 'DB reopen failed');
    throw err;
  }
}

/**
 * Close the current DB connection WITHOUT reopening. Used right before
 * a file-swap on Windows (you cannot rename/replace an open file).
 * Caller MUST call `reopenDatabase()` afterwards.
 */
export function closeDatabase(): void {
  try {
    liveDb.close();
    logger.info('SQLite connection closed (for restore swap)');
  } catch (err: any) {
    logger.warn({ err }, 'DB close failed (continuing — file may still be unlocked)');
  }
}

// Proxy forwards every property access to the live connection.
// This means `db.prepare(...)`, `db.pragma(...)`, `db.exec(...)` etc.
// always operate on the *current* liveDb, even after a close+reopen.
export const db: BetterSqlite3Database = new Proxy({} as BetterSqlite3Database, {
  get(_target, prop, receiver) {
    const value = Reflect.get(liveDb as unknown as object, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(liveDb);
    }
    return value;
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(liveDb as unknown as object, prop, value, receiver);
  },
  has(_target, prop) {
    return Reflect.has(liveDb as unknown as object, prop);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(liveDb as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(liveDb as unknown as object, prop);
  },
});

/** Round to 2 decimal places — money safety */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
