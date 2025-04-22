import styles from './PaginationButtons.module.css';

export const PaginationButtons = ({ page, totalPages, handlePageChange }) => (
    <div className={styles.container}>
        <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
        >
            Previous
        </button>
        <span className={styles.info}>
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