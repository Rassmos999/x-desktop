const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Searches the host system for an existing Widevine CDM shared library (libwidevinecdm.so).
 * Supports Brave, Google Chrome, Chromium, Microsoft Edge, Vivaldi, Codex, and system paths.
 *
 * @returns {{ path: string, version: string, source: string } | null}
 */
function findWidevine() {
  const home = os.homedir();
  const searchRoots = [
    // Spotify desktop isolated CDM
    path.join(home, '.config/spotify-desktop/WidevineCdm'),

    // Brave Browser (common default on Arch / Omarchy)
    path.join(home, '.config/BraveSoftware/Brave-Browser/WidevineCdm'),
    path.join(home, '.config/BraveSoftware/Brave-Browser-Beta/WidevineCdm'),
    path.join(home, '.config/BraveSoftware/Brave-Browser-Nightly/WidevineCdm'),
    '/opt/brave.com/brave/WidevineCdm',

    // Chromium & Arch system packages
    path.join(home, '.config/chromium/WidevineCdm'),
    '/usr/lib/chromium/WidevineCdm',
    '/usr/lib/chromium',

    // Google Chrome
    '/opt/google/chrome/WidevineCdm',
    '/opt/google/chrome-beta/WidevineCdm',
    '/opt/google/chrome-unstable/WidevineCdm',
    path.join(home, '.config/google-chrome/WidevineCdm'),
    path.join(home, '.config/google-chrome-beta/WidevineCdm'),
    path.join(home, '.config/google-chrome-unstable/WidevineCdm'),

    // Codex desktop app & other desktop clients
    path.join(home, '.config/Codex/WidevineCdm'),
    path.join(home, '.config/netflix-desktop/WidevineCdm'),

    // Microsoft Edge & Vivaldi
    path.join(home, '.config/microsoft-edge/WidevineCdm'),
    '/opt/microsoft/msedge/WidevineCdm',
    path.join(home, '.config/vivaldi/WidevineCdm'),
    '/opt/vivaldi/WidevineCdm'
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;

    // 1. Direct check in root
    const directSo = path.join(root, 'libwidevinecdm.so');
    if (fs.existsSync(directSo)) {
      const version = readVersionFromManifest(root) || '4.10.3050.0';
      return { path: directSo, version, source: root };
    }

    // 2. Check version subdirectories (e.g., 4.10.3050.0/)
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      // Sort entries in descending order so latest version is picked first
      const sortedEntries = entries
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));

      for (const entry of sortedEntries) {
        const versionDir = path.join(root, entry.name);
        const candidates = [
          path.join(versionDir, '_platform_specific/linux_x64/libwidevinecdm.so'),
          path.join(versionDir, '_platform_specific/linux_arm64/libwidevinecdm.so'),
          path.join(versionDir, 'libwidevinecdm.so')
        ];

        for (const soPath of candidates) {
          if (fs.existsSync(soPath)) {
            const version = readVersionFromManifest(versionDir) || entry.name || '4.10.3050.0';
            return { path: soPath, version, source: root };
          }
        }
      }
    } catch (err) {
      // Continue searching other locations
    }
  }

  return null;
}

/**
 * Reads the version string from manifest.json in the specified directory.
 */
function readVersionFromManifest(dirPath) {
  const manifestPath = path.join(dirPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest && manifest.version) {
        return manifest.version;
      }
    } catch (e) {
      // ignore parse error
    }
  }
  return null;
}

module.exports = {
  findWidevine,
  readVersionFromManifest
};
