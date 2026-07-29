import { ChannelRadioButton } from './ChannelRadioButton';
import { Filters } from './Filters';
import Disclaimer from './Disclaimer';
import { Quotes } from './Quotes';
import { PaginationButtons } from './PaginationButtons';
import { Footer } from './Footer';
import { FeedbackModal } from './Modals/FeedbackModal';
import { useTheme } from '../hooks/useTheme';
import { TENANT, logo, logoFallback } from '../config/tenant';
import { track } from '../services/analytics';
import styles from './SearchPage.module.css';
// Reused so the loading skeleton is byte-for-byte the same height as real
// results (.quotesTable chrome + 10 x .videoRow at 450px) — this is what makes
// the skeleton itself the reserved space, so first-load => data is shift-free.
import quotesStyles from './Quotes.module.css';
// Same reason, for the top pagination bar: the placeholder borrows the real
// bar's container so the reserved slot is exactly its height.
import paginationStyles from './PaginationButtons/PaginationButtons.module.css';

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

// Empty stand-in for the top pagination bar, same container as the real one
// (40px buttons + 2rem margin-top) so the slot above the results keeps its
// height while the first page is loading. Hidden rather than empty because the
// height must come from real content, not a hardcoded number that drifts.
const PaginationPlaceholder = () => (
    <div
        className={`${paginationStyles.container} ${styles.paginationPlaceholder}`}
        aria-hidden="true"
    >
        <button tabIndex={-1}>&nbsp;</button>
    </div>
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
    handleFeedbackSubmit,
    handleLogoClick,
    handlePageChange,
}) => {
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
                </div>
            </div>
            <div className={styles.inputContainer}>
                <button
                    onClick={handleRandomQuotes}
                    disabled={loading}
                >
                    {/* Both labels share one grid cell, so the button is always
                        as wide as the longer of the two and swapping them can
                        not drag the search input's edge sideways. Sizing it by
                        whichever label is showing did exactly that. */}
                    <span className={styles.buttonLabelStack}>
                        <span className={loading ? styles.labelHidden : undefined}>
                            {randomQuotesText}
                        </span>
                        <span className={loading ? undefined : styles.labelHidden}>
                            {loadingMessage}
                        </span>
                    </span>
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
                    {/* The count line and the top pagination bar sit ABOVE the
                        results, so a slot that is empty during first-load and
                        occupied once data lands pushes the entire results
                        region down — measured at ~0.056 CLS on a desktop
                        search page, the largest shift on the site. Both slots
                        therefore stay occupied for the whole fetch; only their
                        contents change.

                        The count text is still withheld during first-load
                        (totalQuotes is 0 there, and "Total quotes found: 0"
                        above a skeleton is a lie) — the literal U+00A0 below
                        holds the line's height instead. Keep it a non-breaking
                        space: a plain one collapses away and the line loses
                        its height, which is the shift all over again. */}
                    <div className={styles.totalQuotes}>
                        {resultsState === 'first-load'
                            ? ' '
                            : `${totalQuotesLabel} ${numberFormatter.format(totalQuotes)}`}
                    </div>

                    {/* Stays mounted across refetch (keep-previous-data) so it
                        never reattaches mid-fetch. With no results there are no
                        pages to offer, but the slot still holds its height —
                        letting it collapse would move the results region under
                        it, which is the shift this is here to prevent. */}
                    {quotes.length > 0 ? (
                        <PaginationButtons
                            page={page}
                            totalPages={totalPages}
                            handlePageChange={handlePageChange}
                        />
                    ) : (
                        <PaginationPlaceholder />
                    )}

                    <div
                        className={`${styles.resultsRegion}${resultsState === 'refetch' ? ` ${styles.resultsStale}` : ''}`}
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

            <Footer onFeedbackClick={() => { track('feedback_open'); setFeedbackModalOpen(true); }} />

            <FeedbackModal
                isOpen={feedbackModalOpen}
                onClose={() => setFeedbackModalOpen(false)}
                onSubmit={handleFeedbackSubmit}
            />
        </div>
    );
};

export default SearchPage; 