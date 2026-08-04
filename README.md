# Danish Cattle Feed Software

Desktop application for daily register management of a cattle feed shop.

## Architecture
- **Server**: Express 5 + TypeScript + SQLite (offline)
- **Client**: React 18 + Vite
- **Desktop**: Electron 33 + NSIS installer
- **Licensing**: Ed25519 offline activation

## Quick Start (Development)
```bash
npm install
npm run dev
```

## Build Desktop Installer
```bash
npm run desktop:dist
```

## License Management
See `tools/license-keygen/README.md` for seller guide.

## Default Login
- Username: `admin`
- Password: `admin123`
- ⚠️ Change immediately after first login!
