
import { useEffect, useState } from 'react';

export const useFetchGames = () => {
    const [games, setGames] = useState([]);
    useEffect(() => {
        const fetchGames = async () => {
            try {
                const pathsToTry = [
                    '/api/games',
                    '/games',
                    '/app/api/games'
                ];

                let gamesData = null;

                for (const path of pathsToTry) {
                    try {
                        const response = await fetch(path, {
                            cache: 'no-store',
                            headers: {
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache',
                                'Expires': '0'
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.games && Array.isArray(data.games)) {
                                gamesData = data;
                                break;
                            }
                        }
                    } catch (pathError) {
                        // Try next path
                    }
                }

                if (gamesData && gamesData.games) {
                    setGames(gamesData.games);
                } else {
                    console.error('Failed to fetch games from all paths');
                    setGames([]);
                }
            } catch (error) {
                console.error('Error fetching games:', error.message);
                return [];
            }
        };
        fetchGames();
    }, []);
    return games;
};
