import React, { useState, useEffect } from 'react';
import { ensureApiReady, registerPlayer, unregisterPlayer, pauseOtherPlayers, registerInitializingPlayer, unregisterInitializingPlayer } from '../../services/youtubeApiLoader';
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
                
                if (playerRef.current && typeof playerRef.current.setSize === 'function' && width > 0 && height > 0) {
                    try {
                        playerRef.current.setSize(width, height);
                    } catch (err) {
                        // Ignore resize errors
                    }
                }
            }
        };

        window.addEventListener('resize', updatePlayerSize);
        
        let orientationTimeout;
        const handleOrientationChange = () => {
            if (orientationTimeout) {
                clearTimeout(orientationTimeout);
            }
            orientationTimeout = setTimeout(updatePlayerSize, 200);
        };
        window.addEventListener('orientationchange', handleOrientationChange);

        return () => {
            window.removeEventListener('resize', updatePlayerSize);
            window.removeEventListener('orientationchange', handleOrientationChange);
            if (orientationTimeout) {
                clearTimeout(orientationTimeout);
            }
        };
    }, [isPlaying]);

    // Track previous videoId to detect changes
    const prevVideoIdForCleanupRef = React.useRef(videoId);
    
    // Initialize YouTube player when iframe is loaded
    useEffect(() => {
        // If videoId changed, clean up the old player first
        if (prevVideoIdForCleanupRef.current !== videoId && playerRef.current) {
            try {
                if (typeof playerRef.current.pauseVideo === 'function') {
                    playerRef.current.pauseVideo();
                }
                if (typeof playerRef.current.destroy === 'function') {
                    playerRef.current.destroy();
                }
                unregisterPlayer(playerRef.current);
                playerRef.current = null;
                
                setIsPlaying(false);
                setError(null);
                setCurrentTimestamp(null);
                
                iframeContainerIdRef.current = `yt-player-${Math.random().toString(36).substr(2, 9)}`;
            } catch (err) {
                // Ignore cleanup errors
            }
        }
        
        prevVideoIdForCleanupRef.current = videoId;
        
        if (isPlaying && containerRef.current) {
            pauseOtherPlayers(null);
            
            let iframeContainer = containerRef.current.querySelector(`#${iframeContainerIdRef.current}`);
            if (!iframeContainer) {
                iframeContainer = document.createElement('div');
                iframeContainer.id = iframeContainerIdRef.current;
                iframeContainer.className = styles.iframeContainer;
                containerRef.current.appendChild(iframeContainer);
            }
            iframeRef.current = iframeContainer;
            
            ensureApiReady().then(() => {
                if (!isMountedRef.current || !iframeRef.current || !containerRef.current || prevVideoIdForCleanupRef.current !== videoId) {
                    return;
                }
                
                const container = containerRef.current;
                const width = container ? (container.offsetWidth || container.clientWidth || 616) : 616;
                const height = container ? (container.offsetHeight || container.clientHeight || 346) : 346;
                
                let origin = window.location.origin;
                
                if (document.querySelector('meta[http-equiv="X-Forwarded-Host"]')) {
                    const forwardedHost = document.querySelector('meta[http-equiv="X-Forwarded-Host"]')?.content;
                    const forwardedProto = document.querySelector('meta[http-equiv="X-Forwarded-Proto"]')?.content || window.location.protocol.replace(':', '');
                    if (forwardedHost) {
                        origin = `${forwardedProto}://${forwardedHost}`;
                    }
                }
                
                if (!origin || origin === 'null' || origin.includes('undefined')) {
                    origin = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
                }
                
                const playerVars = {
                    autoplay: 1,
                    start: currentTimestamp,
                    enablejsapi: 1,
                    rel: 0,
                    modestbranding: 1
                };
                
                if (origin && origin.startsWith('http')) {
                    playerVars.origin = origin;
                }
                
                const playerInstance = new window.YT.Player(iframeRef.current, {
                    width: width,
                    height: height,
                    videoId,
                    playerVars: playerVars,
                    events: {
                        onReady: (event) => {
                            if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) {
                                try {
                                    event.target.destroy();
                                    unregisterInitializingPlayer(event.target);
                                } catch (e) {
                                    // Ignore
                                }
                                return;
                            }
                            playerRef.current = event.target;
                            registerPlayer(event.target);
                            unregisterInitializingPlayer(event.target);
                            pauseOtherPlayers(event.target);
                            event.target.playVideo();
                            const pauseTimeout = setTimeout(() => {
                                if (isMountedRef.current && playerRef.current && prevVideoIdForCleanupRef.current === videoId) {
                                    pauseOtherPlayers(playerRef.current);
                                }
                            }, 100);
                            if (playerRef.current) {
                                playerRef.current._pauseTimeout = pauseTimeout;
                            }
                        },
                        onStateChange: (event) => {
                            if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) return;
                            if (event.data === window.YT.PlayerState.PLAYING) {
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
                
                registerInitializingPlayer(playerInstance);
            }).catch(err => {
                if (!isMountedRef.current || prevVideoIdForCleanupRef.current !== videoId) return;
                console.error('[YouTubePlayer] Error initializing:', err.message);
                
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
            const cleanupPlayer = playerRef.current;
            
            if (cleanupPlayer) {
                if (cleanupPlayer._pauseTimeout) {
                    clearTimeout(cleanupPlayer._pauseTimeout);
                }
                if (cleanupPlayer._reloadPauseTimeout) {
                    clearTimeout(cleanupPlayer._reloadPauseTimeout);
                }
                
                playerRef.current = null;
                
                try {
                    if (cleanupPlayer && typeof cleanupPlayer.getPlayerState === 'function') {
                        try {
                            cleanupPlayer.getPlayerState();
                        } catch (e) {
                            return;
                        }
                    }
                    
                    if (typeof cleanupPlayer.pauseVideo === 'function') {
                        cleanupPlayer.pauseVideo();
                    }
                    if (typeof cleanupPlayer.destroy === 'function') {
                        cleanupPlayer.destroy();
                    }
                    unregisterPlayer(cleanupPlayer);
                } catch (err) {
                    // Ignore cleanup errors
                }
            }
        };
    }, [isPlaying, videoId, currentTimestamp]);

    // Handle timestamp changes
    const prevTimestampRef = React.useRef(null);
    const prevVideoIdRef = React.useRef(null);
    
    useEffect(() => {
        if (!isMountedRef.current) return;
        
        const timestampChanged = timestamp !== null && 
                                 prevTimestampRef.current !== timestamp &&
                                 (prevTimestampRef.current === null || prevTimestampRef.current !== timestamp);
        const videoIdChanged = videoId !== null && 
                               prevVideoIdRef.current !== videoId &&
                               (prevVideoIdRef.current === null || prevVideoIdRef.current !== videoId);
        
        if (timestamp !== null && !isPlaying) {
            pauseOtherPlayers(null);
            setCurrentTimestamp(timestamp);
            setIsPlaying(true);
        } else if (timestamp !== null && playerRef.current) {
            if (videoIdChanged) {
                try {
                    if (typeof playerRef.current.destroy === 'function') {
                        playerRef.current.destroy();
                    }
                    unregisterPlayer(playerRef.current);
                    playerRef.current = null;
                } catch (err) {
                    // Ignore
                }
                setIsPlaying(false);
                setCurrentTimestamp(timestamp);
                setTimeout(() => {
                    if (isMountedRef.current) {
                        setIsPlaying(true);
                    }
                }, 100);
            } else if (timestampChanged) {
                pauseOtherPlayers(playerRef.current);
                setCurrentTimestamp(timestamp);
                if (!isPlaying) {
                    setIsPlaying(true);
                }
                try {
                    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
                        const currentVideoId = playerRef.current.getVideoData ? playerRef.current.getVideoData().video_id : null;
                        if (currentVideoId === videoId) {
                            if (typeof playerRef.current.seekTo === 'function') {
                                playerRef.current.seekTo(timestamp, true);
                                playerRef.current.playVideo();
                            } else {
                                playerRef.current.loadVideoById({
                                    videoId: videoId,
                                    startSeconds: timestamp
                                });
                                playerRef.current.playVideo();
                            }
                        } else {
                            playerRef.current.loadVideoById({
                                videoId: videoId,
                                startSeconds: timestamp
                            });
                            playerRef.current.playVideo();
                        }
                        const reloadPauseTimeout = setTimeout(() => {
                            if (isMountedRef.current && playerRef.current) {
                                pauseOtherPlayers(playerRef.current);
                            }
                        }, 100);
                        if (playerRef.current) {
                            playerRef.current._reloadPauseTimeout = reloadPauseTimeout;
                        }
                    }
                } catch (err) {
                    console.error('[YouTubePlayer] Error loading video:', err.message);
                    setIsPlaying(false);
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            setCurrentTimestamp(timestamp);
                            setIsPlaying(true);
                        }
                    }, 200);
                }
            }
        } else if (timestamp === null && isPlaying && playerRef.current) {
            try {
                playerRef.current.pauseVideo();
                setIsPlaying(false);
                setCurrentTimestamp(null);
            } catch (err) {
                // Ignore
            }
        }
        
        prevTimestampRef.current = timestamp;
        prevVideoIdRef.current = videoId;
    }, [timestamp, videoId, isPlaying]);
    
    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
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
                    // Ignore
                }
                playerRef.current = null;
            }
        };
    }, []);

    // Handle play button click
    const handlePlayClick = () => {
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

    // Direct iframe embed
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
