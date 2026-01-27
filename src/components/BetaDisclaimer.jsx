import { TENANT } from '../config/tenant';

const BetaDisclaimer = () => {
  // Use hard-bound tenant config (resolved at build time, no flickering)
  const siteName = TENANT.displayName || TENANT.metadata?.siteName || 'NLQuotes';
  const siteUrl = TENANT.hostnames?.[0] ? `https://${TENANT.hostnames[0]}` : 'https://nlquotes.com';
  
  return (
    <div className="beta-disclaimer">
      <div className="beta-disclaimer-content">
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          This is a beta version of {siteName} using our new PostgreSQL database.
        </p>
        
        <p>
          For the stable version, please visit: 
          <a href={siteUrl} className="main-site-link">{siteUrl.replace('https://', '')}</a>
        </p>
        <p className="beta-note">
          This version is fully functional but may occasionally have minor issues as we optimize the new database.
        </p>
      </div>
    </div>
  );
};

export default BetaDisclaimer; 