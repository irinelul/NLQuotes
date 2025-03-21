import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams,useLocation  } from 'react-router-dom';
import { format } from 'date-fns';

const URL = 'https://www.youtube.com/watch?v=';

const FlagModal = ({ isOpen, onClose, onSubmit, quote }) => {
    const [reason, setReason] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(reason);
        setReason('');
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#2a2a2a',
                padding: '24px',
                borderRadius: '8px',
                width: '90%',
                maxWidth: '500px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                position: 'relative'
            }}>
                <h3 style={{ 
                    color: '#fff', 
                    marginBottom: '15px',
                    fontSize: '18px',
                    marginTop: 0
                }}>
                    Flag Quote
                </h3>
                <p style={{ 
                    color: '#ccc', 
                    marginBottom: '15px',
                    fontSize: '14px'
                }}>
                    Please provide a reason for flagging this quote:
                </p>
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Enter your reason here..."
                        style={{
                            width: '100%',
                            minHeight: '100px',
                            padding: '12px',
                            marginBottom: '20px',
                            backgroundColor: '#3a3a3a',
                            border: '1px solid #4a4a4a',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '14px',
                            resize: 'vertical',
                            boxSizing: 'border-box'
                        }}
                        required
                    />
                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#4a4a4a',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#ff4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const useQuery = () => {
    return new URLSearchParams(useLocation().search);
};

const formatDate = (yyyymmdd) => {
    const date = new Date(
        yyyymmdd.slice(0, 4),  // Year
        yyyymmdd.slice(4, 6) - 1, // Month (0-indexed)
        yyyymmdd.slice(6, 8) // Day
    );
    return format(date, 'dd MMMM yyyy');  // Updated format
};

const Quotes = ({ quotes = [], selectedMode, searchTerm }) => {
    const isSearchTitle = selectedMode === "searchTitle";
    const [flagging, setFlagging] = useState({});
    const [modalState, setModalState] = useState({
        isOpen: false,
        quote: null,
        videoId: null,
        title: null,
        channel: null,
        timestamp: null
    });

    const handleFlagClick = (quote, videoId, title, channel, timestamp) => {
        setModalState({
            isOpen: true,
            quote,
            videoId,
            title,
            channel,
            timestamp
        });
    };

    const handleFlagSubmit = async (reason) => {
        try {
            setFlagging(prev => ({ ...prev, [`${modalState.videoId}-${modalState.timestamp}`]: true }));
            await query.flagQuote({
                quote: modalState.quote,
                searchTerm,
                timestamp: modalState.timestamp,
                videoId: modalState.videoId,
                title: modalState.title,
                channel: modalState.channel,
                reason
            });
            alert('Quote flagged successfully!');
            setModalState(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error('Error flagging quote:', error);
            alert('Failed to flag quote. Please try again.');
        } finally {
            setFlagging(prev => ({ ...prev, [`${modalState.videoId}-${modalState.timestamp}`]: false }));
        }
    };

    // Log the received props to check if they're passed correctly
    console.log('Selected Mode:', selectedMode);
    console.log('Received Quotes:', quotes);
    
    return (
        <div>
            {quotes.length > 0 ? (
                <table className="quotes-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Channel</th>
                            <th>Video URL</th>
                            <th>Upload Date</th>
                            <th>Quotes with Timestamps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map((quoteGroup) => (
                            <tr key={quoteGroup._id}>
                                <td>{quoteGroup.quotes[0]?.title || 'N/A'}</td>
                                <td>{quoteGroup.quotes[0]?.channel_source || 'N/A'}</td>
                                <td>
                                    <a target="_blank" rel="noopener noreferrer" href={`${URL}${quoteGroup.video_id}`}>
                                        Video Link
                                    </a>
                                </td>
                                <td>
                                    {quoteGroup.quotes[0]?.upload_date
                                        ? formatDate(quoteGroup.quotes[0].upload_date)
                                        : 'N/A'}
                                </td>
                                <td>
                                    {isSearchTitle ? '' : quoteGroup.quotes?.map((quote, index) => (
                                        <div key={index} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '10px',
                                            marginBottom: '8px',
                                            padding: '8px 0',
                                            borderBottom: index < quoteGroup.quotes.length - 1 ? '1px solid #4a4a4a' : 'none'
                                        }}>
                                            <a
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                href={`${URL}${quoteGroup.video_id}&t=${Math.floor(quote.timestamp_start) - 1}`}
                                                style={{ flex: 1 }}
                                            >
                                                {quote.text} (Timestamp: {Math.floor(quote.timestamp_start) - 1})
                                            </a>
                                            <button
                                                onClick={() => handleFlagClick(
                                                    quote.text,
                                                    quoteGroup.video_id,
                                                    quoteGroup.quotes[0]?.title,
                                                    quoteGroup.quotes[0]?.channel_source,
                                                    quote.timestamp_start
                                                )}
                                                disabled={flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    color: '#ff4444',
                                                    border: 'none',
                                                    padding: '4px 8px',
                                                    cursor: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 'not-allowed' : 'pointer',
                                                    opacity: flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? 0.6 : 1,
                                                    fontSize: '16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseOver={e => {
                                                    if (!flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]) {
                                                        e.currentTarget.style.transform = 'scale(1.1)';
                                                    }
                                                }}
                                                onMouseOut={e => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                            </button>
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div>No quotes found</div>
            )}
            <FlagModal
                isOpen={modalState.isOpen}
                onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                onSubmit={handleFlagSubmit}
                quote={modalState.quote}
            />
        </div>
    );
};


const App = () => {
    const [quotes, setQuotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [strict, setStrict] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [stats, setStats] = useState([]);
    const [totalPages, setTotalPages] = useState(0);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [selectedChannel, setselectedChannel] = useState("all");
    const [selectedMode, setselectedMode] = useState("searchText");

    const handleChannelChange = (
        value
    ) => {
        setselectedChannel(value);
    };

    const handleModeChange = (
        value
    ) => {
        setselectedMode(value);
    };

    const fetchQuotes = () => {
        setLoading(true);
        setError(null);
        query
            .getAll(searchTerm, page, strict, selectedChannel,selectedMode)
            .then((result) => {
                setQuotes(result.data || []);
                setTotalPages(result.totalPages || 0);
                setLoading(false);
                setHasSearched(true);
            })
            .catch((err) => {
                setError('Failed to fetch quotes');
                setLoading(false);
                setHasSearched(true);
            });
    };

    const handleSearch = () => {
        setPage(1);
        navigate(`?search=${searchTerm}&page=1&strict=${strict}&channel=${selectedChannel}&mode=${selectedMode}`);
        fetchQuotes();
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        navigate(`?search=${searchTerm}&page=${newPage}&strict=${strict}&channel=${selectedChannel}&mode=${selectedMode}`);
        fetchQuotes();
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    useEffect(() => {
        const urlSearchTerm = searchParams.get('search') || '';
        const urlPage = parseInt(searchParams.get('page')) || 1;
        const urlStrict = searchParams.get('strict') === 'true';

        setSearchTerm(urlSearchTerm);
        setPage(urlPage);
        setStrict(urlStrict);
    }, [searchParams]);

    const numberFormatter = new Intl.NumberFormat('en-US');



    const styles = {
        container: {
        },
        radioGroup: {
            display: "flex",
            justifyContent: "space-between",
            gap: "12px", // Reduced from 16px
            paddingBottom: "8px", // Reduced from 10px
        },
        radioButton: {
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            padding: "8px 16px", // Reduced from 10px 20px
            borderRadius: "3px", // Slightly smaller
            transition: "background-color 0.3s, border 0.3s",
            justifyContent: "center",
        },
        radioLabel: {
            fontSize: "16px", // Reduced from 16px
            color: "white",
            fontWeight: "bold",
        },
    };
    


    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
                <div className="logo-container">
                    <img src={`/NLogo.png`} alt="Northernlion Logo" />
                </div>
                <div className="input-container">
                    <label htmlFor="quote-search">
                        <input
                            id="quote-search"
                            className="search-input"
                            onKeyDown={handleKeyPress}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search quotes..."
                        />
                    </label>
                    <button onClick={handleSearch}>Search</button>
                </div>
                <div style={styles.container}>
                    <div style={styles.radioGroup}>
                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedChannel === "all" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedChannel === "all" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleChannelChange("all")}
                        >
                            <input
                                type="radio"
                                id="option1"
                                value="all"
                                checked={selectedChannel === "all"}
                                onChange={() => handleChannelChange("all")}
                                style={{ display: "none" }} // Hide the default radio button
                            />
                            <label
                                htmlFor="option1"
                                style={styles.radioLabel}
                            >
                                All Sources
                            </label>
                        </div>

                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedChannel === "Librarian" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedChannel === "Librarian" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleChannelChange("Librarian")}
                        >
                            <input
                                type="radio"
                                id="option2"
                                value="Librarian"
                                checked={selectedChannel === "Librarian"}
                                onChange={() => handleChannelChange("Librarian")}
                                style={{ display: "none" }} // Hide the default radio button
                            />
                            <label
                                htmlFor="Librarian"
                                style={styles.radioLabel}
                            >
                                Librarian
                            </label>
                        </div>

                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedChannel === "Northernlion" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedChannel === "Northernlion" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleChannelChange("Northernlion")}
                        >
                            <input
                                type="radio"
                                id="Northernlion"
                                value="Northernlion"
                                checked={selectedChannel === "Northernlion"}
                                onChange={() => handleChannelChange("Northernlion")}
                                style={{ display: "none" }} // Hide the default radio button
                            />
                            <label
                                htmlFor="Northernlion"
                                style={styles.radioLabel}
                            >
                                Northernlion
                            </label>
                        </div>
                    </div>
                </div>
                <div style={styles.container}>
                    <div style={styles.radioGroup}>
                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedMode === "searchText" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedMode === "searchText" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleModeChange("searchText")}
                        >
                            <input
                                type="radio"
                                id="option4"
                                value="searchText"
                                checked={selectedMode === "searchText"}
                                onChange={() => handleModeChange("searchText")}
                                style={{ display: "none" }} // Hide the default radio button
                            />
                            <label
                                htmlFor="option4"
                                style={styles.radioLabel}
                            >
                                Search Quote
                            </label>
                        </div>

                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedMode === "searchTitle" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedMode === "searchTitle" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleModeChange("searchTitle")}
                        >
                            <input
                                type="radio"
                                id="option5"
                                value="searchTitle"
                                checked={selectedMode === "searchTitle"}
                                onChange={() => handleModeChange("searchTitle")}
                                style={{ display: "none" }} // Hide the default radio button
                            />
                            <label
                                htmlFor="Librarian"
                                style={styles.radioLabel}
                            >
                                Search Title
                            </label>
                        </div>

                    </div>
                </div>


                {hasSearched && <Quotes quotes={quotes} selectedMode={selectedMode} searchTerm={searchTerm} />}
                {quotes.length > 0 && (
                    <div className="pagination-buttons" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <button 
                            onClick={() => handlePageChange(page - 1)} 
                            disabled={page === 1 || quotes.length < 10}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: (page === 1 || quotes.length < 10) ? '#4a4a4a' : '#758b89',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: (page === 1 || quotes.length < 10) ? 'not-allowed' : 'pointer',
                                opacity: (page === 1 || quotes.length < 10) ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                boxShadow: (page === 1 || quotes.length < 10) ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
                                ':hover': {
                                    transform: (page === 1 || quotes.length < 10) ? 'none' : 'translateY(-2px)',
                                    boxShadow: (page === 1 || quotes.length < 10) ? 'none' : '0 4px 8px rgba(0,0,0,0.3)'
                                }
                            }}
                            onMouseOver={e => {
                                if (!(page === 1 || quotes.length < 10)) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                                }
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = (page === 1 || quotes.length < 10) ? 'none' : '0 2px 4px rgba(0,0,0,0.2)';
                            }}
                        >
                            Previous
                        </button>
                        <button 
                            onClick={() => handlePageChange(page + 1)} 
                            disabled={page === totalPages || quotes.length < 10}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: (page === totalPages || quotes.length < 10) ? '#4a4a4a' : '#758b89',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: (page === totalPages || quotes.length < 10) ? 'not-allowed' : 'pointer',
                                opacity: (page === totalPages || quotes.length < 10) ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                boxShadow: (page === totalPages || quotes.length < 10) ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
                                ':hover': {
                                    transform: (page === totalPages || quotes.length < 10) ? 'none' : 'translateY(-2px)',
                                    boxShadow: (page === totalPages || quotes.length < 10) ? 'none' : '0 4px 8px rgba(0,0,0,0.3)'
                                }
                            }}
                            onMouseOver={e => {
                                if (!(page === totalPages || quotes.length < 10)) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
                                }
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = (page === totalPages || quotes.length < 10) ? 'none' : '0 2px 4px rgba(0,0,0,0.2)';
                            }}
                        >
                            Next
                        </button>
                    </div>
                )}
                {loading && <div>Loading...</div>}
                {error && <div>{error}</div>}
            </div>
        </>
    );
};

export default App;