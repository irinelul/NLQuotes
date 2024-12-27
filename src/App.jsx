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
                                <td>{quoteGroup.quotes[0].title}</td>
                                <td>
                                    <a target="_blank" rel="noopener noreferrer" href={`${URL}${quoteGroup.video_id}`}>
                                        Video Link
                                    </a>
                                </td>
                                <td>
                                    {quoteGroup.quotes.map((quote, index) => (
                                        <div key={index}>
                                            <a target="_blank" rel="noopener noreferrer" href={`${URL}${quoteGroup.video_id}&t=${Math.floor(quote.timestamp_start)-1}`}>
                                                {quote.text} (Timestamp: {Math.floor(quote.timestamp_start)-1})
                                            </a>
                                            {index < quoteGroup.quotes.length - 1 && <hr />}
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

    useEffect(() => {
        fetchStats();
    }, []);

    const handleSearch = () => {
        setPage(1);
        navigate(`?search=${searchTerm}&page=1&strict=${strict}`);
        fetchQuotes();
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        navigate(`?search=${searchTerm}&page=${newPage}&strict=${strict}`);
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

    return (
        <>
            <div className="stats" style={{ position: 'absolute', top: 0, left: 0, padding: '10px' }}>
                Stats Area: <br />
                {stats} / 3,342 Librarian videos <br />
                0 / 20,613 NL Videos
            </div>
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
        </>
    );
};

export default App;
