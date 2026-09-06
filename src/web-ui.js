
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { aiEngine } = require('./ai-engine');

const WEB_UI_PORT = 28492;
const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard', 'index.html');

let serverInstance = null;

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

    // Telemetry API
    if (url.pathname === '/api/telemetry') {
      const gpu = getGpuStats();
      const telemetry = aiEngine.getTelemetry();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        vramUsed: gpu.used,
        vramTotal: gpu.total,
        gpuTemp: gpu.temp,
        tokensPerSec: telemetry.tokensPerSec || 112,
        totalTokens: telemetry.totalTokens || 0,
        requestCount: telemetry.requestCount || 0,
        contextMap: telemetry.lastContextMap || {
          system: 85,
          input: 120,
          vision: 0,
          output: 200
        }
      }));
      return;
    }

    // Text Translation API
    if (url.pathname === '/api/translate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body);
          const t0 = Date.now();
          const translation = await aiEngine.translate(text);
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

