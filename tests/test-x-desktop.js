const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Running X Desktop Client Comprehensive Tests...');

const ROOT = path.join(__dirname, '..');

// 1. Check Package Config
console.log('👉 [1/11] Checking package.json...');
const pkg = require(path.join(ROOT, 'package.json'));
assert.strictEqual(pkg.name, 'x-desktop');
assert.strictEqual(pkg.main, 'src/main.js');
assert(pkg.dependencies['mpris-service'], 'mpris-service dependency must exist');
console.log('   ✅ Package metadata verified.');

// 2. Check File & Asset Integrity
console.log('👉 [2/11] Checking icons and desktop data...');
const dataDir = path.join(ROOT, 'data');
assert(fs.existsSync(path.join(dataDir, 'x-desktop.desktop')), 'Desktop file must exist');
assert(fs.existsSync(path.join(dataDir, 'x-desktop.svg')), 'SVG vector icon must exist');
assert(fs.existsSync(path.join(dataDir, 'x-desktop.png')), 'PNG icon must exist');
assert(fs.existsSync(path.join(dataDir, 'x-tray.png')), 'Tray icon must exist');
assert(fs.existsSync(path.join(dataDir, 'hyprland-rules.conf')), 'Hyprland rules must exist');
assert(fs.existsSync(path.join(dataDir, 'niri-rules.kdl')), 'Niri rules must exist');

const iconSizes = [16, 22, 24, 32, 48, 64, 128, 256, 512];
for (const size of iconSizes) {
  const p = path.join(dataDir, 'icons', 'hicolor', `${size}x${size}`, 'apps', 'x-desktop.png');
  assert(fs.existsSync(p), `Icon ${size}x${size} must exist`);
}
console.log('   ✅ All icons and system assets present.');

// 3. Check Preload and Translation Features
console.log('👉 [3/11] Checking Preload and Translation Features...');
const preloadCode = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
assert(preloadCode.includes("injectTranslateButtons"), "injectTranslateButtons must exist");
assert(preloadCode.includes('setupMediaTracking'), 'setupMediaTracking must exist');
assert(preloadCode.includes('injectTranslateButtons'), 'injectTranslateButtons must exist');
assert(preloadCode.includes('injectImageTranslateButtons'), 'injectImageTranslateButtons must exist');
assert(preloadCode.includes('scrubPromotedContent'), 'scrubPromotedContent must exist');
assert(preloadCode.includes('isAdTweet'), 'isAdTweet must exist');
assert(preloadCode.includes('formatArabicBiDi'), 'formatArabicBiDi must exist');

const cssCode = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
assert(cssCode.includes('x-desktop-translation-inline'), 'Translation inline styling must exist');
assert(cssCode.includes('x-desktop-translate-link'), 'Translate link styling must exist');
assert(cssCode.includes('x-desktop-img-translate-btn'), 'Image translate btn styling must exist');
assert(cssCode.includes('x-desktop-ltr-token'), 'BiDi token styling must exist');
console.log('   ✅ Preload and Translation CSS rules verified.');

// 4. Check Main Ad-Blocker, Web UI, and AI Engine
console.log('👉 [4/11] Checking Main Ad-Blocker, Web UI, and AI Handler...');
const mainCode = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
assert(mainCode.includes('AD_TRACKER_PATTERNS'), 'AD_TRACKER_PATTERNS must exist in main.js');
assert(mainCode.includes('aiEngine'), 'aiEngine must be imported in main.js');
assert(mainCode.includes('startWebUiServer'), 'startWebUiServer must be imported in main.js');
assert(mainCode.includes('translate-text'), 'translate-text IPC handler must exist');
assert(mainCode.includes('translate-image'), 'translate-image IPC handler must exist');
console.log('   ✅ Ad-blocker, Web UI integration, and AI handlers verified.');

// 5. Check AI Engine Module Structure
console.log('👉 [5/11] Checking AI Engine Module...');
const { AIEngine } = require(path.join(ROOT, 'src', 'ai-engine.js'));
const engine = new AIEngine();
assert(typeof engine.translate === 'function', 'AIEngine.translate must be a function');
assert(typeof engine.translateImage === 'function', 'AIEngine.translateImage must be a function');
assert(typeof engine.startServer === 'function', 'AIEngine.startServer must be a function');
assert(typeof engine.getTelemetry === 'function', 'AIEngine.getTelemetry must be a function');
console.log('   ✅ AI Engine module with Vision & Telemetry verified.');

// 6. Check Web UI Dashboard Assets
console.log('👉 [6/11] Checking Web UI Dashboard Assets...');
const dashboardHtml = path.join(ROOT, 'src', 'dashboard', 'index.html');
assert(fs.existsSync(dashboardHtml), 'dashboard/index.html must exist');
const htmlContent = fs.readFileSync(dashboardHtml, 'utf8');
assert(htmlContent.includes('starfieldCanvas'), 'Starfield canvas must exist in dashboard');
assert(htmlContent.includes('context-bar'), 'Context window bar must exist in dashboard');
assert(htmlContent.includes('visionDropzone'), 'Vision dropzone must exist in dashboard');
console.log('   ✅ Web UI Dashboard with Frontier Dark System & Canvas verified.');

// 7. Check MPRIS Module
console.log('👉 [7/11] Checking MPRIS Module...');
const mprisModule = require(path.join(ROOT, 'src', 'mpris.js'));
assert.strictEqual(typeof mprisModule.initMpris, 'function');
assert.strictEqual(typeof mprisModule.updateMprisState, 'function');
console.log('   ✅ MPRIS interface verified.');

// 8. Check Packaging Scripts & Setup Tool
console.log('👉 [8/11] Checking packaging files...');
const packDir = path.join(ROOT, 'packaging');
assert(fs.existsSync(path.join(packDir, 'PKGBUILD')), 'PKGBUILD must exist');
assert(fs.existsSync(path.join(packDir, 'build-arch.sh')), 'build-arch.sh must exist');
assert(fs.existsSync(path.join(packDir, 'build-deb.sh')), 'build-deb.sh must exist');
assert(fs.existsSync(path.join(packDir, 'build-rpm.sh')), 'build-rpm.sh must exist');
assert(fs.existsSync(path.join(packDir, 'build-win.sh')), 'build-win.sh must exist');
assert(fs.existsSync(path.join(packDir, 'x-desktop.spec')), 'x-desktop.spec must exist');
assert(fs.existsSync(path.join(ROOT, 'tools', 'setup-ai-engine.sh')), 'setup-ai-engine.sh must exist');
console.log('   ✅ Packaging suite verified.');

// 9. Check Makefile
console.log('👉 [9/11] Checking Makefile...');
const makefile = fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf8');
assert(makefile.includes('install:'), 'Makefile must have install target');
assert(makefile.includes('package-arch:'), 'Makefile must have package-arch target');
assert(makefile.includes('package-deb:'), 'Makefile must have package-deb target');
console.log('   ✅ Makefile verified.');

// 10. Documentation, licences, and the model API surface
console.log('👉 [10/11] Checking documentation and licence...');
const docsDir = path.join(ROOT, 'docs');
for (const rel of [
  'index.html',
  'manual/index.html',
  'ar/index.html',
  'manual/ar/index.html',
  'favicon.svg',
  'assets/tokens.css',
  'assets/landing.css',
  'assets/landing.js',
  'assets/manual.css',
  'assets/manual.js',
  'assets/shots/dashboard.png'
]) {
  assert(fs.existsSync(path.join(docsDir, rel)), `docs/${rel} must exist`);
}

// The app serves the manual from /docs, so the Arabic page and the asset paths
// the pages use must all resolve through the server's allowlist.
const webUiCode = fs.readFileSync(path.join(ROOT, 'src', 'web-ui.js'), 'utf8');
assert(webUiCode.includes("const os = require('os')"), 'web-ui must require os for its path fallbacks');
assert(webUiCode.includes('MANUAL_HTML_PATH'), 'web-ui must serve the manual');
assert(webUiCode.includes('isOriginAllowed'), 'model endpoints must validate Origin');
assert(webUiCode.includes('/api/models'), 'model inventory endpoint must exist');
// Every HTML route must be no-store. Without it a browser serves the previous
// dashboard after an upgrade, which reads to the user as "my fix did nothing".
const htmlRouteCount = (webUiCode.match(/text\/html; charset=utf-8', 'Cache-Control': 'no-store'/g) || []).length;
assert(htmlRouteCount >= 3, `all HTML routes need no-store (found ${htmlRouteCount})`);
// The manual's pages use document-relative links, so they only resolve under a
// URL ending in a slash. Serving them without one made the language switch ask
// for /ar/ and return "Not found".
assert(webUiCode.includes("url.pathname + '/'"), 'manual routes must redirect to their trailing-slash form');
const dashHtml = fs.readFileSync(path.join(ROOT, 'src', 'dashboard', 'index.html'), 'utf8');
assert(dashHtml.includes('href="/docs/"'), 'the dashboard must link to the manual with its trailing slash');
assert(fs.existsSync(path.join(ROOT, 'LICENSE')), 'LICENSE must exist');
console.log('   ✅ Documentation, licence, and model API surface verified.');

// 11. Model manager behaviour
console.log('👉 [11/11] Checking the model manager...');
const models = engine.listModels();
assert(Array.isArray(models), 'listModels must return an array');
assert(!models.some(m => /^mmproj/i.test(m.file)), 'projectors must never be listed as models');
assert(typeof engine.getActiveModel === 'function', 'getActiveModel must exist');
assert(['ready', 'starting', 'switching', 'offline'].includes(engine.getEngineState()),
  'engineState must be one of the known states');

// Guards must reject a projector, a path escape, and an unknown file before any
// engine restart is attempted, so this runs without touching a live engine.
const guardCases = [
  ['mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf', 'projector'],
  ['../etc/passwd', 'path escape'],
  ['/etc/passwd.gguf', 'absolute path'],
  ['does-not-exist.gguf', 'missing file'],
  ['notes.txt', 'wrong extension']
];

(async () => {
  for (const [file, label] of guardCases) {
    const result = await engine.setActiveModel(file);
    assert(result && result.ok === false, `setActiveModel must refuse a ${label}`);
  }
  console.log(`   ✅ Model manager verified (${models.length} model(s) found, all guards hold).`);
  console.log('\n🎉 ALL 11 TEST SUITES PASSED SUCCESSFULLY!');
})().catch(err => {
  console.error('\n❌ Model manager test failed:', err.message);
  process.exit(1);
});
