import axios from 'axios'
import { analyticsHeaders } from './analytics'

// Detect Render.com environment
const isOnRender = window.location.hostname.includes('render.com') ||
                   window.location.hostname.includes('onrender.com');

// Define possible API path prefixes to try
const pathPrefixes = [
    '/api', // Standard setup - TRY THIS FIRST
    '', // No prefix (direct routes)
];

// Define possible base URLs for direct access if proxy fails
const possibleBaseUrls = isOnRender ? [
    window.location.origin,
    '',
] : [''];

// Configure Axios defaults
const axiosConfig = {
    timeout: 15000,
    headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
    }
};


// Helper to try API calls with different path prefixes and base URLs
const makeApiRequest = async (endpoint, method = 'get', params = null, data = null) => {
    const errors = [];
    // Merge in the analytics opt-out header so server-side logging respects it
    const requestConfig = {
        ...axiosConfig,
        headers: { ...axiosConfig.headers, ...analyticsHeaders() }
    };
    
    // If endpoint already starts with /api, use it directly first
    if (endpoint.startsWith('/api')) {
        try {
            if (method === 'get') {
                const response = await axios.get(endpoint, {
                    ...requestConfig,
                    params
                });
                return response;
            }
            else if (method === 'post') {
                const response = await axios.post(endpoint, data, requestConfig);
                return response;
            }
        } catch (error) {
            errors.push({
                path: endpoint,
                status: error.response?.status,
                message: error.message
            });
            // For same-origin API endpoints, don't fall through to legacy path guessing.
            throw error;
        }
    }
    
    for (const baseUrl of possibleBaseUrls) {
        // Try each path prefix
        for (const prefix of pathPrefixes) {
            try {
                // Build the full path, ensuring we don't double up on /api
                let fullPath = endpoint;
                if (prefix && !endpoint.startsWith(prefix)) {
                    fullPath = `${prefix}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
                }
                // Skip if we already tried this exact path
                if (fullPath === endpoint && endpoint.startsWith('/api')) {
                    continue;
                }
                if (baseUrl) {
                    fullPath = `${baseUrl}${fullPath}`;
                }
                
                if (method === 'get') {
                    const response = await axios.get(fullPath, {
                        ...requestConfig,
                        params
                    });
                    return response;
                }
                else if (method === 'post') {
                    const response = await axios.post(fullPath, data, requestConfig);
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

                // If we get SSL error, log more details
                if (error.message.includes('SSL')) {
                    console.error('SSL Error detected:', error);
                }
            }
        }
    }
    
    // If we get here, all attempts failed
    const errorMessage = errors.length > 0 
        ? `All API attempts failed. Last error: ${errors[errors.length - 1].message}`
        : 'API request failed';
    throw new Error(errorMessage);
};

const getAll = async (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    try {
        // Make the request directly to the /api endpoint
        const response = await makeApiRequest('/api', 'get', {  
            search: searchTerm || '', 
            page: page || 1,   
            strict: strict,
            channel: selectedValue || 'all',
            selectedMode: selectedMode || 'searchText',
            year: year || '',
            sort: sortOrder || 'default',
            game: gameName || 'all'
        });
        
        // If we get here, one of the attempts succeeded
        const result = {
            data: response.data.data || [],
            total: response.data.total || 0,
            totalQuotes: response.data.totalQuotes || 0
        };

        return result;
    } catch (error) {
        console.error('Error fetching quotes:', error);
        throw error;
    }
};

const flagQuote = async (quoteData) => {
    try {
        // Use /api/flag directly since the endpoint is /api/flag
        const response = await makeApiRequest('/api/flag', 'post', null, quoteData);
        return response.data;
    } catch (error) {
        console.error('Error flagging quote:', error);
        throw error;
    }
};

const getRandomQuotes = async () => {
    try {
        const response = await makeApiRequest('/api/random', 'get');
        if (!response.data || !response.data.quotes) {
            throw new Error('Invalid response format from random quotes endpoint');
        }
        return response.data;
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        // Add more specific error handling
        if (error.message.includes('Network Error')) {
            throw new Error('Network connection failed. Please check your internet connection.');
        } else if (error.message.includes('timeout')) {
            throw new Error('Request timed out. Please try again.');
        } else {
            throw new Error('Unable to fetch random quotes. Please try again later.');
        }
    }
};

export default {
    getAll,
    flagQuote,
    getRandomQuotes,
}