#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${VERSION:-$(node -p "require('$ROOT/package.json').version")}
ARCH=${ARCH:-x64}
ELECTRON_VER=${ELECTRON_VER:-41.10.7}
DIST=${DIST:-$ROOT/dist}
CACHE_DIR=${CACHE_DIR:-$HOME/.cache/x-desktop-prebuilt}
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$DIST" "$CACHE_DIR"
ZIP_NAME="electron-v${ELECTRON_VER}-win32-${ARCH}.zip"
ZIP_FILE="$CACHE_DIR/$ZIP_NAME"

echo "==> Building X Desktop for Windows (win32-$ARCH v$VERSION)..."

# Ensure icons are generated
python3 "$ROOT/tools/make-icons.py"

# Download Electron for Windows if missing
if [[ ! -f "$ZIP_FILE" ]] || [[ $(stat -c %s "$ZIP_FILE") -lt 100000000 ]]; then
  echo "==> Fetching Electron Windows binary (v$ELECTRON_VER)..."
  curl -L -C - --retry 5 -o "$ZIP_FILE" "https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/$ZIP_NAME"
fi

echo "==> Extracting Windows Electron shell..."
mkdir -p "$STAGE/x-desktop-win32-x64"
unzip -q -o "$ZIP_FILE" -d "$STAGE/x-desktop-win32-x64"

# Rename executable to x-desktop.exe
mv "$STAGE/x-desktop-win32-x64/electron.exe" "$STAGE/x-desktop-win32-x64/x-desktop.exe"

# Prepare resources/app
echo "==> Staging application assets..."
APP_DEST="$STAGE/x-desktop-win32-x64/resources/app"
mkdir -p "$APP_DEST"

cp "$ROOT/package.json" "$APP_DEST/"
cp -r "$ROOT/src" "$APP_DEST/"
cp -r "$ROOT/data" "$APP_DEST/"

# Copy production node_modules excluding electron
if [[ -d "$ROOT/node_modules" ]]; then
  cp -r "$ROOT/node_modules" "$APP_DEST/"
  rm -rf "$APP_DEST/node_modules/electron" "$APP_DEST/node_modules/.bin/electron"
fi

# Create a clean Windows launcher
cat > "$STAGE/x-desktop-win32-x64/x-desktop.bat" <<'BAT'
@echo off
start "" "%~dp0x-desktop.exe" %*
BAT

# Create a Desktop Shortcut Installer script for Windows users
cat > "$STAGE/x-desktop-win32-x64/install-shortcut.bat" <<'BAT'
@echo off
setlocal
echo Creating shortcut for X Desktop on your Desktop...
set "TARGET=%~dp0x-desktop.exe"
set "ICON=%~dp0resources\app\data\x-desktop.ico"
set "SHORTCUT=%USERPROFILE%\Desktop\X Desktop.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.IconLocation = '%ICON%'; $s.Save()"
echo Shortcut created successfully on Desktop!
pause
BAT

# Create README for Windows users
cat > "$STAGE/x-desktop-win32-x64/README.txt" <<EOF
X Desktop Client for Windows (x64) v${VERSION}
============================================

How to run:
- Double-click "x-desktop.exe" to launch the client.
- Optional: Run "install-shortcut.bat" to add X Desktop to your Windows Desktop.

Features:
- Standalone isolated session (no interference with Chrome/Edge/Brave)
- Google Login Bridge: Seamlessly authenticate in your default browser and sync session
- Ad & Boosted tweet filter
- Instant inline Arabic translation
- PiP floating video window
- Media download to ~/Downloads

How to Sign In with Google:
1. Click "Sign in with Google" or right-click anywhere and select "Login Assistant".
2. Your default browser will open to authenticate securely with Google.
3. Paste the auth_token or click Apply to instantly connect your account permanently.

Built with Electron.
EOF

# Package into ZIP in dist/
OUT_ZIP="$DIST/x-desktop-${VERSION}-win32-${ARCH}.zip"
rm -f "$OUT_ZIP"
echo "==> Creating portable distribution archive: $OUT_ZIP"
(cd "$STAGE" && zip -r -q "$OUT_ZIP" x-desktop-win32-x64)
echo "✅ Windows package ready: $OUT_ZIP"
