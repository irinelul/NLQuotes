import axios from 'axios'

// Configure Axios defaults
const axiosConfig = {
    timeout: 15000,
    headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
    }
};

const getAll = async (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    try {
        const response = await axios.get('/api', {
            ...axiosConfig,
            params: {
                search: searchTerm || '',
                page: page || 1,
                strict: strict,
                channel: selectedValue || 'all',
                selectedMode: selectedMode || 'searchText',
                year: year || '',
                sort: sortOrder || 'default',
                game: gameName || 'all'
            }
        });

        return {
            data: response.data.data || [],
            total: response.data.total || 0,
            totalQuotes: response.data.totalQuotes || 0
        };
    } catch (error) {
        console.error('Error fetching quotes:', error.message);
        throw error;
    }
};

const flagQuote = async (quoteData) => {
    try {
        const response = await axios.post('/api/flag', quoteData, axiosConfig);
        return response.data;
    } catch (error) {
        console.error('Error flagging quote:', error.message);
        throw error;
    }
};

const getRandomQuotes = async () => {
    try {
        const response = await axios.get('/api/random', axiosConfig);
        if (!response.data || !response.data.quotes) {
            throw new Error('Invalid response format from random quotes endpoint');
        }
        return response.data;
    } catch (error) {
        if (error.message.includes('Network Error')) {
            throw new Error('Network connection failed. Please check your internet connection.');
        } else if (error.message.includes('timeout')) {
            throw new Error('Request timed out. Please try again.');
        } else {
            throw new Error('Unable to fetch random quotes. Please try again later.');
        }
    }
};

const checkDatabaseStatus = async () => {
    try {
        const response = await axios.get('/db-status', axiosConfig);
        return response.data;
    } catch (error) {
        console.error('Error checking database status:', error.message);
        throw error;
    }
};

export default {
    getAll,
    flagQuote,
    getRandomQuotes,
    checkDatabaseStatus
}
