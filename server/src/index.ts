import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { startBackupScheduler } from './services/backup.js';
import { logger } from './logger.js';

runMigrations();
runSeed();
startBackupScheduler();

const app = createApp();
app.listen(config.port, '127.0.0.1', () => {
  logger.info({ port: config.port, env: config.env }, `Danish Cattle Feed Software server chal raha hai`);
});
