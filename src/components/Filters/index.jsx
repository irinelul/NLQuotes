import { SearchableDropdown } from "../SearchableDropdown";
import styles from './Filters.module.css';

export const Filters = ({
    handleYearChange,
    sortOrder,
    handleSortChange,
    selectedGame,
    handleGameChange,
    handleGameReset,
    games,
    yearInput,
    setYearInput,
    gameFilterConfig,
}) => {
    // Show game filter unless explicitly disabled
    // Default behavior: show if config is missing or enabled is true/undefined
    const enabledValue = gameFilterConfig?.enabled;
    const isGameFilterEnabled = enabledValue !== false; // Only hide if explicitly false
    const gameFilterLabel = gameFilterConfig?.label || 'game';
    const placeholderText = `Select a ${gameFilterLabel}`;
    
    // Get tooltip texts from config with defaults
    const tooltipText = gameFilterConfig?.tooltipText || `Filter by ${gameFilterLabel} (type to search).`;
    const resetTooltipText = gameFilterConfig?.resetTooltipText || `Reset ${gameFilterLabel} filter`;
    
    // Create style objects for CSS custom properties
    const gameTooltipStyle = {
        '--tooltip-text': `"${tooltipText}"`
    };
    
    const resetButtonStyle = {
        '--reset-tooltip-text': `"${resetTooltipText}"`
    };
    
    return (
        <div className={styles.container}>
            <div className={styles.group}>
                <div className={styles.yearTooltip}>
                    <input
                        type="text"
                        value={yearInput}
                        onChange={e => {
                            setYearInput(e.target.value);
                            handleYearChange(e);
                        }}
                        placeholder="Year (YYYY)"
                        maxLength="4"
                        className={styles.yearInput}
                    />
                </div>
                <div className={styles.sortTooltip}>
                    <select
                        value={sortOrder}
                        onChange={handleSortChange}
                        className={styles.sortSelect}
                    >
                        <option value="default">Default Order</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>
            </div>
            {isGameFilterEnabled && (
                <div className={styles.gameContainer}>
                    <div 
                        className={styles.gameTooltip}
                        style={gameTooltipStyle}
                    >
                        <SearchableDropdown
                            options={games}
                            value={selectedGame}
                            onChange={handleGameChange}
                            placeholder={placeholderText}
                        />
                    </div>
                    <button
                        className={styles.resetGameButton}
                        onClick={handleGameReset}
                        style={resetButtonStyle}
                    >
                        ↺
                    </button>
                </div>
            )}
        </div>
    );
}