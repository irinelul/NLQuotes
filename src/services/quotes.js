import axios from 'axios'
const baseUrl = 'https://nlquotes.onrender.com/api'

const getAll = (searchTerm, page, limit) => {
    const request = axios.get(baseUrl, {
        params: {  // Pass query parameters as part of the request
            searchTerm: searchTerm || '',  // The search term
            page: page || 1,   // The page number
            limit: limit || 10 // The number of items per page
        }
    });
    return request.then(response => response.data);
};

export default {
    getAll: getAll,
}