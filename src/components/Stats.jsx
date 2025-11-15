import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import './Stats.css';

const Stats = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Hard-coded Grafana dashboard URLs
  const dashboardUrl = "https://stats.nlquotes.com/d/bek3z1ymfr9j4a/test?orgId=1&from=now-24h&to=now&timezone=browser&var-city_filter=$__all&var-search_term_filter=$__all&refresh=5m";
  const mobileDashboardUrl = "https://stats.nlquotes.com/d/xek3z1ymfr9j4a/test-mobile?orgId=1&from=now-24h&to=now&timezone=browser&refresh=5m&showCategory=Graph%20styles";

  // Validate and normalize dashboard URL
  const normalizeUrl = (url) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      // Ensure the URL has a protocol
      if (!urlObj.protocol) {
        urlObj.protocol = window.location.protocol;
      }
      return urlObj.toString();
    } catch (e) {
      console.error('Invalid dashboard URL:', e);
      return null;
    }
  };

  const normalizedDashboardUrl = normalizeUrl(dashboardUrl);
  const normalizedMobileUrl = normalizeUrl(mobileDashboardUrl);

  // Check if URLs are configured
  if (!normalizedDashboardUrl) {
    return (
      <div className="stats-container">
        <h1>NLQuotes Statistics</h1>
        <div className="error-message">
          <p>Grafana dashboard URL is not configured or invalid. Please check your environment variables.</p>
          <p>Required environment variables:</p>
          <ul>
            <li>VITE_GRAFANA_DASHBOARD_URL</li>
            <li>VITE_GRAFANA_DASHBOARD_URL_MOBILE (optional)</li>
          </ul>
        </div>
      </div>
    );
  }

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use mobile URL if available and on mobile device
  const baseUrl = isMobile && normalizedMobileUrl ? normalizedMobileUrl : normalizedDashboardUrl;
  
  // Add more URL parameters for better dashboard configuration
  const urlParams = new URLSearchParams({
    theme: theme,
    refresh: '5m',
    from: 'now-7d',
    to: 'now',
    orgId: '1',
    edit: 'false',
    timezone: 'browser',
    cache: 'false',
    mobile: isMobile ? 'true' : 'false'
  });

  const embedUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${urlParams.toString()}`;

  const handleIframeLoad = () => {
    console.log('Iframe loaded successfully');
    console.log('Current URL:', embedUrl);
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    console.error('Iframe failed to load');
    console.error('Failed URL:', embedUrl);
    setIsLoading(false);
    setError('Failed to load dashboard. Please check your network connection and try again.');
  };

  // Prevent body scrolling when Stats page is mounted
  useEffect(() => {
    // Save original overflow style
    const originalOverflow = document.body.style.overflow;
    const originalOverflowHtml = document.documentElement.style.overflow;
    
    // Disable scrolling on body and html
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Restore scrolling when component unmounts
    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalOverflowHtml;
    };
  }, []);

  // Add message event listener for iframe communication
  useEffect(() => {
    const handleMessage = (event) => {
      console.log('Received message from iframe:', event.data);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="stats-container">
      <div className="title-section">
        <h1 className="dashboard-title">NLQuotes Statistics</h1>
        <div className="stats-summary">
          <p>Librarian has indexed 608 videos</p>
          <p>NL has 21,112 videos</p>
          <button className="back-button" onClick={() => navigate('/')}>
            ← Back to Search
          </button>
        </div>
      </div>
      {isMobile && !normalizedMobileUrl && (
        <div className="mobile-disclaimer">
          <p>⚠️ Note: Mobile dashboard URL is not configured. Using desktop version which may not display correctly on mobile devices.</p>
        </div>
      )}
      {isMobile && normalizedMobileUrl && (
        <div className="mobile-disclaimer">
          <p>⚠️ Note: The dashboard may not display correctly on mobile devices. For the best experience, please view on desktop.</p>
        </div>
      )}
      <div className={`dashboard-container ${isLoading ? 'loading' : ''}`}>
        {isLoading && <div className="loading-overlay">Loading dashboard...</div>}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        <iframe
          key={`dashboard-${theme}`}
          src={embedUrl}
          width="100%"
          height="2500px"
          frameBorder="0"
          scrolling="no"
          title="NLQuotes Dashboard"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-storage-access-by-user-activation allow-presentation allow-downloads allow-modals"
          loading="eager"
          referrerPolicy="no-referrer"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          style={{
            width: '100%',
            height: '2500px',
            minHeight: '2500px',
            border: 'none',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#F5F5F5',
            overflow: 'hidden',
            display: 'block'
          }}
        />
      </div>
    </div>
  );
};

export default Stats; 