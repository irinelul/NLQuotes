import React, { useState, useEffect } from 'react';
import axios from 'axios';
import query from '../services/quotes';

const BetaDisclaimer = () => {
  const [dbStatus, setDbStatus] = useState({
    status: 'checking',
    message: 'Checking PostgreSQL connection...',
    lastChecked: null
  });
  
  const [apiStatus, setApiStatus] = useState({
    endpoints: {},
    baseUrl: window.location.origin
  });
  
  const [renderCheck, setRenderCheck] = useState({
    checked: false,
    status: 'pending',
    message: 'Not checked yet'
  });

  useEffect(() => {
    // Check if we're on Render.com
    const isOnRender = window.location.hostname.includes('render.com') || 
                      window.location.hostname.includes('onrender.com');
    
    // Function to check if an API endpoint exists
    const checkEndpoint = async (path) => {
      try {
        // First try with a HEAD request to avoid loading data
        await axios.head(`${path}`);
        return { exists: true, error: null };
      } catch (error) {
        if (error.response) {
          // If we get any response (even error), the endpoint exists but might have issues
          return { exists: true, status: error.response.status, error: error.message };
        } else {
          // No response means endpoint doesn't exist or is unreachable
          return { exists: false, error: error.message };
        }
      }
    };

    const checkApiStatus = async () => {
      // List of endpoints to check
      const endpoints = [
        '/api',
        '/api/db-status',
        '/api/games',
        '/api/random',
        '/test',
        '/health',
        '/db-status',  // Try without /api prefix
        '/random',     // Try without /api prefix 
        '/games'       // Try without /api prefix
      ];
      
      const results = {};
      
      for (const endpoint of endpoints) {
        results[endpoint] = await checkEndpoint(endpoint);
        console.log(`API Check: ${endpoint} - ${results[endpoint].exists ? 'Found' : 'Not Found'}`);
      }
      
      setApiStatus({
        endpoints: results,
        baseUrl: window.location.origin,
        checked: new Date().toLocaleTimeString()
      });
    };
    
    // Special check for Render.com deployment
    const checkRenderDeployment = async () => {
      if (!isOnRender) {
        setRenderCheck({ 
          checked: true,
          status: 'not-render', 
          message: 'Not deployed on Render.com'
        });
        return;
      }
      
      try {
        // Try with base path with no API prefix
        const response = await axios.get('/test');
        if (response.status === 200) {
          setRenderCheck({
            checked: true,
            status: 'success',
            message: 'Render.com deployment with correct base paths',
            data: response.data
          });
          return;
        }
      } catch (error) {
        console.log('Base path test failed:', error.message);
      }
      
      try {
        // Check if the API is at the root level on Render (no /api prefix)
        const response = await axios.get('/db-status');
        if (response.status === 200) {
          setRenderCheck({
            checked: true,
            status: 'path-issue',
            message: 'API is accessible without /api prefix - check your Express routes',
            data: response.data
          });
          return;
        }
      } catch (error) {
        console.log('Root api check failed:', error.message);
      }
      
      setRenderCheck({
        checked: true,
        status: 'error',
        message: 'Could not access API on Render.com - check your deployment settings',
        error: 'All path configurations failed'
      });
    };
    
    const checkDbStatus = async () => {
      try {
        // Use our updated service that tries multiple path configurations
        const dbStatusData = await query.checkDatabaseStatus();
        
        setDbStatus({
          status: dbStatusData.status || 'connected',
          message: dbStatusData.message || 'Connected to PostgreSQL',
          lastChecked: new Date().toLocaleTimeString(),
          details: dbStatusData
        });
      } catch (error) {
        console.error('Error checking DB status:', error);
        setDbStatus({
          status: 'error',
          message: `Connection error: ${error.message}. The API path may be incorrect.`,
          lastChecked: new Date().toLocaleTimeString(),
          error: error
        });
        
        // If we have API issues, check for more detailed diagnostics
        checkApiStatus();
        checkRenderDeployment();
      }
    };

    // Check immediately on mount
    checkDbStatus();
    checkApiStatus();
    checkRenderDeployment();

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

  // Determine if server is reachable but API routes aren't
  const hasApiIssues = Object.values(apiStatus.endpoints).some(endpoint => !endpoint.exists);

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
          
          {dbStatus.status === 'error' && (
            <div className="api-status">
              <div className="api-status-message">
                <strong>API Issue Detected:</strong> The server is running but API routes may not be properly configured.
                {dbStatus.error && dbStatus.error.response && (
                  <span> Error {dbStatus.error.response.status}: {dbStatus.error.message}</span>
                )}
              </div>
              
              {renderCheck.checked && (
                <div className="render-status">
                  <strong>Render.com Status:</strong> {renderCheck.message}
                  {renderCheck.status === 'path-issue' && (
                    <div className="render-fix-suggestion">
                      <strong>Suggested Fix:</strong> Your API endpoints may be missing the '/api' prefix. 
                      Check if Express is configured with paths like '/db-status' instead of '/api/db-status'.
                    </div>
                  )}
                </div>
              )}
              
              {Object.keys(apiStatus.endpoints).length > 0 && (
                <div className="endpoint-status">
                  <div>API Endpoints:</div>
                  <ul>
                    {Object.entries(apiStatus.endpoints).map(([path, status]) => (
                      <li key={path}>
                        {path}: {status.exists ? '✅' : '❌'} 
                        {status.error && ` - ${status.status || 'Error'}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="troubleshooting-tips">
                <strong>Troubleshooting Tips:</strong>
                <ol>
                  <li>Check if backend server is properly configured with these API routes</li>
                  <li>Verify that the Express routes are properly registered</li>
                  <li>Look for path prefix issues (e.g., may need '/api' prefix)</li>
                  <li>Check for Render.com service path configuration</li>
                  <li>Try accessing <a href="/test" target="_blank" rel="noopener noreferrer" style={{color: 'white'}}>the test endpoint</a> directly</li>
                </ol>
              </div>
            </div>
          )}
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