
const { app, BrowserWindow, shell, ipcMain, session, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initMpris, updateMprisState } = require('./mpris');

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

app.userAgentFallback = CHROME_UA;

// Prevent transient D-Bus / socket errors from terminating the application
process.on('uncaughtException', (err) => {
  if (err && (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.message?.includes("EPIPE") || err.message?.includes("stream is closed"))) {
    console.warn('[X Desktop] Caught transient socket notice:', err.message);
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
  console.log('[X Desktop] Another instance is already running. Focusing existing window.');
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
    width: 1300,
    height: 860,
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
      nodeIntegration: false
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

// App lifecycle
app.whenReady().then(() => {
  // Initialize D-Bus MPRIS Service
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

