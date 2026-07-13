import { useNavigate } from 'react-router-dom';
import styles from './Changelog.module.css';

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

const Changelog = () => {
    const navigate = useNavigate();

    const handleBack = () => {
        navigate('/');
    };

    // NOTE: No separate track('changelog_open') call here. usePageviewTracking()
    // in App.jsx fires a `page_view` event on every route change, so navigating
    // to /changelog is already tracked — a separate event would double-count.

    return (
        <div className={styles.container}>
            <button
                type="button"
                onClick={handleBack}
                className={styles.backButton}
            >
                Go Back
            </button>
            <h2 className={styles.heading}>Changelog</h2>
            {changelogEntries.map((entry, index) => (
                <div key={index} className={styles.entryGroup}>
                    <h4 className={styles.entryDate}>{entry.date}</h4>
                    <ul className={styles.list}>
                        {entry.items.map((item, itemIndex) => (
                            <li key={itemIndex} className={styles.listItem}>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

export default Changelog;
