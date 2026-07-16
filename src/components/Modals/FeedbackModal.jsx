import { useState } from 'react';
import styles from './Modals.module.css';

export const FeedbackModal = ({ isOpen, onClose, onSubmit }) => {
    const [feedback, setFeedback] = useState('');
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState(null); // null | 'sending' | 'success' | 'error'
    const [errorMsg, setErrorMsg] = useState(null); // specific reason from the API, if any

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('sending');
        setErrorMsg(null);
        try {
            await onSubmit(feedback, email);
            setStatus('success');
            setFeedback('');
            setEmail('');
            setTimeout(() => {
                setStatus(null);
                onClose();
            }, 2500);
        } catch (err) {
            setStatus('error');
            setErrorMsg(err?.message || null);
        }
    };

    const handleClose = () => {
        setStatus(null);
        setErrorMsg(null);
        onClose();
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
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email (optional)"
                        className={styles.emailInput}
                    />
                    <div className={styles.modalButtons}>
                        {status === 'success' && (
                            <span className={`${styles.statusMessage} ${styles.statusSuccess}`}>
                                Feedback received, thank you!
                            </span>
                        )}
                        {status === 'error' && (
                            <span className={`${styles.statusMessage} ${styles.statusError}`}>
                                {errorMsg || 'Something went wrong — please try again.'}
                            </span>
                        )}
                        <button type="button" onClick={handleClose}>
                            Cancel
                        </button>
                        <button type="submit" disabled={status === 'sending' || status === 'success'}>
                            {status === 'sending' ? 'Sending…' : 'Submit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
