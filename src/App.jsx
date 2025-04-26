import { useState, useEffect, useRef } from 'react';
import query from './services/quotes';
import { useNavigate, Routes, Route, useSearchParams, useLocation } from 'react-router-dom';
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
import SearchPage from './components/SearchPage';
import getUserHash from './utils/userHash';
import { useAnalyticsTracker, sendAnalytics } from './hooks/useAnalyticsTracker';

// Custom hook for Simple Analytics pageview
function useSimpleAnalyticsPageview() {
    const location = useLocation();
    useEffect(() => {
        if (window.sa_event) {
            window.sa_event('pageview');
        }
    }, [location]);
}

const App = () => {
    useSimpleAnalyticsPageview();
    const sessionId = useAnalyticsTracker();    
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

    // Add local state for year input
    const [yearInput, setYearInput] = useState(year);

    // Sync yearInput with year from URL
    useEffect(() => {
        setYearInput(year);
    }, [year]);

    const prevSearchRef = useRef('');

    useEffect(() => {
        if (
            hasSearched &&
            page === 1 &&
            searchTerm.trim().length > 2 &&
            totalPages > 0 &&
            prevSearchRef.current !== searchTerm
        ) {
            sendAnalytics('search', {
                path: '/search',
                search_term: searchTerm,
                channel,
                year,
                sort_order: sort,
                strict,
                session_id: sessionId,
                page: 1,
                total_pages: totalPages
            });
            prevSearchRef.current = searchTerm;
        }
    }, [hasSearched, page, searchTerm, totalPages, channel, year, sort, strict, sessionId]);
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
        navigate(buildSearchUrl({ channel: channelId, page: 1 }));
    };

    const handleYearChange = (e) => {
        const value = e.target.value;
        setYearInput(value);
        if (value.length === 4 && /^\d{4}$/.test(value)) {
            navigate(buildSearchUrl({ year: value, page: 1 }));
        }
    };

    const handleSortChange = (e) => {
        const value = e.target.value;
        navigate(buildSearchUrl({ sort: value, page: 1 }));
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim().length > 2) {
            navigate(buildSearchUrl({ q: searchInput, page: 1 }));
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            if (searchInput.trim().length > 2) {
                navigate(buildSearchUrl({ q: searchInput, page: 1 }));
            } else {
                setError('Please enter at least 3 characters to search');
                setTimeout(() => setError(null), 3000);
            }
        }
    };

    const handlePageChange = (newPage) => {
        navigate(buildSearchUrl({ page: newPage }));
        // Analytics for pagination
        sendAnalytics('pagination', {
            path: '/search',
            search_term: searchTerm,
            channel,
            year,
            sort_order: sort,
            strict,
            page: newPage,
            total_pages: totalPages,
            session_id: sessionId
        });
    };
    const handleGameChange = (e) => {
        const value = e.target.value;
        navigate(buildSearchUrl({ game: value, page: 1 }));
    };

    const handleGameReset = () => {
        navigate(buildSearchUrl({ game: 'all', page: 1 }));
    };

    // Helper to build URL with all current params and overrides
    function buildSearchUrl(overrides = {}, basePath = '/search') {
        const params = {
            q: searchTerm,
            page,
            channel,
            year,
            sort,
            game,
            ...overrides
        };
        // Remove empty/default values
        const query = Object.entries(params)
            .filter(([k, v]) => v && v !== 'all' && v !== 'default' && v !== 1 && v !== '1')
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        return `${basePath}?${query}`;
    }

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

    // Define fetchQuotes in App.jsx
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
        useEffect(() => {
            console.log('[starting_session effect] path:', window.location.pathname, 'hasSearched:', hasSearched);
            if (
                window.location.pathname === '/' &&
                hasSearched === false &&
                !sessionStorage.getItem('starting_session_sent')
            ) {
                console.log('[starting_session effect] Sending starting_session event');
                sendAnalytics('starting_session', {
                    path: window.location.pathname,
                    session_id: sessionId,
                    referrer: document.referrer
                });
                sessionStorage.setItem('starting_session_sent', 'true');
            }
        }, [sessionId, hasSearched]);
    };

    return (
        <Routes>
            <Route path="/" element={<SearchPage
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                yearInput={yearInput}
                setYearInput={setYearInput}
                handleSearch={handleSearch}
                handleKeyPress={handleKeyPress}
                handleResetSearch={handleResetSearch}
                handleRandomQuotes={handleRandomQuotes}
                handleChannelChange={handleChannelChange}
                handleYearChange={handleYearChange}
                handleSortChange={handleSortChange}
                handleGameChange={handleGameChange}
                handleGameReset={handleGameReset}
                loading={loading}
                error={error}
                channel={channel}
                sort={sort}
                game={game}
                games={games}
                page={page}
                totalPages={totalPages}
                totalQuotes={totalQuotes}
                hasSearched={hasSearched}
                quotes={quotes}
                searchTerm={searchTerm}
                numberFormatter={numberFormatter}
                strict={strict}
                feedbackModalOpen={feedbackModalOpen}
                setFeedbackModalOpen={setFeedbackModalOpen}
                submittingFeedback={submittingFeedback}
                handleFeedbackSubmit={handleFeedbackSubmit}
                handleLogoClick={handleLogoClick}
                fetchQuotes={fetchQuotes}
                handlePageChange={handlePageChange}
            />} />
            <Route path="/search" element={<SearchPage
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                yearInput={yearInput}
                setYearInput={setYearInput}
                handleSearch={handleSearch}
                handleKeyPress={handleKeyPress}
                handleResetSearch={handleResetSearch}
                handleRandomQuotes={handleRandomQuotes}
                handleChannelChange={handleChannelChange}
                handleYearChange={handleYearChange}
                handleSortChange={handleSortChange}
                handleGameChange={handleGameChange}
                handleGameReset={handleGameReset}
                loading={loading}
                error={error}
                channel={channel}
                sort={sort}
                game={game}
                games={games}
                page={page}
                totalPages={totalPages}
                totalQuotes={totalQuotes}
                hasSearched={hasSearched}
                quotes={quotes}
                searchTerm={searchTerm}
                numberFormatter={numberFormatter}
                strict={strict}
                feedbackModalOpen={feedbackModalOpen}
                setFeedbackModalOpen={setFeedbackModalOpen}
                submittingFeedback={submittingFeedback}
                handleFeedbackSubmit={handleFeedbackSubmit}
                handleLogoClick={handleLogoClick}
                fetchQuotes={fetchQuotes}
                handlePageChange={handlePageChange}
            />} />
            <Route path="/privacy" element={<Privacy />} />
        </Routes>
    );
};

export default App;