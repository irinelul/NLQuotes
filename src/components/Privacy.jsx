import { useNavigate } from 'react-router-dom';
import { useAnalyticsOptOut } from '../hooks/useAnalyticsOptOut';
import { TENANT } from '../config/tenant';
import styles from './Privacy.module.css';

const Privacy = () => {
  const navigate = useNavigate();
  const { isOptedOut, toggleOptOut } = useAnalyticsOptOut();
  // Use build-time tenant config (no runtime checks needed)
  const siteName = TENANT.displayName || TENANT.metadata?.siteName || 'NL Quotes';

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={handleBack}
        className={styles.backButton}
      >
        Go Back
      </button>
      <h2 className={styles.heading}>Privacy Policy</h2>
      <p className={styles.paragraph}><strong>Last updated: July 2026</strong></p>

      <p className={styles.paragraph}>
        Your privacy is critically important to us at {siteName}. Our guiding principle is to collect the absolute minimum information necessary and to be transparent about it. This policy explains what we collect and why.
      </p>

      <h3 className={styles.heading}>Analytics Collection</h3>
      <p className={styles.paragraph}>
        By default, we collect anonymous analytics to help improve our service. This includes information about how you use the site, such as page views and search terms. All data is anonymous and cannot be used to identify you.
      </p>
      <p className={`${styles.paragraph} ${styles.paragraphSmall}`}>
        Note: Analytics collection is enabled by default. You can opt out at any time using the button below.
      </p>
      <div className={styles.analyticsSection}>
        <button
          type="button"
          onClick={toggleOptOut}
          style={{ '--analytics-button-bg': isOptedOut ? '#1976d2' : '#f44336' }}
          className={styles.analyticsButton}
        >
          {isOptedOut ? 'Enable Analytics' : 'Disable Analytics'}
        </button>
        <p className={styles.paragraphNote}>
          {isOptedOut 
            ? '✓ Analytics is currently disabled. No usage data will be collected.'
            : '✓ Analytics is currently enabled. Anonymous usage data will be collected to help improve the service.'}
        </p>
      </div>

      <h3 className={styles.heading}>Core Privacy Principles</h3>
      <ul className={styles.list}>
        <li className={styles.listItem}><strong>We do not collect personal information.</strong> Your identity remains anonymous.</li>
        <li className={styles.listItem}><strong>We do not use cookies</strong> or persistent tracking technologies.</li>
        <li className={styles.listItem}><strong>We do not serve advertisements.</strong></li>
        <li className={styles.listItem}><strong>We do not sell or share data with third parties.</strong></li>
      </ul>

      <h3 className={styles.heading}>Information We Collect (Anonymous In-House Analytics)</h3>
      <p className={styles.paragraph}>
        We collect limited anonymous data to understand basic usage patterns and improve {siteName}, while fully respecting your privacy.
      </p>
      <ul className={styles.list}>
        <li className={styles.listItem}>
          <strong>Anonymous Visitor Hashes:</strong> To count unique visitors without identifying anyone, we compute a short hash from your IP address and browser signature combined with a random value that changes every day. Your IP address is never stored, the hash cannot be reversed, and because the random value rotates daily, activity cannot be linked across days.
        </li>
        <li className={styles.listItem}>
          <strong>Usage Events:</strong> We record events such as search terms, filters used (game, channel, year, sort order), page views, pagination, the page that referred you to the site, interactions with quotes (playing, copying, sharing, or flagging a quote), and general feature usage (switching theme, opening the changelog, submitting feedback, or following the GitHub link).
        </li>
        <li className={styles.listItem}>
          <strong>Device and Browser Info:</strong> We collect general details such as device type (mobile/desktop/tablet), operating system, browser name, screen size, preferred language, and country.
        </li>
        <li className={styles.listItem}>
          <strong>Performance Metrics:</strong> We measure how long searches take so we can optimize site performance.
        </li>
      </ul>
      <p className={styles.paragraph}>
        In addition to the opt-out button above, we automatically honor your browser&apos;s <strong>Do Not Track</strong> and <strong>Global Privacy Control</strong> signals — if either is enabled, nothing is collected.
      </p>

      <h3 className={styles.heading}>What We Do Not Collect</h3>
      <ul className={styles.list}>
        <li className={styles.listItem}>No IP addresses are stored.</li>
        <li className={styles.listItem}>No cookies or tracking pixels are used.</li>
        <li className={styles.listItem}>No personal identifiers like name, email, or account details are collected.</li>
        <li className={styles.listItem}>No user profiles are created.</li>
      </ul>

      <h3 className={styles.heading}>How We Use Information</h3>
      <p className={styles.paragraph}>
        The anonymous data we collect is used strictly to improve site functionality, monitor performance, and understand general usage trends. We do not use the data for profiling, advertising, or marketing purposes.
      </p>

      <h3 className={styles.heading}>Data Security</h3>
      <p className={styles.paragraph}>
        Although we collect only anonymous data, we take reasonable measures to secure the information we store. However, no method of transmission over the Internet is 100% secure.
      </p>

      <h3 className={styles.heading}>Third-Party Services & Data Sharing</h3>
      <ul className={styles.list}>
        <li className={styles.listItem}><strong>Analytics:</strong> We operate our own in-house analytics system. Additionally, we use Umami, a privacy-focused, self-hosted analytics platform, to help us understand how users interact with the site. Umami is configured to respect your privacy preferences and does not use cookies for tracking. You can opt out of all analytics using the button above.</li>
        <li className={styles.listItem}><strong>Data Sharing:</strong> We do not share any data with third parties, except if strictly required by law (which is extremely unlikely given the anonymous nature of the data).</li>
        <li className={styles.listItem}><strong>Data Selling:</strong> We do not, and will never, sell any data.</li>
      </ul>

      <h3 className={styles.heading}>Cookies and Tracking</h3>
      <p className={styles.paragraph}>
        We do not use cookies or any other persistent tracking technologies to monitor your browsing history on our site or across the web. Umami does not use cookies for tracking and respects your browser&apos;s &quot;Do Not Track&quot; setting.
      </p>

      <h3 className={styles.heading}>Changes to This Policy</h3>
      <p className={styles.paragraph}>
        We may update this Privacy Policy occasionally. Any changes will be posted on this page. We encourage you to review this policy periodically.
      </p>

      <h3 className={styles.heading}>Change Log</h3>
      <ul className={styles.list}>
        <li className={styles.listItem}><strong>January 2025:</strong> Transitioned to Umami analytics, a privacy-focused, self-hosted analytics platform. Umami provides time-on-page tracking, user engagement metrics, and session duration data while maintaining our commitment to privacy: no cookies, respects Do Not Track, and fully respects user opt-out preferences.</li>
        <li className={styles.listItem}><strong>April 26, 2025:</strong> Updated our Privacy Policy to better reflect the anonymous analytics data collected (hashed identifiers, device/browser information, search terms, page views). Transitioned from using Simple Analytics to our own in-house analytics system. No new data collection was introduced — this is a clarification of existing practices.</li>
        <li className={styles.listItem}><strong>July 2026:</strong> Re-introduced our in-house analytics system alongside Umami. It records the usage events described above (searches, filters, quote interactions) using daily-rotating anonymous hashes — still no cookies, no IP storage, and no cross-day tracking. The opt-out button now covers both systems, and Do Not Track / Global Privacy Control signals are honored automatically.</li>
      </ul>

      <h3 className={styles.heading}>Contact</h3>
      <p className={styles.paragraph}>
        If you have any questions about this Privacy Policy or encounter any issues, please contact us at quotes.contacts@gmail.com.
      </p>
    </div>
  );
};

export default Privacy;
