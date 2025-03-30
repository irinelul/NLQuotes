import React from 'react';

const BetaDisclaimer = () => {
  return (
    <div className="beta-disclaimer">
      <div className="beta-disclaimer-content">
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          You have reached a beta version of this site. We are currently migrating our database from MongoDB to PostgreSQL.
        </p>
        
        <div className="db-status-container">
          <div className="db-status">
            <span className="db-status-indicator">🔄</span>
            <span className="db-status-message">
              PostgreSQL Migration: In Progress
            </span>
          </div>
          
          <div className="migration-note">
            <strong>Current Status:</strong> API endpoints and database connections are currently unavailable while we 
            complete the migration process. The website is in "display only" mode.
            <p className="migration-details">
              We are moving from MongoDB to PostgreSQL for improved performance and reliability.
              This upgrade will allow for faster searches and better support for advanced features.
            </p>
            <p className="ssl-note">
              <strong>Note:</strong> This beta deployment may experience SSL certificate issues. 
              If you're seeing errors related to this, please visit 
              <a href="https://nlquotes.com" className="inline-link"> the main site </a> 
              which has a properly configured certificate.
            </p>
          </div>
        </div>
        
        <p>
          For the complete and stable version, please visit: 
          <a href="https://nlquotes.com" className="main-site-link">nlquotes.com</a>
        </p>
        <p className="beta-note">
          This version contains incomplete data and lacks full functionality during the migration.
        </p>
      </div>
    </div>
  );
};

export default BetaDisclaimer; 