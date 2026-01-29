import { useState, useEffect, useRef } from 'react';
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
import { useAnalyticsTracker, sendAnalytics } from './hooks/useAnalyticsTracker';
import { usePostHog } from './hooks/usePostHog';

// Custom hook for Simple Analytics pageview
function useSimpleAnalyticsPageview() {
    const location = useLocation();
    useEffect(() => {
        if (window.sa_event) {
            window.sa_event('pageview');
        }
    }, [location]);
}

// Custom hook to track page views for analytics
function usePageViewTracking(sessionId, posthog) {
    const location = useLocation();
    const pageLoadTimeRef = useRef(0);
    
    useEffect(() => {
        // Track page view on route change
        const currentPath = location.pathname;
        const queryParams = Object.fromEntries(new URLSearchParams(location.search));
        
        console.log('usePageViewTracking: Route changed to', currentPath, 'sessionId:', sessionId);
        
        // Don't track if user has opted out
        const isOptedOut = localStorage.getItem('analytics_opt_out') === 'true';
        if (isOptedOut) {
            console.log('Analytics skipped - user has opted out');
            return;
        }
        
        // Only send if we have a sessionId (it might be undefined on first render)
        if (!sessionId) {
            console.log('Waiting for sessionId...');
            return;
        }
        
        console.log('Sending page_view analytics for path:', currentPath);
        
        // Send page_view analytics to in-house system
        sendAnalytics('page_view', {
            path: currentPath,
            query_params: queryParams,
            referrer: document.referrer,
            start_time: new Date().toISOString(),
            session_id: sessionId
        });

        // Track page view in PostHog (if initialized for non-NL tenants)
        // For SPAs, we need to explicitly pass the full URL so PostHog recognizes it as a page
        if (posthog) {
            // Construct full URL including path and query string
            const fullUrl = `${window.location.origin}${currentPath}${location.search}`;
            
            // Extract search parameters for better analytics visibility
            const searchTerm = queryParams.q || null;
            const pageNum = queryParams.page || null;
            const channel = queryParams.channel || null;
            const year = queryParams.year || null;
            
            posthog.capture('$pageview', {
                $current_url: fullUrl,
                path: currentPath,
                search: location.search,
                referrer: document.referrer,
                // Include search parameters as properties so they're visible in PostHog
                ...(searchTerm && { search_term: searchTerm }),
                ...(pageNum && { page: pageNum }),
                ...(channel && { channel }),
                ...(year && { year }),
            });
        }
        
        // Reset page load time for this route
        pageLoadTimeRef.current = Date.now();
    }, [location.pathname, location.search, sessionId, posthog]);
}

const App = () => {
    useSimpleAnalyticsPageview();
    const sessionId = useAnalyticsTracker();
    const posthog = usePostHog();
    usePageViewTracking(sessionId, posthog);    
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
            fetchQuotes(page, channel, year, sort, strict, game);
        } else if (!searchTerm) {
            setQuotes([]);
            setTotalPages(0);
            setTotalQuotes(0);
            setHasSearched(false);
        }
    }, [searchTerm, page, channel, year, sort, game]);

    const handleChannelChange = (channelId) => {
        // Track channel filter change
        if (posthog) {
            posthog.capture('filter_changed', {
                filter_type: 'channel',
                filter_value: channelId,
            });
        }
        navigate(buildSearchUrl({ channel: channelId, page: 1 }));
    };

    const handleYearChange = (e) => {
        const value = e.target.value;
        setYearInput(value);
        if (value.length === 4 && /^\d{4}$/.test(value)) {
            // Track year filter change
            if (posthog) {
                posthog.capture('filter_changed', {
                    filter_type: 'year',
                    filter_value: value,
                });
            }
            navigate(buildSearchUrl({ year: value, page: 1 }));
        }
    };

    const handleSortChange = (e) => {
        const value = e.target.value;
        // Track sort order change
        if (posthog) {
            posthog.capture('filter_changed', {
                filter_type: 'sort',
                filter_value: value,
            });
        }
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
    };
    const handleGameChange = (e) => {
        const value = e.target.value;
        // Track game filter change
        if (posthog) {
            posthog.capture('filter_changed', {
                filter_type: 'game',
                filter_value: value,
            });
        }
        navigate(buildSearchUrl({ game: value, page: 1 }));
    };

    const handleGameReset = () => {
        // Track game filter reset
        if (posthog) {
            posthog.capture('filter_changed', {
                filter_type: 'game',
                filter_value: 'all',
                action: 'reset',
            });
        }
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
            .filter(([, v]) => v && v !== 'all' && v !== 'default' && v !== 1 && v !== '1')
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        return `${basePath}?${query}`;
    }

    const handleRandomQuotes = async () => {
        // Track random quotes button click
        if (posthog) {
            posthog.capture('random_quotes_clicked');
        }
        
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

    // Record the time when the page was loaded
    const pageLoadTime = performance.now();

    const fetchQuotes = async (pageNum, channel, year, sort, strictMode, game) => {
        const fetchStart = performance.now();
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
            await new Promise(resolve => setTimeout(resolve, 300));
            const responseTimeMs = Math.round(performance.now() - fetchStart);
            // Send analytics for search or pagination
            console.log('fetchQuotes completed, sending analytics. pageNum:', pageNum, 'sessionId:', sessionId);
            if (pageNum === 1) {
                console.log('Sending search analytics');
                sendAnalytics('search', {
                    path: '/search',
                    search_term: searchTerm,
                    channel,
                    year,
                    sort_order: sort,
                    strict,
                    session_id: sessionId,
                    page: 1,
                    total_pages: Math.ceil(response.total / 10),
                    response_time_ms: responseTimeMs,
                    game: game
                });

                // Track search in PostHog (if initialized for non-NL tenants)
                if (posthog) {
                    posthog.capture('search', {
                        search_term: searchTerm,
                        channel,
                        year,
                        sort_order: sort,
                        game,
                        total_results: response.total,
                        total_pages: Math.ceil(response.total / 10),
                        response_time_ms: responseTimeMs,
                    });
                }
            } else {
                console.log('Sending pagination analytics');
                sendAnalytics('pagination', {
                    path: '/search',
                    search_term: searchTerm,
                    channel,
                    year,
                    sort_order: sort,
                    strict,
                    page: pageNum,
                    total_pages: Math.ceil(response.total / 10),
                    session_id: sessionId,
                    response_time_ms: responseTimeMs,
                    game: game
                });

                // Track pagination in PostHog (if initialized for non-NL tenants)
                if (posthog) {
                    posthog.capture('pagination', {
                        search_term: searchTerm,
                        channel,
                        year,
                        sort_order: sort,
                        game,
                        page: pageNum,
                        total_pages: Math.ceil(response.total / 10),
                        response_time_ms: responseTimeMs,
                    });
                }
            }
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

    useEffect(() => {
        if (window.location.pathname === '/' && !sessionStorage.getItem('starting_session_sent')) {
            const responseTimeMs = Math.round(performance.now() - pageLoadTime);
            sendAnalytics('starting_session', {
                path: window.location.pathname,
                session_id: sessionId,
                referrer: document.referrer,
                response_time_ms: responseTimeMs,
                game: game  
            });
            sessionStorage.setItem('starting_session_sent', 'true');
        }
    }, [sessionId, game]);

    return (
        <>
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
                onChangelogClick={() => {
                    // Track changelog modal opened
                    if (posthog) {
                        posthog.capture('changelog_opened');
                    }
                    setChangelogModalOpen(true);
                }}
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
                onChangelogClick={() => {
                    // Track changelog modal opened
                    if (posthog) {
                        posthog.capture('changelog_opened');
                    }
                    setChangelogModalOpen(true);
                }}
            />} />
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