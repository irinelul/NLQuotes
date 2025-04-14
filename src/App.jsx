import { useState, useEffect } from 'react';
import query from './services/quotes';
import { useNavigate } from 'react-router-dom';
import Disclaimer from './components/Disclaimer';
import { pauseOtherPlayers } from './services/youtubeApiLoader';
import DOMPurify from 'dompurify';
import { YouTubePlayer } from './components/YoutubePlayer';
import { FlagModal } from './components/Modals/FlagModal';
import { FeedbackModal } from './components/Modals/FeedbackModal';
import { backdateTimestamp, formatDate, formatTimestamp } from './services/dateHelpers';
import { ChannelRadioButton } from './components/ChannelRadioButton';
import './App.css';
import { Filters } from './components/Filters';
import { useFetchGames } from './hooks/useFetchGames';
import { Footer } from './components/Footer';
import { PaginationButtons } from './components/PaginationButtons';

// `b` is returned from ts_headline when a match is found
const ALLOWED_TAGS = ['b'];

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
    const [retryCount, setRetryCount] = useState(0);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

    // Effect to handle video loading retry
    useEffect(() => {
        if (showEmbeddedVideos && retryCount < 1) {
            const timer = setTimeout(() => {
                setRetryCount(prev => prev + 1);
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

const App = () => {
    const [quotes, setQuotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [totalPages, setTotalPages] = useState(0);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const navigate = useNavigate();
    const [selectedChannel, setSelectedChannel] = useState("all");
    const [selectedYear, setSelectedYear] = useState("");
    const [sortOrder, setSortOrder] = useState("default");
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [selectedGame, setSelectedGame] = useState("all");
    
    const strict = false;
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
    }, []);

    const games = useFetchGames();

    const handleChannelChange = (channelId) => {
        setSelectedChannel(channelId);
        setPage(1);
        if (searchTerm.trim()) {
            fetchQuotes(1, channelId, selectedYear, sortOrder, strict, selectedGame);
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
                <img 
                    src="/NLogo.webp" 
                    alt="Northernlion Logo"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/NLogo.png";
                    }}
                />
            </div>
            <div className="input-container">
                <button
                    onClick={handleRandomQuotes}
                    disabled={loading}
                    style={{
                        opacity: loading ? 0.7 : 1,
                        transform: 'none',
                        transition: 'background-color 0.2s ease',
                        backgroundColor: 'grey',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 16px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '1rem'
                    }}
                    onMouseOver={e => {
                        if (!loading) {
                            e.currentTarget.style.backgroundColor = '#a8a8a8';
                        }
                    }}
                    onMouseOut={e => {
                        if (!loading) {
                            e.currentTarget.style.backgroundColor = 'grey';
                        }
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
                <button 
                    onClick={handleSearch}
                    style={{
                        backgroundColor: 'grey',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        transform: 'none',
                        transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={e => {
                        e.currentTarget.style.backgroundColor = '#a8a8a8';
                    }}
                    onMouseOut={e => {
                        e.currentTarget.style.backgroundColor = 'grey';
                    }}
                >
                    Search
                </button>
                <button
                    onClick={() => {
                        setSearchTerm('');
                        setQuotes([]);
                        setHasSearched(false);
                        setPage(1);
                        setSelectedYear('');
                        setSortOrder('default');
                        setSelectedChannel('all');
                        setSelectedGame('all');
                        navigate('/');
                    }}
                    style={{ 
                        marginLeft: '0.5rem',
                        backgroundColor: 'grey',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        transform: 'none',
                        transition: 'background-color 0.2s ease'
                    }}
                    onMouseOver={e => {
                        e.currentTarget.style.backgroundColor = '#a8a8a8';
                    }}
                    onMouseOut={e => {
                        e.currentTarget.style.backgroundColor = 'grey';
                    }}
                >
                    Reset Search
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="radio-group channel-tooltip">
                <ChannelRadioButton
                    selectedChannel={selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="all"
                    name="All Sources"
                />
                <ChannelRadioButton
                    selectedChannel={selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="librarian"
                    name="Librarian"
                />
                <ChannelRadioButton
                    selectedChannel={selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="northernlion"
                    name="Northernlion"
                />
            </div>
            
            <Filters 
                selectedYear={selectedYear}
                handleYearChange={handleYearChange}
                sortOrder={sortOrder}
                handleSortChange={handleSortChange}
                selectedGame={selectedGame}
                setSelectedGame={setSelectedGame}
                handleGameChange={handleGameChange}
                games={games}
                searchTerm={searchTerm}
                fetchQuotes={fetchQuotes}
                page={page}
                selectedChannel={selectedChannel}
                strict={strict} 
            />

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
                <PaginationButtons
                    page={page}
                    totalPages={totalPages}
                    handlePageChange={handlePageChange}
                />
            )}

            <Footer />

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