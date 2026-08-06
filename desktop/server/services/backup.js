import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
const BACKUP_DIR = path.join(config.dataDir, 'backups');
const MAX_BACKUPS = 40;
const BACKUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
let timer = null;
export function startBackupScheduler() {
    if (!existsSync(BACKUP_DIR)) {
        mkdirSync(BACKUP_DIR, { recursive: true });
    }
    timer = setInterval(() => {
        // db.backup() is async — wrap in IIFE so setInterval callback can return synchronously
        (async () => {
            try {
                await runBackup();
            }
            catch (err) {
                logger.error({ err }, 'Auto-backup failed');
            }
        })();
    }, BACKUP_INTERVAL_MS);
    logger.info('Auto-backup scheduler started (12h)');
}
export function stopBackupScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
/**
 * Create a timestamped backup of the current database.
 * NOTE: better-sqlite3's db.backup() is async (returns a Promise) — must be awaited.
 */
export async function runBackup() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, `backup-${ts}.db`);
    await db.backup(file);
    pruneBackups();
    logger.info({ file }, 'Backup created');
    return file;
}
export function listBackups() {
    if (!existsSync(BACKUP_DIR))
        return [];
    return readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db'))
        .map(f => ({
        name: f,
        size: statSync(path.join(BACKUP_DIR, f)).size,
        date: statSync(path.join(BACKUP_DIR, f)).mtime.toISOString(),
    }))
        .sort((a, b) => b.date.localeCompare(a.date));
}
function pruneBackups() {
    if (!existsSync(BACKUP_DIR))
        return;
    const files = readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db'))
        .map(f => ({ name: f, time: statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
    for (let i = MAX_BACKUPS; i < files.length; i++) {
        try {
            unlinkSync(path.join(BACKUP_DIR, files[i].name));
        }
        catch { /* ignore */ }
    }
}
//# sourceMappingURL=backup.js.map