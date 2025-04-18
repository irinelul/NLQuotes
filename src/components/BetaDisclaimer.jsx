
const BetaDisclaimer = () => {
  return (
    <div className="beta-disclaimer">
      <div className="beta-disclaimer-content">
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          This is a beta version of NLQuotes using our new PostgreSQL database.
        </p>
        
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