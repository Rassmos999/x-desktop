
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Strictly guard: only execute on X/Twitter domains
const isXDomain = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
if (!isXDomain) {
  return;
}

// 1. Mask broken WebGPU on Linux Wayland/NVIDIA so X falls back to 100% stable HTML5 video playback
try {
  delete Object.getPrototypeOf(navigator).gpu;
} catch (e) {}
try {
  Object.defineProperty(Object.getPrototypeOf(navigator), 'gpu', {
    get: () => undefined,
    configurable: true
  });
} catch (e) {}
try {
  Object.defineProperty(navigator, 'gpu', {
    get: () => undefined,
    configurable: true
  });
} catch (e) {}

// 2. Mouse Wheel Zoom in CAPTURE phase (Ctrl + Wheel Up: Zoom In, Ctrl + Wheel Down: Zoom Out)
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) {
      ipcRenderer.send('zoom-in');
    } else if (e.deltaY > 0) {
      ipcRenderer.send('zoom-out');
    }
  }
}, { capture: true, passive: false });

// 3. Intercept Link Clicks: Open external & t.co links in system default browser (Brave, Chrome)
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link || !link.href) return;

  const href = link.href;
  const isTco = href.includes('t.co/');
  let isExternal = false;
  try {
    const parsed = new URL(href);
    const host = parsed.hostname;
    isExternal = !host.endsWith('x.com') && !host.endsWith('twitter.com');
  } catch (e) {
    isExternal = false;
  }

  if (isTco || isExternal) {
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.send('open-external-url', href);
  }
}, true);

// 4. Inject custom styles (Clean view, smooth scrollbar)
function injectStyles() {
  try {
    const stylePath = path.join(__dirname, 'style.css');
    if (fs.existsSync(stylePath)) {
      const css = fs.readFileSync(stylePath, 'utf8');
      let styleEl = document.getElementById('x-desktop-custom-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'x-desktop-custom-styles';
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = css;
    }
  } catch (err) {
    console.warn('[X Desktop] Error injecting custom styles:', err);
  }
}

// 5. Media Tracking & MPRIS D-Bus Synchronization
let activeMedia = null;

function setupMediaTracking() {
  document.addEventListener('play', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO')) {
      activeMedia = target;
      sendMprisUpdate('Playing');

      target.onpause = () => sendMprisUpdate('Paused');
      target.onended = () => sendMprisUpdate('Stopped');
      target.ontimeupdate = () => {
        if (!target.paused) {
          ipcRenderer.send('mpris-position', target.currentTime);
        }
      };
    }
  }, true);

  document.addEventListener('pause', (event) => {
    if (event.target === activeMedia) {
      sendMprisUpdate('Paused');
    }
  }, true);
}

function sendMprisUpdate(playbackStatus) {
  if (!activeMedia) return;

  let title = 'X Media Playback';
  let artist = 'X (Twitter)';
  let artwork = '';

  const article = activeMedia.closest('article[data-testid="tweet"]');
  if (article) {
    const userEl = article.querySelector('[data-testid="User-Name"]');
    if (userEl) {
      artist = userEl.innerText.split('\n')[0] || 'X Creator';
    }
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (textEl) {
      title = textEl.innerText.slice(0, 70);
    }
    const avatar = article.querySelector('img[src*="profile_images"]');
    if (avatar) {
      artwork = avatar.src;
    }
  }

  ipcRenderer.send('mpris-update', {
    playbackStatus,
    title,
    artist,
    artwork,
    duration: activeMedia.duration || 0,
    position: activeMedia.currentTime || 0,
    volume: activeMedia.volume || 1
  });
}

// Listen for MPRIS controls from system D-Bus
ipcRenderer.on('mpris-action', (e, action, arg) => {
  if (!activeMedia) {
    activeMedia = document.querySelector('video') || document.querySelector('audio');
  }
  if (!activeMedia) return;

  if (action === 'playpause') {
    activeMedia.paused ? activeMedia.play() : activeMedia.pause();
  } else if (action === 'play') {
    activeMedia.play();
  } else if (action === 'pause') {
    activeMedia.pause();
  } else if (action === 'stop') {
    activeMedia.pause();
    activeMedia.currentTime = 0;
  } else if (action === 'seek' && typeof arg === 'number') {
    activeMedia.currentTime = Math.max(0, Math.min(activeMedia.duration || 0, activeMedia.currentTime + arg));
  } else if (action === 'position' && typeof arg === 'number') {
    activeMedia.currentTime = arg;
  } else if (action === 'volume' && typeof arg === 'number') {
    activeMedia.volume = Math.max(0, Math.min(1, arg));
  }
});

// 6. Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    if (e.key === '1') { e.preventDefault(); window.location.href = 'https://x.com/home'; }
    else if (e.key === '2') { e.preventDefault(); window.location.href = 'https://x.com/explore'; }
    else if (e.key === '3') { e.preventDefault(); window.location.href = 'https://x.com/notifications'; }
    else if (e.key === '4') { e.preventDefault(); window.location.href = 'https://x.com/messages'; }
    else if (e.key === '5') { e.preventDefault(); window.location.href = 'https://x.com/i/bookmarks'; }
    else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const composeLink = document.querySelector('a[href="/compose/post"]') || document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      if (composeLink) composeLink.click();
      else window.location.href = 'https://x.com/compose/post';
    }
  }

  // Ctrl+Shift+P: Toggle PiP on active video
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    const vid = activeMedia || document.querySelector('video');
    if (vid) {
      if (document.pictureInPictureElement === vid) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        vid.requestPictureInPicture().catch(() => {});
      }
    }
  }

  // Ctrl+Shift+I: DevTools
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    ipcRenderer.send('toggle-devtools');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  setupMediaTracking();
});

