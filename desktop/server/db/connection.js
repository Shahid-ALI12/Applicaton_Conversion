import BetterSqlite3 from 'better-sqlite3';
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
function openConnection() {
    const conn = new BetterSqlite3(config.dbFile);
    conn.pragma('journal_mode = WAL');
    conn.pragma('foreign_keys = ON');
    conn.pragma('busy_timeout = 5000');
    conn.pragma('synchronous = NORMAL');
    return conn;
}
let liveDb = openConnection();
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
export function reopenDatabase() {
    try {
        try {
            liveDb.close();
        }
        catch (err) {
            // Ignore close errors — file may already be detached. Log and continue.
            logger.warn({ err }, 'DB close during reopen failed (continuing)');
        }
        liveDb = openConnection();
        logger.info({ dbFile: config.dbFile }, 'SQLite reconnected after restore');
        return true;
    }
    catch (err) {
        logger.error({ err }, 'DB reopen failed');
        throw err;
    }
}
/**
 * Close the current DB connection WITHOUT reopening. Used right before
 * a file-swap on Windows (you cannot rename/replace an open file).
 * Caller MUST call `reopenDatabase()` afterwards.
 */
export function closeDatabase() {
    try {
        liveDb.close();
        logger.info('SQLite connection closed (for restore swap)');
    }
    catch (err) {
        logger.warn({ err }, 'DB close failed (continuing — file may still be unlocked)');
    }
}
// Proxy forwards every property access to the live connection.
// This means `db.prepare(...)`, `db.pragma(...)`, `db.exec(...)` etc.
// always operate on the *current* liveDb, even after a close+reopen.
export const db = new Proxy({}, {
    get(_target, prop, receiver) {
        const value = Reflect.get(liveDb, prop, receiver);
        if (typeof value === 'function') {
            return value.bind(liveDb);
        }
        return value;
    },
    set(_target, prop, value, receiver) {
        return Reflect.set(liveDb, prop, value, receiver);
    },
    has(_target, prop) {
        return Reflect.has(liveDb, prop);
    },
    ownKeys(_target) {
        return Reflect.ownKeys(liveDb);
    },
    getOwnPropertyDescriptor(_target, prop) {
        return Reflect.getOwnPropertyDescriptor(liveDb, prop);
    },
});
/** Round to 2 decimal places — money safety */
export function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=connection.js.map