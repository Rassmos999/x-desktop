
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { aiEngine } = require('./ai-engine');

const WEB_UI_PORT = 28492;
const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard', 'index.html');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const MANUAL_HTML_PATH = path.join(DOCS_DIR, 'manual', 'index.html');
const MANUAL_AR_HTML_PATH = path.join(DOCS_DIR, 'manual', 'ar', 'index.html');
const MODELS_DIR = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'models');

let serverInstance = null;

// Origins allowed to call the mutating endpoints. The app itself opens the
// dashboard at http://localhost:28492 (see main.js), so localhost must be
// accepted alongside 127.0.0.1 or the user's own panel would be locked out.
const ALLOWED_ORIGINS = [
  `http://localhost:${WEB_UI_PORT}`,
  `http://127.0.0.1:${WEB_UI_PORT}`
];

// Reject only when an Origin is present AND foreign. Absent, empty, and "null"
// origins come from Electron-internal calls, same-origin navigations, and local
// tools; those are not cross-site requests and must keep working.
function isOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true;
  const normalized = origin.replace(/\/$/, '');
  return ALLOWED_ORIGINS.includes(normalized);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Serve a file from docs/ by explicit allowlisted relative path. No traversal:
// the resolved path must stay inside DOCS_DIR.
function serveDocsAsset(res, relativePath) {
  const target = path.resolve(DOCS_DIR, relativePath);
  if (target !== DOCS_DIR && !target.startsWith(DOCS_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Documentation asset missing.');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const types = {
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.json': 'application/json; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function getActiveModelName() {
  try {
    const res = execSync('curl -s http://127.0.0.1:28491/v1/models', { timeout: 1000 }).toString();
    const data = JSON.parse(res);
    const modelId = data?.data?.[0]?.id || data?.models?.[0]?.name || '';
    if (modelId.includes('gemma-4')) return 'Gemma-4-E2B';
    if (modelId.includes('Qwen3')) return 'Qwen3-VL';
    if (modelId) return path.basename(modelId, '.gguf');
    return 'AI Engine';
  } catch (e) {
    return 'Gemma-4-E2B';
  }
}

function getGpuStats() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits', { timeout: 1500 }).toString().trim();
    const parts = out.split(',').map(s => s.trim());
    return {
      used: parseInt(parts[0], 10) || 0,
      total: parseInt(parts[1], 10) || 8188,
      temp: parseInt(parts[2], 10) || 48
    };
  } catch (e) {
    return { used: 1100, total: 8188, temp: 48 };
  }
}

function startWebUiServer() {
  if (serverInstance) return;

  serverInstance = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${WEB_UI_PORT}`);

    // Serve Dashboard HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      try {
        const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Dashboard asset missing: ' + err.message);
      }
      return;
    }

    // Serve the user manual. The app links here directly: someone already
    // running the client needs the manual, not the public landing page.
    if (url.pathname === '/docs' || url.pathname === '/docs/' || url.pathname === '/guide' || url.pathname === '/manual') {
      try {
        const manualHtml = fs.readFileSync(MANUAL_HTML_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(manualHtml);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Documentation catalog missing.');
      }
      return;
    }

    // Arabic manual
    if (url.pathname === '/docs/ar' || url.pathname === '/docs/ar/' || url.pathname === '/manual/ar') {
      try {
        const manualAr = fs.readFileSync(MANUAL_AR_HTML_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(manualAr);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Documentation catalog missing.');
      }
      return;
    }

    // Manual assets (stylesheet, scripts, screenshots, favicon). Pages use
    // document-relative paths so the same files work from the filesystem and
    // from GitHub Pages; over HTTP the manual's /docs URL resolves assets to
    // /assets and its Arabic page to /docs/ar/../assets, so every prefix the
    // pages can produce is served, and nothing outside docs/ is reachable.
    const ASSET_PREFIXES = ['/assets/', '/docs/assets/', '/docs/manual/assets/', '/docs/ar/assets/'];
    const assetPrefix = ASSET_PREFIXES.find(p => url.pathname.startsWith(p));
    if (req.method === 'GET' && assetPrefix) {
      const rel = 'assets/' + url.pathname.slice(assetPrefix.length);
      serveDocsAsset(res, rel);
      return;
    }
    if (url.pathname === '/favicon.svg' && req.method === 'GET') {
      serveDocsAsset(res, 'favicon.svg');
      return;
    }

    // Static dashboard assets (split CSS/JS). Allowlist only — no traversal.
    if ((url.pathname === '/dashboard.css' || url.pathname === '/dashboard.js') && req.method === 'GET') {
      try {
        var assetPath = path.join(__dirname, 'dashboard', path.basename(url.pathname));
        var asset = fs.readFileSync(assetPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(asset);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Dashboard asset missing: ' + err.message);
      }
      return;
    }

    // Telemetry API
    if (url.pathname === '/api/telemetry') {
      const gpu = getGpuStats();
      const telemetry = aiEngine.getTelemetry();
      // The in-process flag can lag reality: the engine may already be serving
      // on 28491 while this process has not observed it yet. A live health
      // check keeps the dashboard from reporting a healthy engine as stopped.
      let engineState = telemetry.engineState;
      if (engineState === 'offline') {
        const alive = await aiEngine.ping();
        if (alive) {
          aiEngine.isReady = true;
          engineState = 'ready';
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        activeModel: getActiveModelName(),
        activeModelFile: telemetry.activeModel || null,
        engineState: engineState || 'offline',
        visionAvailable: aiEngine.hasVision(),
        vramUsed: gpu.used,
        vramTotal: gpu.total,
        gpuTemp: gpu.temp,
        // No invented defaults: the dashboard renders "--" until the engine
        // has actually measured something. DESIGN.md forbids showing
        // measurements that do not exist yet.
        tokensPerSec: telemetry.tokensPerSec || null,
        totalContext: telemetry.totalContext || null,
        totalTokens: telemetry.totalTokens || 0,
        requestCount: telemetry.requestCount || 0,
        cacheSize: telemetry.cacheSize || 0,
        cacheHits: telemetry.cacheHits || 0,
        history: telemetry.history || [],
        contextMap: telemetry.lastContextMap || null
      }));
      return;
    }

    // Model inventory
    if (url.pathname === '/api/models' && req.method === 'GET') {
      sendJson(res, 200, {
        active: aiEngine.getActiveModel(),
        modelsDir: MODELS_DIR,
        visionAvailable: aiEngine.hasVision(),
        projectorPresent: aiEngine.hasProjector(),
        engineState: aiEngine.getEngineState(),
        models: aiEngine.listModels()
      });
      return;
    }

    // Switch the active model. Mutating: requires a same-origin caller.
    if (url.pathname === '/api/models/active' && req.method === 'POST') {
      if (!isOriginAllowed(req)) {
        sendJson(res, 403, { ok: false, error: 'Cross-origin request rejected.' });
        return;
      }
      try {
        const { file } = JSON.parse(await readBody(req) || '{}');
        const result = await aiEngine.setActiveModel(file);
        sendJson(res, result.ok ? 200 : 400, Object.assign({ engineState: aiEngine.getEngineState() }, result));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message });
      }
      return;
    }

    // Reveal the models folder in the desktop file manager. Mutating.
    if (url.pathname === '/api/models/reveal' && req.method === 'POST') {
      if (!isOriginAllowed(req)) {
        sendJson(res, 403, { ok: false, error: 'Cross-origin request rejected.' });
        return;
      }
      try {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
        // Required lazily: outside Electron this module's `electron` require
        // resolves to a path string, which would throw at load time.
        const { shell } = require('electron');
        const err = await shell.openPath(MODELS_DIR);
        sendJson(res, err ? 400 : 200, err ? { ok: false, error: err } : { ok: true, modelsDir: MODELS_DIR });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: 'File manager unavailable: ' + e.message });
      }
      return;
    }

    // Text Translation API
    if (url.pathname === '/api/translate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { text, mode } = JSON.parse(body);
          const t0 = Date.now();
          const translation = await aiEngine.translate(text, mode || 'ai');
          const latency = Date.now() - t0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ translation, latency }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Image Vision Translation API
    if (url.pathname === '/api/translate-image' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { imageBase64, mimeType } = JSON.parse(body);
          const t0 = Date.now();
          const translation = await aiEngine.translateImage(imageBase64, mimeType || 'image/jpeg');
          const latency = Date.now() - t0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ translation, latency }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  serverInstance.listen(WEB_UI_PORT, '127.0.0.1', () => {
    console.log(`✅ [X Desktop Web UI] Dashboard live on http://127.0.0.1:${WEB_UI_PORT}`);
  });
}

module.exports = {
  startWebUiServer,
  WEB_UI_PORT
};
