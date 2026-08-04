@echo off
chcp 65001 >nul 2>&1
title Danish Cattle Feed Software
color 0B

echo.
echo ============================================================
echo    DANISH CATTLE FEED SOFTWARE
echo ============================================================
echo.
echo  Select run mode:
echo.
echo    [1] Dev Mode       - Server + Client with hot reload
echo                          (Best for development/debugging)
echo.
echo    [2] Production     - Built Server + Client
echo                          (Fast, optimized, no hot reload)
echo.
echo    [3] Desktop (Dev)  - Electron window + dev server
echo                          (Desktop app with live reload)
echo.
echo    [4] Desktop (Prod) - Full Electron desktop app
echo                          (Production build + Electron)
echo.
echo    [0] Exit
echo.
set /p MODE="  Enter choice (0-4): "

if "%MODE%"=="0" exit /b 0
if "%MODE%"=="1" goto dev_mode
if "%MODE%"=="2" goto prod_mode
if "%MODE%"=="3" goto desktop_dev
if "%MODE%"=="4" goto desktop_prod

echo.
echo  Invalid choice. Please enter 0-4.
pause
exit /b 1

REM ============================================================
REM  MODE 1: Dev Mode (concurrently server + client)
REM ============================================================
:dev_mode
echo.
echo ------------------------------------------------------------
echo  Starting in DEV MODE...
echo  Server: http://localhost:3001
echo  Client: http://localhost:5173
echo  Press Ctrl+C to stop both.
echo ------------------------------------------------------------
echo.

REM Check if node_modules exist
if not exist node_modules (
    echo  WARNING: Dependencies not installed!
    echo  Please run install.bat first.
    echo.
    pause
    exit /b 1
)

call npx concurrently -n server,client -c blue,green "npm run dev --workspace server" "npm run dev --workspace client"
goto end

REM ============================================================
REM  MODE 2: Production Mode (built server + client)
REM ============================================================
:prod_mode
echo.
echo ------------------------------------------------------------
echo  Starting in PRODUCTION MODE...
echo ------------------------------------------------------------
echo.

REM Check if builds exist
if not exist server\dist (
    echo  Server not built. Building now...
    cd server
    call npx tsc
    if %errorlevel% neq 0 (
        echo  ERROR: Server build failed!
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

if not exist client\dist (
    echo  Client not built. Building now...
    cd client
    call npx vite build
    if %errorlevel% neq 0 (
        echo  ERROR: Client build failed!
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo  Starting server...
echo  Server: http://localhost:3001
echo  Press Ctrl+C to stop.
echo.

cd server
call node dist\index.js
cd ..
goto end

REM ============================================================
REM  MODE 3: Desktop Dev (Electron + dev server)
REM ============================================================
:desktop_dev
echo.
echo ------------------------------------------------------------
echo  Starting DESKTOP DEV MODE...
echo  Electron will open with dev server.
echo  Press Ctrl+C to stop.
echo ------------------------------------------------------------
echo.

if not exist desktop\node_modules (
    echo  Desktop dependencies not installed!
    echo  Please run install.bat first.
    echo.
    pause
    exit /b 1
)

REM Start server in background, then launch Electron
echo  Starting backend server...
start "DCF-Server" /min cmd /c "cd server && npx tsx watch src\index.ts"

REM Wait a moment for server to start
echo  Waiting for server to be ready...
timeout /t 3 /nobreak >nul

echo  Launching Electron...
cd desktop
call npx electron .
cd ..

REM When Electron closes, also kill the server
echo  Shutting down server...
taskkill /fi "WINDOWTITLE eq DCF-Server*" /f >nul 2>&1
goto end

REM ============================================================
REM  MODE 4: Desktop Production (full build + Electron)
REM ============================================================
:desktop_prod
echo.
echo ------------------------------------------------------------
echo  Starting DESKTOP PRODUCTION MODE...
echo  Building everything and launching Electron.
echo ------------------------------------------------------------
echo.

REM Build all workspaces
echo  Building server...
cd server
call npx tsc
if %errorlevel% neq 0 (
    echo  ERROR: Server build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo  Building client...
cd client
call npx vite build
if %errorlevel% neq 0 (
    echo  ERROR: Client build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo  Preparing desktop payload...
node scripts\prepare-desktop.mjs
if %errorlevel% neq 0 (
    echo  ERROR: Desktop payload preparation failed!
    pause
    exit /b 1
)

echo.
echo  Launching Electron desktop app...
echo  Press Ctrl+C or close the window to stop.
echo.

cd desktop
call npx electron .
cd ..
goto end

:end
echo.
echo  Danish Cattle Feed Software stopped.
