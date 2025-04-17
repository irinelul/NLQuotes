import { useState, useEffect } from 'react';
import query from './services/quotes';
import { useNavigate } from 'react-router-dom';
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

const App = () => {
    const { state, updateState, resetState } = useSearchState();
    const [quotes, setQuotes] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [totalPages, setTotalPages] = useState(0);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const navigate = useNavigate();
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

    // Initial load from URL parameters
    useEffect(() => {
        if (state.searchTerm) {
            fetchQuotes(state.page, state.selectedChannel, state.selectedYear, state.sortOrder, strict, state.selectedGame);
        }
    }, []); // Empty dependency array to run only once on mount

    const handleChannelChange = (channelId) => {
        updateState({ 
            selectedChannel: channelId,
            page: 1
        });
        if (state.searchTerm.trim()) {
            fetchQuotes(1, channelId, state.selectedYear, state.sortOrder, strict, state.selectedGame);
        }
    };

    const handleYearChange = (e) => {
        const value = e.target.value;
        updateState({ selectedYear: value });
        if (value.length === 4) {
            updateState({ page: 1 });
            if (state.searchTerm.trim()) {
                fetchQuotes(1, state.selectedChannel, value, state.sortOrder, strict, state.selectedGame);
            }
        }
    };

    const handleSortChange = (e) => {
        const value = e.target.value;
        updateState({ 
            sortOrder: value,
            page: 1
        });
        if (state.searchTerm.trim()) {
            fetchQuotes(1, state.selectedChannel, state.selectedYear, value, strict, state.selectedGame);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (state.searchTerm.trim().length > 2) {
            updateState({ page: 1 });
            fetchQuotes(1, state.selectedChannel, state.selectedYear, state.sortOrder, strict, state.selectedGame);
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handlePageChange = (newPage) => {
        updateState({ page: newPage });
        fetchQuotes(newPage, state.selectedChannel, state.selectedYear, state.sortOrder, strict, state.selectedGame);
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            if (state.searchTerm.trim().length > 2) {
                updateState({ page: 1 });
                fetchQuotes(1, state.selectedChannel, state.selectedYear, state.sortOrder, strict, state.selectedGame);
            } else {
                setError('Please enter at least 3 characters to search');
                setTimeout(() => setError(null), 3000);
            }
        }
    };

    const handleRandomQuotes = async () => {
        setLoading(true);
        setError(null);
        updateState({ hasSearched: true });
        try {
            console.log('Fetching random quotes...');
            const response = await query.getRandomQuotes();
            console.log('Random quotes response:', response);

            if (!response || !response.quotes) {
                throw new Error('Invalid response format from server');
            }

            setQuotes(response.quotes);
            setTotalPages(1);
            updateState({ page: 1 });
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
        updateState({ hasSearched: false });
        navigate('/');
    };

    const handleGameChange = (e) => {
        const value = e.target.value;
        updateState({ 
            selectedGame: value,
            page: 1
        });
        if (state.searchTerm.trim()) {
            fetchQuotes(1, state.selectedChannel, state.selectedYear, state.sortOrder, strict, value);
        }
    };

    const handleGameReset = () => {
        updateState({ 
            selectedGame: 'all',
            page: 1
        });
        if (state.searchTerm.trim()) {
            fetchQuotes(1, state.selectedChannel, state.selectedYear, state.sortOrder, strict, 'all');
        }
    };

    const fetchQuotes = async (pageNum = state.page, channel = state.selectedChannel, year = state.selectedYear, sort = state.sortOrder, strictMode = strict, game = state.selectedGame) => {
        if (state.searchTerm.trim()) {
            setLoading(true);
            setError(null);
            updateState({ hasSearched: true });
            setQuotes([]);
            try {
                const response = await query.getAll(
                    state.searchTerm,
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

    const handleLogoClick = () => {
        window.scrollTo(0, 0);
        updateState({ searchTerm: "" });
        setQuotes([]);
        updateState({ hasSearched: false });
        updateState({ page: 1 });
        navigate("/");
    };

    return (
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
                    value={state.searchTerm}
                    onChange={(e) => updateState({ searchTerm: e.target.value })}
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
                    selectedChannel={state.selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="all"
                    name="All Sources"
                />
                <ChannelRadioButton
                    selectedChannel={state.selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="librarian"
                    name="Librarian"
                />
                <ChannelRadioButton
                    selectedChannel={state.selectedChannel}
                    handleChannelChange={handleChannelChange}
                    id="northernlion"
                    name="Northernlion"
                />
            </div>
            
            <Filters 
                selectedYear={state.selectedYear}
                handleYearChange={handleYearChange}
                sortOrder={state.sortOrder}
                handleSortChange={handleSortChange}
                selectedGame={state.selectedGame}
                handleGameChange={handleGameChange}
                handleGameReset={handleGameReset}
                games={games}
                searchTerm={state.searchTerm}
                fetchQuotes={fetchQuotes}
                page={state.page}
                selectedChannel={state.selectedChannel}
                strict={strict} 
            />

            {!state.hasSearched && <Disclaimer />}
                    
            {loading && <div>Loading...</div>}
            {state.hasSearched && (
                <>
                    <div className="total-quotes">
                        Total quotes found: {numberFormatter.format(totalQuotes)}
                    </div>
                    <Quotes quotes={quotes} searchTerm={state.searchTerm} />
                </>
            )}

            {quotes.length > 0 && (
                <PaginationButtons
                    page={state.page}
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