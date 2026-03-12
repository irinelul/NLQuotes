import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalyticsOptOut } from '../hooks/useAnalyticsOptOut';
import { TENANT } from '../config/tenant';

const Privacy = () => {
  const navigate = useNavigate();
  const { isOptedOut, toggleOptOut } = useAnalyticsOptOut();
  const siteName = TENANT.displayName || TENANT.metadata?.siteName || 'NL Quotes';

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
      <button
        type="button"
        onClick={handleBack}
        style={{ marginBottom: '1.5rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}
      >
        Go Back
      </button>
      <h2>Privacy Policy</h2>
      <p><strong>Last updated: March 2026</strong></p>

      <p>
        Your privacy is critically important to us at {siteName}. Our guiding principle is to collect the absolute minimum information necessary and to be transparent about it.
      </p>

      <h3>Core Privacy Principles</h3>
      <ul>
        <li><strong>We do not collect personal information.</strong> Your identity remains anonymous.</li>
        <li><strong>We do not use cookies</strong> or persistent tracking technologies.</li>
        <li><strong>We do not serve advertisements.</strong></li>
        <li><strong>We do not sell or share data with third parties.</strong></li>
        <li><strong>We do not fingerprint users</strong> or create user profiles.</li>
      </ul>

      <h3>Analytics</h3>
      <p>
        We use <a href="https://umami.is" target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB' }}>Umami</a>, a privacy-focused, self-hosted analytics platform, to understand basic usage patterns. Umami does not use cookies, does not collect personal data, and respects your browser's "Do Not Track" setting.
      </p>
      <p>
        The only data collected is anonymous aggregate information such as page views and general usage trends. No IP addresses, device fingerprints, or personal identifiers are stored.
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        You can opt out of analytics at any time using the button below.
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
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          {isOptedOut 
            ? '✓ Analytics is currently disabled. No usage data will be collected.'
            : '✓ Analytics is currently enabled. Anonymous, cookie-free usage data is collected via Umami.'}
        </p>
      </div>

      <h3>What We Do Not Collect</h3>
      <ul>
        <li>No IP addresses are stored.</li>
        <li>No cookies or tracking pixels are used.</li>
        <li>No personal identifiers like name, email, or account details are collected.</li>
        <li>No user profiles or fingerprints are created.</li>
        <li>No data is shared with advertisers or third-party trackers.</li>
      </ul>

      <h3>Third-Party Services</h3>
      <ul>
        <li><strong>Umami Analytics:</strong> Self-hosted, privacy-focused, cookie-free analytics. Respects Do Not Track and your opt-out preference above.</li>
        <li><strong>YouTube:</strong> Video embeds are loaded from YouTube when you interact with quotes. YouTube's own privacy policy applies to those embeds.</li>
        <li><strong>Data Sharing:</strong> We do not share any data with third parties.</li>
        <li><strong>Data Selling:</strong> We do not, and will never, sell any data.</li>
      </ul>

      <h3>Changes to This Policy</h3>
      <p>
        We may update this Privacy Policy occasionally. Any changes will be posted on this page.
      </p>

      <h3>Change Log</h3>
      <ul>
        <li><strong>March 2026:</strong> Removed all advertisements (Google AdSense) and in-house analytics. The site now uses only Umami for privacy-friendly, cookie-free analytics. Removed user hashing and device fingerprinting.</li>
        <li><strong>January 2025:</strong> Transitioned to Umami analytics for privacy-focused tracking.</li>
      </ul>

      <h3>Contact</h3>
      <p>
        If you have any questions about this Privacy Policy or encounter any issues, please contact us at quotes.contacts@gmail.com.
      </p>
    </div>
  );
};

export default Privacy;
