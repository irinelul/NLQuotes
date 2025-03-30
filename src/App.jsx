import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams,useLocation  } from 'react-router-dom';
import { format } from 'date-fns';
import Disclaimer from './components/Disclaimer';
import SearchableDropdown from './components/SearchableDropdown';
import BetaDisclaimer from './components/BetaDisclaimer';

const URL = 'https://www.youtube.com/watch?v=';

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
            alert('Failed to flag quote. Please try again.');
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
                            <th>Title</th>
                            <th>Channel</th>
                            <th>Video URL</th>
                            <th>Upload Date</th>
                            <th>Quotes with Timestamps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map((quoteGroup) => (
                            <tr key={quoteGroup._id}>
                                <td>{quoteGroup.quotes[0]?.title || 'N/A'}</td>
                                <td>{quoteGroup.quotes[0]?.channel_source || 'N/A'}</td>
                                <td>
                                    <a target="_blank" rel="noopener noreferrer" href={`${URL}${quoteGroup.video_id}`}>
                                        Video Link
                                    </a>
                                </td>
                                <td>
                                    {quoteGroup.quotes[0]?.upload_date
                                        ? formatDate(quoteGroup.quotes[0].upload_date)
                                        : 'N/A'}
                                </td>
                                <td>
                                    {quoteGroup.quotes?.map((quote, index) => (
                                        <div key={index} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.75rem',
                                            marginBottom: '0.75rem',
                                            padding: '0.75rem 0',
                                            borderBottom: index < quoteGroup.quotes.length - 1 ? '1px solid var(--border-color)' : 'none'
                                        }}>
                                            <a
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                href={`${URL}${quoteGroup.video_id}&t=${Math.floor(quote.timestamp_start) - 1}`}
                                                style={{ flex: 1 }}
                                            >
                                                {quote.text} (Timestamp: {formatTimestamp(Math.floor(quote.timestamp_start) - 1)})
                                            </a>
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

    useEffect(() => {
        const fetchGames = async () => {
            try {
                const response = await fetch('/api/games');
                const data = await response.json();
                setGames(data.games);
            } catch (error) {
                console.error('Error fetching games:', error);
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
            const response = await query.getRandomQuotes();
            setQuotes(response.quotes);
            setTotalPages(1);
            setPage(1);
            setTotalQuotes(response.quotes.length);
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            setError('Error fetching random quotes');
            console.error('Error:', error);
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
                setError('Error fetching quotes');
                console.error('Error:', error);
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
            alert('Failed to submit feedback. Please try again.');
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
            width: '100%'
        }}>
            <BetaDisclaimer />
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