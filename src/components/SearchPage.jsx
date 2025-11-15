import React from 'react';
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
}) => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    return (
        <div className='main-container'>
            <div className="logo-section">
                <div className="logo-container" onClick={handleLogoClick}>
                    <img 
                        src="/nlquotes.svg" 
                        alt="Northernlion Logo"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "/NLogo.png";
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
                    
            {loading && <div>Loading...</div>}
            {hasSearched && (
                <>
                    <div className="total-quotes">
                        Total quotes found: {numberFormatter.format(totalQuotes)}
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

            <Footer />

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