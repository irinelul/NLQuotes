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
        window.addEventListener('orientationchange', () => {
            // Delay to allow layout to settle after orientation change
            setTimeout(updatePlayerSize, 200);
        });

        return () => {
            window.removeEventListener('resize', updatePlayerSize);
            window.removeEventListener('orientationchange', updatePlayerSize);
        };
    }, [isPlaying]);

    // Initialize YouTube player when iframe is loaded
    useEffect(() => {
        if (isPlaying && iframeRef.current) {
            ensureApiReady().then(() => {
                // Get container dimensions for responsive sizing
                // Use container's actual size or fallback to defaults
                const container = iframeRef.current.parentElement;
                const width = container ? (container.offsetWidth || container.clientWidth || 616) : 616;
                const height = container ? (container.offsetHeight || container.clientHeight || 346) : 346;
                
                const player = new window.YT.Player(iframeRef.current, {
                    width: width,
                    height: height,
                    videoId,
                    playerVars: {
                        autoplay: 1,
                        start: currentTimestamp,
                        enablejsapi: 1,
                        origin: window.location.origin
                    },
                    events: {
                        onReady: (event) => {
                            playerRef.current = event.target;
                            registerPlayer(event.target);
                            // Pause other players before starting this one
                            pauseOtherPlayers(event.target);
                            event.target.playVideo();
                            // Also pause after playVideo to ensure other players are stopped
                            setTimeout(() => {
                                pauseOtherPlayers(event.target);
                            }, 100);
                        },
                        onStateChange: (event) => {
                            if (event.data === window.YT.PlayerState.PLAYING) {
                                // Pause other players when this one starts playing
                                pauseOtherPlayers(event.target);
                            }
                        },
                        onError: () => {
                            setError('Failed to load video');
                            setIsPlaying(false);
                        }
                    }
                });
            }).catch(err => {
                console.error('Error initializing YouTube player:', err);
                setError('Failed to initialize video player');
                setIsPlaying(false);
            });
        }

        return () => {
            if (playerRef.current) {
                unregisterPlayer(playerRef.current);
                playerRef.current = null;
            }
        };
    }, [isPlaying, videoId, currentTimestamp]);

    // Handle timestamp changes - use a ref to track previous values
    const prevTimestampRef = React.useRef(null);
    const prevVideoIdRef = React.useRef(null);
    
    useEffect(() => {
        const timestampChanged = prevTimestampRef.current !== timestamp;
        const videoIdChanged = prevVideoIdRef.current !== videoId;
        
        // Update refs
        prevTimestampRef.current = timestamp;
        prevVideoIdRef.current = videoId;
        
        if (timestamp !== null && !isPlaying) {
            // Pause all other players before starting a new video
            pauseOtherPlayers(null);
            setCurrentTimestamp(timestamp);
            setIsPlaying(true);
            console.log(`Auto-playing video ${videoId} at timestamp ${timestamp}`);
        } else if (timestamp !== null && playerRef.current && isPlaying) {
            // Video is already playing - reload if timestamp or video changed
            if (timestampChanged || videoIdChanged) {
                setCurrentTimestamp(timestamp);
                try {
                    // Pause all other players before loading new video
                    pauseOtherPlayers(playerRef.current);
                    // Always reload the video when timestamp changes
                    playerRef.current.loadVideoById({
                        videoId: videoId,
                        startSeconds: timestamp
                    });
                    playerRef.current.playVideo();
                    // Also pause after playVideo in case timing is off
                    setTimeout(() => {
                        pauseOtherPlayers(playerRef.current);
                    }, 100);
                    console.log(`Reloading video ${videoId} at timestamp ${timestamp}`);
                } catch (err) {
                    console.error('Error loading video:', err);
                }
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
    }, [timestamp, videoId, isPlaying]);

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
    return (
        <div
            className={styles.videoContainer}
            data-video-id={videoId}
        >
            <div className={styles.iframeContainer} ref={iframeRef} />
        </div>
    );
};