
const Mpris = require('mpris-service');

let player = null;
let currentMetadata = {};
let lastPositionMicroseconds = 0;
let lastPositionUpdate = Date.now();
let isPlaying = false;

/**
 * Initializes MPRIS D-Bus v2 service for X Desktop.
 *
 * @param {(action: string, arg?: any) => void} onAction - Callback for player actions
 */
function initMpris(onAction) {
  try {
    player = Mpris({
      name: 'x-desktop',
      identity: 'X Desktop',
      desktopEntry: 'x-desktop',
      supportedUriSchemes: ['http', 'https'],
      supportedMimeTypes: ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/aac']
    });

    player.playbackStatus = 'Stopped';
    player.canControl = true;
    player.canPlay = true;
    player.canPause = true;
    player.canGoNext = false;
    player.canGoPrevious = false;
    player.canSeek = true;

    player.getPosition = function () {
      if (!isPlaying || !lastPositionMicroseconds) {
        return lastPositionMicroseconds || 0;
      }
      const elapsedMicros = (Date.now() - lastPositionUpdate) * 1000;
      return lastPositionMicroseconds + elapsedMicros;
    };

    player.on('play', () => onAction('play'));
    player.on('pause', () => onAction('pause'));
    player.on('playpause', () => onAction('playpause'));
    player.on('stop', () => onAction('stop'));
    player.on('seek', (offsetMicros) => {
      const offsetSeconds = offsetMicros / 1000000;
      onAction('seek', offsetSeconds);
    });
    player.on('position', (event) => {
      const posSeconds = (event.position || 0) / 1000000;
      onAction('position', posSeconds);
    });
    player.on('volume', (vol) => {
      onAction('volume', vol);
    });
    player.on('raise', () => onAction('raise'));
    player.on('quit', () => onAction('quit'));

    console.log('[X Desktop] MPRIS D-Bus v2 service registered as org.mpris.MediaPlayer2.x-desktop');
  } catch (err) {
    console.warn('[X Desktop] MPRIS initialization failed:', err.message);
  }
}

/**
 * Updates MPRIS state with latest media playback information from the X client.
 *
 * @param {Object} state
 */
function updateMprisState(state) {
  if (!player || !state) return;

  try {
    if (state.playbackStatus) {
      player.playbackStatus = state.playbackStatus;
      isPlaying = state.playbackStatus === 'Playing';
    }

    if (typeof state.position === 'number') {
      lastPositionMicroseconds = Math.round(state.position * 1000000);
      lastPositionUpdate = Date.now();
    }

    if (typeof state.volume === 'number') {
      player.volume = Math.max(0, Math.min(1, state.volume));
    }

    const trackId = state.trackId || (state.title ? Buffer.from(state.title + (state.artist || '')).toString('hex').slice(0, 16) : '0');
    const lengthMicros = typeof state.duration === 'number' && state.duration > 0 ? Math.round(state.duration * 1000000) : 0;

    const newMetadata = {
      'mpris:trackid': player.objectPath('media/' + trackId),
      'xesam:title': state.title || 'X Media Playback',
      'xesam:artist': state.artist ? [state.artist] : ['X'],
      'xesam:album': state.album || 'X (Twitter)',
      'mpris:artUrl': state.artwork || '',
      'xesam:url': state.url || 'https://x.com'
    };

    if (lengthMicros > 0) {
      newMetadata['mpris:length'] = lengthMicros;
    }

    const metaChanged =
      currentMetadata['xesam:title'] !== newMetadata['xesam:title'] ||
      (currentMetadata['xesam:artist'] && currentMetadata['xesam:artist'][0]) !== (newMetadata['xesam:artist'] && newMetadata['xesam:artist'][0]) ||
      currentMetadata['mpris:artUrl'] !== newMetadata['mpris:artUrl'] ||
      currentMetadata['mpris:length'] !== newMetadata['mpris:length'];

    if (metaChanged) {
      currentMetadata = newMetadata;
      player.metadata = newMetadata;
    }
  } catch (err) {
    console.warn('[X Desktop] Failed to update MPRIS state:', err.message);
  }
}

module.exports = {
  initMpris,
  updateMprisState
};

