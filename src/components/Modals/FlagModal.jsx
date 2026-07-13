import { useState } from 'react';
import styles from './Modals.module.css';

export const FlagModal = ({ isOpen, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    const [status, setStatus] = useState(null); // null | 'sending' | 'success' | 'error'

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('sending');
        try {
            await onSubmit(reason);
            setStatus('success');
            setReason('');
            setTimeout(() => {
                setStatus(null);
                onClose();
            }, 2500);
        } catch {
            setStatus('error');
        }
    };

    const handleClose = () => {
        setStatus(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h3>Flag Quote</h3>
                <p>
                    Please provide a reason for flagging this quote:
                </p>
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Enter your reason here..."
                        required
                    />
                    <div className={styles.modalButtons}>
                        {status === 'success' && (
                            <span className={`${styles.statusMessage} ${styles.statusSuccess}`}>
                                Report received, thank you!
                            </span>
                        )}
                        {status === 'error' && (
                            <span className={`${styles.statusMessage} ${styles.statusError}`}>
                                Something went wrong — please try again.
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
