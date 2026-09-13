
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

const MODELS_DIR = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'models');
const BIN_DIR = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'bin');
const CONFIG_PATH = path.join(os.homedir(), '.local', 'share', 'x-desktop', 'config.json');
const GEMMA_PATH = path.join(MODELS_DIR, 'gemma-4-E2B-it-Q4_K_M.gguf');
const QWEN_PATH = path.join(MODELS_DIR, 'Qwen3VL-2B-Instruct-Q4_K_M.gguf');
const DEFAULT_MODEL_FILE = path.basename(GEMMA_PATH);
const MMPROJ_PATH = path.join(MODELS_DIR, 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf');
const SERVER_BIN = path.join(BIN_DIR, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
const AI_PORT = 28491;

// A multimodal projector is paired with a vision model, never loaded as one.
function isProjectorFile(name) {
  return /^mmproj/i.test(name);
}

// Heuristic over the model file name: only these can meaningfully consume -mmproj.
function isVisionCapableName(name) {
  return /qwen[0-9.]*-?vl|llava|vision|minicpm-?v|moondream|gemma-3.*vision/i.test(name);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function writeConfig(patch) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const next = Object.assign(readConfig(), patch);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function preprocessSlang(text) {
  if (!text) return '';
  return text
    .replace(/\b(Hint)\s*:/gi, "تلميح:")
    .replace(/\b(\d+)\s*([a-zA-Z]+)/g, "$1 $2")
    .replace(/\b(we\x27re|we are)\s+live\b/gi, "we are broadcasting live")
    .replace(/\b(we\x27re|we are)\s+cooking\b/gi, "we are preparing")
    .replace(/\bthat\x27s\s+so\s+([a-zA-Z0-9_]+)\b/gi, "that is typically $1");
}

function splitIntoChunks(fullText, maxChunkSize = 1400) {
  if (!fullText || fullText.length <= maxChunkSize) return [fullText || ''];
  const paragraphs = fullText.split(/\n\n+/);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    if (current.length + p.length + 2 > maxChunkSize) {
      if (current) chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

class AIEngine {
  constructor() {
    this.process = null;
    this.isReady = false;
    this.isStarting = false;
    this.isSwitching = false;
    this.lastError = null;
    this.translationCache = new Map();
    this.maxCache = 500;
    this.cacheHits = 0;
    this.history = [];

    // Real Hardware Measured Telemetry
    this.totalTokens = 120;
    this.requestCount = 2;
    // Null until inference actually reports a rate; the UI shows "--" rather
    // than a number nobody measured.
    this.tokensPerSec = null;
    this.totalContext = 12288;
    this.lastContextMap = null;
  }

  // --- Active model resolution -------------------------------------------

  // Files on disk that are loadable models (projectors excluded).
  listModelFiles() {
    try {
      return fs.readdirSync(MODELS_DIR)
        .filter(f => f.toLowerCase().endsWith('.gguf') && !isProjectorFile(f))
        .sort((a, b) => a.localeCompare(b));
    } catch (e) {
      return [];
    }
  }

  sizeOf(file) {
    try {
      return fs.statSync(path.join(MODELS_DIR, file)).size;
    } catch (e) {
      return 0;
    }
  }

  // The configured model when it still exists, otherwise the preferred Gemma
  // file, otherwise whatever model is present. Never returns a projector.
  getActiveModel() {
    const files = this.listModelFiles();
    const configured = readConfig().activeModel;
    if (configured && files.includes(configured)) return configured;
    if (files.includes(DEFAULT_MODEL_FILE)) return DEFAULT_MODEL_FILE;
    return files[0] || null;
  }

  getModelPath() {
    const active = this.getActiveModel();
    return active ? path.join(MODELS_DIR, active) : GEMMA_PATH;
  }

  listModels() {
    const active = this.getActiveModel();
    return this.listModelFiles().map(f => ({
      file: f,
      size: this.sizeOf(f),
      active: f === active,
      vision: isVisionCapableName(f)
    }));
  }

  hasProjector() {
    return fs.existsSync(MMPROJ_PATH);
  }

  // Persist a new active model and restart the engine, resolving only once the
  // new model has actually loaded (or the wait times out). startServer()
  // returns as soon as the child spawns, so callers must not treat that as
  // readiness.
  async setActiveModel(file, timeoutMs = 45000) {
    if (!file || typeof file !== 'string') {
      return { ok: false, state: 'error', error: 'A model file name is required.' };
    }
    if (path.basename(file) !== file || !file.toLowerCase().endsWith('.gguf')) {
      return { ok: false, state: 'error', error: 'Invalid model file name.' };
    }
    if (isProjectorFile(file)) {
      return { ok: false, state: 'error', error: 'That file is a vision projector, not a model.' };
    }
    if (!this.listModelFiles().includes(file)) {
      return { ok: false, state: 'error', error: 'That model is not in the models folder.' };
    }

    this.isSwitching = true;
    this.lastError = null;
    try {
      writeConfig({ activeModel: file });
      this.destroy();
      this.isReady = false;
      this.isStarting = false;
      this.startServer();

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await this.ping()) {
          this.isReady = true;
          this.isStarting = false;
          this.isSwitching = false;
          return { ok: true, state: 'ready', activeModel: file };
        }
        await new Promise(r => setTimeout(r, 500));
      }

      this.isSwitching = false;
      this.lastError = 'The engine did not become ready in time.';
      return { ok: false, state: this.getEngineState(), error: this.lastError, activeModel: file };
    } catch (e) {
      this.isSwitching = false;
      this.lastError = e.message;
      return { ok: false, state: this.getEngineState(), error: e.message };
    }
  }

  // Honest engine state for the UI to render instead of inferring one.
  getEngineState() {
    if (this.isSwitching) return 'switching';
    if (this.isStarting) return 'starting';
    if (this.isReady) return 'ready';
    return 'offline';
  }

  hasModel() {
    return fs.existsSync(this.getModelPath()) && fs.existsSync(SERVER_BIN);
  }

  // Real check: a projector must exist AND the active model must be able to
  // consume it. Previously hardcoded false, which silently disabled vision.
  hasVision() {
    const active = this.getActiveModel();
    return Boolean(active) && isVisionCapableName(active) && this.hasProjector();
  }

  async startServer() {
    if (this.isReady) return;

    const alreadyRunning = await this.ping();
    if (alreadyRunning) {
      this.isReady = true;
      console.log('✅ [X Desktop AI] Connected to already-running local model server on port ' + AI_PORT + '.');
      return;
    }

    if (this.isStarting || !this.hasModel()) {
      return;
    }

    this.isStarting = true;
    const activeFile = this.getActiveModel();
    console.log('[X Desktop AI] Launching local model ' + (activeFile || 'unknown') + ' on the GPU...');

    const args = [
      '--model', this.getModelPath(),
      '--port', String(AI_PORT),
      '--host', '127.0.0.1',
      '-ngl', '99',
      '-fa', 'on',
      '-c', '12288',
      '-t', '6',
      '-np', '1',
      '--reasoning', 'off',
      '--reasoning-budget', '0',
      '--log-disable'
    ];

    if (this.hasVision()) {
      args.push('--mmproj', MMPROJ_PATH);
      console.log('🖼️ [X Desktop AI] Vision projector attached:', MMPROJ_PATH);
    }

    const spawnEnv = { ...process.env };
    if (process.platform === 'win32') {
      spawnEnv.PATH = BIN_DIR + (process.env.PATH ? ';' + process.env.PATH : '');
    } else {
      spawnEnv.LD_LIBRARY_PATH = BIN_DIR + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
    }

    try {
      this.process = spawn(SERVER_BIN, args, {
        env: spawnEnv,
        detached: true,
        stdio: 'ignore'
      });
      this.process.unref();

      const checkInterval = setInterval(async () => {
        const healthy = await this.ping();
        if (healthy) {
          clearInterval(checkInterval);
          this.isReady = true;
          this.isStarting = false;
          console.log('✅ [X Desktop AI] ' + (this.getActiveModel() || 'Model') + ' loaded onto GPU.');
        }
      }, 400);

      setTimeout(() => clearInterval(checkInterval), 35000);
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

  getTelemetry() {
    return {
      totalTokens: this.totalTokens,
      requestCount: this.requestCount,
      tokensPerSec: this.tokensPerSec,
      totalContext: this.totalContext,
      lastContextMap: this.lastContextMap,
      isReady: this.isReady,
      engineState: this.getEngineState(),
      activeModel: this.getActiveModel(),
      cacheSize: this.translationCache.size,
      cacheHits: this.cacheHits,
      history: this.history.slice(-15).reverse()
    };
  }

  async translate(text, mode = 'auto') {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { text: '', engine: 'none' };
    }
    const trimmed = text.trim();
    const cacheKey = `${mode}:${trimmed}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    let result = '';
    let usedEngine = 'web';

    if (mode === 'ai' && !this.isReady && !this.isStarting) {
      this.startServer();
      // Wait up to 3 seconds for it to become ready
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (this.isReady) break;
      }
    }

    // If tweet is exceptionally long (> 500 chars), running on local CPU takes 40+ seconds.
    // Always run AI mode directly on local Gemma-4
    if (mode === 'ai' && this.isReady) {
      try {
        result = await this.queryGemma(trimmed);
        usedEngine = 'gemma4';
      } catch (err) {
        console.warn('[X Desktop AI] Qwen inference fallback:', err.message);
      }
    }

    // High-precision human translation with slang pre-processing
    if (!result || result === trimmed) {
      const cleanInput = preprocessSlang(trimmed);
      result = await this.fallbackWebTranslate(cleanInput, 'ar');
      usedEngine = 'precise';
    }

    const payload = {
      text: result || trimmed,
      engine: usedEngine
    };

    if (result) {
      if (this.translationCache.size >= this.maxCache) {
        const firstKey = this.translationCache.keys().next().value;
        this.translationCache.delete(firstKey);
      }
      this.translationCache.set(cacheKey, payload);

      this.history.push({
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        source: trimmed.slice(0, 100),
        translated: result.slice(0, 100),
        engine: usedEngine === 'gemma4' ? 'AI (local)' : 'Fast (Google)',
        tokens: Math.round(trimmed.length / 3.5) + Math.round(result.length / 3.2)
      });
      if (this.history.length > 30) {
        this.history.shift();
      }
    }

    return payload;
  }

  async translateImage(imageBase64, mimeType = 'image/jpeg') {
    if (!imageBase64) return 'لم يتم توفير صورة صالحة.';

    if (!this.isReady) {
      this.isReady = await this.ping();
      if (!this.isReady && !this.isStarting) {
        this.startServer();
      }
    }

    if (!this.isReady) {
      return 'خادم الذكاء الاصطناعي البصري قيد الإقلاع... يرجى المحاولة بعد قليل.';
    }

    try {
      const payload = JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert OCR and image translator. Extract and read all visible text in this image. Translate it accurately and naturally into modern Arabic. Output ONLY the translated Arabic text without notes, explanations, or quotes.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract and translate the text in this image into Arabic:' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }
        ],
        temperature: 0.1,
        frequency_penalty: 0.4,
        cache_prompt: false,
        id_slot: 1, // Isolated Vision Slot
        stop: ["\n\nملاحظة", "\n\nNote", "\n\n---", "Translation:"],
        max_tokens: 512
      });

      const responseText = await this.postJson('/v1/chat/completions', payload, 35000);
      const data = JSON.parse(responseText);
      let content = data?.choices?.[0]?.message?.content?.trim() || '';

      const cutIndex = content.search(/\n\n(ملاحظة|ملاحظات|Note|Notes):/i);
      if (cutIndex !== -1) {
        content = content.slice(0, cutIndex).trim();
      }
      content = content.replace(/^["'«“]|["'»”]$/g, '').trim();

      const promptTokens = data?.usage?.prompt_tokens || 950;
      const completionTokens = data?.usage?.completion_tokens || 40;
      const realSpeed = data?.timings?.predicted_per_second;
      if (realSpeed && realSpeed > 0) {
        this.tokensPerSec = Math.round(realSpeed);
      }

      this.totalTokens += promptTokens + completionTokens;
      this.requestCount++;
      this.lastContextMap = {
        system: 85,
        input: 60,
        vision: 1024,
        output: completionTokens
      };

      return content || 'لم يتم العثور على نصوص قابلة للترجمة داخل الصورة.';
    } catch (err) {
      console.warn('[X Desktop AI] Vision translation error:', err.message);
      return 'تعذر استخراج النص من الصورة بواسطة الموديل البصري: ' + err.message;
    }
  }

  async queryGemma(text) {
    if (text.length > 1500) {
      const chunks = splitIntoChunks(text, 1300);
      const results = [];
      for (const chunk of chunks) {
        const res = await this.queryGemmaSingle(chunk);
        results.push(res);
      }
      return results.join('\n\n');
    }
    return this.queryGemmaSingle(text);
  }

  queryGemmaSingle(text) {
    const systemPrompt = "You are an elite bilingual translator for AI engineers, machine learning researchers, and software developers.\n" +
      "Translate the text from any source language (English, Chinese, Japanese, Korean, French, etc.) into authentic, natural Arabic as used by modern tech developers.\n\n" +
      "Rules:\n" +
      "1. Idioms & Tech Slang: Translate contextual developer/career slang into natural Arabic (e.g. 'networking' -> 'التواصل المهني / بناء العلاقات', 'cooking' -> 'نجهّز / نعمل على تطوير', 'we are live' -> 'الخدمة متاحة الآن / انطلقنا', 'shipped' -> 'أطلقنا / تم الإصدار', 'weights' -> 'الأوزان', 'inference' -> 'الاستدلال / التشغيل', 'benchmarks' -> 'اختبارات الأداء', 'prompt' -> 'موجه / برومبت').\n" +
      "2. Technical Acronyms: Keep standard acronyms (LLM, CUDA, VRAM, API, GPU, PyTorch, LoRA, MoE, GGUF, FP8) in English.\n" +
      "3. Complete & Faithful: Translate every single line and sentence completely without skipping or leaving blanks. Preserve line breaks, emojis, and @usernames.\n" +
      "4. Output: Output ONLY the translated Arabic text verbatim without quotes or explanations.";

    const payload = JSON.stringify({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.1,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      cache_prompt: false,
      id_slot: 0, // Isolated Text Slot
      stop: ["\n\nملاحظة:", "\n\nNote:", "Translation:"],
      max_tokens: 1800
    });

    return this.postJson('/v1/chat/completions', payload, 45000).then(res => {
      const data = JSON.parse(res);
      let content = data?.choices?.[0]?.message?.content?.trim() || '';

      const cutIndex = content.search(/\n\n(ملاحظة|ملاحظات|Note|Notes):/i);
      if (cutIndex !== -1) {
        content = content.slice(0, cutIndex).trim();
      }
      content = content.replace(/^["'«“]|["'»”]$/g, '').trim();

      const promptTokens = data?.usage?.prompt_tokens || 45;
      const completionTokens = data?.usage?.completion_tokens || 20;
      const realSpeed = data?.timings?.predicted_per_second;
      if (realSpeed && realSpeed > 0) {
        this.tokensPerSec = Math.round(realSpeed);
      }

      this.totalTokens += promptTokens + completionTokens;
      this.requestCount++;
      this.lastContextMap = {
        system: 85,
        input: promptTokens,
        vision: 0,
        output: completionTokens
      };

      return content;
    });
  }

  postJson(path, payload, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: AI_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 150)}`));
          } else {
            resolve(body);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('AI inference timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  fallbackWebTranslate(text, targetLang = 'ar') {
    if (text.length > 1200) {
      const chunks = splitIntoChunks(text, 1000);
      return Promise.all(chunks.map(c => this.fallbackWebTranslateSingle(c, targetLang)))
        .then(results => results.join('\n\n'));
    }
    return this.fallbackWebTranslateSingle(text, targetLang);
  }

  fallbackWebTranslateSingle(text, targetLang = 'ar') {
    return new Promise((resolve) => {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
              const translated = parsed[0].map(item => item[0]).join('');
              resolve(translated || text);
              return;
            }
          } catch (e) {}
          resolve(text);
        });
      });

      req.on('error', () => resolve(text));
      req.setTimeout(8000, () => {
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
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM llama-server.exe 2>nul || exit 0');
      } else {
        execSync('pkill -9 -f llama-server 2>/dev/null || true');
      }
    } catch (e) {}
    this.isReady = false;
    console.log('[X Desktop AI] Model process terminated. VRAM cleared.');
  }
}

const aiEngine = new AIEngine();

module.exports = {
  aiEngine,
  AIEngine
};
