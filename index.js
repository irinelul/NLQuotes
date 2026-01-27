import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quoteModel from './models/postgres.js';
import axios from 'axios';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import path from 'path';
import { fileURLToPath } from 'url';
import analyticsModel from './models/analytics.js';
import { detectTenant, getTenantById, getAllTenants } from './tenants/tenant-manager.js';

// Load environment variables
dotenv.config();

// Validate required environment variables (at least default DATABASE_URL)
// Note: Per-tenant database URLs are optional and will fall back to DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('ERROR: Missing required environment variable: DATABASE_URL');
  console.error('Please create a .env file with DATABASE_URL.');
  process.exit(1);
}

// Check database URL format
const dbUrlPattern = /^postgres(ql)?:\/\/.+:.+@.+:\d+\/.+$/i;
if (!dbUrlPattern.test(process.env.DATABASE_URL)) {
  console.warn('WARNING: DATABASE_URL may be incorrectly formatted.');
  console.warn('Expected format: postgres://username:password@hostname:port/database');
  console.warn(`Got: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);
}

const app = express();
// Get port from env var, or try to detect from tenant config
let PORT = process.env.PORT;
if (!PORT) {
  // Try to get port from tenant config if TENANT_ID is set
  const forcedTenantId = process.env.TENANT_ID;
  if (forcedTenantId) {
    try {
      const tenant = getTenantById(forcedTenantId);
      PORT = tenant?.port || 8080;
      console.log(`Using port ${PORT} from tenant config for ${forcedTenantId}`);
    } catch (e) {
      PORT = 8080;
    }
  } else {
    PORT = 8080;
  }
}
PORT = parseInt(PORT) || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======= TENANT DETECTION MIDDLEWARE =======
// Detect tenant from hostname and attach to request
app.use((req, res, next) => {
  const hostname = req.get('host') || req.hostname || 'localhost';
  const forcedTenantId = process.env.TENANT_ID || req.get('x-tenant-id') || req.query?.tenant;

  if (forcedTenantId) {
    req.tenant = getTenantById(forcedTenantId);
    console.log(`[Tenant] Forced tenant: ${forcedTenantId} -> ${req.tenant?.id}`);
  } else {
    // Try to detect tenant by port first
    // Priority: 1) Port from hostname, 2) Port from socket, 3) Server's PORT env var
    let detectedTenant = null;
    let port = null;
    
    // Extract port from hostname (e.g., "localhost:3002")
    if (hostname.includes(':')) {
      port = parseInt(hostname.split(':')[1]);
    } else if (req.socket && req.socket.localPort) {
      // Get port from the socket (the port the server is listening on)
      port = req.socket.localPort;
    } else {
      // Fallback to the server's PORT (from env var or tenant config)
      port = PORT;
    }
    
    // If we have a port, try to match it to a tenant
    if (port) {
      const allTenants = getAllTenants();
      for (const tenant of allTenants) {
        if (tenant.port === port) {
          detectedTenant = tenant;
          console.log(`[Tenant] Detected from port ${port}: ${tenant.id} (hostname: ${hostname})`);
          break;
        }
      }
    }
    
    // Fall back to hostname-based detection
    if (!detectedTenant) {
      detectedTenant = detectTenant(hostname);
      console.log(`[Tenant] Detected from hostname "${hostname}": ${detectedTenant?.id} (server port: ${PORT})`);
    }
    
    req.tenant = detectedTenant;
  }
  next();
});

// ======= OPTIMIZED CONNECTION HANDLING =======
// Configure connection and security in a single middleware to prevent conflicts
app.use((req, res, next) => {
  // Set connection and security headers in one place
  res.set({
    // Connection optimization
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=60', // Reduced from 120s to 60s
    
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  });
  
  // Only add HSTS in production environments
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Conditionally set cache headers for static assets
  if (req.path.startsWith('/assets/') || req.path.includes('.')) {
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours for static assets
  }
  
  next();
});

// ======= RATE LIMITING WITH OPTIMIZED SETTINGS =======
// Apply rate limiting with more reasonable limits
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes (reduced from 15)
  max: 200, // Increased from 100 to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later',
  skip: (req) => req.path === '/' || req.path.startsWith('/assets/')
});

// Apply speed limiting only to the most sensitive endpoints
const speedLimiter = slowDown({
  windowMs: 5 * 60 * 1000, // 5 minutes
  delayAfter: 50, // Increased from 30
  delayMs: (hits) => Math.min(500, hits * 50), // Cap delay at 500ms
  skip: (req) => {
    return req.path === '/' || 
           req.path.startsWith('/assets/') || 
           req.method === 'GET' && !req.path.includes('/api');
  }
});

// Apply rate limiting and speed limiting more selectively
app.use('/api', apiLimiter);
app.use('/api/flag', speedLimiter); // Only apply speed limiting to sensitive endpoints

// ======= OPTIMIZED CORS =======
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'If-None-Match'],
  maxAge: 86400 // 24 hours in seconds
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '250kb' })); // Limit payload size

// ======= STREAMLINED STATIC FILE SERVING =======
app.use(express.static(path.resolve(__dirname, 'dist')));

// ======= REDUCED LOGGING =======
// Only log essential information to reduce overhead
morgan.token('method-path', (req) => `${req.method} ${req.path}`);
morgan.token('response-info', (req, res) => `${res.statusCode} - ${res.getHeader('content-length') || 0}b`);
app.use(morgan(':method-path :response-info :response-time ms', {
  skip: (req) => req.path.startsWith('/assets/')
}));

// ======= SECURITY FILTER =======
// Block suspicious requests without heavy processing
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const requestPath = req.path || '';
  
  // Simplified pattern matching for better performance
  if (
    /sqlmap|nikto|nmap|acunetix|burpsuite|ZAP/i.test(userAgent) ||
    /wp-|xmlrpc|admin|\.php|\.asp/i.test(requestPath)
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Prevent HTTP parameter pollution more efficiently
  if (req.query) {
    for (const key in req.query) {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][0];
      }
    }
  }
  
  next();
});

// Add console logs at the start of the file to check routes loading

// Cache for game titles per tenant
const cachedGameLists = new Map();

function getDefaultTenant() {
    const forcedTenantId = process.env.TENANT_ID;
    return forcedTenantId ? getTenantById(forcedTenantId) : detectTenant('localhost');
}

// Load game titles into cache on startup (per tenant)
async function loadGameTitles(tenant) {
    try {
        const result = await quoteModel.getGameList(tenant);
        cachedGameLists.set(tenant.id, result);
        console.log(`Loaded ${result.length} game titles into cache for tenant ${tenant.id}`);
    } catch (error) {
        console.error(`Error loading game titles into cache for tenant ${tenant.id}:`, error);
        cachedGameLists.set(tenant.id, []); // Initialize as empty array if query fails
    }
}

// Load game titles for default tenant immediately
const defaultTenant = getDefaultTenant();
loadGameTitles(defaultTenant).then(() => {
    console.log('Game titles cache initialized for default tenant');
}).catch(err => {
    console.error('Failed to initialize game titles cache:', err);
});

// Tenant config endpoint - serves tenant configuration to frontend
app.get('/api/tenant', (req, res) => {
  try {
    const tenant = req.tenant || detectTenant(req.get('host') || 'localhost');
    
    console.log(`[Tenant API] Serving config for tenant: ${tenant?.id} (hostname: ${req.get('host')})`);
    
    // Return sanitized tenant config (no database URLs or port)
    const config = {
      id: tenant.id,
      name: tenant.name,
      displayName: tenant.displayName,
      branding: tenant.branding,
      metadata: tenant.metadata,
      texts: tenant.texts,
      channels: tenant.channels,
      hostnames: tenant.hostnames,
      grafana: tenant.grafana,
      gameFilter: tenant.gameFilter
    };
    
    // Set cache-busting headers - don't cache tenant config
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff'
    });
    
    res.json(config);
  } catch (error) {
    console.error('Error serving tenant config:', error);
    res.status(500).json({ error: 'Failed to load tenant configuration' });
  }
});

app.get('/api', async (req, res) => {
    // Log search request details for debugging - THIS SHOULD ALWAYS APPEAR
    console.log('=== SEARCH ENDPOINT HIT ===');
    const tenantId = req.tenant?.id || 'unknown';
    const hostname = req.get('host') || 'unknown';
    console.log(`[Search] Request received - Tenant: ${tenantId}, Hostname: ${hostname}`);
    
    // Input validation and sanitization
    let searchTerm = req.query.search || '';
    let selectedValue = req.query.channel || 'all';
    let year = req.query.year || '';
    let sortOrder = req.query.sort || 'default';
    let page = parseInt(req.query.page) || 1;
    let exactPhrase = req.query.strict === 'true';
    let gameName = req.query.game || 'all';

    console.log(`[Search] Parameters - term: "${searchTerm}", channel: ${selectedValue}, year: ${year}, sort: ${sortOrder}, page: ${page}, game: ${gameName}, tenant: ${tenantId}`);

    if (req.query.gameName) {
        try {
            // Decode and basic sanitization
            const decodedGame = decodeURIComponent(req.query.gameName)
                .replace(/['";]/g, '') // Remove quotes and semicolons
                .replace(/\+/g, ' ')
                .trim();
            
            if (decodedGame && decodedGame !== 'all') {
                // For additional security, you could validate against your known game list
                gameName = decodedGame;
            }
        } catch (e) {
            console.error("Error decoding game name:", e);
            gameName = "all";
        }
    }
    
    // Always search in text, not title
    const searchPath = "text";

    try {
        // Validate tenant is available
        if (!req.tenant) {
            console.error(`[Search] ERROR: No tenant detected for hostname: ${hostname}`);
            return res.status(500).json({ 
                error: 'Search failed',
                details: 'Tenant configuration not found'
            });
        }
        
        const startTime = Date.now();
        console.log(`[Search] Executing search query for tenant: ${tenantId}`);
        const result = await quoteModel.search({
            searchTerm,
            searchPath,
            gameName,
            selectedValue,
            year,
            sortOrder,
            page,
            exactPhrase,
            tenant: req.tenant
        });
        const totalTime = Date.now() - startTime;
        console.log(`[Search] Query completed - Tenant: ${tenantId}, Results: ${result.data?.length || 0}, Total: ${result.total || 0}, Time: ${totalTime}ms`);

        // Set security headers
        res.set({
            'X-Response-Time': `${totalTime}ms`,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none'",
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        });

        res.json({
            data: result.data,
            total: result.total,
            totalQuotes: result.totalQuotes,
            queryTime: result.queryTime,
            totalTime: totalTime
        });
    } catch (error) {
        console.error('Search error:', error);
        console.error('Search parameters:', {
            searchTerm,
            selectedValue,
            year,
            sortOrder,
            gameName,
            searchPath
        });
        res.status(500).json({ 
            error: 'Search failed',
            details: 'An error occurred while processing your request' // Don't expose actual error details
        });
    }
});


// Add new endpoint for flagging quotes
app.post('/api/flag', async (req, res) => {
    try {
        // Validate and sanitize input
        const sanitizeInput = (input) => {
            if (!input) return "N/A";
            // Basic sanitization - remove potential script tags and other harmful content
            return input.toString()
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/['";`]/g, '') // Remove quotes and backticks
                .slice(0, 1000); // Limit length
        };
        
        // Extract and sanitize fields
        const quote = sanitizeInput(req.body.quote);
        const searchTerm = sanitizeInput(req.body.searchTerm);
        const timestamp = req.body.timestamp ? parseFloat(req.body.timestamp) : null;
        
        // Validate videoId format (YouTube IDs are 11 chars)
        const videoId = /^[a-zA-Z0-9_-]{11}$/.test(req.body.videoId) ? 
                        req.body.videoId : "invalid";
        
        const title = sanitizeInput(req.body.title);
        const channel = sanitizeInput(req.body.channel);
        const reason = sanitizeInput(req.body.reason);
        const email = req.body.email ? sanitizeInput(req.body.email) : null;
        
        // Check for spam or abuse patterns
        const hasSuspiciousContent = (input) => {
            const spamPatterns = [
                /\b(viagra|cialis|casino|porn|sex|xxx)\b/i,
                /\b(click here|free money|you won|lottery)\b/i,
                /(https?:\/\/|www\.)/i // Links are often spam
            ];
            
            return spamPatterns.some(pattern => pattern.test(input));
        };
        
        if (hasSuspiciousContent(reason) || hasSuspiciousContent(quote)) {
            return res.status(400).json({ error: 'Potential spam detected' });
        }
        
        // Create Discord webhook message
        const webhookMessage = {
            embeds: [{
                title: "🚩 Quote Flagged",
                color: 15158332, // Red color
                fields: [
                    {
                        name: "Search Term",
                        value: searchTerm,
                        inline: true
                    },
                    {
                        name: "Channel",
                        value: channel,
                        inline: true
                    },
                    {
                        name: "Video Title",
                        value: title,
                        inline: true
                    },
                    {
                        name: "Quote",
                        value: quote,
                        inline: false
                    },
                    {
                        name: "Timestamp",
                        value: timestamp ? `[${timestamp}](https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp) - 1})` : "N/A",
                        inline: true
                    },
                    {
                        name: "Feedback",
                        value: reason ? `\`\`\`${reason}\`\`\`` : "No feedback provided",
                        inline: false
                    },
                    ...(email ? [{
                        name: "Email",
                        value: email,
                        inline: true
                    }] : [])
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "Quote Flagging System"
                }
            }]
        };

        // Send to Discord webhook
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            console.error('DISCORD_WEBHOOK_URL environment variable is not set');
            return res.status(500).json({ 
                error: 'Discord webhook URL not configured. Please set DISCORD_WEBHOOK_URL environment variable.' 
            });
        }

        try {
            await axios.post(webhookUrl, webhookMessage);
        } catch (discordError) {
            console.error('Error sending to Discord webhook:', discordError.message);
            return res.status(500).json({ 
                error: `Failed to send to Discord: ${discordError.message}` 
            });
        }
        
        // Set security headers
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store'
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error flagging quote:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to flag quote' 
        });
    }
});

app.get('/api/random', async (req, res) => {
    try {
        const result = await quoteModel.getRandom(req.tenant);
        res.json({ quotes: result });
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        res.status(500).json({ error: 'Failed to fetch random quotes' });
    }
});

app.get('/api/games', (req, res) => {
    try {
        const tenant = req.tenant || detectTenant(req.get('host') || 'localhost');
        let cachedGameList = cachedGameLists.get(tenant.id);
        
        // Load if not cached
        if (!cachedGameList) {
            cachedGameList = [];
            loadGameTitles(tenant);
        }
        
        // Set cache headers - cache for 1 hour on client side
        res.set({
            'Cache-Control': 'public, max-age=3600',
            'ETag': `"${cachedGameList.length}"` // Simple ETag based on number of games
        });
        
        res.json({ games: cachedGameList });
    } catch (error) {
        console.error('Error serving game titles:', error);
        res.status(500).json({ error: 'Failed to fetch game titles' });
    }
});

// Health check endpoint for monitoring and diagnostics
app.get('/health', async (req, res) => {
    const health = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        status: 'UP'
    };
    
    try {
        // Check database connectivity (for default tenant)
        const defaultTenant = getDefaultTenant();
        const dbHealthy = await quoteModel.checkHealth(defaultTenant);
        health.database = dbHealthy ? 'connected' : 'disconnected';
        
        if (!dbHealthy) {
            health.status = 'DEGRADED';
            return res.status(200).json(health);
        }
        
        res.json(health);
    } catch {
        health.status = 'DOWN';
        health.error = 'Service unavailable';
        health.database = 'error';
        res.status(500).json(health);
    }
});

// Database status endpoint - for monitoring in beta version
app.get('/api/db-status', async (req, res) => {
  console.log('Database status check requested from: ' + req.ip);
  console.log('Request URL path: ' + req.path);
  console.log('Full request URL: ' + req.originalUrl);
  console.log('Request headers:', req.headers);
  
  try {
    console.log('Attempting to check database health...');
    const healthStatus = await quoteModel.checkHealth();
    console.log('Database health check complete:', healthStatus.healthy ? 'HEALTHY' : 'UNHEALTHY');
    
    const response = {
      status: healthStatus.healthy ? 'connected' : 'error',
      message: healthStatus.healthy 
        ? `Connected to PostgreSQL (${healthStatus.responseTime} response time)` 
        : `Error connecting to PostgreSQL: ${healthStatus.error}`,
      details: healthStatus,
      timestamp: new Date().toISOString()
    };
    
    console.log('Sending DB status response:', response.status);
    res.json(response);
  } catch (error) {
    console.error('Error checking database status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check database status: ' + error.message,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Add a test endpoint that's simpler to check if Express routing is working correctly
app.get('/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ status: 'ok', message: 'Test endpoint working' });
});

// Add a global error handler with connection error recovery
app.use((err, req, res, next) => {
    console.error('Unhandled application error:', err.stack);
    
    // Check if it's a database connection error
    const isDbConnectionError = 
        err.message && (
            err.message.includes('database') || 
            err.message.includes('connection') || 
            err.message.includes('PostgreSQL')
        );
    
    if (isDbConnectionError) {
        // Try to reconnect immediately
        setTimeout(async () => {
            try {
                const defaultTenant = getDefaultTenant();
                await quoteModel.checkHealth(defaultTenant);
                console.log('Database reconnection successful after error');
            } catch (e) {
                console.error('Failed to reconnect to database:', e.message);
            }
        }, 1000);
    }
    
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
            ? 'Something went wrong' 
            : err.message
    });
});

const errorHandler = (error, req, res, next) => {
    console.error(error.message);
    if (error.name === 'CastError') {
        return res.status(400).send({ error: 'malformatted id' });
    } else if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
};

app.use(errorHandler);

// Add NLDLE game endpoint
app.get('/api/nldle', async (req, res) => {
  console.log('NLDLE endpoint hit');
  try {
    const currentDate = new Date();
    console.log('Fetching game for date:', currentDate);
    const gameData = await quoteModel.getNLDLEGame(currentDate, req.tenant);
    console.log('Game data:', gameData);
    
    if (!gameData) {
      console.log('No game data found for date:', currentDate);
      return res.status(404).json({ error: 'No game data available for today' });
    }
    
    res.json({ 
      game_data: gameData,
      game_date: currentDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error in NLDLE endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch game data' });
  }
});

// Popular searches endpoint - DISABLED
// app.get('/api/popular-searches', async (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit) || 20;
//     const timeRange = req.query.timeRange || '7d';
//     const domain = req.query.domain || undefined;
//     const year = req.query.year ? parseInt(req.query.year) : undefined;

//     const result = await analyticsModel.getPopularSearchTerms({
//       limit,
//       timeRange,
//       domain,
//       year
//     });
    
//     res.json({ 
//       terms: result,
//       total: result.length,
//       timeRange,
//       domain,
//       year
//     });
//   } catch (error) {
//     console.error('Error fetching popular searches:', error);
//     res.status(500).json({ error: 'Failed to fetch popular searches' });
//   }
// });

// Topic quotes endpoint
app.get('/api/topic/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!term || term.trim().length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }
    
    const result = await quoteModel.search({
      searchTerm: term,
      searchPath: 'text',
      gameName: 'all',
      selectedValue: 'all',
      year: '',
      sortOrder: 'default',
      page,
      limit,
      exactPhrase: false,
      tenant: req.tenant
    });
    
    const totalPages = Math.max(1, Math.ceil((result.total || 0) / limit));
    res.json({
      data: result.data,
      total: result.total,
      totalPages,
      totalQuotes: result.totalQuotes,
      limit,
      page,
      searchTerm: term
    });
  } catch (error) {
    console.error('Error fetching topic quotes:', error);
    res.status(500).json({ error: 'Failed to fetch topic quotes' });
  }
});

// Serve pre-generated static topic pages if present (lets Google crawl real HTML at /topic/:term)
app.get('/topic/:term', (req, res, next) => {
  try {
    const encoded = encodeURIComponent(req.params.term);
    const staticPath = path.resolve(__dirname, 'dist', 'topic', encoded, 'index.html');
    if (fs.existsSync(staticPath)) {
      return res.sendFile(staticPath);
    }
  } catch (e) {
    console.error('Error serving static topic page:', e);
  }
  next();
});

// --- Analytics endpoint ---
// IMPORTANT: This must be registered BEFORE the SPA fallback route
app.post('/analytics', async (req, res) => {
    try {
      console.log('POST /analytics hit');
      console.log('Request body:', JSON.stringify(req.body, null, 2));

      // Check if user has opted out of analytics
      if (req.body.analytics_opted_out === true) {
        console.log('Analytics skipped - user has opted out');
        return res.status(204).end();
      }

      // Check database connection first
      console.log('Checking analytics database connection...');
      const isConnected = await analyticsModel.checkConnection();
      if (!isConnected) {
        console.error('Analytics database connection failed');
        return res.status(500).json({ error: 'Database connection failed' });
      }
      console.log('Analytics database connection successful');

      // Validate request body
      if (!req.body || typeof req.body !== 'object') {
        console.error('Invalid request body:', req.body);
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // Validate required field
      if (!req.body.type) {
        console.error('Missing required field: type');
        return res.status(400).json({ error: 'Missing required field: type' });
      }

      // Store the analytics event
      console.log('Attempting to store analytics event of type:', req.body.type);
      const result = await analyticsModel.storeEvent(req.body);
      console.log('Analytics event stored successfully with id:', result?.id);
      res.status(204).end();
    } catch (error) {
      console.error('Error in analytics endpoint:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ 
        error: 'Failed to store analytics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

// SPA fallback for React Router with CSP header
// This must be LAST so it doesn't catch API routes
app.use((req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://api.nlquotes.com https://www.youtube.com https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' https://nlquotes.com https://api.nlquotes.com https://img.youtube.com https://www.youtube.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com data:; " +
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://stats.nlquotes.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com; " +
    "connect-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net; " +
    "object-src 'none'"
  );

  // Inject tenant config into HTML before serving
  try {
    const tenant = req.tenant || detectTenant(req.get('host') || 'localhost');
    const indexPath = path.resolve(__dirname, 'dist', 'index.html');
    
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf8');
      
      // Create sanitized tenant config (no database URLs)
      const tenantConfig = {
        id: tenant.id,
        name: tenant.name,
        displayName: tenant.displayName,
        branding: tenant.branding,
        metadata: tenant.metadata,
        texts: tenant.texts,
        channels: tenant.channels,
        hostnames: tenant.hostnames,
        grafana: tenant.grafana,
        gameFilter: tenant.gameFilter
      };
      
      // Inject tenant config as a script tag before the main script
      const tenantScript = `<script>window.__TENANT_CONFIG__ = ${JSON.stringify(tenantConfig)};</script>`;
      
      // Insert before the main script tag
      html = html.replace(
        '<script type="module" src="/src/main.jsx"></script>',
        `${tenantScript}\n<script type="module" src="/src/main.jsx"></script>`
      );
      
      // Also update meta tags in HTML if tenant is not northernlion
      if (tenant.id !== 'northernlion' && tenant.metadata) {
        // Update title
        html = html.replace(
          /<title>.*?<\/title>/,
          `<title>${tenant.metadata.title || 'HiveQuotes'}</title>`
        );
        
        // Update description
        html = html.replace(
          /<meta name="description" content="[^"]*"\/>/,
          `<meta name="description" content="${(tenant.metadata.description || '').replace(/"/g, '&quot;')}" />`
        );
        
        // Update favicon if different
        if (tenant.branding?.favicon) {
          html = html.replace(
            /<link rel="icon"[^>]*>/g,
            `<link rel="icon" href="${tenant.branding.favicon}" type="image/png" />`
          );
        }
      }
      
      res.send(html);
    } else {
      res.sendFile(indexPath);
    }
  } catch (error) {
    console.error('Error injecting tenant config:', error);
    // Fallback to normal file serving
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  }
});


// Create server with optimized settings
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('=================================');
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- /api (search)');
    console.log('- /api/random (random quotes)');
    console.log('- /api/games (game list)');
    console.log('- /api/flag (flag quotes)');
    console.log('- /api/nldle (NLDLE game)');
    console.log('- /api/topic/:term (topic quotes)');
    console.log('- /analytics (POST - analytics tracking)');
    console.log('- /health (health check)');
    console.log('=================================');
});

// Add error handling for server startup
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please try a different port or kill the process using this port.`);
    } else {
        console.error('Server error:', error);
    }
    process.exit(1);
});

// Configure server timeouts
server.keepAliveTimeout = 120000; // 120 seconds - longer than browsers typically use
server.headersTimeout = 125000; // 125 seconds - slightly longer than keepAliveTimeout
server.timeout = 300000; // 5 minutes for long-running requests

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
});
