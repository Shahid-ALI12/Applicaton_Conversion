import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSmokeTest = process.argv.includes('--smoke');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;
let serverPort = 0;

async function startServer() {
  const userData = app.getPath('userData');
  process.env.NODE_ENV = 'production';
  process.env.DATA_DIR = path.join(userData, 'data');
  process.env.CLIENT_DIST = path.join(__dirname, 'client');
  process.env.LOG_FILE = path.join(userData, 'logs', 'app.log');
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

  const { runMigrations } = await import('./server/db/migrate.js');
  const { runSeed } = await import('./server/db/seed.js');
  const { startBackupScheduler } = await import('./server/services/backup.js');
  const { createApp } = await import('./server/app.js');

  runMigrations();
  runSeed();
  startBackupScheduler();

  const expressApp = createApp();
  await new Promise((resolve, reject) => {
    const httpServer = expressApp.listen(0, '127.0.0.1', () => {
      serverPort = httpServer.address().port;
      resolve(undefined);
    });
    httpServer.on('error', reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Danish Cattle Feed Software',
    autoHideMenuBar: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.maximize();
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 700, autoHideMenuBar: true } };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [
      { label: `Danish Cattle Feed Software v${app.getVersion()}`, enabled: false },
      { label: 'Data Folder kholein', click: () => shell.openPath(app.getPath('userData')) },
    ] },
  ]));
}

app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

app.whenReady().then(async () => {
  try { await startServer(); } catch (err) {
    if (isSmokeTest) { writeSmokeResult({ ok: false, error: String(err?.stack ?? err) }); app.exit(1); return; }
    dialog.showErrorBox('Danish Cattle Feed Software', `Application start nahi ho saki:\n\n${err?.stack ?? err}`);
    app.exit(1); return;
  }

  if (isSmokeTest) {
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
      const body = await res.json();
      writeSmokeResult({ ok: res.ok, port: serverPort, health: body });
      app.exit(res.ok ? 0 : 1);
    } catch (err) { writeSmokeResult({ ok: false, error: String(err) }); app.exit(1); }
    return;
  }

  buildMenu();
  createWindow();
});

function writeSmokeResult(result) {
  const out = process.env.SMOKE_OUT ?? path.join(app.getPath('userData'), 'smoke.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
}

app.on('window-all-closed', () => app.quit());

app.on('will-quit', async () => {
  try {
    const { db } = await import('./server/db/connection.js');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch { /* already closed */ }
});
