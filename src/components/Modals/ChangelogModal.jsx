import styles from './Modals.module.css';

const changelogEntries = [
    {
        date: 'November 30, 2025',
        items: [
            'Added Changelog',
            'Improved notifications system',
            'Added email optional field to feedback',
            'Updated packages'
        ]
    }
];

export const ChangelogModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <h3>Changelog</h3>
                <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1rem 0' }}>
                    {changelogEntries.map((entry, index) => (
                        <div key={index} style={{ marginBottom: '2rem' }}>
                            <h4 style={{ 
                                color: 'var(--accent-color)', 
                                marginBottom: '0.5rem',
                                fontSize: '1.1rem',
                                fontWeight: '600'
                            }}>
                                {entry.date}
                            </h4>
                            <ul style={{ 
                                listStyle: 'none', 
                                paddingLeft: '0',
                                margin: 0
                            }}>
                                {entry.items.map((item, itemIndex) => (
                                    <li key={itemIndex} style={{ 
                                        marginBottom: '0.5rem',
                                        paddingLeft: '1.5rem',
                                        position: 'relative'
                                    }}>
                                        <span style={{
                                            position: 'absolute',
                                            left: '0',
                                            color: 'var(--accent-color)'
                                        }}>•</span>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className={styles.modalButtons}>
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

