
const { ipcRenderer } = require('electron');

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

// 4. BiDi Formatter: Isolate URLs, domains, and @mentions from RTL text flipping
function formatArabicBiDi(text) {
  if (!text) return '';
  
  let cleanText = text.replace(/\s*\/\/\s*:\s*https?\s*/g, ' ');

  let escaped = cleanText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<bdi dir="ltr" class="x-desktop-ltr-token">$1</bdi>');
  escaped = escaped.replace(/(?<![\/\w])([a-zA-Z0-9-]+\.[a-zA-Z]{2,16}(?:\/[^\s<]*)?)/g, '<bdi dir="ltr" class="x-desktop-ltr-token">$1</bdi>');
  escaped = escaped.replace(/(?<!\w)(@[a-zA-Z0-9_]{1,30})/g, '<bdi dir="ltr" class="x-desktop-ltr-token">$1</bdi>');

  return escaped;
}

// 5. Toast Notification for Context-Menu Translations
function showToast(message) {
  let toast = document.querySelector('.x-desktop-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'x-desktop-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>🌐</span> <div style="flex:1;">${formatArabicBiDi(message)}</div>`;
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

function getCleanTweetText(textEl) {
  if (!textEl) return '';
  try {
    const clone = textEl.cloneNode(true);
    const links = clone.querySelectorAll('a');
    links.forEach(a => {
      let linkText = a.textContent ? a.textContent.trim().replace(/\s+/g, '') : '';
      const textNode = document.createTextNode(' ' + linkText + ' ');
      if (a.parentNode) a.parentNode.replaceChild(textNode, a);
    });
    let clean = (clone.innerText || clone.textContent || '').replace(/\s*\/\/\s*:\s*https?/g, '').trim();
    return clean;
  } catch (e) {
    return textEl.innerText ? textEl.innerText.trim() : '';
  }
}

function injectTranslateButtons() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    const textEl = tw.querySelector('[data-testid="tweetText"]');
    if (!textEl || tw.querySelector('.x-desktop-translate-link') || tw.querySelector('.x-desktop-translation-inline')) return;

    const originalText = getCleanTweetText(textEl);
    if (originalText.length < 3 || hasArabic(originalText)) return;

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

      link.innerHTML = 'جاري الترجمة بالذكاء الاصطناعي...';
      link.disabled = true;

      try {
        const translated = await ipcRenderer.invoke('translate-text', originalText);
        cachedTranslation = translated;

        translationBox = document.createElement('div');
        translationBox.className = 'x-desktop-translation-inline';
        translationBox.innerHTML = `
          <div class="x-desktop-translation-meta">
            <span>ترجم بواسطة الذكاء الاصطناعي (Qwen3 · RTX 4060)</span>
            <button class="x-desktop-show-original-link">عرض الأصل</button>
          </div>
          <div class="x-desktop-translated-text">${formatArabicBiDi(translated)}</div>
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

// 7. Vision Image Translation Action in Tweets
function injectImageTranslateButtons() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tw => {
    const photoContainer = tw.querySelector('div[data-testid="tweetPhoto"]');
    if (!photoContainer || tw.querySelector('.x-desktop-img-translate-btn')) return;

    const img = photoContainer.querySelector('img[src*="twimg.com/media"]');
    if (!img) return;

    const btn = document.createElement('button');
    btn.className = 'x-desktop-img-translate-btn';
    btn.innerHTML = '🖼️ ترجمة النص داخل الصورة (Qwen3-VL)';

    let resultBox = null;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.innerHTML = '🔍 جاري فحص وترجمة الصورة بالذكاء الاصطناعي...';
      btn.disabled = true;

      try {
        const resp = await fetch(img.src);
        const blob = await resp.blob();
        const reader = new FileReader();

        reader.onload = () => {
          const imgObj = new Image();
          imgObj.onload = async () => {
            const maxDim = 1280;
            let w = imgObj.width;
            let h = imgObj.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(imgObj, 0, 0, w, h);
            const base64Data = c.toDataURL('image/jpeg', 0.88).split(',')[1];

            const translation = await ipcRenderer.invoke('translate-image', {
              imageBase64: base64Data,
              mimeType: 'image/jpeg'
            });

            if (!resultBox) {
              resultBox = document.createElement('div');
              resultBox.className = 'x-desktop-translation-inline';
              photoContainer.parentNode.insertBefore(resultBox, photoContainer.nextSibling);
            }

            resultBox.innerHTML = `
              <div class="x-desktop-translation-meta">
                <span>ترجمة النصوص المستخرجة من الصورة (Qwen3-VL · RTX 4060)</span>
                <button class="x-desktop-show-original-link">إخفاء</button>
              </div>
              <div class="x-desktop-translated-text">${formatArabicBiDi(translation)}</div>
            `;

            const hideBtn = resultBox.querySelector('.x-desktop-show-original-link');
            hideBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              resultBox.style.display = 'none';
              btn.innerHTML = '🖼️ ترجمة النص داخل الصورة (Qwen3-VL)';
              btn.disabled = false;
            });

            btn.innerHTML = '👁️ إخفاء ترجمة الصورة';
            btn.disabled = false;
          };
          imgObj.src = reader.result;
        };

        reader.readAsDataURL(blob);
      } catch (err) {
        btn.innerHTML = '⚠️ تعذر فحص الصورة';
        btn.disabled = false;
      }
    });

    photoContainer.parentNode.insertBefore(btn, photoContainer.nextSibling);
  });
}

// 8. Absolute Promoted & Boosted Tweet Scrubber (Ad-Blocker)
function isAdTweet(article) {
  if (article.querySelector('[data-testid="icon-promoted"]')) return true;

  if (article.querySelector('[aria-label*="Promoted"], [aria-label*="إعلان"], [aria-label*="Sponsored"], [aria-label*="Boosted"]')) {
    return true;
  }

  const spans = article.querySelectorAll('span, div');
  for (let i = 0; i < spans.length; i++) {
    const el = spans[i];
    if (el.children.length === 0) {
      const t = el.textContent ? el.textContent.trim() : '';
      if (
        t === 'Ad' ||
        t === 'مروّج' ||
        t === 'Sponsored' ||
        t === 'Promoted' ||
        t === 'Boosted' ||
        t === 'مُعزّز' ||
        t === 'إعلان' ||
        t === 'إعلان ممول'
      ) {
        return true;
      }
    }
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

// 9. Media Tracking & MPRIS D-Bus Synchronization (Passive listeners only)
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

// 10. Keyboard Shortcuts
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

// Periodic & Mutation Loop
function runLoop() {
  scrubPromotedContent();
  injectTranslateButtons();
  injectImageTranslateButtons();
}

document.addEventListener('DOMContentLoaded', () => {
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

