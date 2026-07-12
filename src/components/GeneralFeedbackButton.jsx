import React from 'react';
import styles from './GeneralFeedbackButton.module.css';

const GeneralFeedbackButton = ({ onClick, disabled }) => (
    <button
        className={styles.floatingFeedbackButton}
        onClick={onClick}
        disabled={disabled}
    >
        💡 Send Feedback
    </button>
);

export default GeneralFeedbackButton; 