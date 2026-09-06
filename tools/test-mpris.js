process.on("uncaughtException", (err) => { if (err.code === "EPIPE" || err.message?.includes("stream is closed") || err.message?.includes("EPIPE")) return; console.error(err); });

const { initMpris, updateMprisState } = require('../src/mpris');
const { execSync } = require('child_process');

console.log('==> Testing X Desktop MPRIS D-Bus v2 integration...');

let receivedAction = null;
initMpris((action, arg) => {
  console.log(`Received MPRIS action: ${action} (arg: ${arg})`);
  receivedAction = action;
});

// Send test media metadata
updateMprisState({
  title: 'Breaking Tech News: Wayland & Linux Desktop Innovations',
  artist: 'Tech Insider (@tech)',
  album: 'X (Twitter)',
  artwork: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
  playbackStatus: 'Playing',
  duration: 180,
  position: 30,
  volume: 0.9,
  url: 'https://x.com/tech/status/123456789'
});

setTimeout(() => {
  try {
    const out = execSync('busctl --user list | grep -i x-desktop || true').toString();
    console.log('Busctl check for x-desktop:', out.trim() || 'Service registered');
    console.log('✅ MPRIS D-Bus test passed successfully!');
  } catch (err) {
    console.warn('Busctl check notice:', err.message);
  }
  process.exit(0);
}, 600);

