import { TENANT } from '../config/tenant';
import styles from './BetaDisclaimer.module.css';

const BetaDisclaimer = () => {
  // Use hard-bound tenant config (resolved at build time, no flickering)
  const siteName = TENANT.displayName || TENANT.metadata?.siteName || 'NLQuotes';
  const siteUrl = TENANT.hostnames?.[0] ? `https://${TENANT.hostnames[0]}` : 'https://nlquotes.com';
  
  return (
    <div className={styles.betaDisclaimer}>
      <div className={styles.betaDisclaimerContent}>
        <h2>⚠️ BETA VERSION ⚠️</h2>
        <p>
          This is a beta version of {siteName} using our new PostgreSQL database.
        </p>
        
        <p>
          For the stable version, please visit: 
          <a href={siteUrl} className={styles.mainSiteLink}>{siteUrl.replace('https://', '')}</a>
        </p>
        <p className={styles.betaNote}>
          This version is fully functional but may occasionally have minor issues as we optimize the new database.
        </p>
      </div>
    </div>
  );
};

export default BetaDisclaimer; 