/**
 * Centralized YouTube API loader
 * Manages a single API loading instance to avoid race conditions
 */

let isApiReady = false;
let loadingPromise = null;
const waitingQueue = [];

function signalReady() {
  isApiReady = true;
  waitingQueue.forEach(resolve => resolve());
  waitingQueue.length = 0; // Clear queue
}

export function ensureApiReady() {
  if (isApiReady) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise((resolve, reject) => {
    waitingQueue.push(resolve); // Add to queue

    if (!window.onYouTubeIframeAPIReady) {
       // Define the global callback *only once*
       window.onYouTubeIframeAPIReady = () => {
         console.log('[YouTubeAPI] YouTube IFrame API is ready');
         // Give a small delay for the API to be fully initialized
         setTimeout(() => {
           signalReady();
         }, 100);
       };

       // Add timeout to detect if script never loads (CSP blocking)
       const timeout = setTimeout(() => {
         if (!window.YT || !window.YT.Player) {
           console.error('[YouTubeAPI] Timeout waiting for YouTube API to load');
           console.error('[YouTubeAPI] This usually means CSP is blocking the script');
           console.error('[YouTubeAPI] Check browser console for CSP violation errors');
           console.error('[YouTubeAPI] Current CSP:', document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'Not found in meta tag');
           
           // Check actual CSP header via fetch
           fetch(window.location.href, { method: 'HEAD' })
             .then(res => {
               const csp = res.headers.get('Content-Security-Policy');
               console.error('[YouTubeAPI] CSP Header:', csp);
               if (csp && !csp.includes('www.youtube.com')) {
                 console.error('[YouTubeAPI] CSP is missing www.youtube.com in script-src!');
               }
             })
             .catch(() => {});
           
           loadingPromise = null;
           waitingQueue.forEach(rej => rej(new Error('YouTube API failed to load - likely CSP blocking')));
           waitingQueue.length = 0;
         }
       }, 10000); // 10 second timeout

       // Load the script *only once*
       const tag = document.createElement('script');
       tag.src = 'https://www.youtube.com/iframe_api';
       tag.async = true;
       tag.defer = true;
       tag.onerror = () => {
         clearTimeout(timeout);
         console.error('[YouTubeAPI] Failed to load YouTube IFrame API script');
         console.error('[YouTubeAPI] Script src:', tag.src);
         console.error('[YouTubeAPI] CSP might be blocking - check Content-Security-Policy header');
         console.error('[YouTubeAPI] Check Network tab to see if script request was blocked');
         // Reject the promise if script fails to load
         loadingPromise = null;
         waitingQueue.forEach(rej => rej(new Error('Failed to load YouTube API - check CSP headers')));
         waitingQueue.length = 0;
       };
       tag.onload = () => {
         clearTimeout(timeout);
         console.log('[YouTubeAPI] Script tag loaded successfully');
       };
       console.log('[YouTubeAPI] Attempting to load YouTube IFrame API from:', tag.src);
       const firstScript = document.getElementsByTagName('script')[0];
       if (firstScript && firstScript.parentNode) {
         firstScript.parentNode.insertBefore(tag, firstScript);
       } else {
         document.body.appendChild(tag);
       }
    } else {
       // If callback exists but API not ready, maybe it's loading?
       // Or maybe it loaded before this code ran? Check YT object.
       if (window.YT && window.YT.Player) {
         // If API is already there, signal immediately.
         console.log('[YouTubeAPI] YouTube API already loaded');
         signalReady();
       }
       // Otherwise, the existing onYouTubeIframeAPIReady will eventually call signalReady.
    }
  });

  return loadingPromise;
}

// Helper to create a container element if it doesn't exist
export function ensurePlayerContainer(containerId, width = '480px', height = '270px') {
  let container = document.getElementById(containerId);
  
  if (!container) {
    console.log(`Creating container for ${containerId}`);
    container = document.createElement('div');
    container.id = containerId;
    container.style.width = width;
    container.style.height = height;
    document.body.appendChild(container);
  }
  
  return container;
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
    console.log(`[PlayerRegistry] Unregistered player, registry size: ${playerRegistry.length}`);
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
      } catch (e) {
        // Player is destroyed/invalid, don't keep it
        console.log('[PlayerRegistry] Removing destroyed player from registry');
      }
    } else {
      // Player doesn't have expected methods, remove it
      console.log('[PlayerRegistry] Removing invalid player from registry');
    }
  });
  
  const removed = playerRegistry.length - validPlayers.length;
  if (removed > 0) {
    console.log(`[PlayerRegistry] Cleaned up ${removed} stale player(s)`);
  }
  
  playerRegistry.length = 0;
  playerRegistry.push(...validPlayers);
}

export function pauseOtherPlayers(currentPlayer) {
  // Prevent re-entrancy
  if (isStoppingPlayers) {
    console.log('[PlayerRegistry] Already stopping players, skipping');
    return;
  }
  
  isStoppingPlayers = true;
  
  try {
    // Clean up stale players first
    cleanupRegistry();
    
    console.log(`[PlayerRegistry] Pausing other players, registry size: ${playerRegistry.length}, initializing: ${initializingPlayers.size}, current: ${currentPlayer ? 'has' : 'none'}`);
    
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
          console.log('[PlayerRegistry] Force stopping player');
          // Use both pauseVideo and stopVideo for better mobile compatibility
          if (player.pauseVideo && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          if (player.stopVideo && typeof player.stopVideo === 'function') {
            player.stopVideo();
          }
        } catch (e) {
          console.log('[PlayerRegistry] Error stopping player, removing from registry:', e.message);
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
          console.log('[PlayerRegistry] Destroying initializing player');
          player.destroy();
        }
      } catch (e) {
        console.log('[PlayerRegistry] Error destroying initializing player:', e.message);
      }
    });
    initializingPlayers.clear();
  } finally {
    isStoppingPlayers = false;
  }
}

// Export registry for debugging
export function getRegistrySize() {
  return playerRegistry.length;
}

export function getRegistry() {
  return [...playerRegistry];
}