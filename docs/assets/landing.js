/* Landing page enhancement. Everything here is optional: with scripting off,
   the page is complete and every download link still resolves. */
(function () {
  'use strict';

  // Mark the row matching the visitor's platform so the likely choice reads
  // first, without hiding the others or reordering the document.
  var uaAll = (navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || '') +
    ' ' + navigator.userAgent;
  var platform = null;

  if (/arch/i.test(uaAll)) platform = 'arch';
  else if (/debian|ubuntu|linux/i.test(uaAll)) platform = 'debian';
  else if (/win/i.test(uaAll)) platform = 'windows';

  // Any text this script writes comes from the page's own markup, so an
  // Arabic page stays Arabic. Nothing here is a hardcoded English string.
  var note = document.getElementById('dlNote');
  var match = platform ? document.querySelector('.dl[data-platform="' + platform + '"]') : null;

  if (match) {
    match.setAttribute('data-primary', 'true');
    var sz = match.querySelector('.sz');
    if (sz) sz.textContent = (sz.getAttribute('data-prefix') || '') + sz.textContent;
    if (note) note.textContent = note.getAttribute('data-detected') || note.textContent;
  }
})();
