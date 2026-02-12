import React, { useState, useEffect } from 'react';
import { ensureApiReady, registerPlayer, unregisterPlayer, pauseOtherPlayers } from '../../services/youtubeApiLoader';
import styles from './YoutubePlayer.module.css';

// Simpler approach with minimal DOM manipulation
export const YouTubePlayer = ({ videoId, timestamp }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(null);
    const [currentTimestamp, setCurrentTimestamp] = useState(timestamp);
    const iframeRef = React.useRef(null);
    const playerRef = React.useRef(null);
    const isMountedRef = React.useRef(true);
    const containerRef = React.useRef(null);
    const iframeContainerIdRef = React.useRef(`yt-player-${Math.random().toString(36).substr(2, 9)}`);

    // Handle window resize and orientation changes to resize player
    useEffect(() => {
        const updatePlayerSize = () => {
            if (playerRef.current && iframeRef.current?.parentElement) {
                const container = iframeRef.current.parentElement;
                const width = container.offsetWidth || container.clientWidth;
                const height = container.offsetHeight || container.clientHeight;
                
                // Resize YouTube player if it exists and has the setSize method
                if (playerRef.current && typeof playerRef.current.setSize === 'function' && width > 0 && height > 0) {
                    try {
                        playerRef.current.setSize(width, height);
                    } catch (err) {
                        console.error('Error resizing player:', err);
                    }
                }
            }
        };

        // Listen for resize and orientation changes
        window.addEventListener('resize', updatePlayerSize);
        
        let orientationTimeout;
        const handleOrientationChange = () => {
            // Clear any pending timeout
            if (orientationTimeout) {
                clearTimeout(orientationTimeout);
            }
            // Delay to allow layout to settle after orientation change
            orientationTimeout = setTimeout(updatePlayerSize, 200);
        };
        window.addEventListener('orientationchange', handleOrientationChange);

        return () => {
            window.removeEventListener('resize', updatePlayerSize);
            window.removeEventListener('orientationchange', handleOrientationChange);
            // Clear any pending timeout
            if (orientationTimeout) {
                clearTimeout(orientationTimeout);
            }
        };
    }, [isPlaying]);

    // Track previous videoId to detect changes
    const prevVideoIdForCleanupRef = React.useRef(videoId);
    
    // Initialize YouTube player when iframe is loaded
    useEffect(() => {
        // If videoId changed, we need to clean up the old player first
        if (prevVideoIdForCleanupRef.current !== videoId && playerRef.current) {
            try {
                // Destroy the old player completely
                if (typeof playerRef.current.pauseVideo === 'function') {
                    playerRef.current.pauseVideo();
                }
                if (typeof playerRef.current.destroy === 'function') {
                    playerRef.current.destroy();
                }
                unregisterPlayer(playerRef.current);
                playerRef.current = null;
                
                // Reset playing state - this will trigger a remount
                setIsPlaying(false);
                setError(null);
                setCurrentTimestamp(null);
                
                // Create a new container ID to force fresh iframe
                iframeContainerIdRef.current = `yt-player-${Math.random().toString(36).substr(2, 9)}`;
            } catch (err) {
                console.error('Error cleaning up old player:', err);
            }
        }
        
        // Update the ref
        prevVideoIdForCleanupRef.current = videoId;
        
        if (isPlaying && containerRef.current) {
            // Pause all other players immediately before starting this one
            pauseOtherPlayers(null);
            
            // Ensure we have a fresh iframe container
            let iframeContainer = containerRef.current.querySelector(`#${iframeContainerIdRef.current}`);
            if (!iframeContainer) {
                // Create new iframe container
                iframeContainer = document.createElement('div');
                iframeContainer.id = iframeContainerIdRef.current;
                iframeContainer.className = styles.iframeContainer;
                containerRef.current.appendChild(iframeContainer);
            }
            iframeRef.current = iframeContainer;
            
            ensureApiReady().then(() => {
                // Check if component is still mounted and videoId hasn't changed
                if (!isMountedRef.current || !iframeRef.current || !containerRef.current || prevVideoIdForCleanupRef.current !== videoId) {
                    return;
                }
                
                // Get container dimensions for responsive sizing
                const container = containerRef.current;
                const width = container ? (container.offsetWidth || container.clientWidth || 616) : 616;
                const height = container ? (container.offsetHeight || container.clientHeight || 346) : 346;
                
                // Get origin - handle Coolify/reverse proxy scenarios
                // Coolify might be behind a proxy, so use the actual hostname from the request
                // Try to get origin from headers first (for reverse proxy), then fall back to window.location
                let origin = window.location.origin;
                
                // For Coolify/reverse proxy, try to detect the actual origin
                // Check if we're behind a proxy by looking at X-Forwarded headers
                if (document.querySelector('meta[http-equiv="X-Forwarded-Host"]')) {
                    const forwardedHost = document.querySelector('meta[http-equiv="X-Forwarded-Host"]')?.content;
                    const forwardedProto = document.querySelector('meta[http-equiv="X-Forwarded-Proto"]')?.content || window.location.protocol.replace(':', '');
                    if (forwardedHost) {
                        origin = `${forwardedProto}://${forwardedHost}`;
                    }
                }
                
                // Fallback if origin is still invalid
                if (!origin || origin === 'null' || origin.includes('undefined')) {
                    origin = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
                }
                
                console.log(`[YouTubePlayer] Initializing player:`, {
                    videoId,
                    timestamp: currentTimestamp,
                    origin,
                    windowOrigin: window.location.origin,
                    protocol: window.location.protocol,
                    hostname: window.location.hostname,
                    port: window.location.port,
                    ytApiReady: !!(window.YT && window.YT.Player),
                    containerExists: !!iframeRef.current,
                    containerId: iframeContainerIdRef.current
                });
                
                // Try without origin parameter first - YouTube can auto-detect it
                // Only add origin if it's a valid URL
                const playerVars = {
                    autoplay: 1,
                    start: currentTimestamp,
                    enablejsapi: 1,
                    rel: 0,
                    modestbranding: 1
                };
                
                // Only add origin if it's valid (YouTube requires a valid origin)
                if (origin && origin.startsWith('http')) {
                    playerVars.origin = origin;
                }
                
                const player = new window.YT.Player(iframeRef.current, {
                    width: width,
                    height: height,
                    videoId,
                    playerVars: playerVars,
                    events: {
                        onReady: (event) => {
                            // Double-check videoId hasn't changed
                            if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) {
                                try {
                                    event.target.destroy();
                                } catch (e) {
                                    // Ignore
                                }
                                return;
                            }
                            playerRef.current = event.target;
                            registerPlayer(event.target);
                            // Pause other players before starting this one
                            pauseOtherPlayers(event.target);
                            event.target.playVideo();
                            // Also pause after playVideo to ensure other players are stopped
                            const pauseTimeout = setTimeout(() => {
                                if (isMountedRef.current && playerRef.current && prevVideoIdForCleanupRef.current === videoId) {
                                    pauseOtherPlayers(playerRef.current);
                                }
                            }, 100);
                            // Store timeout ID for cleanup (if needed)
                            if (playerRef.current) {
                                playerRef.current._pauseTimeout = pauseTimeout;
                            }
                        },
                        onStateChange: (event) => {
                            if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) return;
                            if (event.data === window.YT.PlayerState.PLAYING) {
                                // Pause other players when this one starts playing
                                pauseOtherPlayers(event.target);
                            }
                        },
                        onError: () => {
                            if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) return;
                            setError('Failed to load video');
                            setIsPlaying(false);
                        }
                    }
                });
            }).catch(err => {
                if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) return;
                console.error('[YouTubePlayer] Error initializing YouTube player:', err);
                console.error('[YouTubePlayer] Error details:', {
                    message: err.message,
                    stack: err.stack,
                    videoId,
                    origin: window.location.origin,
                    iframeContainer: !!iframeRef.current,
                    containerRef: !!containerRef.current,
                    ytApiReady: !!(window.YT && window.YT.Player),
                    ytObjectExists: !!window.YT
                });
                
                // Check CSP violations
                if (err.message && err.message.includes('CSP')) {
                    console.error('[YouTubePlayer] CSP violation detected!');
                    console.error('[YouTubePlayer] Check browser console for CSP violation reports');
                }
                
                // More user-friendly error message
                let errorMsg = 'Failed to initialize video player';
                if (err.message && err.message.includes('CSP')) {
                    errorMsg = 'Video player blocked by security policy. Please check CSP headers.';
                } else if (!window.YT || !window.YT.Player) {
                    errorMsg = 'YouTube API failed to load. Check browser console for details.';
                } else {
                    errorMsg = `Failed to initialize: ${err.message || 'Unknown error'}`;
                }
                
                setError(errorMsg);
                setIsPlaying(false);
            });
        }

        return () => {
            // Cleanup: destroy player and unregister
            const cleanupPlayer = playerRef.current;
            
            if (cleanupPlayer) {
                // Clear any pending timeouts
                if (cleanupPlayer._pauseTimeout) {
                    clearTimeout(cleanupPlayer._pauseTimeout);
                }
                if (cleanupPlayer._reloadPauseTimeout) {
                    clearTimeout(cleanupPlayer._reloadPauseTimeout);
                }
                
                // Clear the ref immediately to prevent other code from using it
                playerRef.current = null;
                
                try {
                    // Check if player still has valid methods before calling
                    if (cleanupPlayer && typeof cleanupPlayer.getPlayerState === 'function') {
                        try {
                            cleanupPlayer.getPlayerState(); // Test if player is still valid
                        } catch (e) {
                            // Player is already destroyed, skip cleanup
                            return;
                        }
                    }
                    
                    // Pause the video before destroying
                    if (typeof cleanupPlayer.pauseVideo === 'function') {
                        cleanupPlayer.pauseVideo();
                    }
                    // Destroy the player - this will remove the iframe from DOM
                    if (typeof cleanupPlayer.destroy === 'function') {
                        cleanupPlayer.destroy();
                    }
                    unregisterPlayer(cleanupPlayer);
                    // Don't try to remove the iframe container - YouTube's destroy() already did that
                    // and React will handle the container cleanup
                } catch (err) {
                    // Ignore cleanup errors - DOM might already be gone or player already destroyed
                    console.log('Cleanup error (safe to ignore):', err.message);
                }
            }
        };
    }, [isPlaying, videoId, currentTimestamp]);

    // Handle timestamp changes - use a ref to track previous values
    const prevTimestampRef = React.useRef(null);
    const prevVideoIdRef = React.useRef(null);
    
    useEffect(() => {
        if (!isMountedRef.current) return;
        
        // CRITICAL: Check for changes BEFORE updating refs
        // Only consider it changed if both values exist and are different
        const timestampChanged = prevTimestampRef.current !== null && 
                                 timestamp !== null && 
                                 prevTimestampRef.current !== timestamp;
        const videoIdChanged = prevVideoIdRef.current !== null && 
                               videoId !== null && 
                               prevVideoIdRef.current !== videoId;
        
        console.log('[YouTubePlayer] Timestamp effect triggered:', {
            timestamp,
            prevTimestamp: prevTimestampRef.current,
            timestampChanged,
            videoId,
            prevVideoId: prevVideoIdRef.current,
            videoIdChanged,
            isPlaying,
            hasPlayer: !!playerRef.current
        });
        
        if (timestamp !== null && !isPlaying) {
            // Pause all other players IMMEDIATELY before starting a new video
            pauseOtherPlayers(null);
            setCurrentTimestamp(timestamp);
            setIsPlaying(true);
            console.log(`[YouTubePlayer] Auto-playing video ${videoId} at timestamp ${timestamp}`);
        } else if (timestamp !== null && playerRef.current) {
            // Player exists - check if we need to reload for timestamp change
            // Video is already playing - reload if timestamp or video changed
            if (videoIdChanged) {
                console.log(`[YouTubePlayer] Video ID changed from ${prevVideoIdRef.current} to ${videoId}`);
                // Video ID changed - need to reset and let the initialization effect handle it
                try {
                    // Destroy the old player
                    if (typeof playerRef.current.destroy === 'function') {
                        playerRef.current.destroy();
                    }
                    unregisterPlayer(playerRef.current);
                    playerRef.current = null;
                } catch (err) {
                    console.error('Error destroying old player:', err);
                }
                // Reset state to trigger new player creation
                setIsPlaying(false);
                setCurrentTimestamp(timestamp);
                // Small delay to ensure cleanup completes
                setTimeout(() => {
                    if (isMountedRef.current) {
                        setIsPlaying(true);
                    }
                }, 100);
            } else if (timestampChanged) {
                // Same video, different timestamp - just reload
                console.log(`[YouTubePlayer] Timestamp changed from ${prevTimestampRef.current} to ${timestamp}, reloading...`);
                pauseOtherPlayers(playerRef.current);
                setCurrentTimestamp(timestamp);
                // Ensure playing state is set
                if (!isPlaying) {
                    setIsPlaying(true);
                }
                try {
                    // Always reload the video when timestamp changes
                    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
                        playerRef.current.loadVideoById({
                            videoId: videoId,
                            startSeconds: timestamp
                        });
                        playerRef.current.playVideo();
                        // Also pause after playVideo to ensure other players are stopped
                        const reloadPauseTimeout = setTimeout(() => {
                            if (isMountedRef.current && playerRef.current) {
                                pauseOtherPlayers(playerRef.current);
                            }
                        }, 100);
                        // Store timeout ID for cleanup
                        if (playerRef.current) {
                            playerRef.current._reloadPauseTimeout = reloadPauseTimeout;
                        }
                        console.log(`[YouTubePlayer] Reloading video ${videoId} at timestamp ${timestamp}`);
                    } else {
                        console.error('[YouTubePlayer] Player exists but loadVideoById is not available');
                    }
                } catch (err) {
                    console.error('[YouTubePlayer] Error loading video:', err);
                }
            } else {
                console.log('[YouTubePlayer] No changes detected, skipping reload');
            }
        } else if (timestamp === null && isPlaying && playerRef.current) {
            // If timestamp is set to null, pause the video
            try {
                playerRef.current.pauseVideo();
                setIsPlaying(false);
                setCurrentTimestamp(null);
            } catch (err) {
                console.error('Error pausing video:', err);
            }
        }
        
        // Update refs AFTER processing
        prevTimestampRef.current = timestamp;
        prevVideoIdRef.current = videoId;
    }, [timestamp, videoId, isPlaying]);
    
    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            // Pause all players when this component unmounts
            pauseOtherPlayers(null);
            if (playerRef.current) {
                try {
                    if (typeof playerRef.current.pauseVideo === 'function') {
                        playerRef.current.pauseVideo();
                    }
                    if (typeof playerRef.current.destroy === 'function') {
                        playerRef.current.destroy();
                    }
                    unregisterPlayer(playerRef.current);
                } catch (err) {
                    // Ignore errors during cleanup
                }
                playerRef.current = null;
            }
        };
    }, []);

    // Handle play button click - load video with iframe
    const handlePlayClick = () => {
        console.log(`Play button clicked for ${videoId}`);
        setCurrentTimestamp(timestamp);
        setIsPlaying(true);
    };

    // Error display
    if (error) {
        return (
            <div className={styles.errorDisplay}>
                <div>{error}</div>
                <button
                    className={styles.retryButton}
                    onClick={() => {
                        setError(null);
                        handlePlayClick();
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    // Video thumbnail (when not playing)
    if (!isPlaying) {
        return (
            <div className={styles.thumbnailContainer}>
                <img
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt="Video thumbnail"
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                />
                <button
                    className={styles.thumbnailOverlay}
                    onClick={handlePlayClick}
                >
                    <div>
                        <div />
                    </div>
                </button>
            </div>
        );
    }

    // Direct iframe embed - most reliable approach
    // Don't create the iframe container in JSX - let YouTube API create it
    return (
        <div
            className={styles.videoContainer}
            data-video-id={videoId}
            ref={containerRef}
        >
            {/* Container will be created by YouTube API */}
        </div>
    );
};