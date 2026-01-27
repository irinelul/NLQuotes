import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalyticsOptOut } from '../hooks/useAnalyticsOptOut';
import { TENANT } from '../config/tenant';

const Privacy = () => {
  const navigate = useNavigate();
  const { isOptedOut, toggleOptOut } = useAnalyticsOptOut();
  // Use hard-bound tenant config (resolved at build time, no flickering)
  const siteName = TENANT.displayName || TENANT.metadata?.siteName || 'NL Quotes';

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
      <button
        type="button"
        onClick={handleBack}
        style={{ marginBottom: '1.5rem', background: 'none', border: '1px solid #ccc', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: '#fff' }}
      >
        Go Back
      </button>
      <h2>Privacy Policy</h2>
      <p><strong>Last updated: April 26, 2025</strong></p>

      <p>
        Your privacy is critically important to us at {siteName}. Our guiding principle is to collect the absolute minimum information necessary and to be transparent about it. This policy explains what we collect and why.
      </p>

      <h3>Analytics Collection</h3>
      <p>
        By default, we collect anonymous analytics to help improve our service. This includes information about how you use the site, such as page views and search terms. All data is anonymous and cannot be used to identify you.
      </p>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Note: Analytics collection is enabled by default. You can opt out at any time using the button below.
      </p>
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={toggleOptOut}
          style={{
            background: isOptedOut ? '#1976d2' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
            marginBottom: '0.5rem'
          }}
        >
          {isOptedOut ? 'Enable Analytics' : 'Disable Analytics'}
        </button>
        <p style={{ 
          margin: 0,
          fontSize: '0.9rem'
        }}>
          {isOptedOut 
            ? '✓ Analytics is currently disabled. No usage data will be collected.'
            : '✓ Analytics is currently enabled. Anonymous usage data will be collected to help improve the service.'}
        </p>
      </div>

      <h3>Core Privacy Principles</h3>
      <ul>
        <li><strong>We do not collect personal information.</strong> Your identity remains anonymous.</li>
        <li><strong>We do not use cookies</strong> or persistent tracking technologies.</li>
        <li><strong>We do not serve advertisements.</strong></li>
        <li><strong>We do not sell or share data with third parties.</strong></li>
      </ul>

      <h3>Information We Collect (Anonymous In-House Analytics)</h3>
      <p>
        We collect limited anonymous data to understand basic usage patterns and improve {siteName}, while fully respecting your privacy.
      </p>
      <ul>
        <li>
          <strong>User and Session Hashes:</strong> We generate anonymous hashes to distinguish usage sessions without identifying individuals.
        </li>
        <li>
          <strong>Usage Events:</strong> We track events such as search terms, page views, and user interactions with the site.
        </li>
        <li>
          <strong>Device and Browser Info:</strong> We collect general details such as device type, operating system, browser name, screen width and height, pixel ratio, preferred language, timezone, region, and city.
        </li>
        <li>
          <strong>Performance Metrics:</strong> We measure page response times and total pages visited to help optimize site performance.
        </li>
      </ul>

      <h3>What We Do Not Collect</h3>
      <ul>
        <li>No IP addresses are stored.</li>
        <li>No cookies or tracking pixels are used.</li>
        <li>No personal identifiers like name, email, or account details are collected.</li>
        <li>No user profiles are created.</li>
      </ul>

      <h3>How We Use Information</h3>
      <p>
        The anonymous data we collect is used strictly to improve site functionality, monitor performance, and understand general usage trends. We do not use the data for profiling, advertising, or marketing purposes.
      </p>

      <h3>Data Security</h3>
      <p>
        Although we collect only anonymous data, we take reasonable measures to secure the information we store. However, no method of transmission over the Internet is 100% secure.
      </p>

      <h3>Third-Party Services & Data Sharing</h3>
      <ul>
        <li><strong>Analytics:</strong> We operate our own in-house analytics system. No third-party analytics services are used.</li>
        <li><strong>Data Sharing:</strong> We do not share any data with third parties, except if strictly required by law (which is extremely unlikely given the anonymous nature of the data).</li>
        <li><strong>Data Selling:</strong> We do not, and will never, sell any data.</li>
      </ul>

      <h3>Cookies and Tracking</h3>
      <p>
        We do not use cookies or any other persistent tracking technologies to monitor your browsing history on our site or across the web.
      </p>

      <h3>Changes to This Policy</h3>
      <p>
        We may update this Privacy Policy occasionally. Any changes will be posted on this page. We encourage you to review this policy periodically.
      </p>

      <h3>Change Log</h3>
      <ul>
        <li><strong>April 26, 2025:</strong> Updated our Privacy Policy to better reflect the anonymous analytics data collected (hashed identifiers, device/browser information, search terms, page views). Transitioned from using Simple Analytics to our own in-house analytics system. No new data collection was introduced — this is a clarification of existing practices.</li>
      </ul>

      <h3>Contact</h3>
      <p>
        If you have any questions about this Privacy Policy or encounter any issues, please contact us at quotes.contacts@gmail.com.
      </p>
    </div>
  );
};

export default Privacy;
