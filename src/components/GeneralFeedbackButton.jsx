import React from 'react';

const GeneralFeedbackButton = ({ onClick, disabled }) => (
    <button
        className="floating-feedback-button"
        onClick={onClick}
        disabled={disabled}
    >
        💡 Send Feedback
    </button>
);

export default GeneralFeedbackButton; 