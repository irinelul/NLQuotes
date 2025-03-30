import React from 'react';

const BetaDisclaimer = () => {
  return (
    <div className="beta-disclaimer">
      <div className="beta-disclaimer-content">
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          This is a beta version of NLQuotes using our new PostgreSQL database.
        </p>
        
        <div className="db-status-container">
          <div className="db-status">
            <span className="db-status-indicator">✅</span>
            <span className="db-status-message">
              PostgreSQL Migration: Complete
            </span>
          </div>
          
          <div className="migration-note migration-complete">
            <strong>Current Status:</strong> Database migration complete! The website is now fully functional with PostgreSQL.
            <p className="migration-details">
              We've successfully migrated from MongoDB to PostgreSQL for improved performance and reliability.
              Enjoy faster searches and better reliability with our new database.
            </p>
            <p className="ssl-note">
              <strong>Note:</strong> This beta deployment may still experience occasional SSL certificate issues. 
              If you encounter connection problems, you can visit 
              <a href="https://nlquotes.com" className="inline-link"> the main site </a> 
              which has a properly configured certificate.
            </p>
          </div>
        </div>
        
        <p>
          For the stable version, please visit: 
          <a href="https://nlquotes.com" className="main-site-link">nlquotes.com</a>
        </p>
        <p className="beta-note">
          This version is fully functional but may occasionally have minor issues as we optimize the new database.
        </p>
      </div>
    </div>
  );
};

export default BetaDisclaimer; 