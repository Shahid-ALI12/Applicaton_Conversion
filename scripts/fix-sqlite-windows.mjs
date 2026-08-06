// scripts/fix-sqlite-windows.mjs
// Cross-platform fix: replace Linux better_sqlite3.node with Windows PE32+ binary
// Run this AFTER `npm run desktop:dist` but BEFORE `bash scripts/build-installer.sh`

import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPkg = JSON.parse(readFileSync(path.join(root, 'desktop/node_modules/electron/package.json'), 'utf8'));
const bsql3Pkg = JSON.parse(readFileSync(path.join(root, 'server/node_modules/better-sqlite3/package.json'), 'utf8'));

// Electron 33.x -> Node ABI v130
const electronMajor = parseInt(electronPkg.version.split('.')[0], 10);
const abiMap = { 30: 124, 31: 125, 32: 128, 33: 130, 34: 131, 35: 132 };
const abi = abiMap[electronMajor] || 130;
const bsql3Version = bsql3Pkg.version;
const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsql3Version}/better-sqlite3-v${bsql3Version}-electron-v${abi}-win32-x64.tar.gz`;

console.log(`Electron ${electronPkg.version} -> ABI v${abi}`);
console.log(`better-sqlite3 ${bsql3Version}`);
console.log(`Downloading: ${url}`);

const tmpTar = '/tmp/bsql3-win.tar.gz';
const tmpExtract = '/tmp/bsql3-extract';
execSync(`curl -sL -o ${tmpTar} "${url}" && rm -rf ${tmpExtract} && mkdir -p ${tmpExtract} && tar -xzf ${tmpTar} -C ${tmpExtract}`, { stdio: 'inherit' });

const winNode = path.join(tmpExtract, 'build/Release/better_sqlite3.node');
if (!existsSync(winNode)) {
  console.error('FATAL: Windows .node file not found after extraction');
  process.exit(1);
}

const targets = [
  'desktop/release/win-unpacked/resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'desktop/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'server/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'desktop/node_modules/better-sqlite3/build/Release/obj.target/better_sqlite3.node',
  'server/node_modules/better-sqlite3/build/Release/obj.target/better_sqlite3.node',
];

for (const t of targets) {
  const abs = path.join(root, t);
  if (existsSync(abs)) {
    cpSync(winNode, abs);
    console.log(`✓ Replaced: ${t}`);
  }
}

console.log('\n✅ All better_sqlite3.node files replaced with Windows PE32+ binary');
console.log('Now run: bash scripts/build-installer.sh');
