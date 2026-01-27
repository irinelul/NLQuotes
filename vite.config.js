import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { getTenantById } from './tenants/tenant-manager.js';

// Load environment variables (Vite doesn't auto-load dotenv)
dotenv.config();

// Get backend port from env var, or detect from tenant config
let API_PORT = process.env.VITE_API_PORT || process.env.API_PORT;

if (!API_PORT) {
  // Try to get port from tenant config if TENANT_ID is set
  const forcedTenantId = process.env.TENANT_ID;
  console.log(`[Vite] TENANT_ID from env:`, forcedTenantId);
  if (forcedTenantId) {
    try {
      const tenant = getTenantById(forcedTenantId);
      API_PORT = tenant?.port || 8080;
      console.log(`[Vite] ✓ Using port ${API_PORT} from tenant config for ${forcedTenantId}`);
    } catch (e) {
      console.error(`[Vite] ✗ Error getting tenant config:`, e.message);
      API_PORT = 8080;
    }
  } else {
    console.log(`[Vite] No TENANT_ID set, using default port 8080`);
    API_PORT = 8080;
  }
}

API_PORT = parseInt(API_PORT) || 8080;
console.log(`[Vite] Proxy target: http://localhost:${API_PORT}`);

// Get tenant ID from env (for build-time injection)
const TENANT_ID = process.env.TENANT_ID || 'northernlion';

// Get tenant config for HTML transformation
const tenant = getTenantById(TENANT_ID);
const tenantMetadata = tenant?.metadata || {};
const tenantBranding = tenant?.branding || {};
const tenantName = tenant?.name || 'Northernlion';
const tenantDisplayName = tenant?.displayName || 'NLQuotes';
const primaryHostname = tenant?.hostnames?.[0] || 'nlquotes.com';
const baseUrl = `https://${primaryHostname}`;

// Vite plugin to transform HTML based on tenant
function tenantHtmlPlugin() {
  return {
    name: 'tenant-html-transform',
    transformIndexHtml(html) {
      const favicon = tenantBranding.favicon || '/nlquotes/nlquotes.svg';
      const ogImage = tenantMetadata.ogImage || tenantBranding.logo || '/nlquotes/NLogo.png';
      const ogImageUrl = ogImage.startsWith('http') ? ogImage : `${baseUrl}${ogImage}`;
      const siteName = tenantMetadata.siteName || tenantDisplayName;
      const title = tenantMetadata.title || `${siteName} - Search ${tenantName} Quotes`;
      const description = tenantMetadata.description || `Search through thousands of quotes from ${tenantName}'s videos. Find memorable moments, funny quotes, and more.`;
      const keywords = tenantMetadata.keywords || `${tenantName.toLowerCase()}, quotes, search, videos, gaming, twitch, youtube`;
      const themeColor = tenantBranding.primaryColor || '#0b0b0f';
      
      // Generate keywords array for structured data
      const keywordsArray = keywords.split(',').map(k => k.trim()).filter(k => k);
      
      // Transform the HTML
      let transformedHtml = html;
      
      // Replace favicon links - handle multiple icon declarations
      // Remove all existing icon links
      transformedHtml = transformedHtml.replace(/<link rel="icon"[^>]*>/g, '');
      transformedHtml = transformedHtml.replace(/<link rel="apple-touch-icon"[^>]*>/g, '');
      
      // Determine icon type
      let iconType = 'image/png';
      if (favicon.endsWith('.svg')) {
        iconType = 'image/svg+xml';
      } else if (favicon.endsWith('.webp')) {
        iconType = 'image/webp';
      } else if (favicon.endsWith('.jpg') || favicon.endsWith('.jpeg')) {
        iconType = 'image/jpeg';
      }
      
      // Add new icon links after charset meta tag
      transformedHtml = transformedHtml.replace(
        /(<meta charset="UTF-8" \/>)/,
        `$1\n    <link rel="icon" href="${favicon}" type="${iconType}" />\n    <link rel="apple-touch-icon" href="${favicon}" />`
      );
      
      // Update og:image:type based on ogImage file extension
      let ogImageType = 'image/png';
      if (ogImage.endsWith('.svg')) {
        ogImageType = 'image/svg+xml';
      } else if (ogImage.endsWith('.webp')) {
        ogImageType = 'image/webp';
      } else if (ogImage.endsWith('.jpg') || ogImage.endsWith('.jpeg')) {
        ogImageType = 'image/jpeg';
      }
      transformedHtml = transformedHtml.replace(
        /<meta property="og:image:type"[^>]*>/g,
        `<meta property="og:image:type" content="${ogImageType}" />`
      );
      
      // Replace theme color
      transformedHtml = transformedHtml.replace(
        /<meta name="theme-color"[^>]*>/g,
        `<meta name="theme-color" content="${themeColor}" />`
      );
      
      // Replace canonical URL
      transformedHtml = transformedHtml.replace(
        /<link rel="canonical"[^>]*>/g,
        `<link rel="canonical" href="${baseUrl}/" />`
      );
      
      // Replace title
      transformedHtml = transformedHtml.replace(
        /<title>.*?<\/title>/g,
        `<title>${title}</title>`
      );
      
      // Replace meta description
      transformedHtml = transformedHtml.replace(
        /<meta name="description"[^>]*>/g,
        `<meta name="description" content="${description}" />`
      );
      
      // Replace meta keywords
      transformedHtml = transformedHtml.replace(
        /<meta name="keywords"[^>]*>/g,
        `<meta name="keywords" content="${keywords}" />`
      );
      
      // Replace Open Graph tags
      transformedHtml = transformedHtml.replace(
        /<meta property="og:url"[^>]*>/g,
        `<meta property="og:url" content="${baseUrl}/" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta property="og:title"[^>]*>/g,
        `<meta property="og:title" content="${title}" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta property="og:description"[^>]*>/g,
        `<meta property="og:description" content="${description}" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta property="og:image"[^>]*>/g,
        `<meta property="og:image" content="${ogImageUrl}" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta property="og:image:alt"[^>]*>/g,
        `<meta property="og:image:alt" content="${siteName} Logo" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta property="og:site_name"[^>]*>/g,
        `<meta property="og:site_name" content="${siteName}" />`
      );
      
      // Replace Twitter card tags
      transformedHtml = transformedHtml.replace(
        /<meta name="twitter:url"[^>]*>/g,
        `<meta name="twitter:url" content="${baseUrl}/" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta name="twitter:title"[^>]*>/g,
        `<meta name="twitter:title" content="${title}" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta name="twitter:description"[^>]*>/g,
        `<meta name="twitter:description" content="${description}" />`
      );
      transformedHtml = transformedHtml.replace(
        /<meta name="twitter:image"[^>]*>/g,
        `<meta name="twitter:image" content="${ogImageUrl}" />`
      );
      
      // Replace structured data
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": `${baseUrl}/`,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${baseUrl}/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        },
        "keywords": keywordsArray
      };
      
      transformedHtml = transformedHtml.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
        `<script type="application/ld+json">\n    ${JSON.stringify(structuredData, null, 2)}\n    </script>`
      );
      
      // Replace noscript fallback text
      transformedHtml = transformedHtml.replace(
        /<noscript>[\s\S]*?<\/noscript>/g,
        `<noscript>\n    <p>${siteName} lets you search ${tenantName} quotes and moments from videos. Enable JavaScript for full functionality.</p>\n</noscript>`
      );
      
      console.log(`[Vite] ✓ Transformed HTML for tenant: ${TENANT_ID} (${siteName})`);
      
      return transformedHtml;
    }
  };
}

export default defineConfig({
  plugins: [react(), tenantHtmlPlugin()],
  define: {
    // Inject TENANT_ID as a build-time constant accessible via import.meta.env
    'import.meta.env.VITE_TENANT_ID': JSON.stringify(TENANT_ID),
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/analytics': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    manifest: true,
    emptyOutDir: true, // Ensure dist folder is cleaned before each build
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
});
