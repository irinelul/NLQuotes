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

    const handleResetSearch = () => {
        setSearchTerm('');
            setQuotes([]);
            setHasSearched(false);
            setPage(1);
            setSelectedYear('');
            setSortOrder('default');
            setSelectedChannel('all');
            setSelectedGame('all');
            navigate('/');
    }

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

    const handleLogoClick = () => {
        window.scrollTo(0, 0);
        setSearchTerm("");
        setQuotes([]);
        setHasSearched(false);
        setPage(1);
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
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                    <div className="total-quotes">
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