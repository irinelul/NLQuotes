import { useState, useEffect } from 'react';
import query from './services/quotes';
import { useNavigate, Routes, Route, useSearchParams } from 'react-router-dom';
import Disclaimer from './components/Disclaimer';
import { FeedbackModal } from './components/Modals/FeedbackModal';
import { ChannelRadioButton } from './components/ChannelRadioButton';
import './App.css';
import { Filters } from './components/Filters';
import { useFetchGames } from './hooks/useFetchGames';
import { Footer } from './components/Footer';
import { PaginationButtons } from './components/PaginationButtons';
import { Quotes } from './components/Quotes';
import { useSearchState } from './hooks/useSearchState';
import Privacy from './components/Privacy';

const App = () => {
    const { state, updateState, resetState, updateSearchParams } = useSearchState();
    const [quotes, setQuotes] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [totalPages, setTotalPages] = useState(0);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const [hasSearched, setHasSearched] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    
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

    // Extract URL params at the top of the component
    const searchTerm = searchParams.get('q') || '';
    const page = Number(searchParams.get('page')) || 1;
    const channel = searchParams.get('channel') || 'all';
    const year = searchParams.get('year') || '';
    const sort = searchParams.get('sort') || 'default';
    const game = searchParams.get('game') || 'all';

    // Add local state for search input
    const [searchInput, setSearchInput] = useState(searchTerm);

    // Sync searchInput with searchTerm from URL
    useEffect(() => {
        setSearchInput(searchTerm);
    }, [searchTerm]);

    // Effect to handle URL parameter changes
    useEffect(() => {
        if (searchTerm.trim().length > 2) {
            setLoading(true);
            setError(null);
            setQuotes([]);
            setHasSearched(true);
            fetchQuotes(page, channel, year, sort, strict, game);
        } else if (!searchTerm) {
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
            setHasSearched(false);
        }
    }, [searchTerm, page, channel, year, sort, game]);

    const handleChannelChange = (channelId) => {
        navigate(`/?q=${encodeURIComponent(searchTerm)}&channel=${channelId}`, { replace: true });
    };

    const handleYearChange = (e) => {
        const value = e.target.value;
        if (value.length === 4) {
            navigate(`/?q=${encodeURIComponent(searchTerm)}&year=${value}`, { replace: true });
        }
    };

    const handleSortChange = (e) => {
        const value = e.target.value;
        navigate(`/?q=${encodeURIComponent(searchTerm)}&sort=${value}`, { replace: true });
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim().length > 2) {
            navigate(`/?q=${encodeURIComponent(searchInput)}`, { replace: true });
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handlePageChange = (newPage) => {
        navigate(`/?q=${encodeURIComponent(searchTerm)}&page=${newPage}`, { replace: true });
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            if (searchInput.trim().length > 2) {
                navigate(`/?q=${encodeURIComponent(searchInput)}`, { replace: true });
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

    const handleResetSearch = () => {
        resetState();
        setQuotes([]);
        setHasSearched(false);
        navigate('/', { replace: true });
    };

    const handleGameChange = (e) => {
        const value = e.target.value;
        navigate(`/?q=${encodeURIComponent(searchTerm)}&game=${encodeURIComponent(value)}`, { replace: true });
    };

    const handleGameReset = () => {
        navigate(`/?q=${encodeURIComponent(searchTerm)}`, { replace: true });
    };

    const fetchQuotes = async (pageNum, channel, year, sort, strictMode, game) => {
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
            setError('Unable to connect to database.');
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
        } finally {
            setLoading(false);
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

    const handleLogoClick = () => {
        window.scrollTo(0, 0);
        resetState();
        setQuotes([]);
        navigate("/");
    };

    return (
        <Routes>
            <Route path="/" element={
                <div className='main-container'>
                    <div className="logo-container" onClick={handleLogoClick}>
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
                                cursor: loading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {loading ? 'Loading...' : 'Random Quotes'}
                        </button>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Search quotes..."
                            className="search-input"
                            style={{ boxSizing: "border-box" }}
                        />
                        <button onClick={handleSearch}>
                            Search
                        </button>
                        <button
                            onClick={handleResetSearch}
                            style={{ marginLeft: '0.5rem' }}
                        >
                            Reset Search
                        </button>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <div className="radio-group channel-tooltip">
                        <ChannelRadioButton
                            selectedChannel={channel}
                            handleChannelChange={handleChannelChange}
                            id="all"
                            name="All Sources"
                        />
                        <ChannelRadioButton
                            selectedChannel={channel}
                            handleChannelChange={handleChannelChange}
                            id="librarian"
                            name="Librarian"
                        />
                        <ChannelRadioButton
                            selectedChannel={channel}
                            handleChannelChange={handleChannelChange}
                            id="northernlion"
                            name="Northernlion"
                        />
                    </div>
                    
                    <Filters 
                        selectedYear={year}
                        handleYearChange={handleYearChange}
                        sortOrder={sort}
                        handleSortChange={handleSortChange}
                        selectedGame={game}
                        handleGameChange={handleGameChange}
                        handleGameReset={handleGameReset}
                        games={games}
                        searchTerm={searchTerm}
                        fetchQuotes={fetchQuotes}
                        page={page}
                        selectedChannel={channel}
                        strict={strict} 
                    />

                    {!hasSearched && <Disclaimer />}
                            
                    {loading && <div>Loading...</div>}
                    {hasSearched && (
                        <>
                            <div className="total-quotes">
                                Total quotes found: {numberFormatter.format(totalQuotes)}
                            </div>
                            <Quotes quotes={quotes} searchTerm={searchTerm} totalQuotes={totalQuotes} />
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
            } />
            <Route path="/privacy" element={<Privacy />} />
        </Routes>
    );
};

export default App;