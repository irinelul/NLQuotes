import React from 'react';

const GeneralFeedbackButton = ({ onClick, disabled }) => (
    <button
        className="floating-feedback-button"
        onClick={onClick}
        disabled={disabled}
        aria-label="Send Feedback"
    >
        💡 Send Feedback
    </button>
);

export default GeneralFeedbackButton; 