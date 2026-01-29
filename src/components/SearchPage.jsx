import React, { useEffect } from 'react';
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
import { usePostHog } from '../hooks/usePostHog';

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
    const posthog = usePostHog();
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

    return (
        <div className='main-container'>
            <div className="logo-section">
                <div className="logo-container" onClick={handleLogoClick}>
                    <img 
                        src={logo} 
                        alt={`${TENANT.name || 'NLQuotes'} Logo`}
                        width={156}
                        height={125}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = logoFallback;
                        }}
                    />
                </div>
                <div className="logo-nav">
                    <button
                        onClick={toggleTheme}
                        className="logo-nav-button theme-toggle-button"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                    </button>
                    <button
                        onClick={() => {
                            // Track stats page navigation
                            if (posthog) {
                                posthog.capture('stats_page_clicked');
                            }
                            navigate('/stats');
                        }}
                        className="logo-nav-button stats-button"
                    >
                        📊 Stats
                    </button>
                    <button
                        onClick={() => {
                            // Track changelog modal opened
                            if (posthog) {
                                posthog.capture('changelog_opened');
                            }
                            onChangelogClick();
                        }}
                        className="logo-nav-button"
                        style={{ background: '#4CAF50' }}
                        title="View Changelog"
                    >
                        📋 Changelog
                    </button>
                </div>
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
                    {loading ? loadingMessage : randomQuotesText}
                </button>
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={searchPlaceholder}
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

            {error && <div className="error-message">{error || errorMessage}</div>}

            <div className="radio-group channel-tooltip">
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

            {!hasSearched && <Disclaimer />}
                    
            {loading && <div>{loadingMessage}</div>}
            {hasSearched && (
                <>
                    <div className="total-quotes">
                        {totalQuotesLabel} {numberFormatter.format(totalQuotes)}
                    </div>
                    {quotes.length > 0 && (
                        <PaginationButtons
                            page={page}
                            totalPages={totalPages}
                            handlePageChange={handlePageChange}
                        />
                    )}
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

            <Footer onChangelogClick={onChangelogClick} />

            {/* Improved desktop-only feedback button */}
            <GeneralFeedbackButton
                onClick={() => {
                    // Track feedback modal opened
                    if (posthog) {
                        posthog.capture('feedback_modal_opened');
                    }
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