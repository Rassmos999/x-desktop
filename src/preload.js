
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Strictly guard: only execute desktop enhancements on X/Twitter domains
const isXDomain = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
if (!isXDomain) {
  return;
}

// 1. Intercept Link Clicks: Open external & t.co links in system default browser (Brave, Chrome, etc.)
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link || !link.href) return;

  const href = link.href;

  // Check if link is a t.co redirect or an external non-X link
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

// 2. Inject custom styles (Clean view, PiP button, Downloader, smooth scrollbar)
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

// 3. Hide Promoted Tweets & Web Promotional Elements via MutationObserver
function scrubPromotedContent() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    const isPromoted = 
      tw.querySelector('[data-testid="icon-promoted"]') ||
      (tw.innerText && (tw.innerText.includes('Promoted') || tw.innerText.includes('مروّج') || tw.innerText.includes('إعلان مروّج')));

    if (isPromoted && !tw.dataset.xScrubbed) {
      tw.dataset.xScrubbed = 'true';
      tw.style.display = 'none';
    }
  });
}

// 4. Media Tracking & MPRIS D-Bus Synchronization
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

// 5. Picture-in-Picture (PiP) Enhancement
function injectPiPButtons() {
  const videos = document.querySelectorAll('video');
  videos.forEach(vid => {
    const container = vid.closest('div[data-testid="videoComponent"]') || 
                      vid.closest('div[data-testid="videoPlayer"]') || 
                      vid.parentElement;
    if (!container || container.querySelector('.x-desktop-pip-btn')) return;

    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const pipBtn = document.createElement('button');
    pipBtn.className = 'x-desktop-pip-btn';
    pipBtn.title = 'Picture-in-Picture (Ctrl+Shift+P)';
    pipBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
        <rect x="12" y="10" width="8" height="6" rx="1" fill="currentColor"></rect>
      </svg>
    `;

    pipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        if (document.pictureInPictureElement === vid) {
          await document.exitPictureInPicture();
        } else {
          await vid.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('[X Desktop] PiP request failed:', err);
      }
    });

    container.appendChild(pipBtn);
  });
}

// 6. Media Downloader Action Button in Tweets
function injectDownloadButtons() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    const actionGroup = tw.querySelector('div[role="group"]');
    if (!actionGroup || actionGroup.querySelector('.x-desktop-download-btn')) return;

    const hasMedia = tw.querySelector('div[data-testid="tweetPhoto"]') || 
                     tw.querySelector('img[src*="pbs.twimg.com/media"]') ||
                     tw.querySelector('video');

    if (!hasMedia) return;

    const btn = document.createElement('div');
    btn.className = 'x-desktop-download-btn';
    btn.title = 'تحميل الوسائط إلى ~/Downloads';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 15.586l4.293-4.293 1.414 1.414L12 18.414l-5.707-5.707 1.414-1.414L12 15.586zM11 2h2v12h-2V2zm-7 18h16v2H4v-2z"></path>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadTweetMedia(tw);
    });

    actionGroup.appendChild(btn);
  });
}

function showToast(message) {
  let toast = document.querySelector('.x-desktop-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'x-desktop-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>💾</span> <span>${message}</span>`;
  setTimeout(() => {
    if (toast && toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 3500);
}

function downloadTweetMedia(article) {
  const images = article.querySelectorAll('img[src*="pbs.twimg.com/media"]');
  const video = article.querySelector('video');

  let authorHandle = 'x_media';
  const userEl = article.querySelector('[data-testid="User-Name"]');
  if (userEl) {
    const text = userEl.innerText;
    const match = text.match(/@([a-zA-Z0-9_]+)/);
    if (match) authorHandle = match[1];
  }

  let count = 0;

  images.forEach((img, idx) => {
    let src = img.src;
    if (src.includes('name=')) {
      src = src.replace(/name=[a-zA-Z0-9_]+/, 'name=orig');
    } else {
      src += src.includes('?') ? '&name=orig' : '?name=orig';
    }

    ipcRenderer.send('download-url', {
      url: src,
      filename: `${authorHandle}-${Date.now()}-${idx + 1}.jpg`
    });
    count++;
  });

  if (video && video.src) {
    ipcRenderer.send('download-url', {
      url: video.src,
      filename: `${authorHandle}-${Date.now()}.mp4`
    });
    count++;
  }

  if (count > 0) {
    showToast(`جاري تحميل ${count} ملف إلى مجلد Downloads...`);
  } else {
    showToast('لم يتم العثور على رابط مباشر للوسائط.');
  }
}

// 7. Native Desktop Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    // Ctrl+1: Home
    if (e.key === '1') {
      e.preventDefault();
      window.location.href = 'https://x.com/home';
    }
    // Ctrl+2: Explore
    else if (e.key === '2') {
      e.preventDefault();
      window.location.href = 'https://x.com/explore';
    }
    // Ctrl+3: Notifications
    else if (e.key === '3') {
      e.preventDefault();
      window.location.href = 'https://x.com/notifications';
    }
    // Ctrl+4: Messages
    else if (e.key === '4') {
      e.preventDefault();
      window.location.href = 'https://x.com/messages';
    }
    // Ctrl+5: Bookmarks
    else if (e.key === '5') {
      e.preventDefault();
      window.location.href = 'https://x.com/i/bookmarks';
    }
    // Ctrl+N: Compose new tweet
    else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const composeLink = document.querySelector('a[href="/compose/post"]') || document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      if (composeLink) {
        composeLink.click();
      } else {
        window.location.href = 'https://x.com/compose/post';
      }
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

// Periodic and Mutation loop for DOM enhancements
function runLoop() {
  scrubPromotedContent();
  injectPiPButtons();
  injectDownloadButtons();
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

