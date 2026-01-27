import { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';

const TenantContext = createContext(null);

// Read tenant config synchronously at module load time (before React renders)
// This ensures we have the tenant config immediately, avoiding any delay
const getInitialTenantConfig = () => {
  if (typeof window === 'undefined') return null;
  
  // First, try to read the injected config (server-side injection from tenant JSON files)
  // Inline scripts execute before module scripts, so this should be available
  if (window.__TENANT_CONFIG__) {
    const injectedConfig = window.__TENANT_CONFIG__;
    console.log('[useTenant] ✓ Found injected tenant config:', injectedConfig.id);
    return injectedConfig;
  }
  
  console.log('[useTenant] No injected config found, will fetch from /api/tenant');
  
  // For dev mode (localhost), try synchronous fetch from API as fallback
  // The API reads from tenant JSON files, so this ensures we always use the source of truth
  const hostname = window.location.hostname.toLowerCase().split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/tenant', false); // false = synchronous
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('Pragma', 'no-cache');
      xhr.send();
      
      if (xhr.status >= 200 && xhr.status < 300) {
        const tenantConfig = JSON.parse(xhr.responseText);
        console.log('[useTenant] Synchronously fetched tenant from API:', tenantConfig.id);
        return tenantConfig;
      }
    } catch (e) {
      console.warn('[useTenant] Synchronous fetch failed:', e.message);
    }
  }
  
  // Return null to trigger async fetch from /api/tenant
  // All tenant configs come from JSON files via the API
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
    // If we already have a tenant config (from injection or sync fetch), update metadata immediately
    if (initialTenantConfig) {
      console.log('[useTenant] Using initial tenant config:', initialTenantConfig.id);
      updateDocumentMetadata(initialTenantConfig);
      setLoading(false);
      
      // Optionally refresh from API in background to ensure we have the latest config
      // This is non-blocking - we already have the correct tenant loaded
      async function refreshTenantInBackground() {
        try {
          const cacheBuster = `_t=${Date.now()}`;
          const response = await axios.get(`/api/tenant?${cacheBuster}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          // Update if config changed (shouldn't happen, but ensures consistency)
          if (response.data) {
            setTenant(response.data);
            updateDocumentMetadata(response.data);
          }
        } catch (err) {
          // Silently fail - we already have a working tenant config
          console.warn('[useTenant] Background refresh failed:', err.message);
        }
      }
      refreshTenantInBackground();
      return;
    }

    // If no initial config, fetch from API (reads from tenant JSON files)
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
        console.log('[useTenant] Received tenant config:', response.data.id);
        setTenant(response.data);
        updateDocumentMetadata(response.data);
      } catch (err) {
        console.error('[useTenant] Error fetching tenant config:', err);
        setError(err);
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
