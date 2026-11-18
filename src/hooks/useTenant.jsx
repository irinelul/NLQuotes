import { useState, useEffect, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { getSpaMetadata } from '../../utils/spaMetadata.js';

const TenantContext = createContext(null);

// Read tenant config synchronously at module load time (before React renders)
// This ensures we have the tenant config immediately, avoiding any delay
const getInitialTenantConfig = () => {
  if (typeof window === 'undefined') return null;
  
  // First, try to read the injected config (server-side injection from tenant JSON files)
  // Inline scripts execute before module scripts, so this should be available
  if (window.__TENANT_CONFIG__) {
    return window.__TENANT_CONFIG__;
  }

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
        return JSON.parse(xhr.responseText);
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

export function TenantProvider({ children }) {
  // Use the synchronously detected tenant config as initial state
  // This ensures we have the correct tenant immediately, avoiding any flash of wrong content
  const [tenant, setTenant] = useState(initialTenantConfig);
  const [loading, setLoading] = useState(!initialTenantConfig);
  const [error, setError] = useState(null);
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!tenant) return;
    const { title, description, canonical, robots } = getSpaMetadata(pathname, new URLSearchParams(search), tenant);
    document.title = title;
    const tags = {
      'name="description"': description,
      'name="robots"': robots,
      'property="og:title"': title,
      'property="og:description"': description,
      'property="og:url"': canonical,
      'name="twitter:title"': title,
      'name="twitter:description"': description,
      'name="twitter:url"': canonical,
    };
    for (const [selector, content] of Object.entries(tags)) {
      document.head.querySelector('meta[' + selector + ']')?.setAttribute('content', content);
    }
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
  }, [pathname, search, tenant]);

  useEffect(() => {
    const href = tenant?.branding?.favicon;
    if (!href) return;
    const favicon = document.head.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (favicon) {
      favicon.href = href;
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      document.head.appendChild(link);
    }
  }, [tenant]);

  useEffect(() => {
    // An injected or synchronously fetched config is already in use.
    if (initialTenantConfig) {
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
        const cacheBuster = `_t=${Date.now()}`;
        const response = await axios.get(`/api/tenant?${cacheBuster}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        setTenant(response.data);
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
