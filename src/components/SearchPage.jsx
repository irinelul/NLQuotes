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
import { useTenant } from '../hooks/useTenant';

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
    const { tenant, loading: tenantLoading } = useTenant();
    
    // Use tenant config with fallbacks
    const logo = tenant?.branding?.logo || '/nlquotes.svg';
    const logoFallback = tenant?.branding?.logoFallback || '/NLogo.png';
    
    // Debug logging
    useEffect(() => {
      if (tenant) {
        console.log('[SearchPage] Tenant loaded:', tenant.id, 'Logo:', logo, 'Fallback:', logoFallback);
      } else if (!tenantLoading) {
        console.warn('[SearchPage] No tenant config loaded, using fallbacks');
      }
    }, [tenant, tenantLoading, logo, logoFallback]);
    const searchPlaceholder = tenant?.texts?.searchPlaceholder || 'Search quotes...';
    const randomQuotesText = tenant?.texts?.randomQuotesButton || 'Random Quotes';
    const totalQuotesLabel = tenant?.texts?.totalQuotesLabel || 'Total quotes found:';
    const loadingMessage = tenant?.texts?.loadingMessage || 'Loading...';
    const errorMessage = tenant?.texts?.errorMessage || 'Unable to connect to database.';
    const channels = tenant?.channels || [
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
                        alt={`${tenant?.name || 'NLQuotes'} Logo`}
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
                        onClick={() => navigate('/stats')}
                        className="logo-nav-button stats-button"
                    >
                        📊 Stats
                    </button>
                    <button
                        onClick={() => navigate('/popular-searches')}
                        className="logo-nav-button popular-searches-button"
                    >
                        🔥 Popular
                    </button>
                    <button
                        onClick={onChangelogClick}
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
                onClick={() => setFeedbackModalOpen(true)}
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