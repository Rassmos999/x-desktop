# x-desktop -- Standalone X/Twitter Desktop Client for Linux
#
# Staged self-contained tree:
# places app in resources/app, installs hicolor theme icons, .desktop file,
# and creates launcher in ~/.local/bin.

PREFIX    ?= $(HOME)/.local
DESTDIR   ?=
VERSION   ?= $(shell node -p "require('./package.json').version")

APP_ID    = x-desktop
BIN       = x-desktop

bindir       = $(PREFIX)/bin
libdir       = $(PREFIX)/lib/$(BIN)
appdir       = $(PREFIX)/share/applications
icontheme    = $(PREFIX)/share/icons/hicolor
pixmapdir    = $(PREFIX)/share/pixmaps

ELECTRON   = node_modules/electron/dist
ICON_SIZES = 16 22 24 32 48 64 128 256 512

# Prune unused Chromium locales to save disk space, keep en-US and ar
LOCALES = en-US ar

all: $(ELECTRON)/electron icons
	@echo "X Desktop ready. Run 'make install' or 'npm start'."

$(ELECTRON)/electron:
	npm install --no-audit --no-fund
	node node_modules/electron/install.js

# App runtime assets
APP_FILES = package.json src data

icons:
	@python3 tools/make-icons.py

install: $(ELECTRON)/electron icons
	@echo "Installing $(BIN) v$(VERSION) to $(PREFIX)..."
	@install -d $(DESTDIR)$(libdir)
	@cp -a $(ELECTRON)/. $(DESTDIR)$(libdir)/
	@rm -f $(DESTDIR)$(libdir)/electron
	@install -m755 $(ELECTRON)/electron $(DESTDIR)$(libdir)/$(BIN)
	@for f in $(DESTDIR)$(libdir)/locales/*.pak; do \
	  keep=""; for l in $(LOCALES); do [ "$$(basename $$f .pak)" = "$$l" ] && keep=1; done; \
	  [ -n "$$keep" ] || rm -f "$$f"; \
	done
	@install -d $(DESTDIR)$(libdir)/resources/app
	@cp -a $(APP_FILES) $(DESTDIR)$(libdir)/resources/app/
	@if [ -d node_modules ]; then \
	  cp -a node_modules $(DESTDIR)$(libdir)/resources/app/ && \
	  rm -rf $(DESTDIR)$(libdir)/resources/app/node_modules/electron $(DESTDIR)$(libdir)/resources/app/node_modules/.bin/electron; \
	fi
	@install -d $(DESTDIR)$(bindir)
	@printf '#!/bin/sh\nexec "%s/%s" --no-sandbox --ozone-platform-hint=auto --enable-features=WaylandWindowDecorations,VaapiVideoDecoder,CanvasOopRasterization,ZeroCopy "$$@"\n' "$(libdir)" "$(BIN)" > $(DESTDIR)$(bindir)/$(BIN)
	@chmod 755 $(DESTDIR)$(bindir)/$(BIN)
	@install -d $(DESTDIR)$(appdir)
	@install -m644 data/$(APP_ID).desktop $(DESTDIR)$(appdir)/$(APP_ID).desktop
	@install -d $(DESTDIR)$(pixmapdir)
	@install -m644 data/x-desktop.png $(DESTDIR)$(pixmapdir)/x-desktop.png
	@install -m644 data/x-desktop.png $(DESTDIR)$(pixmapdir)/x.png
	@install -d $(DESTDIR)$(icontheme)/scalable/apps
	@install -m644 data/icons/hicolor/scalable/apps/x-desktop.svg $(DESTDIR)$(icontheme)/scalable/apps/x-desktop.svg
	@install -m644 data/icons/hicolor/scalable/apps/x.svg $(DESTDIR)$(icontheme)/scalable/apps/x.svg
	@for s in $(ICON_SIZES); do \
	  install -d $(DESTDIR)$(icontheme)/$$s"x"$$s/apps; \
	  if [ -f data/icons/hicolor/$$s"x"$$s/apps/$(APP_ID).png ]; then \
	    install -m644 data/icons/hicolor/$$s"x"$$s/apps/$(APP_ID).png $(DESTDIR)$(icontheme)/$$s"x"$$s/apps/$(APP_ID).png; \
	    install -m644 data/icons/hicolor/$$s"x"$$s/apps/$(APP_ID).png $(DESTDIR)$(icontheme)/$$s"x"$$s/apps/x.png; \
	  fi; \
	done
	@if [ ! -f $(DESTDIR)$(icontheme)/index.theme ]; then \
	  cp /usr/share/icons/hicolor/index.theme $(DESTDIR)$(icontheme)/index.theme; \
	fi
	@-update-desktop-database $(DESTDIR)$(appdir) 2>/dev/null || true
	@-gtk-update-icon-cache -f -t $(DESTDIR)$(icontheme) 2>/dev/null || true
	@echo "Installation complete! Run with: $(BIN)"

uninstall:
	@echo "Uninstalling $(BIN)..."
	@rm -rf $(DESTDIR)$(libdir)
	@rm -f $(DESTDIR)$(bindir)/$(BIN) $(DESTDIR)$(appdir)/$(APP_ID).desktop
	@rm -f $(DESTDIR)$(pixmapdir)/x-desktop.png $(DESTDIR)$(pixmapdir)/x.png
	@rm -f $(DESTDIR)$(icontheme)/scalable/apps/x-desktop.svg $(DESTDIR)$(icontheme)/scalable/apps/x.svg
	@for s in $(ICON_SIZES); do \
	  rm -f $(DESTDIR)$(icontheme)/$$s"x"$$s/apps/$(APP_ID).png $(DESTDIR)$(icontheme)/$$s"x"$$s/apps/x.png; \
	done
	@-update-desktop-database $(DESTDIR)$(appdir) 2>/dev/null || true
	@-gtk-update-icon-cache -f -t $(DESTDIR)$(icontheme) 2>/dev/null || true
	@echo "Uninstallation complete."

package-arch:
	packaging/build-arch.sh

package-deb:
	packaging/build-deb.sh

package-rpm:
	packaging/build-rpm.sh

package: package-deb package-rpm package-arch
	@echo "All packages generated in dist/:"
	@ls -lh dist/

run:
	npm start

clean:
	python3 -c "import shutil, os; [shutil.rmtree(p, ignore_errors=True) for p in ['node_modules', 'dist', 'data/icons/hicolor']]"

.PHONY: all icons install uninstall run clean package package-arch package-deb package-rpm

