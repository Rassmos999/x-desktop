
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

// 4. Inject custom styles (Clean view, translation styling, smooth scrollbar)
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

// 5. Toast Notification for Context-Menu Translations
function showToast(message) {
  let toast = document.querySelector('.x-desktop-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'x-desktop-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>🌐</span> <div style="flex:1;">${message}</div>`;
  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 7000);
}

ipcRenderer.on('show-toast-message', (e, msg) => {
  showToast(msg);
});

// 6. Native In-Place Arabic Translation for Foreign Tweets
function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function injectTranslateButtons() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    const textEl = tw.querySelector('[data-testid="tweetText"]');
    if (!textEl || tw.querySelector('.x-desktop-translate-link') || tw.querySelector('.x-desktop-translation-inline')) return;

    const originalText = textEl.innerText.trim();
    if (originalText.length < 5 || hasArabic(originalText)) return;

    const link = document.createElement('button');
    link.className = 'x-desktop-translate-link';
    link.innerHTML = 'ترجمة المنشور';

    let translationBox = null;
    let cachedTranslation = '';

    link.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (cachedTranslation && translationBox) {
        translationBox.style.display = 'block';
        link.style.display = 'none';
        return;
      }

      link.innerHTML = 'جاري الترجمة...';
      link.disabled = true;

      try {
        const translated = await ipcRenderer.invoke('translate-text', originalText);
        cachedTranslation = translated;

        translationBox = document.createElement('div');
        translationBox.className = 'x-desktop-translation-inline';
        translationBox.innerHTML = `
          <div class="x-desktop-translation-meta">
            <span>ترجم من الإنجليزية بواسطة X Desktop</span>
            <button class="x-desktop-show-original-link">عرض الأصل</button>
          </div>
          <div class="x-desktop-translated-text">${translated}</div>
        `;

        const showOriginalBtn = translationBox.querySelector('.x-desktop-show-original-link');
        showOriginalBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          translationBox.style.display = 'none';
          link.style.display = 'inline-block';
          link.innerHTML = 'ترجمة المنشور';
          link.disabled = false;
        });

        textEl.parentNode.insertBefore(translationBox, textEl.nextSibling);
        link.style.display = 'none';
      } catch (err) {
        link.innerHTML = 'تعذرت الترجمة';
        link.disabled = false;
      }
    });

    textEl.parentNode.insertBefore(link, textEl.nextSibling);
  });
}

// 7. Promoted Tweet & "Ad" Label Scrubber (Ad-Blocker)
function isAdTweet(article) {
  // 1. Icon promoted testid
  if (article.querySelector('[data-testid="icon-promoted"]')) return true;

  // 2. Check for "Ad", "مروّج", "Sponsored", "إعلان" label in headers
  const spans = article.querySelectorAll('span, div');
  for (let i = 0; i < spans.length; i++) {
    const el = spans[i];
    if (el.children.length === 0) {
      const t = el.innerText ? el.innerText.trim() : '';
      if (t === 'Ad' || t === 'مروّج' || t === 'Sponsored' || t === 'Promoted' || t === 'إعلان' || t === 'إعلان مروّج') {
        return true;
      }
    }
  }

  // 3. Check aria-labels
  if (article.querySelector('[aria-label*="Promoted"], [aria-label*="إعلان"], [aria-label*="Sponsored"]')) {
    return true;
  }

  return false;
}

function scrubPromotedContent() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    if (tw.dataset.xScrubbed) return;

    if (isAdTweet(tw)) {
      tw.dataset.xScrubbed = 'true';
      tw.style.display = 'none';
    }
  });
}

// 8. Media Tracking & MPRIS D-Bus Synchronization (Passive listeners only)
let activeMedia = null;

function setupMediaTracking() {
  document.addEventListener('play', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO')) {
      activeMedia = target;
      sendMprisUpdate('Playing');
    }
  }, true);

  document.addEventListener('pause', (event) => {
    if (event.target === activeMedia) {
      sendMprisUpdate('Paused');
    }
  }, true);

  document.addEventListener('ended', (event) => {
    if (event.target === activeMedia) {
      sendMprisUpdate('Stopped');
    }
  }, true);

  document.addEventListener('timeupdate', (event) => {
    if (event.target === activeMedia && !activeMedia.paused) {
      ipcRenderer.send('mpris-position', activeMedia.currentTime);
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

ipcRenderer.on('mpris-action', (e, action, arg) => {
  if (!activeMedia) {
    activeMedia = document.querySelector('video') || document.querySelector('audio');
  }
  if (!activeMedia) return;

  if (action === 'playpause') {
    activeMedia.paused ? activeMedia.play().catch(() => {}) : activeMedia.pause();
  } else if (action === 'play') {
    activeMedia.play().catch(() => {});
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

// 9. Keyboard Shortcuts
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

  // Ctrl+Shift+I: DevTools
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    ipcRenderer.send('toggle-devtools');
  }
});

// Periodic & Mutation Loop for translation and ad cleaning
function runLoop() {
  scrubPromotedContent();
  injectTranslateButtons();
}

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  setupMediaTracking();
  runLoop();

  const observer = new MutationObserver(() => {
    runLoop();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

