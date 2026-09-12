
const { ipcRenderer } = require('electron');

// Strictly guard: only execute on X/Twitter domains
const isXDomain = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
if (!isXDomain && window.location.hostname !== '' && window.location.protocol.startsWith('http')) {
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

  // 1. Isolate full URLs (https://, http://)
  escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<bdi dir="ltr" class="x-desktop-ltr-token">$1</bdi>');

  // 2. Isolate all web domains with ANY 2-16 letter TLD (e.g. .supply, .design, .lol, .ai, .com)
  escaped = escaped.replace(/(?<![\/\w])([a-zA-Z0-9-]+\.[a-zA-Z]{2,16}(?:\/[^\s<]*)?)/g, '<bdi dir="ltr" class="x-desktop-ltr-token">$1</bdi>');

  // 3. Isolate @mentions
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

function getTweetKey(tw, textEl) {
  if (!tw) return "";
  const links = tw.querySelectorAll("a[href*='/status/']");
  for (const a of links) {
    const m = (a.getAttribute("href") || "").match(/\/status\/(\d+)/);
    if (m && m[1]) return m[1];
  }
  const urlMatch = window.location.pathname.match(/\/status\/(\d+)/);
  if (urlMatch && urlMatch[1]) {
    const mainArticle = document.querySelector("article[data-testid='tweet']");
    if (tw === mainArticle) return urlMatch[1];
  }
  const txt = (textEl ? textEl.innerText : "") || "";
  return txt.slice(0, 100).trim();
}

const persistentTranslations = new Map();

function renderTranslationBox(tw, textEl, tweetKey, cacheObj, linkEl) {
  const link = linkEl || tw.querySelector(".x-desktop-translate-link");
  let translationBox = tw.querySelector(".x-desktop-translation-inline");
  if (translationBox) return translationBox;

  translationBox = document.createElement("div");
  translationBox.className = "x-desktop-translation-inline";

  // Isolate clicks completely so tweet navigation never triggers
  translationBox.addEventListener("click", (ev) => ev.stopPropagation());
  translationBox.addEventListener("mousedown", (ev) => ev.stopPropagation());
  translationBox.addEventListener("mouseup", (ev) => ev.stopPropagation());
  translationBox.addEventListener("pointerdown", (ev) => ev.stopPropagation());

  const isFast = (cacheObj.currentActiveMode === "auto") || (cacheObj.actualEngine === "precise" || cacheObj.actualEngine === "web");
  const initialText = (cacheObj.currentActiveMode === "auto" && cacheObj.cachedFastText) ? cacheObj.cachedFastText : cacheObj.cachedAiText;
  const initialBadge = isFast ? "الترجمة السريعة" : "ترجمة الذكاء الاصطناعي";
  const initialRephraseBtn = isFast ? "ترجمة الذكاء الاصطناعي" : "الترجمة السريعة";

  translationBox.innerHTML = `
    <div class="x-desktop-translation-meta">
      <span class="x-desktop-badge-text">${initialBadge}</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="x-desktop-show-original-link x-desktop-rephrase-ai">${initialRephraseBtn}</button>
        <button class="x-desktop-show-original-link x-desktop-hide-translation">عرض الأصل</button>
      </div>
    </div>
    <div class="x-desktop-translated-text">${formatArabicBiDi(initialText)}</div>
  `;

  const rephraseBtn = translationBox.querySelector(".x-desktop-rephrase-ai");
  const showOriginalBtn = translationBox.querySelector(".x-desktop-hide-translation");
  const textContainer = translationBox.querySelector(".x-desktop-translated-text");
  const badgeText = translationBox.querySelector(".x-desktop-badge-text");

  rephraseBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    rephraseBtn.disabled = true;
    const nextMode = (cacheObj.currentActiveMode === "ai") ? "auto" : "ai";

    if (nextMode === "auto" && cacheObj.cachedFastText) {
      cacheObj.currentActiveMode = "auto";
      textContainer.innerHTML = formatArabicBiDi(cacheObj.cachedFastText);
      badgeText.textContent = "الترجمة السريعة";
      rephraseBtn.innerHTML = "ترجمة الذكاء الاصطناعي";
      rephraseBtn.disabled = false;
      return;
    }
    if (nextMode === "ai" && cacheObj.cachedAiText) {
      cacheObj.currentActiveMode = "ai";
      textContainer.innerHTML = formatArabicBiDi(cacheObj.cachedAiText);
      badgeText.textContent = "ترجمة الذكاء الاصطناعي";
      rephraseBtn.innerHTML = "الترجمة السريعة";
      rephraseBtn.disabled = false;
      return;
    }

    rephraseBtn.innerHTML = "جاري المعالجة...";
    try {
      const latestText = getCleanTweetText(textEl) || cacheObj.fullOriginalText;
      const rephraseRes = await ipcRenderer.invoke("translate-text", { text: latestText, mode: nextMode });
      const newText = typeof rephraseRes === "object" ? rephraseRes.text : rephraseRes;
      textContainer.innerHTML = formatArabicBiDi(newText);

      const engineUsed = typeof rephraseRes === 'object' ? rephraseRes.engine : '';
      cacheObj.actualEngine = engineUsed;
      const isActualFast = (nextMode === "auto") || (engineUsed === "precise" || engineUsed === "web");

      if (nextMode === "ai") {
        cacheObj.cachedAiText = newText;
        cacheObj.currentActiveMode = "ai";
      } else {
        cacheObj.cachedFastText = newText;
        cacheObj.currentActiveMode = "auto";
      }

      badgeText.textContent = isActualFast ? "الترجمة السريعة" : "ترجمة الذكاء الاصطناعي";
      rephraseBtn.innerHTML = isActualFast ? "ترجمة الذكاء الاصطناعي" : "الترجمة السريعة";
    } catch (err) {
      rephraseBtn.innerHTML = "تعذر التبديل";
    } finally {
      rephraseBtn.disabled = false;
    }
  });

  showOriginalBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    cacheObj.rendered = false;
    translationBox.remove();
    if (link) {
      link.style.display = "inline-block";
      link.innerHTML = "ترجمة المنشور";
      link.disabled = false;
    }
  });

  textEl.parentNode.insertBefore(translationBox, textEl.nextSibling);
  return translationBox;
}

function injectTranslateButtons() {
  const tweets = document.querySelectorAll("article[data-testid='tweet']");
  tweets.forEach(tw => {
    const textEl = tw.querySelector("[data-testid='tweetText']");
    if (!textEl) return;

    const originalText = getCleanTweetText(textEl);
    const tweetKey = getTweetKey(tw, textEl);

    const existingBox = tw.querySelector(".x-desktop-translation-inline");
    const existingLink = tw.querySelector(".x-desktop-translate-link");
    if (existingBox) return;

    // If already translated and cached for this tweet, auto-restore
    if (tweetKey && persistentTranslations.has(tweetKey)) {
      const cachedData = persistentTranslations.get(tweetKey);
      if (cachedData && cachedData.rendered) {
        if (existingLink) existingLink.style.display = "none";
        renderTranslationBox(tw, textEl, tweetKey, cachedData);
        return;
      }
    }

    if (existingLink) return;
    if (originalText.length < 2) return;

    // Only skip if predominantly Arabic
    const arabicMatch = originalText.match(/[\u0600-\u06FF]/g);
    const arabicCount = arabicMatch ? arabicMatch.length : 0;
    const totalLetters = (originalText.match(/[\p{L}]/gu) || []).length;
    if (totalLetters > 0 && (arabicCount / totalLetters) > 0.4) {
      return;
    }

    const link = document.createElement("button");
    link.className = "x-desktop-translate-link";
    link.innerHTML = "ترجمة المنشور";

    link.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (tweetKey && persistentTranslations.has(tweetKey)) {
        const cachedData = persistentTranslations.get(tweetKey);
        cachedData.rendered = true;
        renderTranslationBox(tw, textEl, tweetKey, cachedData, link);
        link.style.display = "none";
        return;
      }

      // Auto-expand Show more / عرض المزيد to get complete text
      const showMoreSelectors = [
        '[data-testid="tweet-text-show-more-link"]',
        'button[data-testid="tweet-text-show-more-link"]'
      ];
      for (const sel of showMoreSelectors) {
        const el = tw.querySelector(sel);
        if (el) {
          try { el.click(); } catch (err) {}
          break;
        }
      }
      const spans = tw.querySelectorAll("span");
      for (const sp of spans) {
        const txt = (sp.textContent || "").trim();
        if (txt === "Show more" || txt === "عرض المزيد") {
          try { sp.click(); } catch (err) {}
          break;
        }
      }

      await new Promise(r => setTimeout(r, 160));
      const latestTextEl = tw.querySelector("[data-testid='tweetText']") || textEl;
      const fullOriginalText = getCleanTweetText(latestTextEl) || originalText;

      link.innerHTML = "جاري الترجمة بالذكاء الاصطناعي...";
      link.disabled = true;

      try {
        const res = await ipcRenderer.invoke("translate-text", { text: fullOriginalText, mode: "ai" });
        const translatedText = typeof res === "object" ? res.text : res;
        const engineUsed = typeof res === "object" ? res.engine : "";

        const cacheObj = {
          rendered: true,
          currentActiveMode: "ai",
          actualEngine: engineUsed,
          cachedAiText: translatedText,
          cachedFastText: (engineUsed === "precise" || engineUsed === "web") ? translatedText : "",
          fullOriginalText: fullOriginalText
        };
        if (tweetKey) persistentTranslations.set(tweetKey, cacheObj);

        renderTranslationBox(tw, textEl, tweetKey, cacheObj, link);
        link.style.display = "none";
      } catch (err) {
        link.innerHTML = "تعذرت الترجمة";
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

  if (article.querySelector('[aria-label*="Promoted"], [aria-label*="إعلان"], [aria-label*="Sponsored"], [aria-label*="Boosted"], [aria-label*="مُعزّز"], [aria-label*="Ad"], [aria-label*="مروّج"]')) {
    return true;
  }

  // Check all elements in article for Ad badges
  const allElements = article.querySelectorAll('span, div, svg');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const aria = el.getAttribute('aria-label');
    if (aria && /\b(Ad|Boosted|Sponsored|Promoted|إعلان|مروّج|مُعزّز)\b/i.test(aria)) {
      return true;
    }

    const t = (el.innerText || el.textContent || '').trim();
    if (
      t === 'Ad' ||
      t === 'مروّج' ||
      t === 'Sponsored' ||
      t === 'Promoted' ||
      t === 'Boosted' ||
      t === 'مُعزّز' ||
      t === 'إعلان' ||
      t === 'إعلان ممول' ||
      t === 'Ad ·' ||
      t === '· Ad'
    ) {
      return true;
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

// 11. Interactive Selection Translation Tooltip (Pop-up)
let activeTooltip = null;
let lastSelectedRange = null;
let lastSelectedText = '';

function removeSelectionTooltip() {
  if (activeTooltip) {
    if (activeTooltip.parentNode) {
      activeTooltip.parentNode.removeChild(activeTooltip);
    }
    activeTooltip = null;
  }
}

function setupSelectionTranslation() {
  document.addEventListener('mouseup', (e) => {
    // Ignore clicks inside the tooltip itself
    if (activeTooltip && activeTooltip.contains(e.target)) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        removeSelectionTooltip();
        return;
      }

      const text = selection.toString().trim();
      if (!text || text.length < 2 || text.length > 500) {
        removeSelectionTooltip();
        return;
      }

      // Don't popup inside input/textarea/contenteditable (e.g. tweet composer)
      const anchorNode = selection.anchorNode;
      const parentEl = anchorNode ? (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement) : null;
      if (parentEl && (parentEl.closest('input, textarea, [contenteditable="true"], [data-testid="tweetTextarea_0"]'))) {
        removeSelectionTooltip();
        return;
      }

      // Skip if predominantly Arabic
      const arabicMatch = text.match(/[\u0600-\u06FF]/g);
      const arabicCount = arabicMatch ? arabicMatch.length : 0;
      const totalLetters = (text.match(/[\p{L}]/gu) || []).length;
      if (totalLetters > 0 && (arabicCount / totalLetters) > 0.4) {
        removeSelectionTooltip();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        removeSelectionTooltip();
        return;
      }

      lastSelectedRange = range.cloneRange();
      lastSelectedText = text;

      removeSelectionTooltip();
      showSelectionTooltip(rect, text);
    }, 60);
  });

  document.addEventListener('mousedown', (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      removeSelectionTooltip();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeSelectionTooltip();
    }
  });
}

function showSelectionTooltip(rect, text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'x-selection-tooltip';
  tooltip.addEventListener('click', (e) => e.stopPropagation());
  tooltip.addEventListener('mousedown', (e) => e.stopPropagation());

  let currentMode = 'ai';
  let translatedAi = '';
  let translatedFast = '';
  let activeTranslation = '';

  tooltip.innerHTML = `
    <div class="x-tooltip-header">
      <span class="x-tooltip-badge">ترجمة الذكاء الاصطناعي</span>
      <button class="x-tooltip-mode-btn">التبديل للسريعة</button>
    </div>
    <div class="x-tooltip-result">جاري الترجمة...</div>
    <div class="x-tooltip-actions">
      <button class="x-tooltip-btn x-tooltip-btn-primary x-tooltip-replace-btn" title="استبدال الكلمة مكانها في التغريدة">استبدال مكانها</button>
      <button class="x-tooltip-btn x-tooltip-copy-btn">نسخ</button>
      <button class="x-tooltip-btn x-tooltip-close-btn">إغلاق</button>
    </div>
  `;

  // Position tooltip relative to page
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  const tooltipWidth = tooltip.offsetWidth || 220;
  const tooltipHeight = tooltip.offsetHeight || 100;
  let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);
  let top = rect.top + window.scrollY - tooltipHeight - 10;

  // Keep within window bounds
  if (left < 10) left = 10;
  if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
  if (top < window.scrollY + 10) {
    top = rect.bottom + window.scrollY + 10; // place below if not enough room above
  }

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';

  const resultEl = tooltip.querySelector('.x-tooltip-result');
  const badgeEl = tooltip.querySelector('.x-tooltip-badge');
  const modeBtn = tooltip.querySelector('.x-tooltip-mode-btn');
  const replaceBtn = tooltip.querySelector('.x-tooltip-replace-btn');
  const copyBtn = tooltip.querySelector('.x-tooltip-copy-btn');
  const closeBtn = tooltip.querySelector('.x-tooltip-close-btn');

  async function fetchAndDisplay(mode) {
    resultEl.textContent = 'جاري الترجمة...';
    try {
      const res = await ipcRenderer.invoke('translate-text', { text, mode });
      const translated = typeof res === 'object' ? res.text : res;
      activeTranslation = translated;
      resultEl.innerHTML = formatArabicBiDi(translated);
      if (mode === 'ai') {
        translatedAi = translated;
        badgeEl.textContent = 'ترجمة الذكاء الاصطناعي';
        modeBtn.textContent = 'التبديل للسريعة';
      } else {
        translatedFast = translated;
        badgeEl.textContent = 'الترجمة السريعة';
        modeBtn.textContent = 'التبديل للذكاء الاصطناعي';
      }
    } catch (err) {
      resultEl.textContent = 'تعذرت الترجمة';
    }
  }

  modeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    currentMode = (currentMode === 'ai') ? 'auto' : 'ai';
    if (currentMode === 'auto' && translatedFast) {
      activeTranslation = translatedFast;
      resultEl.innerHTML = formatArabicBiDi(translatedFast);
      badgeEl.textContent = 'الترجمة السريعة';
      modeBtn.textContent = 'التبديل للذكاء الاصطناعي';
      return;
    }
    if (currentMode === 'ai' && translatedAi) {
      activeTranslation = translatedAi;
      resultEl.innerHTML = formatArabicBiDi(translatedAi);
      badgeEl.textContent = 'ترجمة الذكاء الاصطناعي';
      modeBtn.textContent = 'التبديل للسريعة';
      return;
    }
    fetchAndDisplay(currentMode);
  });

  copyBtn.addEventListener('click', () => {
    if (activeTranslation) {
      navigator.clipboard.writeText(activeTranslation);
      copyBtn.textContent = 'تم النسخ ✓';
      setTimeout(() => { if (copyBtn) copyBtn.textContent = 'نسخ'; }, 1500);
    }
  });

  closeBtn.addEventListener('click', () => {
    removeSelectionTooltip();
  });

  replaceBtn.addEventListener('click', () => {
    if (!activeTranslation || !lastSelectedRange) return;
    try {
      const anchorNode = lastSelectedRange.startContainer;
      const textEl = anchorNode ? (anchorNode.nodeType === 1 ? anchorNode.closest('[data-testid="tweetText"]') : anchorNode.parentElement?.closest('[data-testid="tweetText"]')) : null;
      const tw = textEl ? textEl.closest('article[data-testid="tweet"]') : null;

      if (textEl && !textEl.dataset.originalHtml) {
        textEl.dataset.originalHtml = textEl.innerHTML;
      }

      // Use <bdi> with isolate direction so surrounding English sentences are NOT reversed!
      const bdi = document.createElement('bdi');
      bdi.className = 'x-desktop-replaced-text';
      bdi.dir = 'rtl';
      bdi.textContent = activeTranslation;
      bdi.title = 'النص الأصلي: ' + text + ' (انقر للاستعادة)';

      bdi.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const originalTextNode = document.createTextNode(text);
        bdi.parentNode.replaceChild(originalTextNode, bdi);
        if (textEl && !textEl.querySelector('.x-desktop-replaced-text')) {
          const restoreBtn = tw ? tw.querySelector('.x-desktop-restore-btn') : null;
          if (restoreBtn) restoreBtn.remove();
          delete textEl.dataset.originalHtml;
        }
      });

      // Add/show "عودة للمنشور" button directly on the side of the tweet
      if (tw && textEl && !tw.querySelector('.x-desktop-restore-btn')) {
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'x-desktop-restore-btn';
        restoreBtn.innerHTML = '↩ عودة للمنشور';
        restoreBtn.title = 'استعادة المنشور بالكامل إلى لغته الأصلية';
        restoreBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (textEl.dataset.originalHtml) {
            textEl.innerHTML = textEl.dataset.originalHtml;
            delete textEl.dataset.originalHtml;
          }
          restoreBtn.remove();
        });
        textEl.parentNode.insertBefore(restoreBtn, textEl.nextSibling);
      }

      lastSelectedRange.deleteContents();
      lastSelectedRange.insertNode(bdi);
      removeSelectionTooltip();
    } catch (err) {
      console.warn('[X Desktop] Replace in place failed:', err);
    }
  });

  fetchAndDisplay('ai');
}

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
  setupSelectionTranslation();
  runLoop();

  const observer = new MutationObserver(() => {
    runLoop();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
