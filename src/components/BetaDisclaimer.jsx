import { useTenant } from '../hooks/useTenant';

const BetaDisclaimer = () => {
  const { tenant } = useTenant();
  const siteName = tenant?.displayName || tenant?.metadata?.siteName || 'NLQuotes';
  const siteUrl = tenant?.hostnames?.[0] ? `https://${tenant.hostnames[0]}` : 'https://nlquotes.com';
  
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