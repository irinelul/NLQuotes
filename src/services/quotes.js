import axios from 'axios'
const baseUrl = '/api'

const getAll = (searchTerm, page,strict) => {
    const request = axios.get(baseUrl, {
        params: {  
            searchTerm: searchTerm || '', 
            page: page || 1,   
            strict:strict
        }
    });
    return request.then(response => response.data);
};

export default {
    getAll: getAll,
}