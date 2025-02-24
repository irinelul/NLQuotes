import { useState, useEffect } from 'react';
import query from './services/quotes';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';

const URL = 'https://www.youtube.com/watch?v=';



const formatDate = (yyyymmdd) => {
    const date = new Date(
        yyyymmdd.slice(0, 4),  // Year
        yyyymmdd.slice(4, 6) - 1, // Month (0-indexed)
        yyyymmdd.slice(6, 8) // Day
    );
    return format(date, 'dd MMMM yyyy');  // Updated format
};



const Quotes = ({ quotes }) => {
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

                                <td>{quoteGroup.quotes[0].title}</td>
                                <td>
                                    {quoteGroup.quotes[0].channel_source}
                                </td>
                                <td>
                                    <a target="_blank" rel="noopener noreferrer" href={`${URL}${quoteGroup.video_id}`}>
                                        Video Link
                                    </a>
                                </td>

                                <td>
                                    {quoteGroup.quotes[0].upload_date ? formatDate(quoteGroup.quotes[0].upload_date) : 'N/A'}
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
    const [stats, setStats] = useState([]);
    const [totalPages, setTotalPages] = useState(0);

    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [selectedValue, setSelectedValue,] = useState("all");

    const handleRadioChange = (
        value
    ) => {
        setSelectedValue(value);
    };

    const fetchQuotes = () => {
        setLoading(true);
        setError(null);
        query
            .getAll(searchTerm, page, strict, selectedValue)
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
        query.getStats().then((result) => {
            console.log('Fetched stats:', result.data);
            setStats(result.data);
            console.log(selectedValue)
        }).catch((error) => {
            console.error('Error fetching stats:', error);
            setStats([]); // Handle errors gracefully by setting stats to empty array
        });
    };

    useEffect(() => {
        fetchStats(); // Fetch stats in the background
    }, []);

    const handleSearch = () => {
        setPage(1);
        navigate(`?search=${searchTerm}&page=1&strict=${strict}&channel=${selectedValue}`);
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

    const numberFormatter = new Intl.NumberFormat('en-US');



    const styles = {
        container: {
        },
        radioGroup: {
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            paddingBottom: "10px",
        },
        radioButton: {
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            padding: "10px 20px",
            borderRadius: "4px",
            transition: "background-color 0.3s, border 0.3s",
            justifyContent: "center",
        },
        radioLabel: {
            fontSize: "16px",
            color: "white",
            fontWeight: "bold",
        },
    };


    return (
        <>
            <div className="stats" style={{ position: 'absolute', top: 0, left: 0, padding: '10px' }}>
                <h2>Stats</h2>
                {stats.length > 0 ? (
                    <ul>
                        {stats
                            .filter(stat => stat.channel_source !== null)
                            .map((stat) => (
                                <li key={stat.channel_source}>
                                    {stat.channel_source}: {numberFormatter.format(stat.videoCount)} videos, {numberFormatter.format(stat.totalQuotes)} quotes
                                </li>
                            ))}
                    </ul>
                ) : (
                    <div>Loading stats...</div>
                )}
            </div>
            <div>
                The database got corrupted during migration, working on bringing it back up.
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
                <div style={styles.container}>
                    <div style={styles.radioGroup}>
                        <div
                            style={{
                                ...styles.radioButton,
                                backgroundColor: selectedValue === "all" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedValue === "all" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleRadioChange("all")}
                        >
                            <input
                                type="radio"
                                id="option1"
                                value="all"
                                checked={selectedValue === "all"}
                                onChange={() => handleRadioChange("all")}
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
                                backgroundColor: selectedValue === "Librarian" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedValue === "Librarian" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleRadioChange("Librarian")}
                        >
                            <input
                                type="radio"
                                id="option2"
                                value="Librarian"
                                checked={selectedValue === "Librarian"}
                                onChange={() => handleRadioChange("Librarian")}
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
                                backgroundColor: selectedValue === "Northernlion" ? "#758b89" : "transparent", // Highlight when selected
                                border: selectedValue === "Northernlion" ? "2px solid #00796b" : "2px solid transparent", // Border change on selection
                            }}
                            onClick={() => handleRadioChange("Northernlion")}
                        >
                            <input
                                type="radio"
                                id="Northernlion"
                                value="Northernlion"
                                checked={selectedValue === "Northernlion"}
                                onChange={() => handleRadioChange("Northernlion")}
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