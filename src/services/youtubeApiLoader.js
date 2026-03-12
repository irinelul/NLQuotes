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
  waitingQueue.length = 0;
}

export function ensureApiReady() {
  if (isApiReady) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise((resolve, reject) => {
    waitingQueue.push(resolve);

    if (!window.onYouTubeIframeAPIReady) {
       window.onYouTubeIframeAPIReady = () => {
         setTimeout(() => {
           signalReady();
         }, 100);
       };

       const timeout = setTimeout(() => {
         if (!window.YT || !window.YT.Player) {
           loadingPromise = null;
           waitingQueue.forEach(rej => rej(new Error('YouTube API failed to load - likely CSP blocking')));
           waitingQueue.length = 0;
         }
       }, 10000);

       const tag = document.createElement('script');
       tag.src = 'https://www.youtube.com/iframe_api';
       tag.async = true;
       tag.defer = true;
       tag.onerror = () => {
         clearTimeout(timeout);
         console.error('[YouTubeAPI] Failed to load YouTube IFrame API script');
         loadingPromise = null;
         waitingQueue.forEach(rej => rej(new Error('Failed to load YouTube API - check CSP headers')));
         waitingQueue.length = 0;
       };
       tag.onload = () => {
         clearTimeout(timeout);
       };
       const firstScript = document.getElementsByTagName('script')[0];
       if (firstScript && firstScript.parentNode) {
         firstScript.parentNode.insertBefore(tag, firstScript);
       } else {
         document.body.appendChild(tag);
       }
    } else {
       if (window.YT && window.YT.Player) {
         signalReady();
       }
    }
  });

  return loadingPromise;
}

// Helper to create a container element if it doesn't exist
export function ensurePlayerContainer(containerId, width = '480px', height = '270px') {
  let container = document.getElementById(containerId);
  
  if (!container) {
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
const initializingPlayers = new Set();
let isStoppingPlayers = false;

export function registerPlayer(player) {
  playerRegistry.push(player);
  initializingPlayers.delete(player);
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
        player.getPlayerState();
        validPlayers.push(player);
      } catch (e) {
        // Player is destroyed/invalid
      }
    }
  });
  
  playerRegistry.length = 0;
  playerRegistry.push(...validPlayers);
}

export function pauseOtherPlayers(currentPlayer) {
  if (isStoppingPlayers) {
    return;
  }
  
  isStoppingPlayers = true;
  
  try {
    cleanupRegistry();
    
    playerRegistry.forEach(player => {
      if (player !== currentPlayer) {
        try {
          if (!player || typeof player.getPlayerState !== 'function') {
            unregisterPlayer(player);
            return;
          }
          
          if (player.pauseVideo && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          if (player.stopVideo && typeof player.stopVideo === 'function') {
            player.stopVideo();
          }
        } catch (e) {
          unregisterPlayer(player);
        }
      }
    });
    
    initializingPlayers.forEach(player => {
      try {
        if (player && typeof player.destroy === 'function') {
          player.destroy();
        }
      } catch (e) {
        // Ignore
      }
    });
    initializingPlayers.clear();
  } finally {
    isStoppingPlayers = false;
  }
}

export function getRegistrySize() {
  return playerRegistry.length;
}

export function getRegistry() {
  return [...playerRegistry];
}
