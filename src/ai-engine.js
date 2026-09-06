
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

const MODELS_DIR = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'models');
const BIN_DIR = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'bin');
const MODEL_PATH = path.join(MODELS_DIR, 'Qwen3VL-2B-Instruct-Q4_K_M.gguf');
const SERVER_BIN = path.join(BIN_DIR, 'llama-server');
const AI_PORT = 28491;

class AIEngine {
  constructor() {
    this.process = null;
    this.isReady = false;
    this.isStarting = false;
    this.translationCache = new Map();
    this.maxCache = 500;
  }

  hasModel() {
    return fs.existsSync(MODEL_PATH) && fs.existsSync(SERVER_BIN);
  }

  async startServer() {
    if (this.isReady) return;

    // Check if server is already running on port 28491
    const alreadyRunning = await this.ping();
    if (alreadyRunning) {
      this.isReady = true;
      console.log('✅ [X Desktop AI] Connected to running Qwen3 AI server on RTX 4060 GPU.');
      return;
    }

    if (this.isStarting || !this.hasModel()) {
      return;
    }

    this.isStarting = true;
    console.log('[X Desktop AI] Launching local Qwen3-VL-2B inference server on RTX 4060 GPU...');

    const args = [
      '--model', MODEL_PATH,
      '--port', String(AI_PORT),
      '--host', '127.0.0.1',
      '-ngl', '99',
      '-c', '2048',
      '--log-disable'
    ];

    try {
      this.process = spawn(SERVER_BIN, args, {
        env: { ...process.env, LD_LIBRARY_PATH: BIN_DIR + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') },
        detached: true,
        stdio: 'ignore'
      });
      this.process.unref();

      // Poll until ready
      const checkInterval = setInterval(async () => {
        const healthy = await this.ping();
        if (healthy) {
          clearInterval(checkInterval);
          this.isReady = true;
          this.isStarting = false;
          console.log('✅ [X Desktop AI] Qwen3-VL-2B loaded onto GPU. Ready for intelligent translation.');
        }
      }, 400);

      setTimeout(() => clearInterval(checkInterval), 30000);
    } catch (e) {
      console.warn('[X Desktop AI] Start server exception:', e.message);
      this.isStarting = false;
    }
  }

  ping() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${AI_PORT}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => { req.destroy(); resolve(false); });
    });
  }

  async translate(text, targetLang = 'ar') {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return '';
    }
    const trimmed = text.trim();
    const cacheKey = `${targetLang}:${trimmed}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    let result = '';

    // Check if AI server is reachable or start it
    if (!this.isReady) {
      this.isReady = await this.ping();
      if (!this.isReady && !this.isStarting) {
        this.startServer();
      }
    }

    // 1. Try local Qwen3 AI model if server is ready
    if (this.isReady) {
      try {
        result = await this.queryQwen(trimmed);
      } catch (err) {
        console.warn('[X Desktop AI] Qwen inference notice:', err.message);
      }
    }

    // 2. Fallback to web translation if AI is starting or model not ready
    if (!result || result === trimmed) {
      result = await this.fallbackWebTranslate(trimmed, targetLang);
    }

    if (result) {
      if (this.translationCache.size >= this.maxCache) {
        const firstKey = this.translationCache.keys().next().value;
        this.translationCache.delete(firstKey);
      }
      this.translationCache.set(cacheKey, result);
    }

    return result || trimmed;
  }

  queryQwen(text) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        messages: [
          {
            role: 'system',
            content: "You are an expert bilingual social media translator. Translate the given text from English to punchy, natural, modern Arabic. Accurately translate internet slang, idioms, and colloquialisms (e.g. 'Annnnnnd we\'re live!' -> 'وأخيراً بدأ البث المباشر!', 'Rank is won, never bought' -> 'المكانة تُكتسب ولا تُشترى'). Preserve all @mentions, #hashtags, and URLs verbatim. Output ONLY the translated Arabic text without quotes, explanation, or preamble."
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.2,
        max_tokens: 512
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: AI_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const content = data?.choices?.[0]?.message?.content?.trim() || '';
            resolve(content);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('AI inference timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  fallbackWebTranslate(text, targetLang = 'ar') {
    return new Promise((resolve) => {
      const url = `https://translate.google.com/m?sl=auto&tl=${targetLang}&q=${encodeURIComponent(text)}`;
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const match = data.match(/<div class="result-container">([^<]+)<\/div>/);
          if (match && match[1]) {
            let translated = match[1]
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
            resolve(translated);
          } else {
            resolve(text);
          }
        });
      });

      req.on('error', () => resolve(text));
      req.setTimeout(4500, () => {
        req.destroy();
        resolve(text);
      });
    });
  }

  destroy() {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (e) {}
      this.process = null;
    }
  }
}

const aiEngine = new AIEngine();

module.exports = {
  aiEngine,
  AIEngine
};

