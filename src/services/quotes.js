import axios from 'axios'

// Detect Render.com environment
const isOnRender = window.location.hostname.includes('render.com') || 
                   window.location.hostname.includes('onrender.com');

// Define possible API path prefixes to try
const pathPrefixes = [
    '/api', // Standard setup
    '',     // No prefix (direct routes)
    '/app/api', // Potential subfolder configuration
];

// Helper to try API calls with different path prefixes
const makeApiRequest = async (endpoint, method = 'get', params = null, data = null) => {
    for (const prefix of pathPrefixes) {
        try {
            const fullPath = `${prefix}${endpoint}`;
            console.log(`Trying API request: ${method.toUpperCase()} ${fullPath}`);
            
            if (method === 'get') {
                const response = await axios.get(fullPath, { params });
                console.log(`API call succeeded with prefix: ${prefix}`);
                return response;
            } else if (method === 'post') {
                const response = await axios.post(fullPath, data);
                console.log(`API call succeeded with prefix: ${prefix}`);
                return response;
            }
        } catch (error) {
            console.log(`API call failed with prefix: ${prefix}`, error.message);
            // Continue to next prefix if this one failed
            if (prefix === pathPrefixes[pathPrefixes.length - 1]) {
                // If this is the last prefix to try, propagate the error
                throw error;
            }
        }
    }
};

const getAll = async (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    try {
        const response = await makeApiRequest('', 'get', {  
            searchTerm: searchTerm || '', 
            page: page || 1,   
            strict: strict,
            selectedValue: selectedValue || 'all',
            selectedMode: selectedMode || 'searchText',
            year: year || '',
            sortOrder: sortOrder || 'default',
            gameName: gameName || 'all'
        });
        
        return {
            data: response.data.data,
            total: response.data.total,
            totalQuotes: response.data.totalQuotes || 0
        };
    } catch (error) {
        console.error('Error fetching quotes:', error);
        throw error;
    }
};


const getStats = async () => {
    try {
        const response = await makeApiRequest('/stats', 'get');
        return response.data;
    } catch (error) {
        console.error('Error fetching stats:', error);
        throw error;
    }
};

const flagQuote = async (quoteData) => {
    try {
        const response = await makeApiRequest('/flag', 'post', null, quoteData);
        return response.data;
    } catch (error) {
        console.error('Error flagging quote:', error);
        throw error;
    }
};

const getRandomQuotes = async () => {
    try {
        const response = await makeApiRequest('/random', 'get');
        return response.data;
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        throw error;
    }
};

const checkDatabaseStatus = async () => {
    try {
        const response = await makeApiRequest('/db-status', 'get');
        return response.data;
    } catch (error) {
        console.error('Error checking database status:', error);
        throw error;
    }
};

export default {
    getAll,
    getStats,
    flagQuote,
    getRandomQuotes,
    checkDatabaseStatus
}