import { SearchableDropdown } from "../SearchableDropdown";
import styles from './Filters.module.css';

export const Filters = ({
    selectedYear,
    handleYearChange,
    sortOrder,
    handleSortChange,
    selectedGame,
    handleGameChange,
    handleGameReset,
    games,
}) => (
    <div className={styles.container}>
        <div className={styles.group}>
            <div className="year-tooltip">
                <input
                    type="text"
                    value={selectedYear}
                    onChange={handleYearChange}
                    placeholder="Year (YYYY)"
                    maxLength="4"
                    className={styles.yearInput}
                />
            </div>
            <div className="sort-tooltip">
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
        <div className={styles.gameContainer}>
            <div className="game-tooltip">
                <SearchableDropdown
                    options={games}
                    value={selectedGame}
                    onChange={handleGameChange}
                    placeholder="Select a game"
                />
            </div>
            <button
                className={styles.resetGameButton}
                onClick={handleGameReset}
            >
                ↺
            </button>
        </div>
    </div>
)