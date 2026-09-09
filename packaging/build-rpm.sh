#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${VERSION:-$(node -p "require('$ROOT/package.json').version")}
DIST=${DIST:-$ROOT/dist}
BUILD=$(mktemp -d)
trap 'python3 -c "import shutil, sys; shutil.rmtree(sys.argv[1], ignore_errors=True)" "$BUILD"' EXIT

mkdir -p "$DIST"
rm -f "$DIST"/x-desktop-"$VERSION"-*.rpm

echo "==> Building X Desktop RPM package for Fedora / RHEL..."

if [[ ! -x "$ROOT/node_modules/electron/dist/electron" ]]; then
  (cd "$ROOT" && npm install --no-audit --no-fund && node node_modules/electron/install.js)
fi
(cd "$ROOT" && python3 tools/make-icons.py)

if command -v rpmbuild >/dev/null 2>&1; then
  SOURCE_TREE="$BUILD/x-desktop-$VERSION"
  mkdir -p "$SOURCE_TREE"
  cp -a "$ROOT/package.json" "$ROOT/Makefile" "$ROOT/README.md" "$ROOT/src" "$ROOT/data" "$ROOT/tools" "$SOURCE_TREE/"
  if [[ -d "$ROOT/node_modules" ]]; then
    cp -a "$ROOT/node_modules" "$SOURCE_TREE/"
  fi

  TARBALL="$BUILD/x-desktop-$VERSION.tar.gz"
  tar -C "$BUILD" -czf "$TARBALL" "x-desktop-$VERSION"

  mkdir -p "$BUILD/rpmbuild"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
  cp "$TARBALL" "$BUILD/rpmbuild/SOURCES/"
  cp "$ROOT/packaging/x-desktop.spec" "$BUILD/rpmbuild/SPECS/"

  rpmbuild -bb \
    --define "_topdir $BUILD/rpmbuild" \
    --define "version $VERSION" \
    --define "_build_id_links none" \
    "$BUILD/rpmbuild/SPECS/x-desktop.spec"

  shopt -s nullglob
  for rpm in "$BUILD"/rpmbuild/RPMS/*/*.rpm; do
    cp -v "$rpm" "$DIST/"
  done
  echo "✅ Created Fedora/RPM package in $DIST/"
else
  STAGE="$BUILD/stage"
  mkdir -p "$STAGE"
  make -C "$ROOT" DESTDIR="$STAGE" PREFIX=/usr install
  TAR_OUT="$DIST/x-desktop-${VERSION}-fedora-x86_64.tar.gz"
  tar -C "$STAGE" -czf "$TAR_OUT" usr
  echo "✅ Created staged package: $TAR_OUT"
fi
