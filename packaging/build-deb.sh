#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${VERSION:-$(node -p "require('$ROOT/package.json').version")}
ARCH=${ARCH:-amd64}
DIST=${DIST:-$ROOT/dist}
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$DIST"
OUT_DEB="$DIST/x-desktop_${VERSION}_${ARCH}.deb"
rm -f "$OUT_DEB"

echo "==> Building X Desktop Debian/Ubuntu package (${VERSION}_${ARCH})..."

if [[ ! -x "$ROOT/node_modules/electron/dist/electron" ]]; then
  (cd "$ROOT" && npm install --no-audit --no-fund && node node_modules/electron/install.js)
fi
(cd "$ROOT" && python3 tools/make-icons.py)

make -C "$ROOT" DESTDIR="$STAGE/root" PREFIX=/usr install

install -Dm644 "$ROOT/README.md" "$STAGE/root/usr/share/doc/x-desktop/README.md"
install -Dm644 "$ROOT/data/niri-rules.kdl" "$STAGE/root/usr/share/doc/x-desktop/niri-rules.kdl"
install -Dm644 "$ROOT/data/hyprland-rules.conf" "$STAGE/root/usr/share/doc/x-desktop/hyprland-rules.conf"

mkdir -p "$STAGE/root/DEBIAN"
INSTALLED_SIZE=$(du -sk "$STAGE/root" | awk '{print $1}')

cat > "$STAGE/root/DEBIAN/control" <<CONTROL
Package: x-desktop
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Maintainer: Omar <omar@local>
Homepage: https://github.com/x-desktop/x-desktop
Installed-Size: $INSTALLED_SIZE
Depends: libasound2 (>= 1.0.16) | libasound2t64, libatk-bridge2.0-0, libatk1.0-0, libc6 (>= 2.31), libcairo2, libcups2, libdbus-1-3, libdrm2, libexpat1, libgbm1, libglib2.0-0, libgtk-3-0, libnspr4, libnss3, libpango-1.0-0, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxrandr2
Description: Standalone X/Twitter Desktop Client with Wayland & Niri integration, Video PiP, and MPRIS controls
CONTROL

cat > "$STAGE/root/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e
if [ -x /usr/bin/gtk-update-icon-cache ]; then
  gtk-update-icon-cache -qtf /usr/share/icons/hicolor || true
fi
if [ -x /usr/bin/update-desktop-database ]; then
  update-desktop-database -q /usr/share/applications || true
fi
POSTINST

cat > "$STAGE/root/DEBIAN/postrm" <<'POSTRM'
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
  if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache -qtf /usr/share/icons/hicolor || true
  fi
  if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database -q /usr/share/applications || true
  fi
fi
POSTRM

chmod 755 "$STAGE/root/DEBIAN/postinst" "$STAGE/root/DEBIAN/postrm"

if command -v dpkg-deb >/dev/null 2>&1; then
  dpkg-deb --build --root-owner-group "$STAGE/root" "$OUT_DEB" >/dev/null
else
  (cd "$STAGE/root/DEBIAN" && tar --owner=0 --group=0 -czf "$STAGE/control.tar.gz" control postinst postrm)
  (cd "$STAGE/root" && tar --owner=0 --group=0 --exclude="./DEBIAN" -czf "$STAGE/data.tar.gz" .)
  echo "2.0" > "$STAGE/debian-binary"
  ar r "$OUT_DEB" "$STAGE/debian-binary" "$STAGE/control.tar.gz" "$STAGE/data.tar.gz" 2>/dev/null
fi

echo "✅ Created Debian/Ubuntu package: $OUT_DEB"

