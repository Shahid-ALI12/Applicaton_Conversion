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
#   2. Extracts all files there
#   3. Runs install-and-run.bat (creates desktop + start menu shortcuts)
#   4. Launches the app
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
