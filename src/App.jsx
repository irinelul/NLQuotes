import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';

const URL = 'https://www.youtube.com/watch?v=';

const Quotes = ({ quotes }) => {
    return (
        <div>
            {quotes.length > 0 ? (
                <table className="quotes-table">
                    <thead>
                    <tr>
                        <th>Quote</th>
                        <th>Video Link</th>
                        <th>Title</th>
                    </tr>
                    </thead>
                    <tbody>
                    {quotes.map((quote, index) => (
                        <tr key={quote.id || `quote-${index}`}>
                            <td>{quote.text}</td>
                            <td>
                                <a href={`${URL}${quote.video_id}&t=${Math.floor(quote.timestamp_start-1)}`}>
                                    Video Link
                                </a>
                            </td>
                            <td>{quote.title}</td>
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
    const [currentSearchTerm, setCurrentSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [PreviousSearchTerm,setPreviousSearchTerm]= useState('');
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [strict, setStrict] =useState(false)
    const [stats, setStats] =useState('');
    const fetchQuotes = () => {
        setLoading(true);
        setError(null);
        query
            .getAll(currentSearchTerm, page,strict)
            .then(result => {
                setQuotes(result.data || []);
                setTotalPages(result.totalPages || 0);
                setLoading(false);
                setHasSearched(true);
            })
            .catch(err => {
                setError('Failed to fetch quotes');
                setLoading(false);
                setHasSearched(true);
            });
    };
    const fetchStats = () =>{
        query.getStats()
        .then(result=>{setStats(result.data)})
    }
    

    useEffect(() => {
        if (currentSearchTerm) {
            fetchQuotes();
        }
    }, [page, currentSearchTerm]);


    useEffect(() => {
            fetchStats();
    }, []);


    const handleSearch = () => {
        setPreviousSearchTerm(currentSearchTerm);
        setCurrentSearchTerm(searchTerm);
        setPage(1);
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            // justifyContent: 'center',
            alignItems: 'center',
            height: '100vh'
        }}>
            <div classname="stats">
                Stats Area: <br></br>
                {stats} / 3183 Librarian videos <br></br>
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
            <div> <label> <input type="checkbox" onClick={() => setStrict((prevStrict) => !prevStrict)} /> Strict mode: the search only matches the exact word (e.g., "flat" won't match "inflation"). </label> </div>
            {hasSearched && <Quotes quotes={quotes} />}
            <div className="pagination-buttons">
                <button onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
                <button onClick={() => setPage(page + 1)} disabled={page === totalPages}>Next</button>
            </div>
            {loading && <div>Loading...</div>}
            {error && <div>{error}</div>}
        </div>
    );

};
export default App;
