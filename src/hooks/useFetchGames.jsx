
import { useEffect, useState } from 'react';

export const useFetchGames = () => {
    const [games, setGames] = useState([]);
    useEffect(() => {
        let cancelled = false;
        // Plain cached fetch: /api/games sets Cache-Control/ETag itself, so the
        // browser reuses the hour-long cache instead of refetching the full
        // list on every visit (the old no-store fetch defeated that).
        fetch('/api/games')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch games: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!cancelled && Array.isArray(data?.games)) {
                    setGames(data.games);
                }
            })
            .catch((error) => {
                console.error('Error fetching games:', error);
            });
        return () => { cancelled = true; };
    }, []);
    return games;
};
