import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const useSearchState = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Initialize state from URL parameters
    const [state, setState] = useState({
        searchTerm: searchParams.get('q') || '',
        page: Number(searchParams.get('page')) || 1,
        selectedChannel: searchParams.get('channel') || 'all',
        selectedYear: searchParams.get('year') || '',
        sortOrder: searchParams.get('sort') || 'default',
        selectedGame: searchParams.get('game') || 'all',
        hasSearched: !!searchParams.get('q')
    });

    // Update URL only when search is performed
    const updateSearchParams = (newState) => {
        const params = new URLSearchParams();
        if (newState.searchTerm) params.set('q', newState.searchTerm);
        if (newState.page > 1) params.set('page', newState.page);
        if (newState.selectedChannel !== 'all') params.set('channel', newState.selectedChannel);
        if (newState.selectedYear) params.set('year', newState.selectedYear);
        if (newState.sortOrder !== 'default') params.set('sort', newState.sortOrder);
        if (newState.selectedGame !== 'all') params.set('game', newState.selectedGame);
        
        setSearchParams(params);
    };

    const updateState = (newState) => {
        setState(prev => ({ ...prev, ...newState }));
    };

    const resetState = () => {
        const newState = {
            searchTerm: '',
            page: 1,
            selectedChannel: 'all',
            selectedYear: '',
            sortOrder: 'default',
            selectedGame: 'all',
            hasSearched: false
        };
        setState(newState);
        updateSearchParams(newState);
    };

    return {
        state,
        updateState,
        resetState,
        updateSearchParams
    };
}; 