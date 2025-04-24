import React from 'react';
import { useNavigate } from 'react-router-dom';

const Privacy = () => {
  const navigate = useNavigate();
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
      <p>
        Your privacy is critically important to us at Chat Audit. Our fundamental principle is to collect the absolute minimum information necessary and to be transparent about it. This policy explains our approach.
      </p>

      <h3>Core Privacy Principles</h3>
      <ul>
        <li><strong>We do not collect personal information.</strong> Your identity remains anonymous.</li>
        <li><strong>We do not track your individual activity.</strong> No cookies, no browser fingerprinting, no tracking pixels.</li>
        <li><strong>We do not serve advertisements.</strong></li>
        <li><strong>We do not sell data.</strong> We don't collect personal data in the first place, and we absolutely do not sell any information.</li>
      </ul>

      <h3>Information We Collect (Minimal Anonymous Analytics)</h3>
      <p>
        We aim to understand basic usage patterns to improve Chat Audit without compromising your privacy.
      </p>
      <ul>
        <li>
          We use <strong>Simple Analytics</strong>, a privacy-focused analytics provider. Simple Analytics provides us with minimal, aggregated website statistics like total page views and referring websites.
        </li>
        <li>
          <strong>No personal data is collected</strong> through analytics. No IP addresses are stored, no user profiles are built, and individual user sessions are not tracked.
        </li>
        <li>
          Simple Analytics respects <strong>Do Not Track (DNT)</strong> browser settings.
        </li>
        <li>
          Specific usage data within the app (like searches performed or pages visited by an individual) is <strong>not logged or stored</strong>.
        </li>
      </ul>

      <h3>How We Use Information</h3>
      <p>
        The limited, anonymous, aggregate data we receive from Simple Analytics is used solely to:
      </p>
      <ul>
        <li>Provide and improve our services based on overall usage trends.</li>
        <li>Understand general traffic patterns to enhance user experience.</li>
        <li>Ensure the website is functioning correctly and securely (e.g., identify pages that might be broken).</li>
      </ul>

      <h3>Data Security</h3>
      <p>
        While we collect virtually no personal data, we still take reasonable measures to protect the minimal anonymous aggregate statistics we handle. However, please remember that no method of transmission over the Internet is 100% secure.
      </p>

      <h3>Third-Party Services & Data Sharing</h3>
      <ul>
         <li><strong>Analytics:</strong> As mentioned, we use Simple Analytics for minimal, privacy-respecting stats. They do not collect personal data.</li>
         <li><strong>Data Sharing:</strong> We do not share any information with third parties, except if strictly required by law (which is highly unlikely given we don't collect identifiable data).</li>
         <li><strong>Data Selling:</strong> We restate: We <strong>never</strong> sell any data.</li>
      </ul>

      <h3>Cookies and Tracking</h3>
       <p>
         We <strong>do not use cookies</strong> or any other persistent tracking technologies to monitor your individual activity or Browse history on our site or across the web.
       </p>

      <h3>Changes to This Policy</h3>
      <p>
        We may update this Privacy Policy occasionally. Any changes will be posted on this page. We encourage you to review this policy periodically.
      </p>

      <h3>Contact</h3>
      <p>
        If you have any questions about this Privacy Policy or encounter any issues, please don't hesitate to contact us at quotes.contacts@gmail.com.
      </p>
    </div>
  );
};

export default Privacy; 