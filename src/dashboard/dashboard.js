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
    result: $('txtResult'), resultHint: $('resultHint'),
    modelSelect: $('modelSelect'), btnSwitch: $('btnSwitchModel'),
    btnReveal: $('btnRevealModels'), modelsState: $('modelsState'),
    modelsStateText: $('modelsStateText'), modelsCount: $('modelsCount'),
    modelsDir: $('modelsDir'), modelHint: $('modelHint'), modelLatency: $('modelLatency')
  };

  var lastSig = '';
  var timer = null;
  var lastEngineState = null;
  // True from the moment a switch is submitted until it resolves. Polling must
  // not report a disconnection while the engine is deliberately restarting.
  var switching = false;

  function num(n, d) { return (n === undefined || n === null || isNaN(n)) ? '--' : n; }

  function setRail(state, label) {
    els.rail.setAttribute('data-state', state);
    els.railState.textContent = label;
  }

  function setModelState(tone, text, busy) {
    els.modelsState.setAttribute('data-tone', tone);
    els.modelsStateText.textContent = text;
    var old = els.modelsState.querySelector('.spin');
    if (old) old.remove();
    if (busy) {
      var sp = document.createElement('span');
      sp.className = 'spin';
      sp.setAttribute('aria-hidden', 'true');
      els.modelsState.insertBefore(sp, els.modelsStateText);
    }
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
    // A known switch outranks telemetry: the engine is up but not yet serving
    // the new model, which is a working state, not a fault.
    var state = data.engineState || (data.isReady === false ? 'offline' : 'ready');
    if (switching || state === 'switching' || state === 'starting') {
      setRail('warn', 'جارٍ تبديل الموديل');
      els.railModel.textContent = (data.activeModelFile || data.activeModel || '—') + ' · ' +
        (state === 'switching' ? 'SWITCHING' : 'LOADING');
    } else if (state === 'ready') {
      setRail('ok', 'المحرك يعمل');
      if (data.activeModel) els.railModel.textContent = data.activeModel + ' · SLOT 0 · NOMINAL';
    } else {
      setRail('warn', 'المحرك متوقف');
      els.railModel.textContent = (data.activeModel || 'لا موديل') + ' · OFFLINE';
    }
    // Model-panel status follows the engine only when that state actually
    // changes, so it never overwrites a fresh switch result with chatter.
    if (!switching && state !== lastEngineState) {
      lastEngineState = state;
      if (state === 'ready') setModelState('ok', 'المحرك يخدم الموديل المحدد الآن.', false);
      else setModelState('warn', 'المحرك متوقف — لن يكتمل التبديل حتى يعمل المحرك.', false);
    }

    els.vram.textContent = data.vramUsed === undefined ? '--' : data.vramUsed.toLocaleString('en-US');
    els.vramSub.textContent = '/ ' + (data.vramTotal || 8188) + ' MB';
    els.temp.textContent = num(data.gpuTemp);
    var tps = data.tokensPerSec;
    els.speed.textContent = (typeof tps === 'number' && tps > 0) ? tps.toFixed(1) : '--';

    els.tokens.textContent = (data.totalTokens || 0).toLocaleString('en-US');
    els.reqs.textContent = '/ ' + (data.requestCount || 0);
    els.cache.textContent = num(data.cacheSize);
    els.cacheSub.textContent = '· ' + (data.cacheHits || 0) + ' hit';

    // Unmeasured means unmeasured: show "--" and an inert bar instead of a
    // plausible-looking number.
    var total = data.totalContext;
    var cm = data.contextMap;
    if (!total || !cm) {
      els.barSys.style.width = '0%';
      els.barIn.style.width = '0%';
      els.barOut.style.width = '0%';
      els.barFree.style.width = '100%';
      $('tankLegend').textContent = 'SYS — · IN — · OUT —';
      $('tankFree').textContent = 'شاغر —';
      els.ctxUtil.textContent = 'لم تُقس بعد — شغّل ترجمة لعرض التخصيص.';
      setRoutes([
        { path: '/api/telemetry', state: 'ok', label: '200' },
        { path: '/api/translate', state: 'ok', label: '200' },
        { path: '/api/translate-image', state: 'warn', label: 'IDLE' }
      ]);
      if (Array.isArray(data.history)) renderFeed(data.history);
      return;
    }
    var sys = cm.system || 0, inp = cm.input || 0, out = cm.output || 0;
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
    // During a deliberate switch the engine is expected to be unreachable for a
    // few seconds (VRAM release + weight load). Report that honestly instead of
    // claiming the connection dropped.
    if (switching) {
      setRail('warn', 'جارٍ تبديل الموديل');
      els.railModel.textContent = 'إعادة توزيع الذاكرة · LOADING';
      return;
    }
    setRail('bad', 'انقطع الاتصال');
    els.railModel.textContent = 'لا رد من :28492 · OFFLINE';
    setModelState('bad', 'لا رد من لوحة التحكم على المنفذ 28492.', false);
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

  // --- Model panel ---------------------------------------------------------

  function loadModels() {
    return fetch('/api/models')
      .then(function (res) { if (!res.ok) throw new Error('http ' + res.status); return res.json(); })
      .then(function (data) {
        els.modelsDir.textContent = data.modelsDir || '—';
        while (els.modelSelect.firstChild) els.modelSelect.removeChild(els.modelSelect.firstChild);

        if (!data.models || !data.models.length) {
          var none = document.createElement('option');
          none.value = '';
          none.textContent = 'لا موديلات';
          els.modelSelect.appendChild(none);
          els.modelSelect.disabled = true;
          els.btnSwitch.disabled = true;
          els.modelsCount.textContent = '0';
          setModelState('warn', 'لم يُعثر على أي ملف GGUF في مجلد الموديلات.', false);
          els.modelHint.textContent = 'نزّل ملف موديل إلى المجلد أعلاه ثم حدّث الصفحة.';
          return;
        }

        data.models.forEach(function (m) {
          var opt = document.createElement('option');
          opt.value = m.file;
          var gb = (m.size / (1024 * 1024 * 1024)).toFixed(2);
          opt.textContent = m.file + '  ·  ' + gb + ' GB' + (m.vision ? '  ·  VISION' : '');
          opt.selected = !!m.active;
          els.modelSelect.appendChild(opt);
        });

        els.modelsCount.textContent = data.models.length + ' MODELS';
        els.modelSelect.disabled = false;
        els.btnSwitch.disabled = false;
        els.modelHint.textContent = data.visionAvailable
          ? 'الموديل البصري مفعّل: ترجمة النصوص داخل الصور متاحة.'
          : 'ترجمة نصوص الصور غير مفعّلة — تتطلب موديلاً بصرياً وملف الإسقاط البصري معاً.';
        if (!switching && lastEngineState === null) {
          setModelState('idle', 'جاهز — اختر موديلاً ثم اضغط تبديل الموديل.', false);
        }
      })
      .catch(function () {
        els.modelsDir.textContent = '—';
        setModelState('bad', 'تعذّر قراءة قائمة الموديلات من اللوحة.', false);
      });
  }

  els.btnSwitch.addEventListener('click', function () {
    var file = els.modelSelect.value;
    if (!file || switching) return;

    var previous = null;
    for (var i = 0; i < els.modelSelect.options.length; i++) {
      if (els.modelSelect.options[i].selected) previous = els.modelSelect.options[i].value;
    }

    switching = true;
    var t0 = Date.now();
    els.modelSelect.disabled = true;
    els.btnSwitch.disabled = true;
    els.modelLatency.textContent = '';
    setModelState('warn', 'جارٍ تبديل الموديل وتفريغ الذاكرة…', true);
    setRail('warn', 'جارٍ تبديل الموديل');
    els.railModel.textContent = file + ' · SWITCHING';

    fetch('/api/models/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file })
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (r) {
      switching = false;
      var ms = Date.now() - t0;
      if (r.ok && r.body.ok) {
        setModelState('ok', 'تم تحميل الموديل المحدد على كرت الرسوم.', false);
        lastEngineState = 'ready';
        setRail('ok', 'المحرك يعمل');
        els.modelLatency.textContent = 'زمن التبديل: ' + (ms / 1000).toFixed(1) + 's';
        els.railModel.textContent = (r.body.activeModel || file) + ' · SLOT 0 · NOMINAL';
      } else {
        setModelState('bad', 'فشل تبديل الموديل: ' + (r.body.error || 'خطأ غير معروف.'), false);
        lastEngineState = null;
        els.modelHint.textContent = 'لم يتغيّر الموديل النشط. أعد المحاولة أو افتح المجلد للتحقق من الملف.';
        if (previous) els.modelSelect.value = previous;
      }
    }).catch(function () {
      switching = false;
      setModelState('bad', 'تعذّر الوصول إلى اللوحة أثناء التبديل.', false);
      if (previous) els.modelSelect.value = previous;
    }).then(function () {
      els.modelSelect.disabled = false;
      els.btnSwitch.disabled = false;
      loadModels();
      fetchTelemetry();
    });
  });

  els.btnReveal.addEventListener('click', function () {
    fetch('/api/models/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (res) { return res.json(); })
      .then(function (r) {
        if (r && r.ok) setModelState('ok', 'تم فتح مجلد الموديلات في مدير الملفات.', false);
        else setModelState('bad', (r && r.error) || 'تعذّر فتح المجلد.', false);
      })
      .catch(function () { setModelState('bad', 'تعذّر فتح المجلد.', false); });
  });

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
  loadModels();
  timer = setInterval(fetchTelemetry, POLL_MS);
})();
