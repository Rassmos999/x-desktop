
const { app, BrowserWindow, shell, ipcMain, session, Menu, MenuItem, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initMpris, updateMprisState } = require('./mpris');
const { aiEngine } = require('./ai-engine');
const { startWebUiServer, WEB_UI_PORT } = require('./web-ui');

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  try {
    const pkg = require('../package.json');
    console.log(`X Desktop v${pkg.version}`);
  } catch (e) {
    console.log('X Desktop v1.0.0');
  }
  process.exit(0);
}

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

// Prevent transient D-Bus / socket disconnect notices from interrupting the app
process.on('uncaughtException', (err) => {
  if (err && (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.message?.includes('EPIPE') || err.message?.includes('stream is closed'))) {
    return;
  }
  console.error('[X Desktop] Uncaught exception:', err);
});

// Application identity
app.setName('x-desktop');
app.setAppUserModelId('x-desktop');

// Strictly isolate user session and cookies in ~/.config/x-desktop
const userDataPath = path.join(app.getPath('appData'), 'x-desktop');
app.setPath('userData', userDataPath);

if (process.platform === 'linux') {
  // Sandbox compatibility on Linux user namespaces
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  // Hardware acceleration & clean Wayland flags
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
  app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox,Vulkan');
}
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[X Desktop] Another instance is already running. Forwarding focus.');
  app.quit();
}

let mainWindow = null;
let tray = null;

// Translation IPC Handlers via local AI Engine
ipcMain.handle('translate-text', async (event, arg) => {
  const text = typeof arg === 'object' ? arg.text : arg;
  const mode = typeof arg === 'object' ? (arg.mode || 'auto') : 'auto';
  return await aiEngine.translate(text, mode);
});

ipcMain.handle('translate-image', async (event, { imageBase64, mimeType }) => {
  return await aiEngine.translateImage(imageBase64, mimeType);
});

ipcMain.handle('get-ai-status', () => {
  return {
    isReady: aiEngine.isReady,
    hasModel: aiEngine.hasModel(),
    hasVision: aiEngine.hasVision()
  };
});

// Zoom Management
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

function zoomIn() {
  if (!mainWindow) return;
  const current = mainWindow.webContents.getZoomFactor();
  const next = Math.min(MAX_ZOOM, parseFloat((current + ZOOM_STEP).toFixed(2)));
  mainWindow.webContents.setZoomFactor(next);
}

function zoomOut() {
  if (!mainWindow) return;
  const current = mainWindow.webContents.getZoomFactor();
  const next = Math.max(MIN_ZOOM, parseFloat((current - ZOOM_STEP).toFixed(2)));
  mainWindow.webContents.setZoomFactor(next);
}

function zoomReset() {
  if (!mainWindow) return;
  mainWindow.webContents.setZoomFactor(1.0);
}

ipcMain.on('zoom-in', () => zoomIn());
ipcMain.on('zoom-out', () => zoomOut());
ipcMain.on('zoom-reset', () => zoomReset());

// Determine if a URL is strictly internal to X (not an external redirect like t.co)
function isInternalXUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('t.co/')) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host.endsWith('x.com') || host.endsWith('twitter.com');
  } catch (e) {
    return false;
  }
}

function isAuthServiceUrl(url) {
  if (!url) return false;
  return url.includes('accounts.google.com') || url.includes('appleid.apple.com');
}

function parseTargetUrl(argv) {
  for (const arg of argv) {
    if (arg && (arg.startsWith('https://x.com') || arg.startsWith('https://twitter.com'))) {
      return arg;
    }
  }
  return 'https://x.com';
}

function getIconPath(name = 'x-desktop.png') {
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, '..', 'data', 'x-desktop.ico');
    if (fs.existsSync(icoPath)) return icoPath;
  }
  const p = path.join(__dirname, '..', 'data', name);
  return fs.existsSync(p) ? p : undefined;
}

function showAndFocusWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.setAlwaysOnTop(false);
}

// Known Ad & Analytics Tracking Patterns to Block on the Network Level
const AD_TRACKER_PATTERNS = [
  '*://*.ads-api.twitter.com/*',
  '*://*.ads.twitter.com/*',
  '*://*.analytics.twitter.com/*',
  '*://*.analytics.x.com/*',
  '*://*.scribe.twitter.com/*',
  '*://*.adservice.google.com/*',
  '*://*.googleads.g.doubleclick.net/*',
  '*://*.pagead2.googlesyndication.com/*',
  '*://*.doubleclick.net/*',
  '*://ad.doubleclick.net/*'
];

function createWindow(targetUrl = 'https://x.com') {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 800,
    minHeight: 560,
    title: 'X',
    icon: getIconPath(),
    backgroundColor: '#000000',
    show: false,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      spellcheck: true
    }
  });

  const stylePath = path.join(__dirname, "style.css");
  if (fs.existsSync(stylePath)) {
    const css = fs.readFileSync(stylePath, "utf8");
    mainWindow.webContents.on("dom-ready", () => {
      mainWindow.webContents.insertCSS(css);
    });
    mainWindow.webContents.on("did-navigate-in-page", () => {
      mainWindow.webContents.insertCSS(css);
    });
  }

  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    showAndFocusWindow();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      showAndFocusWindow();
    }
  }, 800);

  // Global Keyboard Zoom & Dashboard Handlers
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && input.type === 'keyDown') {
      // Open Web UI Dashboard: Ctrl + Shift + D
      if (input.shift && input.code === 'KeyD') {
        event.preventDefault();
        shell.openExternal(`http://localhost:${WEB_UI_PORT}`);
      }
      // Zoom in with Ctrl + = (or Ctrl + + without needing Shift)
      else if (input.key === '=' || input.key === '+' || input.code === 'Equal' || input.code === 'NumpadAdd') {
        event.preventDefault();
        zoomIn();
      }
      // Zoom out with Ctrl + -
      else if (input.key === '-' || input.key === '_' || input.code === 'Minus' || input.code === 'NumpadSubtract') {
        event.preventDefault();
        zoomOut();
      }
      // Reset zoom with Ctrl + 0
      else if (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') {
        event.preventDefault();
        zoomReset();
      }
    }
  });

  // Intercept all top-level navigations: If external or t.co, open in default browser!
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalXUrl(url) || isAuthServiceUrl(url)) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  // Handle OAuth popups and window.open requests
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthServiceUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          title: 'Sign In',
          backgroundColor: '#ffffff',
          webPreferences: {
            sandbox: false,
            contextIsolation: true
          }
        }
      };
    }

    if (isInternalXUrl(url)) {
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Native mouse back/forward buttons
  mainWindow.webContents.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward' && mainWindow.webContents.canGoBack()) {
      mainWindow.webContents.goBack();
    } else if (cmd === 'browser-forward' && mainWindow.webContents.canGoForward()) {
      mainWindow.webContents.goForward();
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('page-title-updated', (e, title) => {
    if (!title.includes('X') && !title.includes('Twitter')) {
      mainWindow.setTitle(title + ' / X');
    }
  });

  // Native Context Menu (Right Click)
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // AI Dashboard Link
    menu.append(new MenuItem({
      label: '📊 فتح لوحة تحكم الذكاء الاصطناعي (Web UI)',
      accelerator: 'CmdOrCtrl+Shift+D',
      click: () => shell.openExternal(`http://localhost:${WEB_UI_PORT}`)
    }));
    menu.append(new MenuItem({ type: 'separator' }));

    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '🌐 ترجمة النص بالذكاء الاصطناعي',
        click: async () => {
          const translated = await aiEngine.translate(params.selectionText, 'ar');
          mainWindow.webContents.send('show-toast-message', translated);
        }
      }));
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({
        label: `Search X for "${params.selectionText.slice(0, 20)}..."`,
        click: () => {
          mainWindow.loadURL(`https://x.com/search?q=${encodeURIComponent(params.selectionText)}&f=live`);
        }
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open Link in Default Browser',
        click: () => shell.openExternal(params.linkURL)
      }));
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(params.linkURL);
        }
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.hasImageContents && params.srcURL) {
      menu.append(new MenuItem({
        label: 'Save Image to Downloads',
        click: () => {
          mainWindow.webContents.downloadURL(params.srcURL);
        }
      }));
      menu.append(new MenuItem({
        label: 'Copy Image Address',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(params.srcURL);
        }
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }));
      menu.append(new MenuItem({ role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut' }));
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'paste' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Zoom Controls in Context Menu
    menu.append(new MenuItem({
      label: 'Zoom In (Ctrl + =)',
      click: () => zoomIn()
    }));
    menu.append(new MenuItem({
      label: 'Zoom Out (Ctrl + -)',
      click: () => zoomOut()
    }));
    menu.append(new MenuItem({
      label: 'Reset Zoom (Ctrl + 0)',
      click: () => zoomReset()
    }));
    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Back',
      enabled: mainWindow.webContents.canGoBack(),
      click: () => mainWindow.webContents.goBack()
    }));
    menu.append(new MenuItem({
      label: 'Forward',
      enabled: mainWindow.webContents.canGoForward(),
      click: () => mainWindow.webContents.goForward()
    }));
    menu.append(new MenuItem({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => mainWindow.webContents.reload()
    }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Home (X)',
      accelerator: 'CmdOrCtrl+1',
      click: () => mainWindow.loadURL('https://x.com/home')
    }));
    menu.append(new MenuItem({
      label: 'Inspect Element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => mainWindow.webContents.toggleDevTools()
    }));

    menu.popup();
  });

  // Offline / Network Recovery Screen
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Connection Error - X Desktop</title>
        <style>
          body {
            background-color: #000000;
            color: #e2e8f0;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            user-select: none;
          }
          .icon { width: 64px; height: 64px; fill: #ffffff; margin-bottom: 24px; }
          h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
          p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; text-align: center; max-width: 400px; }
          .btn {
            background-color: #1d9bf0;
            color: #ffffff;
            border: none;
            padding: 10px 24px;
            font-size: 14px;
            font-weight: 600;
            border-radius: 9999px;
            cursor: pointer;
            transition: background 0.2s;
          }
          .btn:hover { background-color: #1a8cd8; }
        </style>
      </head>
      <body>
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        <h1>Unable to Connect to X</h1>
        <p>${errorDescription || 'Please verify your network connection.'}</p>
        <button class="btn" onclick="window.location.href='${validatedURL || 'https://x.com'}'">Retry Connection</button>
      </body>
      </html>
    `)}`);
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'data', 'x-tray.png');
  const icon = fs.existsSync(iconPath) ? iconPath : getIconPath();
  tray = new Tray(icon);
  tray.setToolTip('X (Twitter) Desktop');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'X Desktop', enabled: false },
    { type: 'separator' },
    {
      label: 'Open X',
      click: () => showAndFocusWindow()
    },
    {
      label: 'AI Web Dashboard (لوحة التحكم)',
      click: () => shell.openExternal(`http://localhost:${WEB_UI_PORT}`)
    },
    {
      label: 'Compose Post...',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        if (mainWindow) {
          showAndFocusWindow();
          mainWindow.loadURL('https://x.com/compose/post');
        }
      }
    },
    {
      label: 'Notifications',
      click: () => {
        if (mainWindow) {
          showAndFocusWindow();
          mainWindow.loadURL('https://x.com/notifications');
        }
      }
    },
    {
      label: 'Direct Messages',
      click: () => {
        if (mainWindow) {
          showAndFocusWindow();
          mainWindow.loadURL('https://x.com/messages');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Toggle Audio Mute',
      click: () => {
        if (mainWindow) {
          const isMuted = mainWindow.webContents.isAudioMuted();
          mainWindow.webContents.setAudioMuted(!isMuted);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        showAndFocusWindow();
      }
    }
  });
}

// Open external URL in system browser
ipcMain.on('open-external-url', (event, url) => {
  if (url) {
    shell.openExternal(url);
  }
});

// Media Downloader handler
ipcMain.on('download-url', (event, { url, filename }) => {
  if (!url || !mainWindow) return;

  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const destPath = path.join(downloadsDir, filename);

  mainWindow.webContents.session.downloadURL(url);
  mainWindow.webContents.session.once('will-download', (e, item) => {
    item.setSavePath(destPath);
    item.once('done', (e, state) => {
      if (state === 'completed') {
        console.log('[X Desktop] Download completed:', destPath);
      } else {
        console.warn('[X Desktop] Download failed:', state);
      }
    });
  });
});

// MPRIS updates from preload
ipcMain.on('mpris-update', (event, state) => {
  updateMprisState(state);
});

// DevTools toggle from renderer
ipcMain.on('toggle-devtools', () => {
  if (mainWindow) {
    mainWindow.webContents.toggleDevTools();
  }
});

// App lifecycle
app.whenReady().then(() => {
  // Start local AI server on RTX 4060 GPU
  aiEngine.startServer();

  // Start Web UI Dashboard server on port 28492
  startWebUiServer();

  // Activate Network-Level Ad & Analytics Blocker
  session.defaultSession.webRequest.onBeforeRequest({ urls: AD_TRACKER_PATTERNS }, (details, callback) => {
    callback({ cancel: true });
  });

  initMpris((action, arg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (action === 'raise') {
        showAndFocusWindow();
      } else if (action === 'quit') {
        app.isQuitting = true;
        app.quit();
      } else {
        mainWindow.webContents.send('mpris-action', action, arg);
      }
    }
  });

  createTray();
  const targetUrl = parseTargetUrl(process.argv);
  createWindow(targetUrl);

  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      showAndFocusWindow();
      const target = parseTargetUrl(commandLine);
      if (target && target !== 'https://x.com') {
        mainWindow.loadURL(target);
      }
    }
  });
});

app.on('will-quit', () => {
  aiEngine.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
