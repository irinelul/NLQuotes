import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BetaDisclaimer = () => {
  const [dbStatus, setDbStatus] = useState({
    status: 'checking',
    message: 'Checking PostgreSQL connection...',
    lastChecked: null
  });

  useEffect(() => {
    const checkDbStatus = async () => {
      try {
        const response = await axios.get('/api/db-status');
        setDbStatus({
          status: response.data.status,
          message: response.data.message,
          lastChecked: new Date().toLocaleTimeString()
        });
      } catch (error) {
        console.error('Error checking DB status:', error);
        setDbStatus({
          status: 'error',
          message: `Connection error: ${error.message}`,
          lastChecked: new Date().toLocaleTimeString()
        });
      }
    };

    // Check immediately on mount
    checkDbStatus();

    // Then check every 30 seconds
    const interval = setInterval(checkDbStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Status indicator styles
  const getStatusIndicator = () => {
    switch (dbStatus.status) {
      case 'connected':
        return '🟢';
      case 'error':
        return '🔴';
      default:
        return '🟠';
    }
  };

  return (
    <div className="beta-disclaimer">
      <div className="beta-disclaimer-content">
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          You have reached a beta version of this site. We are currently migrating our database to PostgreSQL.
        </p>
        
        <div className="db-status-container">
          <div className="db-status">
            <span className="db-status-indicator">{getStatusIndicator()}</span>
            <span className="db-status-message">PostgreSQL: {dbStatus.message}</span>
            {dbStatus.lastChecked && (
              <span className="db-status-time">Last checked: {dbStatus.lastChecked}</span>
            )}
          </div>
        </div>
        
        <p>
          For the complete and stable version, please visit: 
          <a href="https://nlquotes.com" className="main-site-link">nlquotes.com</a>
        </p>
        <p className="beta-note">
          This version may contain incomplete data or experience occasional issues.
        </p>
      </div>
    </div>
  );
};

export default BetaDisclaimer; 