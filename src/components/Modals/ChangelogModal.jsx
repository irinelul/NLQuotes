import styles from './Modals.module.css';

// Newest first
const changelogEntries = [
    {
        date: 'July 2026',
        items: [
            'Launched an in-house, privacy-first analytics pipeline: no cookies, no IP storage, anonymous daily-rotating visitor hashes, opt-out on the Privacy page, Do Not Track and Global Privacy Control honored automatically',
            'Replaced the old Stats page dashboards with a single interactive community dashboard (searches, trends, engagement funnel, world map, and more)',
            'Fixed a games API bug: if the game list failed to load at startup, the empty list was cached and the game filter dropdown stayed empty until a restart — it now retries automatically',
            'Faster searches: channel and year filters now use database indexes, and pagination ordering is stable so pages no longer skip or repeat videos',
            'Sitemap is now built from popular recent searches, and topic pages require enough quotes to be worth indexing',
            'Retired the experimental Semantic Search button',
            'Updated the Privacy Policy to describe the new analytics in detail'
        ]
    },
    {
        date: 'November 30, 2025',
        items: [
            'Added Changelog',
            'Improved notifications system',
            'Added email optional field to feedback',
            'Updated packages'
        ]
    },
    {
        date: 'January 2025',
        items: [
            'Transitioned to Umami analytics for privacy-focused tracking',
            'Added time-on-page tracking and user engagement metrics',
            'Enhanced analytics tracking: filter usage, quote interactions, feature usage',
            'Improved privacy policy transparency'
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

