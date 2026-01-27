import { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';

const TenantContext = createContext(null);

// Read tenant config synchronously at module load time (before React renders)
// This ensures we have the tenant config immediately, avoiding any delay
const getInitialTenantConfig = () => {
  if (typeof window === 'undefined') return null;
  
  // First, try to read the injected config (server-side injection)
  // Inline scripts execute before module scripts, so this should be available
  if (window.__TENANT_CONFIG__) {
    const injectedConfig = window.__TENANT_CONFIG__;
    console.log('[useTenant] ✓ Found injected tenant config:', injectedConfig.id, injectedConfig);
    return injectedConfig;
  }
  
  console.log('[useTenant] ✗ No injected config found (window.__TENANT_CONFIG__ is', window.__TENANT_CONFIG__, ')');
  
  // If not injected, try to detect from hostname synchronously
  // This is a fallback for cases where injection didn't work (e.g., dev mode)
  const hostname = window.location.hostname.toLowerCase().split(':')[0];
  const port = window.location.port ? parseInt(window.location.port) : null;
  const fullHost = window.location.host.toLowerCase();
  
  console.log('[useTenant] No injected config found, detecting from hostname:', hostname, 'port:', port, 'fullHost:', fullHost);
  
  // Hardcoded tenant detection based on hostname (matches server-side logic)
  // This ensures we get the right tenant immediately without waiting for API call
  // Check for hivequotes hostnames first
  if (hostname === 'hivequotes.xyz' || hostname === 'www.hivequotes.xyz') {
    return {
      id: 'hivemind',
      name: 'hivemind',
      displayName: 'HiveQuotes',
      branding: {
        logo: '/hivemind/hivemind.jpg',
        logoFallback: '/hivemind/hivemind.jpg',
        favicon: '/hivemind/hivemind.jpg',
        primaryColor: '#4CAF50',
        theme: 'northernlion'
      },
      metadata: {
        title: 'HiveQuotes - Search hivemind Quotes',
        description: 'Search through thousands of quotes from hivemind\'s videos. Find memorable moments, funny quotes, and more.',
        siteName: 'HiveQuotes'
      },
      texts: {
        searchPlaceholder: 'Search quotes...',
        randomQuotesButton: 'Random Quotes',
        totalQuotesLabel: 'Total quotes found:',
        loadingMessage: 'Loading...',
        errorMessage: 'Unable to connect to database.'
      },
      channels: [
        { id: 'all', name: 'All Sources' },
        { id: 'hivemind', name: 'HivemindTV' },
        { id: 'hivemindunlimited', name: 'HivemindUNLIMITED' }
      ],
      hostnames: ['hivequotes.xyz', 'www.hivequotes.xyz', 'localhost'],
      grafana: {
        dashboardUrl: 'http://{hostname}:3000/public-dashboards/f333724fedb14452a37956d035e0b721',
        mobileDashboardUrl: 'http://{hostname}:3000/public-dashboards/f333724fedb14452a37956d035e0b721',
        useHostname: true
      },
      gameFilter: {
        enabled: false,
        label: 'game',
        tooltipText: 'Filter by game (type to search).',
        resetTooltipText: 'Reset game filter'
      }
    };
  }
  
  // For localhost, try to fetch synchronously from API if possible
  // This handles dev mode where injection might not work
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    try {
      // Try synchronous fetch (works in browsers, deprecated but functional)
      // This ensures we get the tenant immediately without waiting for React to render
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/tenant', false); // false = synchronous
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('Pragma', 'no-cache');
      xhr.send();
      
      if (xhr.status >= 200 && xhr.status < 300) {
        const tenantConfig = JSON.parse(xhr.responseText);
        console.log('[useTenant] Synchronously fetched tenant from API:', tenantConfig.id);
        return tenantConfig;
      } else {
        console.warn('[useTenant] API returned status:', xhr.status);
      }
    } catch (e) {
      console.warn('[useTenant] Synchronous fetch failed:', e.message);
      // Fall through to return null, which will trigger async fetch
    }
    // If sync fetch fails, return null to trigger async fetch
    // This will cause a brief delay, but it's better than showing wrong tenant
    console.log('[useTenant] Will fetch tenant asynchronously');
    return null;
  }
  
  // Default to northernlion for nlquotes.com domains
  if (hostname === 'nlquotes.com' || hostname === 'www.nlquotes.com' || hostname === 'api.nlquotes.com') {
    return {
      id: 'northernlion',
      name: 'Northernlion',
      displayName: 'NLQuotes',
      branding: {
        logo: '/nlquotes/nlquotes.svg',
        logoFallback: '/nlquotes/NLogo.png',
        favicon: '/nlquotes/nlquotes.svg',
        primaryColor: '#4CAF50',
        theme: 'northernlion'
      },
      metadata: {
        title: 'NLQuotes - Search Northernlion Quotes',
        description: 'Search through thousands of quotes from Northernlion\'s videos. Find memorable moments, funny quotes, and more.',
        siteName: 'NLQuotes'
      },
      texts: {
        searchPlaceholder: 'Search quotes...',
        randomQuotesButton: 'Random Quotes',
        totalQuotesLabel: 'Total quotes found:',
        loadingMessage: 'Loading...',
        errorMessage: 'Unable to connect to database.'
      },
      channels: [
        { id: 'all', name: 'All Sources' },
        { id: 'librarian', name: 'Librarian' },
        { id: 'northernlion', name: 'Northernlion' }
      ],
      hostnames: ['nlquotes.com', 'www.nlquotes.com', 'api.nlquotes.com', 'localhost'],
      grafana: {
        dashboardUrl: 'https://stats.nlquotes.com/d/bek3z1ymfr9j4a/test?orgId=1&from=now-24h&to=now&timezone=browser&var-city_filter=$__all&var-search_term_filter=$__all&refresh=5m',
        mobileDashboardUrl: 'https://stats.nlquotes.com/d/xek3z1ymfr9j4a/test-mobile?orgId=1&from=now-24h&to=now&timezone=browser&refresh=5m&showCategory=Graph%20styles',
        useHostname: false
      },
      gameFilter: {
        enabled: true,
        label: 'game',
        tooltipText: 'Filter by game (type to search).',
        resetTooltipText: 'Reset game filter'
      }
    };
  }
  
  // Final fallback (shouldn't normally reach here)
  return null;
};

// Read tenant config synchronously at module load
const initialTenantConfig = getInitialTenantConfig();

// Helper function to update document metadata
function updateDocumentMetadata(tenantData) {
  if (tenantData?.metadata) {
    document.title = tenantData.metadata.title || 'NLQuotes';
    
    // Update meta tags
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', tenantData.metadata.description || '');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = tenantData.metadata.description || '';
      document.head.appendChild(meta);
    }
    
    // Update favicon
    if (tenantData.branding?.favicon) {
      const favicon = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
      if (favicon) {
        favicon.href = tenantData.branding.favicon;
      } else {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = tenantData.branding.favicon;
        document.head.appendChild(link);
      }
    }
  }
}

export function TenantProvider({ children }) {
  // Use the synchronously detected tenant config as initial state
  // This ensures we have the correct tenant immediately, avoiding any flash of wrong content
  const [tenant, setTenant] = useState(initialTenantConfig);
  const [loading, setLoading] = useState(!initialTenantConfig);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If we already have a tenant config (from synchronous detection), update metadata immediately
    if (initialTenantConfig) {
      console.log('[useTenant] Using synchronously detected tenant config:', initialTenantConfig.id);
      updateDocumentMetadata(initialTenantConfig);
      setLoading(false);
      
      // Still fetch from API in background to ensure we have the latest config
      // This is non-blocking - we already have the correct tenant loaded
      async function fetchTenantInBackground() {
        try {
          const cacheBuster = `_t=${Date.now()}`;
          const response = await axios.get(`/api/tenant?${cacheBuster}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          // Only update if the API returns a different tenant (shouldn't happen, but just in case)
          if (response.data && response.data.id !== initialTenantConfig.id) {
            console.log('[useTenant] API returned different tenant, updating:', response.data.id);
            setTenant(response.data);
            updateDocumentMetadata(response.data);
          }
        } catch (err) {
          // Silently fail - we already have a working tenant config
          console.warn('[useTenant] Background fetch failed, using detected config:', err.message);
        }
      }
      fetchTenantInBackground();
      return;
    }

    // If no initial config was detected, fetch from API (fallback case)
    async function fetchTenant() {
      try {
        console.log('[useTenant] Fetching tenant config from /api/tenant');
        const cacheBuster = `_t=${Date.now()}`;
        const response = await axios.get(`/api/tenant?${cacheBuster}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        console.log('[useTenant] Received tenant config:', response.data);
        setTenant(response.data);
        updateDocumentMetadata(response.data);
      } catch (err) {
        console.error('[useTenant] Error fetching tenant config:', err);
        setError(err);
        // Use the synchronously detected config as fallback (should already be set, but just in case)
        if (initialTenantConfig) {
          console.warn('[useTenant] API fetch failed, using detected config as fallback');
          setTenant(initialTenantConfig);
          updateDocumentMetadata(initialTenantConfig);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTenant();
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
