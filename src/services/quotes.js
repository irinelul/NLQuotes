import axios from 'axios'
import { analyticsHeaders } from './analytics'
import { describeApiError } from './apiError'

// Shared request config; analytics opt-out header merged per call so
// server-side logging respects the privacy-page opt-out.
const requestConfig = () => ({
    timeout: 15000,
    headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        ...analyticsHeaders()
    }
});

const getAll = async (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    try {
        const response = await axios.get('/api', {
            ...requestConfig(),
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
        console.error('Error fetching quotes:', error);
        throw error;
    }
};

const flagQuote = async (quoteData) => {
    try {
        const response = await axios.post('/api/flag', quoteData, requestConfig());
        return response.data;
    } catch (error) {
        console.error('Error flagging quote:', error);
        // Callers (the flag/feedback modals) display error.message directly.
        throw new Error(describeApiError(error, 'send your report'));
    }
};

const getRandomQuotes = async () => {
    try {
        const response = await axios.get('/api/random', requestConfig());
        if (!response.data || !response.data.quotes) {
            throw new Error('Invalid response format from random quotes endpoint');
        }
        return response.data;
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        throw new Error(describeApiError(error, 'fetch random quotes'));
    }
};

export default {
    getAll,
    flagQuote,
    getRandomQuotes,
}
