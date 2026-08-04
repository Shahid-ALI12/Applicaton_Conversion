import { db } from './connection.js';
import { migrations } from './migrations.js';
import { logger } from '../logger.js';
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
export function runMigrations() {
    for (const m of migrations) {
        const row = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(m.id);
        if (row)
            continue;
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id);
        logger.info({ migration: m.id }, 'Migration applied');
    }
}
//# sourceMappingURL=migrate.js.map