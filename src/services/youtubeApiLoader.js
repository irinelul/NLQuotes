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

export function registerPlayer(player) {
  playerRegistry.push(player);
  return player;
}

export function unregisterPlayer(player) {
  const index = playerRegistry.indexOf(player);
  if (index !== -1) {
    playerRegistry.splice(index, 1);
  }
}

export function pauseOtherPlayers(currentPlayer) {
  playerRegistry.forEach(player => {
    if (player !== currentPlayer && player.stopVideo) {
      try {
        // Try to get player state first
        const playerState = player.getPlayerState ? player.getPlayerState() : null;
        // Only stop if the player is actually playing or buffering
        if (playerState === window.YT?.PlayerState?.PLAYING || 
            playerState === window.YT?.PlayerState?.BUFFERING ||
            playerState === null) { // If we can't get state, assume it might be playing
          // Use both pauseVideo and stopVideo for better mobile compatibility
          if (player.pauseVideo && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
          if (player.stopVideo && typeof player.stopVideo === 'function') {
            player.stopVideo();
          }
        }
        // Get the container element
        const iframe = player.getIframe();
        if (iframe) {
          const container = iframe.parentElement;
          if (container && container.__reactProps$) {
            // Access the React props and call setState
            const setIsPlaying = container.__reactProps$.children.props.setIsPlaying;
            if (typeof setIsPlaying === 'function') {
              setIsPlaying(false);
            }
          }
        }
      } catch (e) {
        console.log('Error stopping player:', e);
        // Fallback: try to stop anyway
        try {
          if (player.stopVideo && typeof player.stopVideo === 'function') {
            player.stopVideo();
          }
        } catch (e2) {
          console.log('Error in fallback stop:', e2);
        }
      }
    }
  });
}