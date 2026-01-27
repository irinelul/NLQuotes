/**
 * Build-time tenant configuration
 * This module determines the tenant at build time based on TENANT_ID env variable
 * and hard-binds all tenant-specific assets and configuration.
 * 
 * This prevents flickering and ensures assets are resolved before render.
 */

// Read tenant ID from environment variable (set at build time)
// Vite injects VITE_TENANT_ID via define in vite.config.js
const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'northernlion';

// Import tenant configs
import northernlionConfig from '../../tenants/northernlion.json';
import hivemindConfig from '../../tenants/hivemind.json';
import jrequotesConfig from '../../tenants/jrequotes.json';

// Map tenant IDs to their configs
const tenantConfigs = {
  northernlion: northernlionConfig,
  hivemind: hivemindConfig,
  jrequotes: jrequotesConfig,
};

// Get the current tenant config (resolved at build time)
const tenantConfig = tenantConfigs[TENANT_ID] || tenantConfigs.northernlion;

// Hard-bind tenant-specific assets at import time
// Logo assets
let logo, logoFallback, favicon;

if (TENANT_ID === 'hivemind') {
  // Import hivemind assets
  logo = '/hivemind/hivemind.jpg';
  logoFallback = '/hivemind/hivemind.jpg';
  favicon = '/hivemind/hivemind.jpg';
} else if (TENANT_ID === 'jrequotes') {
  // Import jrequotes assets
  logo = '/jrequotes/jre.webp';
  logoFallback = '/jrequotes/jre.webp';
  favicon = '/jrequotes/jre.webp';
} else {
  // Import northernlion assets (default)
  logo = '/nlquotes/nlquotes.svg';
  logoFallback = '/nlquotes/NLogo.png';
  favicon = '/nlquotes/nlquotes.svg';
}

// Export tenant config and hard-bound assets
export const TENANT = {
  id: tenantConfig.id,
  name: tenantConfig.name,
  displayName: tenantConfig.displayName,
  hostnames: tenantConfig.hostnames,
  branding: {
    ...tenantConfig.branding,
    logo,
    logoFallback,
    favicon,
  },
  metadata: tenantConfig.metadata,
  texts: tenantConfig.texts,
  channels: tenantConfig.channels,
  grafana: tenantConfig.grafana,
  gameFilter: tenantConfig.gameFilter,
};

// Export convenience flags
export const IS_NORTHERNLION = TENANT_ID === 'northernlion';
export const IS_HIVEMIND = TENANT_ID === 'hivemind';
export const IS_JREQUOTES = TENANT_ID === 'jrequotes';

// Export hard-bound assets
export { logo, logoFallback, favicon };

// Export tenant ID for reference
export { TENANT_ID };
