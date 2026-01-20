import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all tenant configurations
const tenantsDir = path.join(__dirname);
let tenantConfigs = null;

function loadTenantConfigs() {
  if (tenantConfigs) return tenantConfigs;
  
  tenantConfigs = new Map();
  
  try {
    const files = fs.readdirSync(tenantsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    for (const file of jsonFiles) {
      const filePath = path.join(tenantsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(content);
      
      // Validate required fields
      if (!config.id || !config.hostnames || !Array.isArray(config.hostnames)) {
        console.warn(`Invalid tenant config in ${file}, skipping`);
        continue;
      }
      
      tenantConfigs.set(config.id, config);
      
      // Also index by hostname for quick lookup
      for (const hostname of config.hostnames) {
        if (!tenantConfigs.has(`hostname:${hostname}`)) {
          tenantConfigs.set(`hostname:${hostname}`, config);
        }
      }
    }
    
    console.log(`Loaded ${tenantConfigs.size / 2} tenant configurations`);
  } catch (error) {
    console.error('Error loading tenant configs:', error);
    // Fallback to default tenant
    const defaultConfig = {
      id: 'northernlion',
      name: 'Northernlion',
      displayName: 'NLQuotes',
      hostnames: ['localhost'],
      branding: {
        logo: '/nlquotes.svg',
        logoFallback: '/NLogo.png',
        favicon: '/nlquotes.svg',
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
        footerText: 'Made with passion by a fan'
      },
      channels: [
        { id: 'all', name: 'All Sources' },
        { id: 'librarian', name: 'Librarian' },
        { id: 'northernlion', name: 'Northernlion' }
      ],
      database: {
        envVar: 'DATABASE_URL'
      }
    };
    tenantConfigs.set('northernlion', defaultConfig);
    tenantConfigs.set('hostname:localhost', defaultConfig);
  }
  
  return tenantConfigs;
}

// Detect tenant from hostname
export function detectTenant(hostname) {
  const configs = loadTenantConfigs();
  
  // Normalize hostname (remove port, lowercase)
  const normalized = hostname?.toLowerCase().split(':')[0] || 'localhost';
  
  // Try exact match first
  const tenant = configs.get(`hostname:${normalized}`);
  if (tenant) {
    return tenant;
  }
  
  // Try wildcard match (e.g., *.example.com)
  for (const [key, config] of configs.entries()) {
    if (key.startsWith('hostname:')) {
      const configHostname = key.replace('hostname:', '');
      // Simple wildcard matching
      if (configHostname.startsWith('*.')) {
        const domain = configHostname.substring(2);
        if (normalized.endsWith(domain)) {
          return config;
        }
      }
    }
  }
  
  // Fallback to default (northernlion)
  return configs.get('northernlion') || configs.values().next().value;
}

// Get tenant by ID
export function getTenantById(tenantId) {
  const configs = loadTenantConfigs();
  return configs.get(tenantId) || configs.get('northernlion');
}

// Get all tenants (for admin purposes)
export function getAllTenants() {
  const configs = loadTenantConfigs();
  const tenants = [];
  const seen = new Set();
  
  for (const [key, config] of configs.entries()) {
    if (!key.startsWith('hostname:') && !seen.has(config.id)) {
      tenants.push(config);
      seen.add(config.id);
    }
  }
  
  return tenants;
}

// Get database connection string for tenant
export function getTenantDatabaseUrl(tenant) {
  const envVar = tenant.database?.envVar || 'DATABASE_URL';
  const dbUrl = process.env[envVar];
  
  if (!dbUrl) {
    console.warn(`Database URL not found for tenant ${tenant.id} (env var: ${envVar})`);
    // Fallback to default
    return process.env.DATABASE_URL;
  }
  
  return dbUrl;
}
