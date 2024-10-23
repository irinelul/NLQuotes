import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const URL = 'https://www.youtube.com/watch?v=';

const Quotes = ({ quotes }) => {
    return (
        <div>
            {quotes.length > 0 ? (
                <table className="quotes-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Video URL</th>
                            <th>Quotes with Timestamps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map((quoteGroup) => (
                            <tr key={quoteGroup._id}>
                                <td>{quoteGroup.quotes[0].title}</td> {/* Display the title */}
                                <td>
                                    <a href={`${URL}${quoteGroup.video_id}`}>
                                        Video Link
                                    </a>
                                </td>
                                <td>
                                    {quoteGroup.quotes.map((quote, index) => (
                                        <div key={index}>
                                            <a href={`${URL}${quoteGroup.video_id}&t=${Math.floor(quote.timestamp_start)-1}`}>
                                                {quote.text} (Timestamp: {Math.floor(quote.timestamp_start)-1})
                                            </a>
                                            {index < quoteGroup.quotes.length - 1 && <hr />} {/* Add <hr> after each quote except the last one */}
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
    const [stats, setStats] = useState('');
    const [totalPages, setTotalPages] = useState(0);

    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Fetch quotes when user clicks search
    const fetchQuotes = () => {
        setLoading(true);
        setError(null);
        query
            .getAll(searchTerm, page, strict)
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

    const fetchStats = () => {
        query.getStats().then((result) => setStats(result.data));
    };

    // Fetch stats on component load
    useEffect(() => {
        fetchStats();
    }, []);

    const handleSearch = () => {
        setPage(1); // Reset to page 1 on new search
        navigate(`?search=${searchTerm}&page=1&strict=${strict}`);
        fetchQuotes(); // Only fetch quotes when user clicks search
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        navigate(`?search=${searchTerm}&page=${newPage}&strict=${strict}`);
        fetchQuotes(); // Fetch new page quotes
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    useEffect(() => {
        // Sync with the URL params on initial load but don't fetch quotes automatically
        const urlSearchTerm = searchParams.get('search') || '';
        const urlPage = parseInt(searchParams.get('page')) || 1;
        const urlStrict = searchParams.get('strict') === 'true';

        setSearchTerm(urlSearchTerm);
        setPage(urlPage);
        setStrict(urlStrict);
    }, [searchParams]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100vh' }}>
            <div className="stats">
                Stats Area: <br />
                {stats} / 3183 Librarian videos <br />
                0 / 20,374 NL Videos
            </div>
            <div className="logo-container">
                <img src={`/NLogo.png`} alt="Northernlion Logo" />
            </div>
            <div className="input-container">
                <input
                    className="search-input"
                    onKeyDown={handleKeyPress}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search quotes..."
                />
                <button onClick={handleSearch}>Search</button>
            </div>
            <div>
                <label>
                    <input
                        type="checkbox"
                        checked={strict}
                        onChange={() => setStrict((prevStrict) => !prevStrict)}
                    />
                    Strict mode: the search only matches the exact word (e.g., "flat" won't match "inflation").
                </label>
            </div>
            {hasSearched && <Quotes quotes={quotes} />}
            <div className="pagination-buttons">
                <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
                    Previous
                </button>
                <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
                    Next
                </button>
            </div>
            {loading && <div>Loading...</div>}
            {error && <div>{error}</div>}
        </div>
    );
};

export default App;
