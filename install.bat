@echo off
chcp 65001 >nul 2>&1
title Danish Cattle Feed Software - Dependencies Installer
color 0A

echo.
echo ============================================================
echo    DANISH CATTLE FEED SOFTWARE - Dependency Installer
echo ============================================================
echo.

REM -------------------------------------------------------
REM  Step 0: Check Node.js
REM -------------------------------------------------------
echo [Step 0/6] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Node.js is NOT installed!
    echo  Please download and install Node.js v20+ from:
    echo    https://nodejs.org/
    echo.
    echo  After installing Node.js, restart your computer
    echo  and run this file again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo   Found Node.js %NODE_VER%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: npm is NOT found!
    echo  Node.js seems incomplete. Please reinstall Node.js.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo   Found npm %NPM_VER%
echo   [OK] Node.js and npm are available.
echo.

REM -------------------------------------------------------
REM  Step 1: Root workspace install (server + client)
REM -------------------------------------------------------
echo [Step 1/6] Installing root workspace dependencies (server + client)...
echo   This may take a few minutes on first run...
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Root npm install failed!
    echo  Try deleting node_modules and package-lock.json, then re-run.
    echo.
    pause
    exit /b 1
)
echo   [OK] Root dependencies installed.
echo.

REM -------------------------------------------------------
REM  Step 2: Desktop (Electron) install
REM -------------------------------------------------------
echo [Step 2/6] Installing desktop (Electron) dependencies...
cd desktop
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Desktop npm install failed!
    echo.
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Desktop dependencies installed.
echo.

REM -------------------------------------------------------
REM  Step 3: License keygen tool install
REM -------------------------------------------------------
echo [Step 3/6] Installing license keygen tool dependencies...
cd tools\license-keygen
if exist package.json (
    call npm install
    if %errorlevel% neq 0 (
        echo   [WARN] Keygen tool install failed - non-critical, skipping.
    ) else (
        echo   [OK] Keygen tool dependencies installed.
    )
) else (
    echo   [SKIP] No package.json found in keygen tool.
)
cd ..\..
echo.

REM -------------------------------------------------------
REM  Step 4: Build server (TypeScript compile)
REM -------------------------------------------------------
echo [Step 4/6] Building server (TypeScript compilation)...
cd server
call npx tsc
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Server build failed!
    echo  Check TypeScript errors above.
    echo.
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Server built successfully.
echo.

REM -------------------------------------------------------
REM  Step 5: Build client (Vite production build)
REM -------------------------------------------------------
echo [Step 5/6] Building client (Vite production build)...
cd client
call npx vite build
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Client build failed!
    echo  Check the errors above.
    echo.
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Client built successfully.
echo.

REM -------------------------------------------------------
REM  Step 6: Prepare desktop payload
REM -------------------------------------------------------
echo [Step 6/6] Preparing desktop payload...
node scripts\prepare-desktop.mjs
if %errorlevel% neq 0 (
    color 0E
    echo   [WARN] Desktop payload preparation failed.
    echo   You can still run the app in dev mode.
    echo   Run 'run.bat' and choose Dev Mode.
) else (
    echo   [OK] Desktop payload ready.
)
echo.

REM -------------------------------------------------------
REM  Done!
REM -------------------------------------------------------
color 0A
echo ============================================================
echo    ALL DEPENDENCIES INSTALLED SUCCESSFULLY!
echo ============================================================
echo.
echo  Next steps:
echo    1. Double-click  run.bat  to start the software
echo    2. Choose your mode:
echo       [1] Dev Mode     - Server + Client (hot reload)
echo       [2] Production   - Built Server + Client
echo       [3] Desktop      - Electron app
echo.
pause
