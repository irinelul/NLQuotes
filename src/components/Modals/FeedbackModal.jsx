import { useState } from 'react';
import styles from './Modals.module.css';

export const FeedbackModal = ({ isOpen, onClose, onSubmit }) => {
    const [feedback, setFeedback] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(feedback);
        setFeedback('');
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h3>Send Feedback</h3>
                <p>
                    Share your thoughts about the website or suggest improvements:
                </p>
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Enter your feedback here..."
                        required
                    />
                    <div className={styles.modalButtons}>
                        <button type="button" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit">
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};