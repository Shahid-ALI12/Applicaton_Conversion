#!/usr/bin/env bash
# build-installer.sh — Build the Danish Cattle Feed Software Windows installer
#
# This script creates a self-extracting Windows installer (.exe) from the
# already-built desktop/release/win-unpacked/ directory.
#
# The installer uses 7-Zip's SFX (self-extracting archive) technology:
#   [7z.sfx module] + [config.txt] + [payload.7z] = installer.exe
#
# When run on Windows, the installer:
#   1. Prompts the user for an installation folder
#   2. Extracts all files there (including uninstall.bat)
#   3. Runs install-and-run.bat (creates desktop + start menu shortcuts)
#   4. Launches the app
#
# To uninstall later: open the install folder and double-click uninstall.bat
#
# Requirements:
#   - desktop/release/win-unpacked/ must already be built (via `npm run dist`)
#   - 7za binary (bundled in node_modules/7zip-bin/linux/x64/7za)
#   - 7z.sfx module (downloaded once, cached in /home/z/7z-sfx/)

set -euo pipefail

# Paths
ROOT="/home/z/my-project/analysis/Applicaton_Conversion"
DESKTOP="$ROOT/desktop"
WIN_UNPACKED="$DESKTOP/release/win-unpacked"
SEVENZA="$DESKTOP/node_modules/7zip-bin/linux/x64/7za"
SFX_DIR="/home/z/7z-sfx"
SFX_MODULE="$SFX_DIR/7z.sfx"
BUILD_DIR="/home/z/installer-build"
OUTPUT_NAME="Danish Cattle Feed Software - Installer.exe"
OUTPUT_PATH="/home/z/my-project/download/$OUTPUT_NAME"

# Verify prerequisites
if [ ! -d "$WIN_UNPACKED" ]; then
  echo "ERROR: $WIN_UNPACKED not found."
  echo "Run 'cd $DESKTOP && npm run dist' first to build the unpacked app."
  exit 1
fi
if [ ! -x "$SEVENZA" ]; then
  echo "ERROR: 7za not found at $SEVENZA"
  exit 1
fi
if [ ! -f "$SFX_MODULE" ]; then
  echo "ERROR: SFX module not found at $SFX_MODULE"
  echo "Download it first:"
  echo "  mkdir -p $SFX_DIR"
  echo "  cd $SFX_DIR"
  echo "  curl -sL -o 7z2409.exe 'https://downloads.sourceforge.net/project/sevenzip/7-Zip/24.09/7z2409-x64.exe'"
  echo "  $SEVENZA e 7z2409.exe 7z.sfx -y"
  exit 1
fi

echo "=== Building Danish Cattle Feed Software Installer ==="
echo ""

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# 1. Copy win-unpacked to staging
echo "[1/5] Copying application files..."
cp -r "$WIN_UNPACKED" ./DanishCattleFeed

# 2. Create the install-and-run.bat (creates shortcuts + launches app)
echo "[2/5] Creating install-and-run.bat..."
cat > DanishCattleFeed/install-and-run.bat <<'BATCH_EOF'
@echo off
:: Installation finalizer — creates desktop shortcut and launches app
:: This runs once after the SFX extracts files to the install folder

set "APPDIR=%~dp0"
set "APPEXE=%APPDIR%Danish Cattle Feed Software.exe"
set "SHORTCUT=%USERPROFILE%\Desktop\Danish Cattle Feed Software.lnk"

:: === Fresh install: wipe old database so test/old data doesn't leak in ===
:: License file (license.json) is PRESERVED so user doesn't need to re-activate.
:: Only the SQLite DB files are deleted; app will recreate a fresh DB on launch.
set "APPDATA_DIR=%APPDATA%\Danish Cattle Feed Software"
set "DATA_DIR=%APPDATA_DIR%\data"

if exist "%DATA_DIR%\danishcattlefeed.db" (
    echo [Fresh Install] Purging old database...
    del /F /Q "%DATA_DIR%\danishcattlefeed.db" 2>NUL
    del /F /Q "%DATA_DIR%\danishcattlefeed.db-wal" 2>NUL
    del /F /Q "%DATA_DIR%\danishcattlefeed.db-shm" 2>NUL
    del /F /Q "%DATA_DIR%\*.db" 2>NUL
    del /F /Q "%DATA_DIR%\*.db-wal" 2>NUL
    del /F /Q "%DATA_DIR%\*.db-shm" 2>NUL
    echo [Fresh Install] Database cleared. App will start with empty data.
)

:: Also clear old backups (they reference the old DB)
if exist "%APPDATA_DIR%\backups" (
    rmdir /S /Q "%APPDATA_DIR%\backups" 2>NUL
)

:: NOTE: license.json is intentionally NOT deleted — preserves activation.

:: Create desktop shortcut via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%SHORTCUT%'); " ^
  "$s.TargetPath = '%APPEXE%'; " ^
  "$s.WorkingDirectory = '%APPDIR%'; " ^
  "$s.Description = 'Danish Cattle Feed Software'; " ^
  "$s.IconLocation = '%APPEXE%,0'; " ^
  "$s.Save()"

:: Also create Start Menu shortcut
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Danish Cattle Feed Software.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%STARTMENU%'); " ^
  "$s.TargetPath = '%APPEXE%'; " ^
  "$s.WorkingDirectory = '%APPDIR%'; " ^
  "$s.Description = 'Danish Cattle Feed Software'; " ^
  "$s.IconLocation = '%APPEXE%,0'; " ^
  "$s.Save()"

:: Launch the app
start "" "%APPEXE%"

exit /b 0
BATCH_EOF

# 2b. Create uninstall.bat (placed in the install folder for easy removal)
echo "[2b/5] Creating uninstall.bat..."
cat > DanishCattleFeed/uninstall.bat <<'UNINSTALL_EOF'
@echo off
:: Danish Cattle Feed Software - Uninstaller
:: Place this file in the install folder. Double-click to uninstall.

title Danish Cattle Feed Software - Uninstaller
color 0E
chcp 65001 >NUL 2>&1

echo ============================================
echo   Danish Cattle Feed Software - Uninstaller
echo ============================================
echo.

set "APPDIR=%~dp0"
:: remove trailing backslash
set "APPDIR=%APPDIR:~0,-1%"

:: --- Close running app ---
tasklist /FI "IMAGENAME eq Danish Cattle Feed Software.exe" 2>NUL | find /I "Danish Cattle Feed Software.exe" >NUL
if %ERRORLEVEL% equ 0 (
    echo [!] Application is running. Closing it...
    taskkill /F /IM "Danish Cattle Feed Software.exe" >NUL 2>&1
    timeout /t 2 /nobreak >NUL
)

:: --- Confirm uninstall ---
echo.
choice /C YN /M "Are you sure you want to uninstall Danish Cattle Feed Software"
if errorlevel 2 (
    echo.
    echo Uninstall cancelled.
    timeout /t 3 /nobreak >NUL
    exit /b 0
)

:: --- Ask about data removal ---
echo.
echo Choose data removal option:
echo   [1] Remove everything (program files + database + backups + logs)
echo   [2] Keep app data (only remove program files, keep database)
echo.
choice /C 12 /M "Select option"
set "REMOVE_DATA=%ERRORLEVEL%"

echo.
echo --------------------------------------------
echo [1/4] Removing desktop shortcut...
set "SHORTCUT=%USERPROFILE%\Desktop\Danish Cattle Feed Software.lnk"
if exist "%SHORTCUT%" (
    del /F /Q "%SHORTCUT%"
    echo       Done.
) else (
    echo       Not found - skipped.
)

echo [2/4] Removing Start Menu shortcut...
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Danish Cattle Feed Software.lnk"
if exist "%STARTMENU%" (
    del /F /Q "%STARTMENU%"
    echo       Done.
) else (
    echo       Not found - skipped.
)

echo [3/4] App data folder...
set "APPDATA_DIR=%APPDATA%\Danish Cattle Feed Software"
if "%REMOVE_DATA%"=="1" (
    if exist "%APPDATA_DIR%" (
        rmdir /S /Q "%APPDATA_DIR%"
        echo       Removed - all data deleted.
    ) else (
        echo       Not found - skipped.
    )
) else (
    if exist "%APPDATA_DIR%" (
        echo       KEPT at: %APPDATA_DIR%
    ) else (
        echo       Nothing to keep.
    )
)

echo [4/4] Removing installation folder...
echo       Will complete after this window closes.
echo.

:: --- Self-deletion trick: copy to temp, run from there to delete parent ---
set "SELF=%~f0"
set "TEMPBAT=%TEMP%\dcf_uninstall_%RANDOM%.bat"

(
    echo @echo off
    echo timeout /t 3 /nobreak ^>NUL
    echo del /F /Q "%SELF%" 2^>NUL
    echo rmdir /S /Q "%APPDIR%" 2^>NUL
    echo del /F /Q "%TEMPBAT%" 2^>NUL
) > "%TEMPBAT%"

echo --------------------------------------------
echo   Uninstall Complete!
echo --------------------------------------------
echo.
echo The installation folder will be removed shortly.
echo This window will close automatically.
echo.

start /min "" "%TEMPBAT%"
exit /b 0
UNINSTALL_EOF

# 3. Create the SFX config
echo "[3/5] Creating SFX config..."
cat > "$SFX_DIR/config.txt" <<'CONFIG_EOF'
;!@Install@!UTF-8!
Title="Danish Cattle Feed Software - Installer"
BeginPrompt="Do you want to install Danish Cattle Feed Software?"
ExtractDialogText="Extracting files... please wait"
ExtractTitle="Danish Cattle Feed Software Setup"
CancelPrompt="Do you want to cancel installation?"
OverwriteMode="x"
InstallPath="DanishCattleFeed"
GUIMode="2"
RunProgram="install-and-run.bat"
;!@InstallEnd@!
CONFIG_EOF
# 7z SFX requires config to end with newlines
echo "" >> "$SFX_DIR/config.txt"
echo "" >> "$SFX_DIR/config.txt"

# 4. Compress the payload
echo "[4/5] Compressing payload (this may take a minute)..."
"$SEVENZA" a -t7z -mx=5 -mmt=on payload.7z ./DanishCattleFeed/* >/dev/null

# 5. Concatenate SFX + config + payload
echo "[5/5] Building installer.exe..."
cat "$SFX_MODULE" "$SFX_DIR/config.txt" payload.7z > "$OUTPUT_NAME"

# Move to download folder
mv "$OUTPUT_NAME" "$OUTPUT_PATH"

echo ""
echo "=== Build complete ==="
echo "Installer: $OUTPUT_PATH"
echo "Size: $(ls -lh "$OUTPUT_PATH" | awk '{print $5}')"
echo ""
echo "To verify: file '$OUTPUT_PATH'"
echo "To inspect contents: $SEVENZA l '$OUTPUT_PATH'"
