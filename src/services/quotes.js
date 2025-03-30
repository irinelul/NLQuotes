import axios from 'axios'

// Detect Render.com environment
const isOnRender = window.location.hostname.includes('render.com') || 
                   window.location.hostname.includes('onrender.com');

// Check if current protocol is HTTPS
const isHttps = window.location.protocol === 'https:';

// Define possible API path prefixes to try
const pathPrefixes = [
    '', // No prefix (direct routes) - TRY THIS FIRST on Render
    '/api', // Standard setup
    '/app/api', // Potential subfolder configuration
];

// Define possible base URLs for direct access if proxy fails
// This helps bypass potential SSL/Proxy issues
const possibleBaseUrls = isOnRender ? [
    '', // Current domain (default)
    window.location.origin, // Explicit origin
] : [''];

// Configure Axios with settings to handle SSL issues
const axiosConfig = {
    timeout: 15000,  // Longer timeout for SSL handshakes
    headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
    }
};

// For Render.com, we may need to adjust SSL verification
if (isOnRender) {
    console.log('Running on Render.com, adjusting API paths');
    // Set the first path to try based on Render's routing
    pathPrefixes.unshift('');
}

// Add a delay helper for migration mode
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Flag to indicate if we're in migration mode (will be set to true after failed attempts)
let isMigrationMode = false; // Migration complete - set to false to enable searches

// Helper to try API calls with different path prefixes and base URLs
const makeApiRequest = async (endpoint, method = 'get', params = null, data = null) => {
    // If we already know we're in migration mode, fail faster
    if (isMigrationMode) {
        await delay(300); // Add a small delay to simulate a request
        throw new Error('API unavailable during database migration');
    }
    
    // Errors to collect
    const errors = [];
    
    // Try each base URL
    for (const baseUrl of possibleBaseUrls) {
        // Try each path prefix
        for (const prefix of pathPrefixes) {
            try {
                // Build the full path. If endpoint doesn't start with /, add it
                const pathSeparator = (endpoint && !endpoint.startsWith('/') && prefix !== '') ? '/' : '';
                const fullPath = `${baseUrl}${prefix}${pathSeparator}${endpoint}`;
                console.log(`Trying API request: ${method.toUpperCase()} ${fullPath}`);
                
                if (method === 'get') {
                    const response = await axios.get(fullPath, { 
                        ...axiosConfig,
                        params 
                    });
                    console.log(`API call succeeded with: ${fullPath}`);
                    return response;
                } else if (method === 'post') {
                    const response = await axios.post(fullPath, data, axiosConfig);
                    console.log(`API call succeeded with: ${fullPath}`);
                    return response;
                }
            } catch (error) {
                const errorInfo = {
                    path: `${baseUrl}${prefix}${endpoint}`,
                    status: error.response?.status,
                    message: error.message,
                    isSSL: error.message.includes('SSL')
                };
                errors.push(errorInfo);
                
                console.log(`API call failed with: ${baseUrl}${prefix}${endpoint}`, errorInfo);
                
                // If we get SSL error, log more details
                if (error.message.includes('SSL')) {
                    console.error('SSL Error detected:', error);
                }
            }
        }
    }
    
    // If we reach here, all attempts failed
    console.log('All API paths failed - entering migration mode');
    console.log('Collected errors:', errors);
    isMigrationMode = true;
    
    throw new Error('Connection error. API temporarily unavailable.');
};

const getAll = async (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    try {
        // If we're in migration mode, fail quickly with appropriate message
        if (isMigrationMode) {
            await delay(500);
            throw new Error('Search unavailable during database migration');
        }
        
        // Special handling: Try both empty endpoint and /api endpoint
        let response;
        try {
            // First, try the base endpoint (which would be "/" in production on Render)
            response = await makeApiRequest('', 'get', {  
                searchTerm: searchTerm || '', 
                page: page || 1,   
                strict: strict,
                selectedValue: selectedValue || 'all',
                selectedMode: selectedMode || 'searchText',
                year: year || '',
                sortOrder: sortOrder || 'default',
                gameName: gameName || 'all'
            });
        } catch (error) {
            console.log('First API attempt failed, trying alternate path...');
            // If that fails, try /api explicitly
            response = await axios.get('/api', { 
                ...axiosConfig,
                params: {  
                    searchTerm: searchTerm || '', 
                    page: page || 1,   
                    strict: strict,
                    selectedValue: selectedValue || 'all',
                    selectedMode: selectedMode || 'searchText',
                    year: year || '',
                    sortOrder: sortOrder || 'default',
                    gameName: gameName || 'all'
                }
            });
            console.log('Alternate API path succeeded');
        }
        
        // If we get here, one of the attempts succeeded
        return {
            data: response.data.data || [],
            total: response.data.total || 0,
            totalQuotes: response.data.totalQuotes || 0
        };
    } catch (error) {
        console.error('Error fetching quotes:', error);
        throw error;
    }
};


const getStats = async () => {
    try {
        if (isMigrationMode) {
            await delay(300);
            throw new Error('Stats unavailable during database migration');
        }
        
        const response = await makeApiRequest('/stats', 'get');
        return response.data;
    } catch (error) {
        console.error('Error fetching stats:', error);
        throw error;
    }
};

const flagQuote = async (quoteData) => {
    try {
        if (isMigrationMode) {
            await delay(300);
            throw new Error('Flagging unavailable during database migration');
        }
        
        const response = await makeApiRequest('/flag', 'post', null, quoteData);
        return response.data;
    } catch (error) {
        console.error('Error flagging quote:', error);
        throw error;
    }
};

const getRandomQuotes = async () => {
    try {
        if (isMigrationMode) {
            await delay(500);
            throw new Error('Random quotes unavailable during database migration');
        }
        
        const response = await makeApiRequest('/random', 'get');
        return response.data;
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        throw error;
    }
};

const checkDatabaseStatus = async () => {
    try {
        if (isMigrationMode) {
            await delay(300);
            throw new Error('Database status check unavailable during migration');
        }
        
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