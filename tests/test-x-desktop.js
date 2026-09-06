const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Running X Desktop Client Comprehensive Tests...');

const ROOT = path.join(__dirname, '..');

// 1. Check Package Config
console.log('👉 [1/8] Checking package.json...');
const pkg = require(path.join(ROOT, 'package.json'));
assert.strictEqual(pkg.name, 'x-desktop');
assert.strictEqual(pkg.main, 'src/main.js');
assert(pkg.dependencies['mpris-service'], 'mpris-service dependency must exist');
console.log('   ✅ Package metadata verified.');

// 2. Check File & Asset Integrity
console.log('👉 [2/8] Checking icons and desktop data...');
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
console.log('👉 [3/8] Checking Preload and Translation Features...');
const preloadCode = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
assert(preloadCode.includes('injectStyles'), 'injectStyles must exist');
assert(preloadCode.includes('setupMediaTracking'), 'setupMediaTracking must exist');
assert(preloadCode.includes('injectTranslateButtons'), 'injectTranslateButtons must exist');
assert(preloadCode.includes('scrubPromotedContent'), 'scrubPromotedContent must exist');
assert(preloadCode.includes('isAdTweet'), 'isAdTweet must exist');
assert(preloadCode.includes('formatArabicBiDi'), 'formatArabicBiDi must exist');
assert(preloadCode.includes('zoom-in'), 'zoom-in must exist');

const cssCode = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
assert(cssCode.includes('x-desktop-translation-inline'), 'Translation inline styling must exist');
assert(cssCode.includes('x-desktop-translate-link'), 'Translate link styling must exist');
assert(cssCode.includes('x-desktop-ltr-token'), 'BiDi token styling must exist');
console.log('   ✅ Preload and Translation CSS rules verified.');

// 4. Check Main Ad-Blocker and AI Engine Handler
console.log('👉 [4/8] Checking Main Ad-Blocker and AI Handler...');
const mainCode = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
assert(mainCode.includes('AD_TRACKER_PATTERNS'), 'AD_TRACKER_PATTERNS must exist in main.js');
assert(mainCode.includes('aiEngine'), 'aiEngine must be imported in main.js');
assert(mainCode.includes('translate-text'), 'translate-text IPC handler must exist');
assert(mainCode.includes('zoomIn'), 'zoomIn must exist');
console.log('   ✅ Ad-blocker patterns and AI translation backend verified.');

// 5. Check AI Engine Module Structure
console.log('👉 [5/8] Checking AI Engine Module...');
const { AIEngine } = require(path.join(ROOT, 'src', 'ai-engine.js'));
const engine = new AIEngine();
assert(typeof engine.translate === 'function', 'AIEngine.translate must be a function');
assert(typeof engine.startServer === 'function', 'AIEngine.startServer must be a function');
console.log('   ✅ AI Engine module verified.');

// 6. Check MPRIS Module
console.log('👉 [6/8] Checking MPRIS Module...');
const mprisModule = require(path.join(ROOT, 'src', 'mpris.js'));
assert.strictEqual(typeof mprisModule.initMpris, 'function');
assert.strictEqual(typeof mprisModule.updateMprisState, 'function');
console.log('   ✅ MPRIS interface verified.');

// 7. Check Packaging Scripts & Setup Tool
console.log('👉 [7/8] Checking packaging files...');
const packDir = path.join(ROOT, 'packaging');
assert(fs.existsSync(path.join(packDir, 'PKGBUILD')), 'PKGBUILD must exist');
assert(fs.existsSync(path.join(packDir, 'build-arch.sh')), 'build-arch.sh must exist');
assert(fs.existsSync(path.join(packDir, 'build-deb.sh')), 'build-deb.sh must exist');
assert(fs.existsSync(path.join(packDir, 'build-rpm.sh')), 'build-rpm.sh must exist');
assert(fs.existsSync(path.join(packDir, 'x-desktop.spec')), 'x-desktop.spec must exist');
assert(fs.existsSync(path.join(ROOT, 'tools', 'setup-ai-engine.sh')), 'setup-ai-engine.sh must exist');
console.log('   ✅ Packaging suite verified.');

// 8. Check Makefile
console.log('👉 [8/8] Checking Makefile...');
const makefile = fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf8');
assert(makefile.includes('install:'), 'Makefile must have install target');
assert(makefile.includes('package-arch:'), 'Makefile must have package-arch target');
assert(makefile.includes('package-deb:'), 'Makefile must have package-deb target');
console.log('   ✅ Makefile verified.');

console.log('\n🎉 ALL 8 TEST SUITES PASSED SUCCESSFULLY!');
