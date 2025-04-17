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

    // Update URL when state changes
    useEffect(() => {
        const params = new URLSearchParams();
        if (state.searchTerm) params.set('q', state.searchTerm);
        if (state.page > 1) params.set('page', state.page);
        if (state.selectedChannel !== 'all') params.set('channel', state.selectedChannel);
        if (state.selectedYear) params.set('year', state.selectedYear);
        if (state.sortOrder !== 'default') params.set('sort', state.sortOrder);
        if (state.selectedGame !== 'all') params.set('game', state.selectedGame);
        
        setSearchParams(params);
    }, [state, setSearchParams]);

    const updateState = (newState) => {
        setState(prev => ({ ...prev, ...newState }));
    };

    const resetState = () => {
        setState({
            searchTerm: '',
            page: 1,
            selectedChannel: 'all',
            selectedYear: '',
            sortOrder: 'default',
            selectedGame: 'all',
            hasSearched: false
        });
    };

    return {
        state,
        updateState,
        resetState
    };
}; 