
const { app, BrowserWindow, shell, ipcMain, session, Menu, MenuItem, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initMpris, updateMprisState } = require('./mpris');

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

// Sandbox compatibility on Linux user namespaces
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// Hardware acceleration, Wayland & VA-API video decoding flags
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch(
  'enable-features',
  'WaylandWindowDecorations,VaapiVideoDecoder,CanvasOopRasterization,ZeroCopy'
);
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[X Desktop] Another instance is already running. Forwarding focus.');
  app.quit();
}

let mainWindow = null;
let tray = null;

function parseTargetUrl(argv) {
  for (const arg of argv) {
    if (arg && (arg.startsWith('https://x.com') || arg.startsWith('https://twitter.com'))) {
      return arg;
    }
  }
  return 'https://x.com';
}

function getIconPath(name = 'x-desktop.png') {
  return path.join(__dirname, '..', 'data', name);
}

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

  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links vs internal X navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('x.com') || url.includes('twitter.com')) {
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Title sync
  mainWindow.on('page-title-updated', (e, title) => {
    if (!title.includes('X') && !title.includes('Twitter')) {
      mainWindow.setTitle(title + ' / X');
    }
  });

  // Native Context Menu (Right Click)
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

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

    if (params.selectionText) {
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({
        label: `Search X for "${params.selectionText.slice(0, 20)}..."`,
        click: () => {
          mainWindow.loadURL(`https://x.com/search?q=${encodeURIComponent(params.selectionText)}&f=live`);
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
      label: 'Inspect Element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => mainWindow.webContents.toggleDevTools()
    }));

    menu.popup();
  });

  // Offline / Network Recovery Screen
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // Ignore aborted requests
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
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Compose Post...',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL('https://x.com/compose/post');
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Notifications',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL('https://x.com/notifications');
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Direct Messages',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL('https://x.com/messages');
          mainWindow.focus();
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
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

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
  initMpris((action, arg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (action === 'raise') {
        mainWindow.show();
        mainWindow.focus();
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
      if (mainWindow.isMinimized()) mainWindow.restore();
      const target = parseTargetUrl(commandLine);
      if (target && target !== 'https://x.com') {
        mainWindow.loadURL(target);
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

