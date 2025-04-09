import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import Disclaimer from './components/Disclaimer';
import SearchableDropdown from './components/SearchableDropdown';
import { pauseOtherPlayers } from './services/youtubeApiLoader';
import DOMPurify from 'dompurify';
import { YouTubePlayer } from './components/YoutubePlayer';

// Using the player registry from youtubeApiLoader for managing multiple players

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
    const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

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

    // Effect to handle responsive layout
    useEffect(() => {
        const handleResize = () => {
            setIsMobileView(window.innerWidth <= 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // Desktop layout
    const renderDesktopLayout = () => (
        <table className="quotes-table">
            <thead>
                <tr>
                    <th style={{ width: '720px', textAlign: 'center' }}>Video</th>
                    <th style={{ width: 'calc(100% - 720px)', textAlign: 'center' }}>Quotes with Timestamps</th>
                </tr>
            </thead>
            <tbody>
                {quotes.map((quoteGroup) => (
                    <tr key={quoteGroup.video_id || `quote-group-${Math.random()}`} style={{
                        borderBottom: '2px solid var(--border-color)',
                        height: '450px',
                        padding: '1rem 0'
                    }}>
                        <td style={{
                            padding: '1rem',
                            verticalAlign: 'middle',
                            height: '100%',
                            textAlign: 'center',
                            width: '720px'
                        }}>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                height: '470px',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ fontWeight: 'bold' }}>
                                    {quoteGroup.quotes[0]?.title || 'N/A'}
                                </div>
                                <YouTubePlayer
                                    key={`${quoteGroup.video_id}-${retryCount}`}
                                    videoId={quoteGroup.video_id}
                                    timestamp={activeTimestamp.videoId === quoteGroup.video_id ? activeTimestamp.timestamp : null}
                                    onTimestampClick={handleTimestampClick}
                                />
                                <div>
                                    {quoteGroup.quotes[0]?.channel_source || 'N/A'} - {quoteGroup.quotes[0]?.upload_date
                                        ? formatDate(quoteGroup.quotes[0].upload_date)
                                        : 'N/A'}
                                </div>
                            </div>
                        </td>
                        <td style={{
                            verticalAlign: 'middle',
                            height: '100%',
                            padding: '1rem',
                            maxHeight: '450px',
                            overflow: 'visible',
                            textAlign: 'center',
                            position: 'relative'
                        }}>
                            <div style={{
                                width: '100%',
                                height: quoteGroup.quotes?.length > 2 ? '450px' : 'auto',
                                overflowY: quoteGroup.quotes?.length > 2 ? 'auto' : 'visible',
                                padding: '0.5rem 0',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: quoteGroup.quotes?.length > 2 ? 'flex-start' : 'center',
                                alignItems: 'flex-start',
                                position: 'relative'
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
                                        width: '100%',
                                        overflow: 'visible',
                                        wordBreak: 'break-word',
                                        position: 'relative'
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
                                                font: 'inherit',
                                                minWidth: 0,
                                                overflow: 'visible',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                                transition: 'transform 0.2s ease',
                                                position: 'relative',
                                                zIndex: 2
                                            }}
                                            onMouseOver={e => {
                                                e.currentTarget.style.transform = 'scale(1.02)';
                                            }}
                                            onMouseOut={e => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                            }}
                                        >
                                            <span style={{ verticalAlign: 'middle' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quote.text, { ALLOWED_TAGS }) }} />
                                            <span style={{ verticalAlign: 'middle', marginLeft: '0.5em' }}>
                                                ({formatTimestamp(backdateTimestamp(quote.timestamp_start))})
                                            </span>
                                        </button>

                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                            marginLeft: 'auto',
                                            flexShrink: 0
                                        }}>
                                            <button
                                                onClick={() => {
                                                    // Strip HTML tags from the text
                                                    const textToCopy = quote.text.replace(/<[^>]*>/g, '');
                                                    navigator.clipboard.writeText(textToCopy).then(() => {
                                                        // Show a temporary success indicator
                                                        const button = event.currentTarget;
                                                        const originalText = button.innerHTML;
                                                        button.innerHTML = '✓';
                                                        button.style.color = '#4CAF50';
                                                        setTimeout(() => {
                                                            button.innerHTML = originalText;
                                                            button.style.color = '#4A90E2';
                                                        }, 1000);
                                                    });
                                                }}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    color: '#4A90E2',
                                                    border: 'none',
                                                    padding: '0.5rem',
                                                    cursor: 'pointer',
                                                    fontSize: '1.25rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseOver={e => {
                                                    e.currentTarget.style.transform = 'scale(1.3)';
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                📋
                                            </button>

                                            <button
                                                onClick={() => window.open(`https://www.youtube.com/watch?v=${quoteGroup.video_id}&t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`, '_blank')}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    color: '#4A90E2',
                                                    border: 'none',
                                                    padding: '0.5rem',
                                                    cursor: 'pointer',
                                                    fontSize: '1.25rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseOver={e => {
                                                    e.currentTarget.style.transform = 'scale(1.3)';
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                ↗
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
                                                        e.currentTarget.style.transform = 'scale(1.3)';
                                                    }
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    // Mobile layout
    const renderMobileLayout = () => (
        <div className="mobile-quotes-container">
            {quotes.map((quoteGroup) => (
                <div key={quoteGroup.video_id || `quote-group-${Math.random()}`} className="mobile-quote-group">
                    <div className="mobile-video-title" style={{ fontWeight: 'bold', padding: '1rem 0.5rem', textAlign: 'center' }}>
                        {quoteGroup.quotes[0]?.title || 'N/A'}
                    </div>

                    <div className="mobile-video-container" style={{ width: '100%', maxWidth: '480px', margin: '0 auto' }}>
                        <YouTubePlayer
                            key={`${quoteGroup.video_id}-${retryCount}`}
                            videoId={quoteGroup.video_id}
                            timestamp={activeTimestamp.videoId === quoteGroup.video_id ? activeTimestamp.timestamp : null}
                            onTimestampClick={handleTimestampClick}
                        />
                    </div>

                    <div className="mobile-video-info" style={{
                        textAlign: 'center',
                        padding: '0.5rem',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-color)'
                    }}>
                        {quoteGroup.quotes[0]?.channel_source || 'N/A'} - {quoteGroup.quotes[0]?.upload_date
                            ? formatDate(quoteGroup.quotes[0].upload_date)
                            : 'N/A'}
                    </div>

                    <div className="mobile-quotes-list" style={{
                        maxHeight: '500px',
                        overflowY: 'auto',
                        padding: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                    }}>
                        {quoteGroup.quotes?.map((quote, index) => (
                            <div className="mobile-quote-item" key={index} style={{
                                padding: '0.75rem',
                                borderBottom: index < quoteGroup.quotes.length - 1 ? '1px solid var(--border-color)' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem'
                            }}>
                                <button
                                    onClick={() => handleTimestampClick(quoteGroup.video_id, backdateTimestamp(quote.timestamp_start))}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        color: '#4A90E2',
                                        cursor: 'pointer',
                                        padding: '0.5rem',
                                        font: 'inherit',
                                        wordBreak: 'break-word',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--surface-color)',
                                    }}
                                >
                                    <span style={{ verticalAlign: 'middle' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quote.text, { ALLOWED_TAGS }) }} />
                                    <span style={{
                                        verticalAlign: 'middle',
                                        marginLeft: '0.5em',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 'bold'
                                    }}>
                                        ({formatTimestamp(backdateTimestamp(quote.timestamp_start))})
                                    </span>
                                </button>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-around',
                                    padding: '0.5rem',
                                    backgroundColor: 'var(--surface-color)',
                                    borderRadius: '4px'
                                }}>
                                    <button
                                        onClick={() => {
                                            const textToCopy = quote.text.replace(/<[^>]*>/g, '');
                                            navigator.clipboard.writeText(textToCopy).then(() => {
                                                const button = event.currentTarget;
                                                const originalText = button.innerHTML;
                                                button.innerHTML = '✓';
                                                button.style.color = '#4CAF50';
                                                setTimeout(() => {
                                                    button.innerHTML = originalText;
                                                    button.style.color = '#4A90E2';
                                                }, 1000);
                                            });
                                        }}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: '#4A90E2',
                                            border: 'none',
                                            padding: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '1.25rem',
                                        }}
                                        title="Copy to clipboard"
                                    >
                                        📋
                                    </button>

                                    <button
                                        onClick={() => window.open(`https://www.youtube.com/watch?v=${quoteGroup.video_id}&t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`, '_blank')}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: '#4A90E2',
                                            border: 'none',
                                            padding: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '1.25rem',
                                        }}
                                        title="Open in YouTube"
                                    >
                                        ↗
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
                                            padding: '0.5rem',
                                            cursor: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 'not-allowed' : 'pointer',
                                            opacity: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 0.6 : 1,
                                            fontSize: '1.25rem',
                                        }}
                                        title="Flag quote"
                                    >
                                        {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div>
            {quotes.length > 0 ? (
                isMobileView ? renderMobileLayout() : renderDesktopLayout()
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

    // Add meta viewport tag for responsive design
    useEffect(() => {
        // Check if viewport meta tag exists
        let viewportMeta = document.querySelector('meta[name="viewport"]');

        // If it doesn't exist, create it
        if (!viewportMeta) {
            viewportMeta = document.createElement('meta');
            viewportMeta.name = 'viewport';
            document.getElementsByTagName('head')[0].appendChild(viewportMeta);
        }

        // Set the content
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

        // Add mobile-specific CSS
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                /* Mobile logo styles - significantly increased size */
                .logo-container {
                    position: sticky;
                    top: 0;
                    background-color: var(--bg-color);
                    width: 100%;
                    text-align: center;
                    padding: 15px 0;
                    z-index: 100;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .logo-container img {
                    height: 80px; /* Substantially increased from 55px */
                    cursor: pointer;
                    transition: transform 0.2s ease;
                }
                
                .logo-container img:hover {
                    transform: scale(1.05);
                }
                
                /* Hide feedback button on mobile */
                .floating-feedback-button {
                    display: none;
                }
                
                /* Other mobile styles */
                .input-container {
                    flex-direction: column;
                    width: 90% !important;
                    gap: 10px;
                    margin-top: 1rem;
                }
                
                .input-container button {
                    width: 100%;
                    margin: 5px 0 !important;
                }
                
                .search-input {
                    width: 100% !important;
                }
                
                .filter-container {
                    flex-direction: column;
                    align-items: center;
                    width: 90%;
                    gap: 15px;
                    margin: 15px auto;
                }
                
                .filter-group {
                    display: flex;
                    width: 100%;
                    justify-content: space-between;
                    gap: 10px;
                }
                
                .filter-group > * {
                    flex: 1;
                }
                
                .year-tooltip, .sort-tooltip {
                    width: 48%;
                }
                
                .year-input, .sort-select {
                    width: 100%;
                    padding: 8px;
                    border-radius: 4px;
                    border: 1px solid var(--border-color);
                }
                
                .radio-group {
                    flex-wrap: wrap;
                    justify-content: center;
                    width: 100%;
                    margin: 0 auto;
                }
                
                .radio-button {
                    margin: 4px;
                }
                
                .game-filter-container {
                    width: 100%;
                    display: flex;
                }
                
                .game-tooltip {
                    flex: 1;
                }
                
                .mobile-quote-group {
                    margin-bottom: 20px;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    overflow: hidden;
                }
                
                .mobile-quotes-list {
                    border-top: 1px solid var(--border-color);
                }
                
                .pagination-buttons {
                    width: 90%;
                }
                
                .footer-message {
                    width: 90%;
                    font-size: 0.8rem;
                    margin: 10px auto;
                    text-align: center;
                }
                
                /* Horizontal disclaimer layout for mobile */
                .disclaimer-tips {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    gap: 10px;
                }
                
                .disclaimer-tip {
                    width: 100%;
                    margin-bottom: 15px;
                    display: flex;
                    flex-direction: column;
                }
                
                @media (min-width: 500px) {
                    .disclaimer-tip {
                        width: calc(33.33% - 10px);
                    }
                }
                
                .disclaimer-tip > span {
                    margin-bottom: 10px;
                    font-size: 1.5rem;
                    text-align: center;
                }
                
                .disclaimer-tip strong {
                    display: block;
                    text-align: center;
                    margin-bottom: 8px;
                }
                
                .disclaimer-examples {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .disclaimer-example {
                    background-color: var(--surface-color);
                    padding: 10px;
                    border-radius: 4px;
                    font-size: 0.9rem;
                }
                
                .disclaimer-example p {
                    margin: 5px 0;
                }

                /* Mobile-specific styles for bold tags */
                .mobile-quote-item button span b {
                    color: #FF0000 !important;
                    font-weight: bold !important;
                }
            }
            
            /* Desktop styles */
            @media (min-width: 769px) {
                .logo-container {
                    margin-bottom: 2rem;
                    cursor: pointer;
                }
                
                .logo-container img {
                    height: 100px; /* Substantially increased from 70px */
                    transition: transform 0.2s ease;
                }
                
                .logo-container img:hover {
                    transform: scale(1.05);
                }
                
                .filter-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 20px;
                    margin: 20px auto;
                    max-width: 1000px;
                }
                
                .filter-group {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                
                .year-tooltip, .sort-tooltip {
                    min-width: 120px;
                }
                
                .year-input, .sort-select {
                    padding: 8px;
                    border-radius: 4px;
                    border: 1px solid var(--border-color);
                    background-color: var(--surface-color);
                }
                
                .game-filter-container {
                    min-width: 220px;
                    display: flex;
                }
                
                .game-tooltip {
                    flex: 1;
                }
                
                .radio-group {
                    display: flex;
                    gap: 15px;
                    margin: 10px auto;
                    justify-content: center;
                }
                
                /* Vertical disclaimer layout for desktop */
                .disclaimer-tips {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    margin: 20px 0;
                }
                
                .disclaimer-tip {
                    display: flex;
                    gap: 15px;
                    align-items: flex-start;
                    margin-bottom: 10px;
                }
                
                .disclaimer-tip > span {
                    font-size: 1.5rem;
                    flex-shrink: 0;
                }
                
                .disclaimer-tip strong {
                    display: block;
                    margin-bottom: 8px;
                }
                
                .disclaimer-examples {
                    margin-top: 10px;
                }
                
                .disclaimer-example {
                    background-color: var(--surface-color);
                    padding: 12px;
                    border-radius: 6px;
                    margin-bottom: 10px;
                }
                
                .floating-feedback-button {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background-color: var(--accent-color);
                    color: white;
                    border: none;
                    border-radius: 30px;
                    padding: 10px 20px;
                    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
                    cursor: pointer;
                    z-index: 900;
                    font-size: 1rem;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                }
                
                .floating-feedback-button:hover {
                    background-color: #e04c4c; /* Slightly different shade for hover */
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                }
            }
            
            .reset-game-button {
                background-color: var(--surface-color);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                margin-left: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 10px;
                font-size: 18px;
            }
            
            .reset-game-button:hover {
                background-color: var(--border-color);
            }
            
            /* Shared disclaimer styles */
            .disclaimer-container {
                width: 90%;
                max-width: 1200px;
                margin: 20px auto;
                padding: 20px;
                background-color: var(--surface-color);
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .disclaimer-title {
                font-size: 1.2rem;
                font-weight: bold;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .disclaimer-content {
                font-size: 0.95rem;
                color: var(--text-secondary);
            }
            
            /* Global styles for search term highlighting */
            b {
                color: #FF0000 !important;
                font-weight: bold !important;
            }
            
            /* Quote item styling */
            .quote-item button,
            .mobile-quote-item button {
                color: #4A90E2 !important;
            }
        `;
        document.head.appendChild(style);

        // Clean up function to remove the style when component unmounts
        return () => {
            document.head.removeChild(style);
        };
    }, []);

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
                <div className="filter-group">
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
                            if (searchTerm.trim()) {
                                fetchQuotes(page, selectedChannel, selectedYear, sortOrder, strict, "all");
                            }
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
                Made with passion by a fan • Generously supported by The Librarian • Contributors: Xeneta, samfry13 • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>GitHub</a>
            </div>

            {/* Improved desktop-only feedback button */}
            <button
                className="floating-feedback-button"
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