/* X Desktop dashboard — Telemetry Wall behavior.
   Contract: GET /api/telemetry, POST /api/translate {text, mode}.
   Renders with textContent only (no innerHTML). Feed re-renders only
   when the history signature changes, so focus is never stolen. */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var POLL_MS = 2000;

  var els = {
    rail: $('rail'),
    railState: $('railState'),
    railModel: $('txtModelStatus'),
    clock: $('clock'),
    vram: $('valVram'), vramSub: $('subVram'),
    temp: $('valTemp'),
    speed: $('valSpeed'),
    tokens: $('valTokens'), reqs: $('subRequests'),
    cache: $('valCache'), cacheSub: $('subCache'),
    ctxUtil: $('contextUtilization'),
    barSys: $('barSystem'), barIn: $('barInput'),
    barOut: $('barOutput'), barFree: $('barFree'),
    routes: $('routeList'),
    feed: $('feedList'), feedCount: $('feedCount'),
    input: $('txtInput'), btnAi: $('btnTranslateAi'),
    btnFast: $('btnTranslateFast'), latency: $('lblLatency'),
    result: $('txtResult'), resultHint: $('resultHint')
  };

  var lastSig = '';
  var timer = null;

  function num(n, d) { return (n === undefined || n === null || isNaN(n)) ? '--' : n; }

  function setRail(state, label) {
    els.rail.setAttribute('data-state', state);
    els.railState.textContent = label;
  }

  function tickClock() {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    els.clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
      ' UTC' + (-d.getTimezoneOffset() / 60 >= 0 ? '+' : '') + (-d.getTimezoneOffset() / 60);
  }

  function tag(text, cls) {
    var s = document.createElement('span');
    s.className = 'pill ' + cls;
    s.textContent = text;
    return s;
  }

  function renderFeed(history) {
    var sig = history.map(function (it) { return (it.timestamp || '') + '|' + (it.engine || '') + '|' + (it.translated || '').slice(0, 40); }).join('\n');
    if (sig === lastSig) return;
    lastSig = sig;
    while (els.feed.firstChild) els.feed.removeChild(els.feed.firstChild);
    if (!history.length) {
      var empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'لا نشاط بعد — الترجمات من تطبيق X ستظهر هنا لحظياً.';
      els.feed.appendChild(empty);
      els.feedCount.textContent = 'فارغ';
      return;
    }
    var table = document.createElement('table');
    table.className = 'log';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['المحرك', 'الناتج', 'الوقت'].forEach(function (t) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = t;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement('tbody');
    history.forEach(function (item) {
      var tr = document.createElement('tr');
      var tdE = document.createElement('td');
      var isAi = (item.engine || '').indexOf('AI') !== -1;
      tdE.appendChild(tag(isAi ? 'AI' : 'FAST', isAi ? 'pill-ai' : 'pill-fast'));
      var tdT = document.createElement('td');
      tdT.textContent = item.translated || '';
      var tdM = document.createElement('td');
      tdM.className = 'tm ltr';
      tdM.textContent = (item.timestamp || '') + ' · ' + (item.tokens || 0) + 'tk';
      tr.appendChild(tdE); tr.appendChild(tdT); tr.appendChild(tdM);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    els.feed.appendChild(table);
    els.feedCount.textContent = history.length + ' عملية';
  }

  function setRoutes(routes) {
    while (els.routes.firstChild) els.routes.removeChild(els.routes.firstChild);
    routes.forEach(function (r) {
      var li = document.createElement('li');
      var code = document.createElement('code');
      code.className = 'ltr';
      code.textContent = r.path;
      var st = document.createElement('span');
      st.className = 'st ' + (r.state === 'ok' ? 'st-ok' : 'st-idle');
      st.textContent = r.label;
      li.appendChild(code); li.appendChild(st);
      els.routes.appendChild(li);
    });
  }

  function applyTelemetry(data) {
    setRail('ok', 'المحرك يعمل');
    if (data.activeModel) els.railModel.textContent = data.activeModel + ' · SLOT 0 · NOMINAL';

    els.vram.textContent = data.vramUsed === undefined ? '--' : data.vramUsed.toLocaleString('en-US');
    els.vramSub.textContent = '/ ' + (data.vramTotal || 8188) + ' MB';
    els.temp.textContent = num(data.gpuTemp);
    var tps = data.tokensPerSec || 0;
    els.speed.textContent = tps ? tps.toFixed(1) : '--';

    els.tokens.textContent = (data.totalTokens || 0).toLocaleString('en-US');
    els.reqs.textContent = '/ ' + (data.requestCount || 0);
    els.cache.textContent = num(data.cacheSize);
    els.cacheSub.textContent = '· ' + (data.cacheHits || 0) + ' hit';

    var total = data.totalContext || 8192;
    var cm = data.contextMap || {};
    var sys = cm.system || 85, inp = cm.input || 0, out = cm.output || 0;
    var used = sys + inp + out;
    var free = Math.max(0, total - used);
    var pct = function (v) { return ((v / total) * 100).toFixed(1) + '%'; };
    els.barSys.style.width = pct(sys);
    els.barSys.textContent = '';
    els.barSys.setAttribute('aria-label', 'تعليمات النظام: ' + sys + ' توكن');
    els.barIn.style.width = pct(inp);
    els.barIn.textContent = '';
    els.barIn.setAttribute('aria-label', 'نص الدخل: ' + inp + ' توكن');
    els.barOut.style.width = pct(out);
    els.barOut.textContent = '';
    els.barOut.setAttribute('aria-label', 'مساحة التوليد: ' + out + ' توكن');
    els.barFree.style.width = pct(free);
    els.barFree.textContent = '';
    $('tankLegend').textContent = 'SYS ' + sys + ' · IN ' + inp + ' · OUT ' + out;
    $('tankFree').textContent = 'شاغر ' + ((free / total) * 100).toFixed(1) + '%';
    els.ctxUtil.textContent = 'مستخدم ' + used.toLocaleString('en-US') + ' / ' + total.toLocaleString('en-US') +
      ' (' + ((used / total) * 100).toFixed(1) + '%)';

    setRoutes([
      { path: '/api/telemetry', state: 'ok', label: '200' },
      { path: '/api/translate', state: 'ok', label: '200' },
      { path: '/api/translate-image', state: 'idle', label: 'IDLE' }
    ]);

    if (Array.isArray(data.history)) renderFeed(data.history);
  }

  function applyOffline() {
    setRail('bad', 'انقطع الاتصال');
    els.railModel.textContent = 'لا رد من :28492 · OFFLINE';
    setRoutes([
      { path: '/api/telemetry', state: 'idle', label: 'لا اتصال' },
      { path: '/api/translate', state: 'idle', label: 'لا اتصال' },
      { path: '/api/translate-image', state: 'idle', label: 'لا اتصال' }
    ]);
  }

  function fetchTelemetry() {
    if (document.hidden) return;
    fetch('/api/telemetry').then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(applyTelemetry).catch(applyOffline);
  }

  function setBusy(busy, mode) {
    els.btnAi.disabled = busy;
    els.btnFast.disabled = busy;
    var btn = mode === 'ai' ? els.btnAi : els.btnFast;
    if (busy) {
      var sp = document.createElement('span');
      sp.className = 'spin';
      sp.setAttribute('aria-hidden', 'true');
      btn.prepend(sp);
    } else {
      var old = btn.querySelector('.spin');
      if (old) old.remove();
    }
  }

  function executeTranslation(mode) {
    var txt = els.input.value.trim();
    if (!txt) {
      els.result.textContent = 'الصق نصاً أولاً ثم اختر محرك الترجمة.';
      els.result.setAttribute('data-tone', 'error');
      els.input.focus();
      return;
    }
    els.result.removeAttribute('data-tone');
    els.result.textContent = 'جاري الترجمة…';
    els.latency.textContent = '';
    els.resultHint.textContent = '';
    setBusy(true, mode);
    var t0 = Date.now();
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt, mode: mode })
    }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (data) {
      var ms = Date.now() - t0;
      var text = (data.translation && typeof data.translation === 'object') ? data.translation.text : data.translation;
      els.result.textContent = text || 'تعذرت الترجمة — لا ناتج من المحرك.';
      if (!text) els.result.setAttribute('data-tone', 'error');
      els.result.setAttribute('data-fresh', 'true');
      setTimeout(function () { els.result.removeAttribute('data-fresh'); }, 600);
      els.latency.textContent = 'زمن الاستجابة: ' + ms + 'ms';
      fetchTelemetry();
    }).catch(function () {
      els.result.textContent = 'خطأ في الاتصال بالمحرك المحلي.';
      els.result.setAttribute('data-tone', 'error');
      els.resultHint.textContent = 'تحقق أن llama-server يعمل على :28491 ثم أعد المحاولة.';
    }).then(function () { setBusy(false, mode); });
  }

  els.btnAi.addEventListener('click', function () { executeTranslation('ai'); });
  els.btnFast.addEventListener('click', function () { executeTranslation('auto'); });

  // Example text is pre-selected on first focus so typing replaces it at once.
  var edited = false;
  els.input.addEventListener('input', function () { edited = true; });
  els.input.addEventListener('focus', function () {
    if (!edited) els.input.select();
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) fetchTelemetry();
  });

  tickClock();
  setInterval(tickClock, 1000);
  fetchTelemetry();
  timer = setInterval(fetchTelemetry, POLL_MS);
})();
