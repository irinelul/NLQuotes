import { ChannelRadioButton } from './ChannelRadioButton';
import { Filters } from './Filters';
import Disclaimer from './Disclaimer';
import { Quotes } from './Quotes';
import { PaginationButtons } from './PaginationButtons';
import { Footer } from './Footer';
import { FeedbackModal } from './Modals/FeedbackModal';
import { useNavigate } from 'react-router-dom';
import GeneralFeedbackButton from './GeneralFeedbackButton';
import { useTheme } from '../hooks/useTheme';
import { TENANT, logo, logoFallback } from '../config/tenant';
import { track } from '../services/analytics';
import styles from './SearchPage.module.css';
// Reused so the loading skeleton is byte-for-byte the same height as real
// results (.quotesTable chrome + 10 x .videoRow at 450px) — this is what makes
// the skeleton itself the reserved space, so first-load => data is shift-free.
import quotesStyles from './Quotes.module.css';

// Number of placeholder rows in the first-load skeleton. Real result pages are
// 10 rows, so the skeleton matches that height exactly.
const SKELETON_ROW_COUNT = 10;

// Loading skeleton: a real <table> mirroring the results table (same thead +
// 10 .videoRow rows) so its rendered height equals a full results page. Pure
// DOM/CSS — no JS sizing, SSR-safe.
const ResultsSkeleton = () => (
    <table className={quotesStyles.quotesTable} aria-hidden="true">
        <thead>
            <tr>
                <th>Video</th>
                <th>Quotes with Timestamps</th>
            </tr>
        </thead>
        <tbody>
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                <tr key={i} className={quotesStyles.videoRow}>
                    <td className={quotesStyles.videoCell}>
                        <div className={styles.skeletonVideo}>
                            <div className={`${styles.skeletonBar} ${styles.skeletonShimmer}`} />
                        </div>
                    </td>
                    <td className={quotesStyles.quotesCell}>
                        <div className={styles.skeletonQuotes}>
                            <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                            <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                            <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                        </div>
                    </td>
                </tr>
            ))}
        </tbody>
    </table>
);

const SearchPage = ({
    searchInput,
    setSearchInput,
    yearInput,
    setYearInput,
    handleSearch,
    handleKeyPress,
    handleResetSearch,
    handleRandomQuotes,
    handleChannelChange,
    handleYearChange,
    handleSortChange,
    handleGameChange,
    handleGameReset,
    loading,
    error,
    channel,
    sort,
    game,
    games,
    page,
    totalPages,
    totalQuotes,
    hasSearched,
    quotes,
    searchTerm,
    numberFormatter,
    strict,
    feedbackModalOpen,
    setFeedbackModalOpen,
    submittingFeedback,
    handleFeedbackSubmit,
    handleLogoClick,
    handlePageChange,
    onChangelogClick,
}) => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    
    // Use hard-bound tenant config (resolved at build time, no flickering)
    const searchPlaceholder = TENANT.texts?.searchPlaceholder || 'Search quotes...';
    const randomQuotesText = TENANT.texts?.randomQuotesButton || 'Random Quotes';
    const totalQuotesLabel = TENANT.texts?.totalQuotesLabel || 'Total quotes found:';
    const loadingMessage = TENANT.texts?.loadingMessage || 'Loading...';
    const errorMessage = TENANT.texts?.errorMessage || 'Unable to connect to database.';
    const channels = TENANT.channels || [
        { id: 'all', name: 'All Sources' },
        { id: 'librarian', name: 'Librarian' },
        { id: 'northernlion', name: 'Northernlion' }
    ];

    // Single derived results state — exactly one region renders at a time so
    // there is never a height swap between states (the CLS root cause):
    //   idle       !hasSearched                    -> <Disclaimer/>
    //   first-load loading && quotes.length === 0   -> 10-row skeleton
    //   refetch    loading && quotes.length > 0     -> real results, dimmed
    //   empty      !loading && quotes.length === 0  -> "No quotes found"
    //   data       !loading && quotes.length > 0    -> the table
    const resultsState = !hasSearched
        ? 'idle'
        : loading
            ? (quotes.length > 0 ? 'refetch' : 'first-load')
            : (quotes.length > 0 ? 'data' : 'empty');

    return (
        <div className={styles.mainContainer}>
            <div className={styles.logoSection}>
                <div className={styles.logoContainer} onClick={handleLogoClick}>
                    <img 
                        src={logo} 
                        alt={`${TENANT.name || 'NLQuotes'} Logo`}
                        width={156}
                        height={125}
                        fetchPriority="high"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = logoFallback;
                        }}
                    />
                </div>
                <div className={styles.logoNav}>
                    <button
                        onClick={toggleTheme}
                        className={`${styles.logoNavButton} ${styles.themeToggleButton}`}
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                    </button>
                    <button
                        onClick={() => {
                            navigate('/stats');
                        }}
                        className={`${styles.logoNavButton} ${styles.statsButton}`}
                    >
                        📊 Stats
                    </button>
                    <button
                        onClick={() => {
                            onChangelogClick();
                        }}
                        className={`${styles.logoNavButton} ${styles.changelogButton}`}
                        title="View Changelog"
                    >
                        📋 Changelog
                    </button>
                </div>
            </div>
            <div className={styles.inputContainer}>
                <button
                    onClick={handleRandomQuotes}
                    disabled={loading}
                >
                    {loading ? loadingMessage : randomQuotesText}
                </button>
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={searchPlaceholder}
                    className={styles.searchInput}
                />
                <button onClick={handleSearch}>
                    Search
                </button>
                <button
                    onClick={handleResetSearch}
                >
                    Reset Search
                </button>
            </div>

            {error && <div className={styles.errorMessage}>{error || errorMessage}</div>}

            <div className={`${styles.radioGroup} ${styles.channelTooltip}`}>
                {channels.map((ch) => (
                    <ChannelRadioButton
                        key={ch.id}
                        selectedChannel={channel}
                        handleChannelChange={handleChannelChange}
                        id={ch.id}
                        name={ch.name}
                    />
                ))}
            </div>
            
            <Filters 
                selectedYear={yearInput}
                handleYearChange={handleYearChange}
                sortOrder={sort}
                handleSortChange={handleSortChange}
                selectedGame={game}
                handleGameChange={handleGameChange}
                handleGameReset={handleGameReset}
                games={games}
                searchTerm={searchTerm}
                page={page}
                selectedChannel={channel}
                strict={strict} 
                yearInput={yearInput}
                setYearInput={setYearInput}
                gameFilterConfig={TENANT.gameFilter}
            />

            {/* Results region: a single 5-state machine. Each state reserves
                its own space (skeleton == real height, stale results stay
                mounted), so loading never changes the page height (no CLS). */}
            {resultsState === 'idle' ? (
                <Disclaimer />
            ) : (
                <>
                    {/* Suppress the total-count label during first-load:
                        totalQuotes is 0 there, so "Total quotes found: 0"
                        above the skeleton is misleading and shifts when the
                        real count arrives. Shown in data/refetch/empty (0 is
                        correct once loading is done, including the empty state). */}
                    {resultsState !== 'first-load' && (
                        <div className={styles.totalQuotes}>
                            {`${totalQuotesLabel} ${numberFormatter.format(totalQuotes)}`}
                        </div>
                    )}

                    {/* Top pagination bar. Stays mounted across refetch
                        (keep-previous-data) so it never reattaches/detaches
                        mid-fetch; gated on having results. */}
                    {quotes.length > 0 && (
                        <PaginationButtons
                            page={page}
                            totalPages={totalPages}
                            handlePageChange={handlePageChange}
                        />
                    )}

                    <div
                        className={resultsState === 'refetch' ? styles.resultsStale : undefined}
                        aria-busy={loading}
                    >
                        {/* Accessible loading status: announced to AT, visually
                            hidden (the skeleton/dim is the visual affordance). */}
                        {loading && (
                            <span role="status" aria-live="polite" className={styles.srOnly}>
                                {loadingMessage}
                            </span>
                        )}

                        {resultsState === 'first-load' && <ResultsSkeleton />}

                        {(resultsState === 'data' || resultsState === 'refetch') && (
                            <Quotes
                                quotes={quotes}
                                searchTerm={searchTerm}
                                totalQuotes={totalQuotes}
                                loading={loading}
                            />
                        )}

                        {resultsState === 'empty' && (
                            <Quotes
                                quotes={quotes}
                                searchTerm={searchTerm}
                                totalQuotes={totalQuotes}
                                loading={false}
                            />
                        )}
                    </div>

                    {/* Bottom pagination bar — mirrors the top (top+bottom is
                        intentional). Gated identically so the two stay in sync
                        and neither vanishes/reattaches during loading. */}
                    {quotes.length > 0 && (
                        <PaginationButtons
                            page={page}
                            totalPages={totalPages}
                            handlePageChange={handlePageChange}
                        />
                    )}
                </>
            )}

            <Footer onChangelogClick={onChangelogClick} />

            {/* Improved desktop-only feedback button */}
            <GeneralFeedbackButton
                onClick={() => {
                    track('feedback_open');
                    setFeedbackModalOpen(true);
                }}
                disabled={submittingFeedback}
            />

            <FeedbackModal
                isOpen={feedbackModalOpen}
                onClose={() => setFeedbackModalOpen(false)}
                onSubmit={handleFeedbackSubmit}
            />
        </div>
    );
};

export default SearchPage; 