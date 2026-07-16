/**
 * Centralized YouTube API loader
 * Manages a single API loading instance to avoid race conditions
 */

const YT_API_SRC = 'https://www.youtube.com/iframe_api';

let loadingPromise = null;

export function ensureApiReady() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise((resolve, reject) => {
    // Failure must REJECT (the old code called the queued resolve functions,
    // so callers proceeded into `new YT.Player` with no API) and must clear
    // loadingPromise so a retry re-injects the script below.
    const fail = (message) => {
      clearTimeout(timeout);
      loadingPromise = null;
      console.error(`[YouTubeAPI] ${message} — check CSP headers / Network tab`);
      reject(new Error(message));
    };

    // Detect the script never loading (CSP blocking, network failure)
    const timeout = setTimeout(() => {
      fail('YouTube API failed to load within 10s - likely CSP blocking');
    }, 10000);

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      // Give the API a small delay to be fully initialized
      setTimeout(resolve, 100);
    };

    // (Re-)inject the script. A previous failed attempt leaves a dead tag
    // behind — remove it so a retry actually re-requests the script.
    document.querySelector(`script[src="${YT_API_SRC}"]`)?.remove();
    const tag = document.createElement('script');
    tag.src = YT_API_SRC;
    tag.async = true;
    tag.defer = true;
    tag.onerror = () => fail('Failed to load YouTube IFrame API script');
    (document.head || document.body).appendChild(tag);
  });

  return loadingPromise;
}

// Global registry for players to manage multiple instances
const playerRegistry = [];
// Track players that are initializing (before onReady)
const initializingPlayers = new Set();
// Global lock to prevent multiple players from starting at once
let isStoppingPlayers = false;

export function registerPlayer(player) {
  playerRegistry.push(player);
  initializingPlayers.delete(player); // Remove from initializing once registered
  return player;
}

export function registerInitializingPlayer(player) {
  initializingPlayers.add(player);
}

export function unregisterInitializingPlayer(player) {
  initializingPlayers.delete(player);
}

export function unregisterPlayer(player) {
  if (!player) return;
  const index = playerRegistry.indexOf(player);
  if (index !== -1) {
    playerRegistry.splice(index, 1);
  }
}

// Clean up stale/destroyed players from registry
export function cleanupRegistry() {
  const validPlayers = [];
  playerRegistry.forEach(player => {
    if (player && typeof player.getPlayerState === 'function') {
      try {
        // Try to get player state - if it works, player is still valid
        player.getPlayerState();
        validPlayers.push(player);
      } catch {
        // Player is destroyed/invalid, don't keep it
      }
    }
    // Players without the expected methods are dropped silently
  });

  playerRegistry.length = 0;
  playerRegistry.push(...validPlayers);
}

export function pauseOtherPlayers(currentPlayer) {
  // Prevent re-entrancy
  if (isStoppingPlayers) {
    return;
  }
  
  isStoppingPlayers = true;
  
  try {
    // Clean up stale players first
    cleanupRegistry();

    // Stop all registered players - be aggressive, don't check state
    playerRegistry.forEach(player => {
      if (player !== currentPlayer) {
        try {
          // Validate player is still functional
          if (!player || typeof player.getPlayerState !== 'function') {
            // Invalid player, remove from registry
            unregisterPlayer(player);
            return;
          }
          
          // Stop regardless of state - be aggressive
          // Use both pauseVideo and stopVideo for better mobile compatibility
          if (player.pauseVideo && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          if (player.stopVideo && typeof player.stopVideo === 'function') {
            player.stopVideo();
          }
        } catch {
          // Player is invalid, remove from registry
          unregisterPlayer(player);
        }
      }
    });
    
    // Also try to stop players that are still initializing
    // These are iframe elements that haven't called onReady yet
    initializingPlayers.forEach(player => {
      try {
        if (player && typeof player.destroy === 'function') {
          player.destroy();
        }
      } catch {
        // Ignore — player already destroyed
      }
    });
    initializingPlayers.clear();
  } finally {
    isStoppingPlayers = false;
  }
}