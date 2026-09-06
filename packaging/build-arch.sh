#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${VERSION:-$(node -p "require('$ROOT/package.json').version")}
DIST=${DIST:-$ROOT/dist}
BUILD=$(mktemp -d)
trap 'python3 -c "import shutil, sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" "$BUILD"' EXIT

mkdir -p "$DIST"
echo "==> Building X Desktop Arch Linux package (${VERSION})..."

cp "$ROOT/packaging/PKGBUILD" "$BUILD/PKGBUILD"
sed -i "s/^pkgver=.*/pkgver=$VERSION/" "$BUILD/PKGBUILD"

export SRCDEST="$ROOT"
export PKGDEST="$DIST"
(cd "$BUILD" && makepkg -f --nodeps --noconfirm)

echo "✅ Created Arch Linux package in $DIST/"

