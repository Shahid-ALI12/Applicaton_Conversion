import { Router } from 'express';
import { existsSync, mkdirSync, renameSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import BetterSqlite3 from 'better-sqlite3';
import { db, closeDatabase, reopenDatabase } from '../db/connection.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { runBackup } from '../services/backup.js';
import { logger } from '../logger.js';
export const databaseRouter = Router();
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            const tmpDir = path.join(config.dataDir, 'restore-tmp');
            if (!existsSync(tmpDir))
                mkdirSync(tmpDir, { recursive: true });
            cb(null, tmpDir);
        },
        filename: (_req, file, cb) => {
            // Sanitize filename — keep extension only, prefix with timestamp
            const ext = path.extname(file.originalname).toLowerCase() || '.db';
            cb(null, `restore-${Date.now()}${ext}`);
        },
    }),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
            cb(null, true);
        }
        else {
            // Pass a special error object — multer will forward it as a known error
            // that our error handler can convert to a 400 response.
            cb(new MulterInvalidFileError('Only .db / .sqlite / .sqlite3 files are allowed'), false);
        }
    },
});
class MulterInvalidFileError extends Error {
    code = 'INVALID_FILE_TYPE';
    status = 400;
    constructor(message) { super(message); this.name = 'MulterInvalidFileError'; }
}
function pktToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}
function formatBytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
/**
 * GET /api/database/backup
 * Streams the current SQLite database file as a download.
 * Uses SQLite's online backup API to create a consistent snapshot
 * (does NOT block writes while backup is in progress).
 */
databaseRouter.get('/backup', requireAuth, requireAdmin, async (_req, res) => {
    if (!existsSync(config.dbFile)) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Database file not found' } });
    }
    // Use better-sqlite3 backup API — creates a consistent snapshot file
    // even if the database is being written to. Note: db.backup() returns
    // a Promise (async) — must be awaited.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(config.dataDir, `snapshot-${ts}.db`);
    try {
        await db.backup(snapshotPath);
    }
    catch (err) {
        logger.error({ err }, 'Database snapshot failed');
        return res.status(500).json({ error: { code: 'BACKUP_FAILED', message: 'Failed to create database snapshot', detail: err?.message } });
    }
    const stat = statSync(snapshotPath);
    const filename = `danishcattlefeed-backup-${pktToday()}.db`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('X-Backup-Size', formatBytes(stat.size));
    res.setHeader('X-Backup-Date', new Date().toISOString());
    // Stream the file then delete the temp snapshot
    const stream = createReadStream(snapshotPath);
    stream.on('end', () => {
        try {
            unlinkSync(snapshotPath);
        }
        catch { /* ignore */ }
    });
    stream.on('error', () => {
        try {
            unlinkSync(snapshotPath);
        }
        catch { /* ignore */ }
    });
    stream.pipe(res);
});
/**
 * POST /api/database/restore
 * Accepts a .db file upload and safely replaces the current database.
 *
 * Safety flow:
 *   1. Save uploaded file to restore-tmp/
 *   2. Validate it's a valid SQLite database (open it + query sqlite_master)
 *   3. Create a safety backup of the current DB (runBackup())
 *   4. Close the current connection (we can't replace a file that's open)
 *      -- Actually, better-sqlite3 lets us copy the file over because we use
 *      -- WAL mode + the in-memory connection. But to be safe we:
 *      --   a. checkpoint the WAL (force all writes to .db file)
 *      --   b. copy uploaded file -> danishcattlefeed.db
 *   5. Tell user to RESTART the app for changes to take effect
 *      (the running process still holds the old DB in memory; restart loads fresh)
 */
databaseRouter.post('/restore', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded. Please select a .db backup file.' } });
    }
    const uploadedPath = req.file.path;
    try {
        // 1. Validate the uploaded file is a real SQLite database
        let validateErr = null;
        try {
            const probe = new BetterSqlite3(uploadedPath, { readonly: true });
            const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            probe.close();
            if (tables.length === 0) {
                validateErr = 'Uploaded file is empty (no tables found)';
            }
            // Sanity check: look for at least one of our expected tables
            const expected = ['products', 'customers', 'sales', 'expenses', 'cash_ledger'];
            const found = tables.filter((t) => expected.includes(t.name));
            if (found.length < 3) {
                validateErr = `Uploaded file does not look like a Danish Cattle Feed database (found ${found.length}/${expected.length} expected tables)`;
            }
        }
        catch (e) {
            validateErr = `Cannot open uploaded file as SQLite: ${e?.message || 'invalid file'}`;
        }
        if (validateErr) {
            try {
                unlinkSync(uploadedPath);
            }
            catch { /* ignore */ }
            return res.status(400).json({ error: { code: 'INVALID_BACKUP', message: validateErr } });
        }
        // 2. Create a safety backup of the current database (in case restore goes wrong)
        let safetyBackupPath = null;
        try {
            safetyBackupPath = await runBackup(); // returns path to a timestamped .db file in backups/
            logger.info({ safetyBackupPath }, 'Safety backup created before restore');
        }
        catch (err) {
            // Don't proceed if we couldn't make a safety backup — too risky
            try {
                unlinkSync(uploadedPath);
            }
            catch { /* ignore */ }
            return res.status(500).json({ error: { code: 'SAFETY_BACKUP_FAILED', message: 'Failed to create safety backup before restore. Restore aborted.', detail: err?.message } });
        }
        // 3. Force WAL checkpoint so all in-memory changes are flushed to the .db file
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
        }
        catch (err) {
            logger.warn({ err }, 'WAL checkpoint failed during restore (continuing anyway)');
        }
        // 4. Replace the current database file with the uploaded one.
        //
        //    On Windows, the running SQLite connection holds an exclusive lock
        //    on the .db file, so we CANNOT rename or overwrite it while the
        //    connection is open. Strategy:
        //      a. Close the live DB connection (releases the file lock)
        //      b. Rename current .db → .pre-restore-<ts>.db (safety)
        //      c. Move uploaded .db → main .db path
        //      d. Remove stale -wal / -shm sidecar files
        //      e. Reopen the DB connection (loads the new file)
        //    If any step (b)-(c) fails, we revert by renaming the safety copy
        //    back to the original name, then reopen.
        const mainDb = config.dbFile;
        const backupOfCurrent = `${mainDb}.pre-restore-${Date.now()}.db`;
        let restored = false;
        try {
            // (a) Close the connection — releases the Windows file lock
            try {
                closeDatabase();
            }
            catch (err) {
                logger.warn({ err }, 'DB close before swap failed (continuing — may still work on Linux)');
            }
            // (b) Rename current → safety backup name
            renameSync(mainDb, backupOfCurrent);
            try {
                // (c) Move uploaded file → main DB path
                renameSync(uploadedPath, mainDb);
                // (d) Remove stale -wal / -shm files (they'll be recreated on next open)
                for (const ext of ['-wal', '-shm']) {
                    const f = `${mainDb}${ext}`;
                    if (existsSync(f)) {
                        try {
                            unlinkSync(f);
                        }
                        catch { /* ignore */ }
                    }
                }
                restored = true;
            }
            catch (err) {
                // Move failed — revert by restoring the original file
                logger.error({ err }, 'Restore move failed, reverting to original DB');
                try {
                    renameSync(backupOfCurrent, mainDb);
                }
                catch { /* ignore */ }
                throw err;
            }
        }
        catch (err) {
            // Reopen DB before returning so the app keeps working
            try {
                reopenDatabase();
            }
            catch (e) {
                logger.error({ err: e }, 'DB reopen after FAILED restore failed — app may be in a broken state');
            }
            try {
                unlinkSync(uploadedPath);
            }
            catch { /* ignore */ }
            return res.status(500).json({
                error: {
                    code: 'RESTORE_FAILED',
                    message: 'Restore failed — your original database is intact.',
                    detail: err?.message,
                    safetyBackup: safetyBackupPath,
                }
            });
        }
        // 5. Reopen the DB connection so the running process sees the new file.
        //    (The connection still points to the old file descriptor; we must
        //    re-open to pick up the swapped-in database.)
        if (restored) {
            try {
                reopenDatabase();
            }
            catch (err) {
                // Reopen failed — this is bad, but the file swap succeeded, so a
                // restart of the app will still load the new database correctly.
                logger.error({ err }, 'DB reopen after restore failed — app restart required');
                return res.status(500).json({
                    error: {
                        code: 'REOPEN_FAILED',
                        message: 'Database file was replaced, but the app could not re-open it. Please RESTART the application immediately.',
                        detail: err?.message,
                        safetyBackup: safetyBackupPath,
                    }
                });
            }
            // Clean up the pre-restore backup (the safety backup in backups/ is enough)
            try {
                unlinkSync(backupOfCurrent);
            }
            catch { /* ignore */ }
            const stat = statSync(mainDb);
            logger.info({ mainDb, size: stat.size }, 'Database restored successfully');
            return res.json({
                ok: true,
                message: 'Database restored successfully. Please RESTART the application to load the new database.',
                safetyBackup: safetyBackupPath,
                newDbSize: formatBytes(stat.size),
                restoredAt: new Date().toISOString(),
            });
        }
    }
    catch (err) {
        logger.error({ err }, 'Unexpected restore error');
        try {
            unlinkSync(uploadedPath);
        }
        catch { /* ignore */ }
        return res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected error during restore', detail: err?.message } });
    }
});
/**
 * GET /api/database/info
 * Returns info about the current database (size, path, last modified).
 */
databaseRouter.get('/info', requireAuth, requireAdmin, (_req, res) => {
    try {
        if (!existsSync(config.dbFile)) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Database file not found' } });
        }
        const stat = statSync(config.dbFile);
        // Count rows in key tables
        const counts = {};
        const tables = ['products', 'customers', 'sales', 'expenses', 'purchases', 'cash_ledger', 'mix_orders'];
        for (const t of tables) {
            try {
                const r = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get();
                counts[t] = r.n;
            }
            catch { /* table might not exist */
                counts[t] = 0;
            }
        }
        res.json({
            path: config.dbFile,
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            lastModified: stat.mtime.toISOString(),
            counts,
        });
    }
    catch (err) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to get database info', detail: err?.message } });
    }
});
//# sourceMappingURL=database.js.map