const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CASTLABS_VERSION = 'v41.10.7+wvcus';
const ZIP_NAME = `electron-${CASTLABS_VERSION}-linux-x64.zip`;
const URL = `https://github.com/castlabs/electron-releases/releases/download/${CASTLABS_VERSION}/${ZIP_NAME}`;
const CACHE_DIR = path.join(process.env.HOME || '/tmp', '.cache/spotify-desktop');
const CACHED_ZIP = path.join(CACHE_DIR, ZIP_NAME);
const TARGET_DIST = path.join(__dirname, '../node_modules/electron/dist');

function main() {
  console.log(`==> Preparing CastLabs Widevine Electron (${CASTLABS_VERSION})...`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // 1. Check local cache or alternative cached locations
  if (!fs.existsSync(CACHED_ZIP) || fs.statSync(CACHED_ZIP).size < 100000000) {
    const altLocations = [
      path.join(process.env.HOME || '', '.cache/netflix-desktop', ZIP_NAME),
      path.join('/tmp/castlabs', ZIP_NAME)
    ];

    let foundLocal = false;
    for (const alt of altLocations) {
      if (fs.existsSync(alt) && fs.statSync(alt).size > 100000000) {
        console.log(`Found local cached archive at ${alt}, copying to cache...`);
        fs.copyFileSync(alt, CACHED_ZIP);
        foundLocal = true;
        break;
      }
    }

    if (!foundLocal) {
      console.log(`Downloading ${URL}...`);
      execSync(`curl -L -C - -o "${CACHED_ZIP}" "${URL}"`, { stdio: 'inherit' });
    }
  }

  // 2. Unzip into TARGET_DIST
  console.log(`Extracting to ${TARGET_DIST}...`);
  fs.mkdirSync(TARGET_DIST, { recursive: true });
  execSync(`unzip -q -o "${CACHED_ZIP}" -d "${TARGET_DIST}"`, { stdio: 'inherit' });

  // 3. Mark executable
  const electronBin = path.join(TARGET_DIST, 'electron');
  if (fs.existsSync(electronBin)) {
    fs.chmodSync(electronBin, 0o755);
  }

  const ver = execSync(`"${electronBin}" --no-sandbox --version`).toString().trim();
  console.log(`✅ CastLabs Electron ready: ${ver}`);
}

main();
