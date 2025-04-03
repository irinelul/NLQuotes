import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams,useLocation  } from 'react-router-dom';
import { format } from 'date-fns';
import Disclaimer from './components/Disclaimer';
import SearchableDropdown from './components/SearchableDropdown';
import BetaDisclaimer from './components/BetaDisclaimer';
import { ensureApiReady, registerPlayer, unregisterPlayer, pauseOtherPlayers } from './services/youtubeApiLoader';
import DOMPurify from 'dompurify';

const URL = 'https://www.youtube.com/watch?v=';

// Using the player registry from youtubeApiLoader for managing multiple players

// Simpler approach with minimal DOM manipulation
const YouTubePlayer = ({ videoId, timestamp, onTimestampClick }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(null);
    const [currentTimestamp, setCurrentTimestamp] = useState(timestamp);
    const iframeRef = React.useRef(null);
    const playerRef = React.useRef(null);
    
    // Initialize YouTube player when iframe is loaded
    useEffect(() => {
        if (isPlaying && iframeRef.current) {
            ensureApiReady().then(() => {
                const player = new window.YT.Player(iframeRef.current, {
                    videoId,
                    playerVars: {
                        autoplay: 1,
                        start: Math.max(1, Math.floor(currentTimestamp) - 1),
                        enablejsapi: 1,
                        origin: window.location.origin
                    },
                    events: {
                        onReady: (event) => {
                            playerRef.current = event.target;
                            registerPlayer(event.target);
                            event.target.playVideo();
                            pauseOtherPlayers(event.target);
                        },
                        onStateChange: (event) => {
                            if (event.data === window.YT.PlayerState.PLAYING) {
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
    }, [isPlaying, videoId]);

    // Handle timestamp changes
    useEffect(() => {
        if (timestamp && !isPlaying) {
            setCurrentTimestamp(timestamp);
            setIsPlaying(true);
            console.log(`Auto-playing video ${videoId} at timestamp ${timestamp}`);
        } else if (timestamp && playerRef.current) {
            setCurrentTimestamp(timestamp);
            const seconds = Math.max(1, Math.floor(timestamp) - 1);
            try {
                // Always reload the video when timestamp changes
                playerRef.current.loadVideoById({
                    videoId: videoId,
                    startSeconds: seconds
                });
                playerRef.current.playVideo();
                pauseOtherPlayers(playerRef.current);
                console.log(`Loading video ${videoId} at timestamp ${seconds}`);
            } catch (err) {
                console.error('Error loading video:', err);
            }
        }
    }, [timestamp, videoId, isPlaying]);
    
    // Handle play button click - load video with iframe
    const handlePlayClick = () => {
        console.log(`Play button clicked for ${videoId}`);
        setCurrentTimestamp(timestamp || 0);
        setIsPlaying(true);
    };
    
    // Handle errors with iframe loading
    const handleIframeError = () => {
        setError('Failed to load video');
        setIsPlaying(false);
    };

    // We don't need getIframeSrc anymore as we're using the YouTube Player API directly

    // Error display
    if (error) {
        return (
            <div style={{ 
                width: '480px', 
                height: '270px', 
                backgroundColor: 'var(--surface-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                flexDirection: 'column',
                gap: '10px',
                padding: '1rem'
            }}>
                <div>{error}</div>
                <button 
                    onClick={() => {
                        setError(null);
                        handlePlayClick();
                    }}
                    style={{
                        padding: '5px 10px',
                        background: 'var(--accent-color)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
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
            <div
                style={{ 
                    width: '480px', 
                    height: '270px', 
                    position: 'relative',
                    backgroundColor: 'var(--surface-color)',
                    overflow: 'hidden'
                }}
            >
                <img 
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt="Video thumbnail"
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                    onError={(e) => {
                        e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        backgroundColor: 'rgba(0,0,0,0.2)'
                    }}
                    onClick={handlePlayClick}
                >
                    <div
                        style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(255,0,0,0.8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <div
                            style={{
                                width: '0',
                                height: '0',
                                borderTop: '15px solid transparent',
                                borderBottom: '15px solid transparent',
                                borderLeft: '24px solid white',
                                marginLeft: '5px'
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Direct iframe embed - most reliable approach
    return (
        <div
            style={{ 
                width: '480px', 
                height: '270px',
                backgroundColor: 'var(--surface-color)',
                overflow: 'hidden'
            }}
            data-video-id={videoId}
        >
            <div
                ref={iframeRef}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: isPlaying ? 'block' : 'none'
                }}
                setIsPlaying={setIsPlaying}
            ></div>
            {!isPlaying && (
                <img 
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt="Video thumbnail"
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: isPlaying ? 'none' : 'block'
                    }}
                    onError={(e) => {
                        e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                />
            )}
        </div>
    );
};

const FlagModal = ({ isOpen, onClose, onSubmit, quote }) => {
    const [reason, setReason] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(reason);
        setReason('');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Flag Quote</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Please provide a reason for flagging this quote:
                </p>
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Enter your reason here..."
                        required
                    />
                    <div className="modal-buttons">
                        <button type="button" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit">
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const backdateTimestamp = (timestamp) => {
    return Math.max(0, Math.floor(timestamp) - 1);
}

// `b` is returned from ts_headline when a match is found
const ALLOWED_TAGS = ['b'];

const FeedbackModal = ({ isOpen, onClose, onSubmit }) => {
    const [feedback, setFeedback] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(feedback);
        setFeedback('');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Send Feedback</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Share your thoughts about the website or suggest improvements:
                </p>
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Enter your feedback here..."
                        required
                    />
                    <div className="modal-buttons">
                        <button type="button" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit">
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const useQuery = () => {
    return new URLSearchParams(useLocation().search);
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    
    // If it's already a Date object
    if (date instanceof Date) {
        return format(date, 'dd MMMM yyyy');
    }
    
    // If it's a string in YYYYMMDD format
    if (typeof date === 'string' && date.length === 8) {
        const dateObj = new Date(
            date.slice(0, 4),  // Year
            date.slice(4, 6) - 1, // Month (0-indexed)
            date.slice(6, 8) // Day
        );
        return format(dateObj, 'dd MMMM yyyy');
    }
    
    // If it's an ISO string or other date string
    try {
        const dateObj = new Date(date);
        return format(dateObj, 'dd MMMM yyyy');
    } catch (e) {
        return 'Invalid Date';
    }
};

const formatTimestamp = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    const pad = (num) => num.toString().padStart(2, '0');
    
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
    }
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
};

const Quotes = ({ quotes = [], searchTerm }) => {
    const [flagging, setFlagging] = useState({});
    const [modalState, setModalState] = useState({
        isOpen: false,
        quote: null,
        videoId: null,
        title: null,
        channel: null,
        timestamp: null
    });
    const [activeTimestamp, setActiveTimestamp] = useState({ videoId: null, timestamp: null });
    const [showEmbeddedVideos] = useState(true);
    const [isViewSwitching, setIsViewSwitching] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    // Effect to handle video loading retry
    useEffect(() => {
        if (showEmbeddedVideos && retryCount < 1) {
            const timer = setTimeout(() => {
                setRetryCount(prev => prev + 1);
                setIsViewSwitching(false); // Reset the loading state after retry
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [showEmbeddedVideos, retryCount]);

    const handleTimestampClick = (videoId, timestamp) => {
        // If clicking a quote from a different video, stop the current video
        if (activeTimestamp.videoId && activeTimestamp.videoId !== videoId) {
            // Use pauseOtherPlayers from our registry
            pauseOtherPlayers(null); // Passing null to pause all players
        }
        
        // Always set the active timestamp which will trigger video loading
        setActiveTimestamp({ videoId, timestamp });
    };

    const handleFlagClick = (quote, videoId, title, channel, timestamp) => {
        setModalState({
            isOpen: true,
            quote,
            videoId,
            title,
            channel,
            timestamp
        });
    };

    const handleFlagSubmit = async (reason) => {
        try {
            setFlagging(prev => ({ ...prev, [`${modalState.videoId}-${modalState.timestamp}`]: true }));
            await query.flagQuote({
                quote: modalState.quote,
                searchTerm,
                timestamp: modalState.timestamp,
                videoId: modalState.videoId,
                title: modalState.title,
                channel: modalState.channel,
                reason
            });
            alert('Quote flagged successfully!');
            setModalState(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error('Error flagging quote:', error);
            alert('Unable to flag quote due to database connection issues. If you\'re on the deployed site, please try the main site at nlquotes.com.');
        } finally {
            setFlagging(prev => ({ ...prev, [`${modalState.video_id}-${modalState.timestamp}`]: false }));
        }
    };

    return (
        <div>
            {quotes.length > 0 ? (
                <table className="quotes-table">
                    <thead>
                        <tr>
                            <th style={{ width: '480px', textAlign: 'center' }}>Video</th>
                            <th style={{ width: '200px', textAlign: 'center' }}>Channel & Date</th>
                            <th style={{ width: 'calc(100% - 680px)', textAlign: 'center' }}>Quotes with Timestamps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map((quoteGroup) => (
                            <tr key={quoteGroup.video_id || `quote-group-${Math.random()}`} style={{
                                borderBottom: '2px solid var(--border-color)',
                                height: quoteGroup.quotes?.length > 6 ? '500px' : 'auto',
                                padding: '1rem 0'
                            }}>
                                <td style={{ 
                                    padding: '1rem',
                                    verticalAlign: 'middle',
                                    height: '100%',
                                    textAlign: 'center'
                                }}>
                                    <YouTubePlayer 
                                        key={`${quoteGroup.video_id}-${retryCount}`}
                                        videoId={quoteGroup.video_id}
                                        timestamp={activeTimestamp.videoId === quoteGroup.video_id ? activeTimestamp.timestamp : null}
                                        onTimestampClick={handleTimestampClick}
                                    />
                                </td>
                                <td style={{ 
                                    verticalAlign: 'middle',
                                    padding: '1rem',
                                    textAlign: 'center'
                                }}>
                                    <div>{quoteGroup.quotes[0]?.channel_source || 'N/A'}</div>
                                    <div style={{ marginTop: '0.5rem' }}>
                                        {quoteGroup.quotes[0]?.upload_date
                                            ? formatDate(quoteGroup.quotes[0].upload_date)
                                            : 'N/A'}
                                    </div>
                                </td>
                                <td style={{
                                    verticalAlign: 'middle',
                                    height: '100%',
                                    padding: '1rem',
                                    maxHeight: quoteGroup.quotes?.length > 6 ? '500px' : 'none',
                                    overflow: 'hidden',
                                    textAlign: 'center'
                                }}>
                                    <div style={{
                                        width: '100%',
                                        height: quoteGroup.quotes?.length > 6 ? '500px' : 'auto',
                                        overflowY: quoteGroup.quotes?.length > 6 ? 'auto' : 'hidden',
                                        padding: '0.5rem 0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: quoteGroup.quotes?.length > 6 ? 'flex-start' : 'center',
                                        alignItems: 'flex-start'
                                    }}>
                                        {quoteGroup.quotes?.map((quote, index) => (
                                            <div className="quote-item" key={index} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                marginBottom: '0.75rem',
                                                padding: '0.75rem 0',
                                                borderBottom: index < quoteGroup.quotes.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                borderColor: 'var(--border-color)',
                                                flexShrink: 0, 
                                                width: '100%' 
                                            }}>
                                                <button
                                                    onClick={() => handleTimestampClick(quoteGroup.video_id, backdateTimestamp(quote.timestamp_start))}
                                                    style={{
                                                        flex: 1,
                                                        textAlign: 'left',
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#4A90E2',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        font: 'inherit'
                                                    }}
                                                >
                                                    <span style={{ verticalAlign: 'middle' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quote.text, { ALLOWED_TAGS }) }} />
                                                    <span style={{ verticalAlign: 'middle', marginLeft: '0.5em' }}>
                                                        ({formatTimestamp(backdateTimestamp(quote.timestamp_start))})
                                                    </span>
                                                </button>

                                                <button
                                                    onClick={() => handleFlagClick(
                                                        quote.text,
                                                        quoteGroup.video_id,
                                                        quoteGroup.quotes[0]?.title,
                                                        quoteGroup.quotes[0]?.channel_source,
                                                        quote.timestamp_start
                                                    )}
                                                    disabled={flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]}
                                                    style={{
                                                        backgroundColor: 'transparent',
                                                        color: 'var(--accent-color)',
                                                        border: 'none',
                                                        marginLeft: 'auto',
                                                        padding: '0.5rem',
                                                        cursor: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 'not-allowed' : 'pointer',
                                                        opacity: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 0.6 : 1,
                                                        fontSize: '1.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'transform 0.2s'
                                                    }}
                                                    onMouseOver={e => {
                                                        if (!flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]) {
                                                            e.currentTarget.style.transform = 'scale(1.1)';
                                                        }
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                    }}
                                                >
                                                    {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div style={{ 
                    textAlign: 'center', 
                    color: 'var(--text-secondary)',
                    padding: '2rem',
                    fontSize: '1.1rem'
                }}>
                    No quotes found
                </div>
            )}
            <FlagModal
                isOpen={modalState.isOpen}
                onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                onSubmit={handleFlagSubmit}
                quote={modalState.quote}
            />
        </div>
    );
};

// Add a fallback function for when API calls fail during migration
const useEmptyQuotesFallback = () => {
    return {
        data: [],
        total: 0,
        totalQuotes: 0
    };
};

const App = () => {
    const [quotes, setQuotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [strict, setStrict] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [stats, setStats] = useState([]);
    const [totalPages, setTotalPages] = useState(0);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [selectedChannel, setselectedChannel] = useState("all");
    const [selectedYear, setSelectedYear] = useState("");
    const [sortOrder, setSortOrder] = useState("default");
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [games, setGames] = useState([]);
    const [selectedGame, setSelectedGame] = useState("all");
    const [activeTimestamp, setActiveTimestamp] = useState({ videoId: null, timestamp: null });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                // Try multiple path configurations to handle potential Render.com path issues
                const pathsToTry = [
                    '/api/games',
                    '/games',
                    '/app/api/games'
                ];
                
                let gamesData = null;
                let failureMessages = [];
                
                // Try each path until one works
                for (const path of pathsToTry) {
                    try {
                        console.log(`Trying to fetch games from: ${path}`);
                        const response = await fetch(path, {
                            cache: 'no-store', // Disable caching
                            headers: {
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache',
                                'Expires': '0'
                            }
                        });
                        
                        // Check if we got a valid response
                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.games && Array.isArray(data.games)) {
                                gamesData = data;
                                console.log(`Successfully fetched games from ${path}`);
                                break;
                            } else {
                                console.log(`Response from ${path} didn't contain valid games data`);
                                failureMessages.push(`Invalid data from ${path}`);
                            }
                        } else {
                            const errorMsg = `Failed to fetch games from ${path}: ${response.status}`;
                            console.log(errorMsg);
                            failureMessages.push(errorMsg);
                        }
                    } catch (pathError) {
                        const errorMsg = `Error fetching games from ${path}: ${pathError.message}`;
                        console.log(errorMsg);
                        failureMessages.push(errorMsg);
                    }
                }
                
                // If we got data from any of the paths, use it
                if (gamesData && gamesData.games) {
                    setGames(gamesData.games);
                } else {
                    // When no paths worked, set empty array but log detailed error info
                    console.error('All paths failed. Details:', failureMessages.join('; '));
                    console.log('Database connection issue detected - using empty games array');
                    setGames([]);
                }
            } catch (error) {
                console.error('Error fetching games:', error);
                // Set empty array as fallback
                setGames([]);
            }
        };
        fetchGames();
    }, []);

    const handleChannelChange = (e) => {
        const value = e.target.value;
        setselectedChannel(value);
        setPage(1);
        if (searchTerm.trim()) {
            fetchQuotes(1, value, selectedYear, sortOrder, strict, selectedGame);
        }
    };

    const handleYearChange = (e) => {
        const value = e.target.value;
        setSelectedYear(value);
        if (value.length === 4) {
            setPage(1);
            if (searchTerm.trim()) {
                fetchQuotes(1, selectedChannel, value, sortOrder, strict, selectedGame);
            }
        }
    };

    const handleSortChange = (e) => {
        const value = e.target.value;
        setSortOrder(value);
        setPage(1);
        if (searchTerm.trim()) {
            fetchQuotes(1, selectedChannel, selectedYear, value, strict, selectedGame);
        }
    };

    const handleSearchModeChange = (e) => {
        const value = e.target.checked;
        setStrict(value);
        setPage(1);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm.trim().length > 2) {
            setPage(1);
            fetchQuotes(1, selectedChannel, selectedYear, sortOrder, strict, selectedGame);
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        fetchQuotes(newPage, selectedChannel, selectedYear, sortOrder, strict, selectedGame);
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            if (searchTerm.trim().length > 2) {
                setPage(1);
                fetchQuotes(1, selectedChannel, selectedYear, sortOrder, strict, selectedGame);
            } else {
                setError('Please enter at least 3 characters to search');
                setTimeout(() => setError(null), 3000);
            }
        }
    };

    const handleRandomQuotes = async () => {
        setLoading(true);
        setError(null);
        setHasSearched(true);
        try {
            console.log('Fetching random quotes...');
            const response = await query.getRandomQuotes();
            console.log('Random quotes response:', response);
            
            if (!response || !response.quotes) {
                throw new Error('Invalid response format from server');
            }
            
            setQuotes(response.quotes);
            setTotalPages(1);
            setPage(1);
            setTotalQuotes(response.quotes.length);
        } catch (error) {
            console.error('Error fetching random quotes:', error);
            setError(error.message || 'Unable to fetch random quotes. Please try again later.');
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
        } finally {
            setLoading(false);
        }
    };

    const handleGameChange = (e) => {
        const value = e.target.value;
        setSelectedGame(value);
        setPage(1);
        if (searchTerm.trim()) {
            fetchQuotes(1, selectedChannel, selectedYear, sortOrder, strict, value);
        }
    };

    const fetchQuotes = async (pageNum = page, channel = selectedChannel, year = selectedYear, sort = sortOrder, strictMode = strict, game = selectedGame) => {
        if (searchTerm.trim()) {
            setLoading(true);
            setError(null);
            setHasSearched(true);
            setQuotes([]);
            try {
                const response = await query.getAll(
                    searchTerm,
                    pageNum,
                    strictMode,
                    channel,
                    "searchText",
                    year,
                    sort,
                    game
                );
                setQuotes(response.data);
                setTotalPages(Math.ceil(response.total / 10));
                setTotalQuotes(response.totalQuotes || 0);
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error('Error fetching quotes:', error);
                setError('Unable to connect to database. If you\'re seeing this on the deployed site, try the main site at nlquotes.com. Database connection works fine on local development.');
                setQuotes([]);
                setTotalPages(0);
                setTotalQuotes(0);
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const urlSearchTerm = searchParams.get('search') || '';
        const urlPage = parseInt(searchParams.get('page')) || 1;
        const urlStrict = searchParams.get('strict') === 'true';

        setSearchTerm(urlSearchTerm);
        setPage(urlPage);
        setStrict(urlStrict);
    }, [searchParams]);

    const numberFormatter = new Intl.NumberFormat('en-US');

    const handleFeedbackSubmit = async (feedback) => {
        try {
            setSubmittingFeedback(true);
            await query.flagQuote({
                quote: "Website Feedback",
                searchTerm: "Feedback",
                timestamp: "0",
                videoId: "feedback",
                title: "Website Feedback",
                channel: "User Feedback",
                reason: feedback
            });
            alert('Thank you for your feedback!');
            setFeedbackModalOpen(false);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            alert('Unable to submit feedback due to database connection issues. If you\'re on the deployed site, please try the main site at nlquotes.com.');
        } finally {
            setSubmittingFeedback(false);
        }
    };

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            marginTop: '2rem',
            width: '100%',
            height: '100%',
        }}>
            <div className="logo-container" onClick={() => {
                setSearchTerm('');
                setQuotes([]);
                setHasSearched(false);
                setPage(1);
                navigate('/');
            }}>
                <img src="/NLogo.png" alt="Northernlion Logo" />
            </div>
            <div className="input-container">
                <button 
                    onClick={handleRandomQuotes}
                    disabled={loading}
                    style={{
                        opacity: loading ? 0.7 : 1,
                        transform: loading ? 'scale(0.98)' : 'scale(1)',
                        transition: 'all 0.2s ease'
                    }}
                >
                    {loading ? 'Loading...' : 'Random Quotes'}
                </button>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Search quotes..."
                    className="search-input"
                />
                <button onClick={handleSearch}>Search</button>
                <button 
                    onClick={() => {
                        setSearchTerm('');
                        setQuotes([]);
                        setHasSearched(false);
                        setPage(1);
                        setSelectedYear('');
                        setSortOrder('default');
                        setselectedChannel('all');
                        setSelectedGame('all');
                        navigate('/');
                    }}
                    style={{ marginLeft: '0.5rem' }}
                >
                    Reset Search
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="radio-group channel-tooltip">
                <div
                    className={`radio-button ${selectedChannel === "all" ? 'selected' : ''}`}
                    onClick={() => handleChannelChange({ target: { value: "all" } })}
                >
                    <input
                        type="radio"
                        id="all"
                        value="all"
                        checked={selectedChannel === "all"}
                        onChange={handleChannelChange}
                    />
                    <label htmlFor="all" className="radio-label">
                        All Sources
                    </label>
                </div>

                <div
                    className={`radio-button ${selectedChannel === "Librarian" ? 'selected' : ''}`}
                    onClick={() => handleChannelChange({ target: { value: "Librarian" } })}
                >
                    <input
                        type="radio"
                        id="librarian"
                        value="Librarian"
                        checked={selectedChannel === "Librarian"}
                        onChange={handleChannelChange}
                    />
                    <label htmlFor="librarian" className="radio-label">
                        Librarian
                    </label>
                </div>

                <div
                    className={`radio-button ${selectedChannel === "Northernlion" ? 'selected' : ''}`}
                    onClick={() => handleChannelChange({ target: { value: "Northernlion" } })}
                >
                    <input
                        type="radio"
                        id="northernlion"
                        value="Northernlion"
                        checked={selectedChannel === "Northernlion"}
                        onChange={handleChannelChange}
                    />
                    <label htmlFor="northernlion" className="radio-label">
                        Northernlion
                    </label>
                </div>
            </div>

            <div className="filter-container">
                <div className="year-tooltip">
                    <input
                        type="text"
                        value={selectedYear}
                        onChange={handleYearChange}
                        placeholder="Year (YYYY)"
                        maxLength="4"
                        className="year-input"
                    />
                </div>
                <div className="sort-tooltip">
                    <select
                        value={sortOrder}
                        onChange={handleSortChange}
                        className="sort-select"
                    >
                        <option value="default">Default Order</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>
                <div className="game-filter-container">
                    <div className="game-tooltip">
                        <SearchableDropdown
                            options={games}
                            value={selectedGame}
                            onChange={handleGameChange}
                            placeholder="Select a game"
                        />
                    </div>
                    <button 
                        className="reset-game-button"
                        onClick={() => {
                            setSelectedGame("all");
                            if (searchTerm) handleSearch();
                        }}
                    >
                        ↺
                    </button>
                </div>
            </div>

            {!hasSearched && <Disclaimer />}

            {loading && <div>Loading...</div>}
            {hasSearched && (
                <>
                    <div style={{ 
                        textAlign: 'center', 
                        color: 'var(--text-secondary)',
                        marginBottom: '1rem',
                        fontSize: '1.1rem'
                    }}>
                        Total quotes found: {numberFormatter.format(totalQuotes)}
                    </div>
                    <Quotes quotes={quotes} searchTerm={searchTerm} />
                </>
            )}
            
            {quotes.length > 0 && (
                <div className="pagination-buttons">
                    <button 
                        onClick={() => handlePageChange(page - 1)} 
                        disabled={page === 1}
                    >
                        Previous
                    </button>
                    <span className="pagination-info">
                        Page {page} of {totalPages || 1}
                    </span>
                    <button 
                        onClick={() => handlePageChange(page + 1)} 
                        disabled={page >= totalPages || totalPages === 0}
                    >
                        Next
                    </button>
                </div>
            )}
            
            <div className="footer-message">
                Made with passion by a fan • Generously supported by The Librarian
            </div>

            <button 
                className="feedback-button"
                onClick={() => setFeedbackModalOpen(true)}
                disabled={submittingFeedback}
            >
                💡 Send Feedback
            </button>

            <FeedbackModal
                isOpen={feedbackModalOpen}
                onClose={() => setFeedbackModalOpen(false)}
                onSubmit={handleFeedbackSubmit}
            />
        </div>
    );
};

export default App;