/* Manual enhancements: table-of-contents state, copy controls, and the mobile
   disclosure. All optional — with scripting off the manual is fully readable. */
(function () {
  'use strict';

  // Copy buttons, added only when the Clipboard API is actually usable.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    document.querySelectorAll('.code').forEach(function (block) {
      var head = block.querySelector('.code-head');
      var pre = block.querySelector('pre');
      if (!head || !pre) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      // Labels come from the document, so an Arabic page gets Arabic controls.
      var t = function (name, fallback) { return document.documentElement.getAttribute('data-' + name) || fallback; };
      var labelCopy = t('label-copy', 'Copy');
      btn.textContent = labelCopy;
      btn.setAttribute('aria-label', t('label-copy-aria', 'Copy this command'));

      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(pre.innerText.trim()).then(function () {
          btn.textContent = t('label-copied', 'Copied');
          setTimeout(function () { btn.textContent = labelCopy; }, 1600);
        }).catch(function () {
          btn.textContent = t('label-copy-manual', 'Press Ctrl+C');
          setTimeout(function () { btn.textContent = labelCopy; }, 2200);
        });
      });

      head.appendChild(btn);
    });
  }

  // Mobile contents disclosure.
  var toc = document.querySelector('.toc');
  var toggle = document.querySelector('.toc-toggle');
  if (toc && toggle) {
    toggle.addEventListener('click', function () {
      var open = toc.getAttribute('data-open') === 'true';
      toc.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  // Mark the section currently in view. Uses the sections' own headings so the
  // list stays correct without hand-maintained offsets.
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  var sections = links
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  if (!sections.length || !('IntersectionObserver' in window)) return;

  function setCurrent(id) {
    links.forEach(function (a) {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  var visible = new Map();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible.set(e.target.id, e.isIntersecting); });
    for (var i = 0; i < sections.length; i++) {
      if (visible.get(sections[i].id)) { setCurrent(sections[i].id); return; }
    }
  }, { rootMargin: '-76px 0px -60% 0px', threshold: 0 });

  sections.forEach(function (s) { observer.observe(s); });
})();
