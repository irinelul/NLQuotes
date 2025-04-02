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

  loadingPromise = new Promise((resolve) => {
    waitingQueue.push(resolve); // Add to queue

    if (!window.onYouTubeIframeAPIReady) {
       // Define the global callback *only once*
       window.onYouTubeIframeAPIReady = () => {
         console.log('YouTube IFrame API is ready');
         // Give a small delay for the API to be fully initialized
         setTimeout(() => {
           signalReady();
         }, 100);
       };

       // Load the script *only once*
       const tag = document.createElement('script');
       tag.src = 'https://www.youtube.com/iframe_api';
       document.body.appendChild(tag);
    } else {
       // If callback exists but API not ready, maybe it's loading?
       // Or maybe it loaded before this code ran? Check YT object.
       if (window.YT && window.YT.Player) {
         // If API is already there, signal immediately.
         console.log('YouTube API already loaded');
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
        player.stopVideo();
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
      }
    }
  });
}