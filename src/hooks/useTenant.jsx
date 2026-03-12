import { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';

const TenantContext = createContext(null);

// Read tenant config synchronously at module load time (before React renders)
const getInitialTenantConfig = () => {
  if (typeof window === 'undefined') return null;
  
  // First, try to read the injected config (server-side injection from tenant JSON files)
  if (window.__TENANT_CONFIG__) {
    return window.__TENANT_CONFIG__;
  }
  
  // For dev mode (localhost), try synchronous fetch from API as fallback
  const hostname = window.location.hostname.toLowerCase().split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/tenant', false); // false = synchronous
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('Pragma', 'no-cache');
      xhr.send();
      
      if (xhr.status >= 200 && xhr.status < 300) {
        return JSON.parse(xhr.responseText);
      }
    } catch (e) {
      // Fall through to async fetch
    }
  }
  
  return null;
};

const initialTenantConfig = getInitialTenantConfig();

// Helper function to update document metadata
function updateDocumentMetadata(tenantData) {
  if (tenantData?.metadata) {
    document.title = tenantData.metadata.title || 'NLQuotes';
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', tenantData.metadata.description || '');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = tenantData.metadata.description || '';
      document.head.appendChild(meta);
    }
    
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
  const [tenant, setTenant] = useState(initialTenantConfig);
  const [loading, setLoading] = useState(!initialTenantConfig);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialTenantConfig) {
      updateDocumentMetadata(initialTenantConfig);
      setLoading(false);
      
      // Refresh from API in background to ensure latest config
      async function refreshTenantInBackground() {
        try {
          const cacheBuster = `_t=${Date.now()}`;
          const response = await axios.get(`/api/tenant?${cacheBuster}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          if (response.data) {
            setTenant(response.data);
            updateDocumentMetadata(response.data);
          }
        } catch (err) {
          // Silently fail — we already have a working tenant config
        }
      }
      refreshTenantInBackground();
      return;
    }

    // If no initial config, fetch from API
    async function fetchTenant() {
      try {
        const cacheBuster = `_t=${Date.now()}`;
        const response = await axios.get(`/api/tenant?${cacheBuster}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        setTenant(response.data);
        updateDocumentMetadata(response.data);
      } catch (err) {
        console.error('[useTenant] Error fetching tenant config:', err.message);
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
