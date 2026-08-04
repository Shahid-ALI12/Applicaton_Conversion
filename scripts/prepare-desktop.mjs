import { cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDist = path.join(root, 'server', 'dist');
const clientDist = path.join(root, 'client', 'dist');
const desktopServer = path.join(root, 'desktop', 'server');
const desktopClient = path.join(root, 'desktop', 'client');

for (const [src, label] of [[serverDist, 'server/dist'], [clientDist, 'client/dist']]) {
  if (!existsSync(src)) {
    console.error(`Missing ${label} — run "npm run build" first`);
    process.exit(1);
  }
}

rmSync(desktopServer, { recursive: true, force: true });
rmSync(desktopClient, { recursive: true, force: true });
cpSync(serverDist, desktopServer, { recursive: true });
cpSync(clientDist, desktopClient, { recursive: true });

console.log('Desktop payload ready: desktop/server + desktop/client');
