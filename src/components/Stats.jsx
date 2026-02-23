import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useTenant } from '../hooks/useTenant';
import { TENANT as TENANT_CONFIG, IS_HIVEMIND } from '../config/tenant';
import './Stats.css';

const Stats = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { tenant, loading: tenantLoading } = useTenant();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Wait for tenant to load before rendering
  if (tenantLoading) {
    return (
      <div className="stats-container">
        <h1>Loading...</h1>
      </div>
    );
  }
  
  // Get dashboard URL from tenant config
  const grafanaConfig = tenant?.grafana;
  const dashboardUrl = grafanaConfig?.dashboardUrl || null;
  
  // Tenant-aware text
  const siteName = TENANT_CONFIG.displayName || TENANT_CONFIG.metadata?.siteName || 'NLQuotes';
  const statsTitle = `${siteName} Statistics`;
  const isHiveQuotes = IS_HIVEMIND;

  // Check if URL is configured
  if (!dashboardUrl) {
    return (
      <div className="stats-container">
        <h1>{statsTitle}</h1>
        <div className="error-message">
          <p>Dashboard URL is not configured. Please check the tenant configuration.</p>
        </div>
      </div>
    );
  }

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load dashboard. Please check your network connection and try again.');
  };

  return (
    <div className="stats-container">
      <div className="title-section">
        <h1 className="dashboard-title">{statsTitle}</h1>
        <div className="stats-summary">
          {!isHiveQuotes && tenant?.channels && (
            <>
              {tenant.channels.find(c => c.id === 'librarian') && (
                <p>Librarian has indexed 1,135 videos (Some older NLSS vids are assigned to Librarian but on different channel)</p>
              )}
              {tenant.channels.find(c => c.id === 'northernlion') && (
                <p>NL has 21,951 videos</p>
              )}
            </>
          )}
          <button className="back-button" onClick={() => navigate('/')}>
            ← Back to Search
          </button>
        </div>
      </div>
      <div className={`dashboard-container ${isLoading ? 'loading' : ''}`}>
        {isLoading && <div className="loading-overlay">Loading dashboard...</div>}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        <iframe
          key={`dashboard-${theme}`}
          src={dashboardUrl}
          title={`${siteName} Dashboard`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          loading="eager"
          referrerPolicy="no-referrer"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      </div>
    </div>
  );
};

export default Stats;
