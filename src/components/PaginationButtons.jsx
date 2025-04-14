export const PaginationButtons = ({page, totalPages, handlePageChange}) => (
<div className="pagination-buttons">
    <button
        onClick={() => handlePageChange(page - 1)}
        disabled={page === 1}
    >
        Previous
    </button>
    <span className="pagination-info">
        Page {page} of {totalPages || 1}
    </span>
    <button
        onClick={() => handlePageChange(page + 1)}
        disabled={page >= totalPages || totalPages === 0}
    >
        Next
    </button>
</div>
)