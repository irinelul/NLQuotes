import { SearchableDropdown } from "./SearchableDropdown";
export const Filters = ({
  selectedYear,
  handleYearChange,
  sortOrder,
  handleSortChange,
  selectedGame,
  setSelectedGame,
  handleGameChange,
  games,
  searchTerm,
  fetchQuotes,
  page,
  selectedChannel,
  strict
}) => (
  <div className="filter-container">
    <div className="filter-group">
        <div className="year-tooltip">
            <input
                type="text"
                value={selectedYear}
                onChange={handleYearChange}
                placeholder="Year (YYYY)"
                maxLength="4"
                className="year-input"
            />
        </div>
        <div className="sort-tooltip">
            <select
                value={sortOrder}
                onChange={handleSortChange}
                className="sort-select"
            >
                <option value="default">Default Order</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
            </select>
        </div>
    </div>
    <div className="game-filter-container">
        <div className="game-tooltip">
            <SearchableDropdown
                options={games}
                value={selectedGame}
                onChange={handleGameChange}
                placeholder="Select a game"
            />
        </div>
        <button
            className="reset-game-button"
            onClick={() => {
                setSelectedGame("all");
                if (searchTerm.trim()) {
                    fetchQuotes(page, selectedChannel, selectedYear, sortOrder, strict, "all");
                }
            }}
            style={{
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                marginLeft: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 10px',
                fontSize: '18px',
                position: 'relative',
                transform: 'none',
                transition: 'none'
            }}
        >
            ↺
        </button>
    </div>
</div>
)