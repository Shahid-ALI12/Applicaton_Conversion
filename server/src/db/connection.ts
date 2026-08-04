import BetterSqlite3 from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const db = new BetterSqlite3(config.dbFile, { verbose: config.isProd ? undefined : undefined });

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

/** Round to 2 decimal places — money safety */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

logger.info({ dbFile: config.dbFile }, 'SQLite connected (WAL mode)');
