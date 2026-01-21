import { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTenant() {
      try {
        console.log('[useTenant] Fetching tenant config from /api/tenant');
        // Add cache-busting query parameter
        const cacheBuster = `_t=${Date.now()}`;
        const response = await axios.get(`/api/tenant?${cacheBuster}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        console.log('[useTenant] Received tenant config:', response.data);
        setTenant(response.data);
        
        // Update document metadata
        if (response.data.metadata) {
          document.title = response.data.metadata.title || 'NLQuotes';
          
          // Update meta tags
          const metaDescription = document.querySelector('meta[name="description"]');
          if (metaDescription) {
            metaDescription.setAttribute('content', response.data.metadata.description || '');
          } else {
            const meta = document.createElement('meta');
            meta.name = 'description';
            meta.content = response.data.metadata.description || '';
            document.head.appendChild(meta);
          }
          
          // Update favicon
          if (response.data.branding?.favicon) {
            const favicon = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
            if (favicon) {
              favicon.href = response.data.branding.favicon;
            } else {
              const link = document.createElement('link');
              link.rel = 'icon';
              link.href = response.data.branding.favicon;
              document.head.appendChild(link);
            }
          }
        }
      } catch (err) {
        console.error('[useTenant] Error fetching tenant config:', err);
        console.error('[useTenant] Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          url: err.config?.url
        });
        setError(err);
        // Fallback to default tenant config
        console.warn('[useTenant] Falling back to default Northernlion config');
        setTenant({
          id: 'northernlion',
          name: 'Northernlion',
          displayName: 'NLQuotes',
          branding: {
            logo: '/nlquotes/nlquotes.svg',
            logoFallback: '/nlquotes/NLogo.png',
            favicon: '/nlquotes/nlquotes.svg',
            primaryColor: '#4CAF50'
          },
          metadata: {
            title: 'NLQuotes - Search Northernlion Quotes',
            description: 'Search through thousands of quotes from Northernlion\'s videos.',
            siteName: 'NLQuotes'
          },
          texts: {
            searchPlaceholder: 'Search quotes...',
            randomQuotesButton: 'Random Quotes',
            footerText: 'Made with passion by a fan',
            totalQuotesLabel: 'Total quotes found:',
            loadingMessage: 'Loading...',
            errorMessage: 'Unable to connect to database.'
          },
          channels: [
            { id: 'all', name: 'All Sources' },
            { id: 'librarian', name: 'Librarian' },
            { id: 'northernlion', name: 'Northernlion' }
          ]
        });
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
