
import { useEffect, useState } from 'react';

export const useFetchGames = () => {
    const [games, setGames] = useState([]);
    useEffect(() => {
        const fetchGames = async () => {
            try {
                // Try multiple path configurations to handle potential Render.com path issues
                const pathsToTry = [
                    '/api/games',
                    '/games',
                    '/app/api/games'
                ];

                let gamesData = null;
                let failureMessages = [];

                // Try each path until one works
                for (const path of pathsToTry) {
                    try {
                        console.log(`Trying to fetch games from: ${path}`);
                        const response = await fetch(path, {
                            cache: 'no-store', // Disable caching
                            headers: {
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache',
                                'Expires': '0'
                            }
                        });

                        // Check if we got a valid response
                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.games && Array.isArray(data.games)) {
                                gamesData = data;
                                console.log(`Successfully fetched games from ${path}`);
                                break;
                            } else {
                                console.log(`Response from ${path} didn't contain valid games data`);
                                failureMessages.push(`Invalid data from ${path}`);
                            }
                        } else {
                            const errorMsg = `Failed to fetch games from ${path}: ${response.status}`;
                            console.log(errorMsg);
                            failureMessages.push(errorMsg);
                        }
                    } catch (pathError) {
                        const errorMsg = `Error fetching games from ${path}: ${pathError.message}`;
                        console.log(errorMsg);
                        failureMessages.push(errorMsg);
                    }
                }

                // If we got data from any of the paths, use it
                if (gamesData && gamesData.games) {
                    setGames(gamesData.games);
                } else {
                    // When no paths worked, set empty array but log detailed error info
                    console.error('All paths failed. Details:', failureMessages.join('; '));
                    console.log('Database connection issue detected - using empty games array');
                    setGames([]);
                }
            } catch (error) {
                console.error('Error fetching games:', error);
                // Set empty array as fallback
                return [];
            }
        };
        fetchGames();
    }, []);
    return games;
};