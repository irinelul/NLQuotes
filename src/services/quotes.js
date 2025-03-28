import axios from 'axios'
const baseUrl = '/api'
const statsURL = '/stats'


const getAll = (searchTerm, page, strict, selectedValue, selectedMode, year, sortOrder, gameName) => {
    const request = axios.get(baseUrl, {
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
    return request.then(response => ({
        data: response.data.data,
        total: response.data.total
    }));
};


const getStats = () => {
    const request = axios.get(statsURL);
    return request.then(response => response.data);
};

const flagQuote = (quoteData) => {
    const request = axios.post(`${baseUrl}/flag`, quoteData);
    return request.then(response => response.data);
};

const getRandomQuotes = () => {
    const request = axios.get(`${baseUrl}/random`);
    return request.then(response => response.data);
};

export default {
    getAll: getAll,
    getStats: getStats,
    flagQuote: flagQuote,
    getRandomQuotes: getRandomQuotes
}