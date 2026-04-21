import { useState, useEffect } from 'react';
import query from './services/quotes';
import { useNavigate, Routes, Route, useSearchParams, useLocation } from 'react-router-dom';
import { ChangelogModal } from './components/Modals/ChangelogModal';
import './App.css';
import { useFetchGames } from './hooks/useFetchGames';
import { useSearchState } from './hooks/useSearchState';
import Privacy from './components/Privacy';
import SearchPage from './components/SearchPage';
import NLDLE from './components/NLDLE/NLDLE';
import Stats from './components/Stats';
import { TopicPage } from './components/TopicPage';

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
    const { resetState } = useSearchState();
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
    const [changelogModalOpen, setChangelogModalOpen] = useState(false);
    
    const strict = false;

    const games = useFetchGames();

    // Extract URL params at the top of the component
    const searchTerm = searchParams.get('q') || '';
    const page = Number(searchParams.get('page')) || 1;
    const channel = searchParams.get('channel') || 'all';
    const year = searchParams.get('year') || '';
    const sort = searchParams.get('sort') || 'default';
    const game = searchParams.get('game') || 'all';
    const mode = searchParams.get('mode') || 'keyword';

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


    // Effect to handle URL parameter changes
    useEffect(() => {
        if (searchTerm.trim().length > 2) {
            setLoading(true);
            setError(null);
            setQuotes([]);
            setHasSearched(true);
            if (mode === 'semantic') {
                fetchSemanticQuotes(channel, year, game);
            } else {
                fetchQuotes(page, channel, year, sort, strict, game);
            }
        } else if (!searchTerm) {
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
            setHasSearched(false);
        }
    }, [searchTerm, page, channel, year, sort, game, mode]);

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

    const trackUmamiSearch = (term) => {
        if (!window.umami?.track) {
            return;
        }

        const trimmedTerm = term.trim();
        if (!trimmedTerm) {
            return;
        }

        window.umami.track(trimmedTerm, {
            search_term: trimmedTerm.toLowerCase(),
            event_type: 'quote_search',
            channel: channel || 'all',
            year: year || '',
            sort_order: sort || 'default',
            game: game || 'all'
        });
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim().length > 2) {
            trackUmamiSearch(searchInput);
            navigate(buildSearchUrl({ q: searchInput, page: 1, mode: 'keyword' }));
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handleSemanticSearch = () => {
        if (searchInput.trim().length > 2) {
            trackUmamiSearch(searchInput);
            navigate(buildSearchUrl({ q: searchInput, page: 1, mode: 'semantic' }));
        } else {
            setError('Please enter at least 3 characters to search');
            setTimeout(() => setError(null), 3000);
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            if (searchInput.trim().length > 2) {
                trackUmamiSearch(searchInput);
                navigate(buildSearchUrl({ q: searchInput, page: 1, mode: mode === 'semantic' ? 'semantic' : 'keyword' }));
            } else {
                setError('Please enter at least 3 characters to search');
                setTimeout(() => setError(null), 3000);
            }
        }
    };

    const handlePageChange = (newPage) => {
        navigate(buildSearchUrl({ page: newPage }));
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
            mode,
            ...overrides
        };
        // Remove empty/default values ('keyword' is the default mode)
        const query = Object.entries(params)
            .filter(([, v]) => v && v !== 'all' && v !== 'default' && v !== 1 && v !== '1' && v !== 'keyword')
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

    const handleFeedbackSubmit = async (feedback, email) => {
        try {
            setSubmittingFeedback(true);
            await query.flagQuote({
                quote: "Website Feedback",
                searchTerm: "Feedback",
                timestamp: "0",
                videoId: "feedback",
                title: "Website Feedback",
                channel: "User Feedback",
                reason: feedback,
                email: email || undefined
            });
            alert('Thank you for your feedback!');
            setFeedbackModalOpen(false);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
            alert(`Unable to submit feedback: ${errorMessage}. Please check your connection and try again.`);
        } finally {
            setSubmittingFeedback(false);
        }
    };

    const handleLogoClick = () => {
        window.scrollTo(0, 0);
        resetState();
        setQuotes([]);
        setHasSearched(false);
        navigate("/", { replace: true });
    };

    const fetchSemanticQuotes = async (channel, year, game) => {
        try {
            const response = await query.semanticSearch(searchTerm, channel, year, game);
            setQuotes(response.data || []);
            setTotalPages(1);
            setTotalQuotes(response.totalQuotes || 0);
        } catch (error) {
            console.error('Error fetching semantic quotes:', error);
            const detail = error.response?.data?.details || error.response?.data?.error;
            setError(detail || 'Unable to run semantic search.');
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
        } finally {
            setLoading(false);
        }
    };

    const fetchQuotes = async (pageNum, channel, year, sort, strictMode, game) => {
        try {
            console.log('[App] fetchQuotes called with:', { searchTerm, pageNum, channel, year, sort, game });
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
            console.log('[App] Received response:', {
                dataLength: response.data?.length,
                total: response.total,
                totalQuotes: response.totalQuotes,
                firstItem: response.data?.[0]
            });
            setQuotes(response.data || []);
            setTotalPages(Math.ceil((response.total || 0) / 10));
            setTotalQuotes(response.totalQuotes || 0);
            console.log('[App] State updated - quotes:', response.data?.length, 'totalQuotes:', response.totalQuotes);
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

    const searchPageElement = <SearchPage
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        yearInput={yearInput}
        setYearInput={setYearInput}
        handleSearch={handleSearch}
        handleSemanticSearch={handleSemanticSearch}
        mode={mode}
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
        onChangelogClick={() => setChangelogModalOpen(true)}
    />;

    return (
        <>
        <Routes>
            <Route path="/" element={searchPageElement} />
            <Route path="/search" element={searchPageElement} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/nldle" element={<NLDLE />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/topic/:term" element={<TopicPage />} />
        </Routes>
        <ChangelogModal
            isOpen={changelogModalOpen}
            onClose={() => setChangelogModalOpen(false)}
        />
        </>
    );
};

export default App;