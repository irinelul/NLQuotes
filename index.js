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
import { detectTenant, getTenantById, getAllTenants } from './tenants/tenant-manager.js';
import { renderTopicHtml } from './utils/renderTopicHtml.js';
import { isBlockedTopic } from './utils/topicBlocklist.js';
import { embedQuery, rerank, RERANK_ENABLED } from './utils/embeddings.js';

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
app.set('trust proxy', 1); // We're behind Coolify's reverse proxy
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
  
  // Cache headers: long cache for hashed assets, no cache for HTML
  if (req.path.startsWith('/assets/')) {
    // Hashed filenames in /assets/ can be cached aggressively (1 year)
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.path === '/' || req.path.endsWith('.html')) {
    // NEVER cache index.html — it contains references to hashed assets
    // Stale HTML after redeployment causes MIME type errors
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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

// ======= REDUCED LOGGING =======
// Only log essential information to reduce overhead
morgan.token('method-path', (req) => `${req.method} ${req.path}`);
morgan.token('response-info', (req, res) => `${res.statusCode} - ${res.getHeader('content-length') || 0}b`);
app.use(morgan(':method-path :response-info :response-time ms', {
  skip: (req) => req.path.startsWith('/assets/')
}));

// ======= DYNAMIC SITEMAP =======
// Scans dist/topic/ directory directly so on-demand generated pages appear automatically.
app.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const hostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
  const base = `https://${hostname}`;
  const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let topicPages = [];
  try {
    const topicRoot = path.resolve(__dirname, 'dist', 'topic');
    if (fs.existsSync(topicRoot)) {
      const entries = fs.readdirSync(topicRoot);
      for (const encoded of entries) {
        const indexPath = path.join(topicRoot, encoded, 'index.html');
        if (fs.existsSync(indexPath)) {
          const mtime = fs.statSync(indexPath).mtime;
          topicPages.push({
            url: `/topic/${encoded}`,
            lastmod: mtime.toISOString().slice(0, 10),
          });
        }
      }
    }
  } catch (e) { /* no topic pages yet, that's fine */ }

  const urls = [
    { loc: `${base}/`, lastmod: today, priority: '1.0' },
    ...topicPages.map((p) => ({
      loc: `${base}${p.url}`,
      lastmod: p.lastmod,
      priority: '0.7',
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) =>
      `  <url>\n    <loc>${escXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    '\n</urlset>\n';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

// ======= STREAMLINED STATIC FILE SERVING =======
// Serve static assets from dist/, but skip index.html so the SPA fallback
// handles it (with tenant injection + proper no-cache headers)
app.use(express.static(path.resolve(__dirname, 'dist'), {
  index: false,    // Don't serve index.html for '/' — let SPA fallback handle it
  redirect: false  // Don't redirect /topic/foo to /topic/foo/ — causes redirect loops
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

// In-memory set to prevent concurrent duplicate on-demand topic generation
const topicGenerating = new Set();

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

        // Set security headers (no CSP needed for API responses)
        res.set({
            'X-Response-Time': `${totalTime}ms`,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
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


// Semantic search: embed the query and rank quotes by cosine distance on the `embedding` column.
app.get('/api/semantic', async (req, res) => {
    const tenantId = req.tenant?.id || 'unknown';
    const searchTerm = (req.query.search || '').toString();
    const selectedValue = req.query.channel || 'all';
    const year = req.query.year || '';
    const gameName = req.query.game || 'all';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

    console.log(`[Semantic] Request - tenant: ${tenantId}, term: "${searchTerm}", channel: ${selectedValue}, year: ${year}, game: ${gameName}`);

    if (!searchTerm.trim() || searchTerm.trim().length < 3) {
        return res.status(400).json({ error: 'Please enter at least 3 characters' });
    }

    if (!req.tenant) {
        return res.status(500).json({ error: 'Tenant configuration not found' });
    }

    try {
        const startTime = Date.now();
        const queryVector = await embedQuery(searchTerm.trim());
        const embedTime = Date.now() - startTime;

        let data, totalQuotes, rerankTime = null, queryTime;

        if (RERANK_ENABLED) {
            // Stage 1: pull a wider flat candidate set from pgvector.
            const CANDIDATE_LIMIT = Math.max(limit * 5, 150);
            const flat = await quoteModel.semanticSearch({
                queryVector, gameName, selectedValue, year,
                limit: CANDIDATE_LIMIT, grouped: false, tenant: req.tenant
            });
            queryTime = flat.queryTime;

            // Stage 2: rerank with a cross-encoder for precise ordering.
            const docs = flat.data.map(r => r.text || '');
            const rerankStart = Date.now();
            const ranked = docs.length
                ? await rerank(searchTerm.trim(), docs, Math.min(docs.length, limit * 3))
                : [];
            rerankTime = Date.now() - rerankStart;

            // Stage 3: group the reranked quotes by video, preserving order.
            const byVideo = new Map();
            for (const item of ranked) {
                const row = flat.data[item.index];
                if (!row) continue;
                const key = row.video_id;
                const quote = {
                    text: row.text,
                    line_number: row.line_number,
                    timestamp_start: row.timestamp_start,
                    title: row.title,
                    upload_date: row.upload_date,
                    channel_source: row.channel_source,
                    distance: row.distance,
                    rerank_score: item.relevance_score
                };
                if (!byVideo.has(key)) {
                    byVideo.set(key, {
                        video_id: row.video_id,
                        title: row.title,
                        upload_date: row.upload_date,
                        channel_source: row.channel_source,
                        best_rerank_score: item.relevance_score,
                        quotes: [quote]
                    });
                } else {
                    byVideo.get(key).quotes.push(quote);
                }
            }
            // Within each video, show quotes in chronological order so
            // adjacent moments read naturally. Video order still follows
            // the best rerank score.
            for (const v of byVideo.values()) {
                v.quotes.sort((a, b) => (a.timestamp_start || 0) - (b.timestamp_start || 0));
            }
            data = Array.from(byVideo.values()).slice(0, limit);
            totalQuotes = data.reduce((acc, v) => acc + v.quotes.length, 0);
        } else {
            const result = await quoteModel.semanticSearch({
                queryVector, gameName, selectedValue, year, limit, tenant: req.tenant
            });
            data = result.data;
            totalQuotes = result.totalQuotes;
            queryTime = result.queryTime;
        }

        const totalTime = Date.now() - startTime;

        res.set({
            'X-Response-Time': `${totalTime}ms`,
            'X-Embed-Time': `${embedTime}ms`,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        });

        res.json({
            data,
            total: data.length,
            totalQuotes,
            queryTime,
            embedTime,
            rerankTime,
            totalTime,
            reranked: RERANK_ENABLED,
            mode: 'semantic'
        });
    } catch (error) {
        console.error('[Semantic] Error:', error.message);
        const status = error.message?.includes('API_KEY') ? 500 : 500;
        res.status(status).json({
            error: 'Semantic search failed',
            details: error.message?.includes('API_KEY') || error.message?.includes('not set')
                ? 'Embedding service not configured'
                : 'An error occurred while processing your request'
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

// Strip trailing slash on /topic/ routes so /topic/cruise/ → /topic/cruise
app.use('/topic', (req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('/')) {
    return res.redirect(301, '/topic/' + req.path.slice(1, -1));
  }
  next();
});

// Serve pre-generated static topic pages if present; generate on demand otherwise.
app.get('/topic/:term', async (req, res, next) => {
  const encoded = encodeURIComponent(req.params.term);
  const staticPath = path.resolve(__dirname, 'dist', 'topic', encoded, 'index.html');

  // Serve existing file immediately
  try {
    if (fs.existsSync(staticPath)) {
      return res.sendFile(staticPath);
    }
  } catch (e) {
    console.error('Error checking static topic page:', e);
  }

  // Generate on demand
  const term = req.params.term;

  if (isBlockedTopic(term)) {
    return next(); // fall through to SPA, no static page generated
  }

  try {
    // If another request is already generating this page, wait briefly then re-check
    if (topicGenerating.has(encoded)) {
      // Poll for up to 10s (100ms intervals) before falling through to SPA
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (fs.existsSync(staticPath)) {
          return res.sendFile(staticPath);
        }
        if (!topicGenerating.has(encoded)) break;
      }
      // If still not ready, fall through to SPA
      return next();
    }

    topicGenerating.add(encoded);
    try {
      const topicData = await quoteModel.search({
        searchTerm: term,
        searchPath: 'text',
        gameName: 'all',
        selectedValue: 'all',
        year: '',
        sortOrder: 'newest',
        page: 1,
        limit: 10,
        exactPhrase: false,
        tenant: req.tenant,
      });

      if (!topicData?.totalQuotes || topicData.totalQuotes === 0) {
        // No quotes — fall through to SPA
        return next();
      }

      const hostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
      const siteBaseUrl = `https://${hostname}`;
      const html = renderTopicHtml({
        term,
        totalQuotes: topicData.totalQuotes,
        videoGroups: topicData.data || [],
        siteBaseUrl,
      });

      // Save to disk so subsequent requests are served as static files
      const outDir = path.resolve(__dirname, 'dist', 'topic', encoded);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
      console.log(`[topic] Generated on demand: /topic/${encoded}`);

      res.send(html);
    } finally {
      topicGenerating.delete(encoded);
    }
  } catch (e) {
    topicGenerating.delete(encoded);
    console.error('Error generating on-demand topic page:', e);
    next();
  }
});

// 404 handler for API routes (must come before SPA fallback)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[404] API route not found: ${req.method} ${req.path}`);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  next();
});

// SPA fallback for React Router with CSP header
// This must be LAST so it doesn't catch API routes
app.use((req, res, next) => {
  // Don't serve index.html for missing static assets (prevents MIME type errors)
  const staticExtensions = /\.(js|css|map|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|ico|json)$/i;
  if (staticExtensions.test(req.path)) {
    return res.status(404).end();
  }
  // Get tenant hostname for CSP
  const tenantHostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
  const tenantDomain = `https://${tenantHostname}`;
  
  // CSP with explicit YouTube domains (wildcards might not work in Coolify)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.nlquotes.com https://umami.nlquotes.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://www.googlevideo.com https://googlevideo.com https://www.googleapis.com https://apis.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' " + tenantDomain + " https://api.nlquotes.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://i.ytimg.com https://img.youtube.com https://www.googlevideo.com https://googlevideo.com data: blob:; " +
    "frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://umami.nlquotes.com; " +
    "connect-src 'self' https://api.nlquotes.com https://umami.nlquotes.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://www.googlevideo.com https://googlevideo.com; " +
    "media-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://www.googlevideo.com https://googlevideo.com; " +
    "object-src 'none'"
  );

  // Inject tenant config into HTML before serving
  try {
    const tenant = req.tenant || detectTenant(req.get('host') || 'localhost');
    console.log(`[HTML Injection] Tenant detected: ${tenant?.id}, has umami: ${!!tenant?.umami}`);
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
      
      // Inject Umami tracking script in <head> if configured for this tenant
      if (tenant.umami?.scriptUrl && tenant.umami?.websiteId) {
        // Validate and sanitize script URL and website ID to prevent XSS
        const scriptUrl = String(tenant.umami.scriptUrl).trim();
        const websiteId = String(tenant.umami.websiteId).trim();
        
        // Basic validation: ensure URL is https and website ID is a valid UUID format
        const isValidUrl = scriptUrl.startsWith('https://') && 
                          !scriptUrl.includes('<') && 
                          !scriptUrl.includes('>') && 
                          !scriptUrl.includes('"') && 
                          !scriptUrl.includes("'");
        const isValidWebsiteId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId);
        
        if (isValidUrl && isValidWebsiteId) {
          // Escape any special characters in URL and ID (extra safety)
          const safeScriptUrl = scriptUrl.replace(/"/g, '&quot;');
          const safeWebsiteId = websiteId.replace(/"/g, '&quot;');
          const umamiScript = `<script defer src="${safeScriptUrl}" data-website-id="${safeWebsiteId}"></script>`;
          // Insert after charset meta tag in head (handle both dev and production formats)
          // Try multiple patterns to match different HTML formats
          if (html.includes('<meta charset="UTF-8" />')) {
            html = html.replace(
              /(<meta charset="UTF-8" \/>)/,
              `$1\n    ${umamiScript}`
            );
          } else if (html.includes('<meta charset="UTF-8">')) {
            html = html.replace(
              /(<meta charset="UTF-8">)/,
              `$1\n    ${umamiScript}`
            );
          } else {
            // Fallback: insert after first <head> tag
            html = html.replace(
              /(<head[^>]*>)/i,
              `$1\n    ${umamiScript}`
            );
          }
          console.log(`[Umami] Injected script for tenant ${tenant.id}`);
        } else {
          console.warn(`[Umami] Invalid scriptUrl or websiteId for tenant ${tenant.id}, skipping injection`);
        }
      }
      
      // Inject tenant config as a script tag before the main script
      const tenantScript = `<script>window.__TENANT_CONFIG__ = ${JSON.stringify(tenantConfig)};</script>`;
      
      // Insert before the main script tag (handle both dev and production builds)
      // Production: <script type="module" crossorigin src="/assets/index-*.js"></script>
      // Dev: <script type="module" src="/src/main.jsx"></script>
      const productionScriptPattern = /<script type="module"[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/;
      const devScriptPattern = /<script type="module" src="\/src\/main\.jsx"><\/script>/;
      
      if (productionScriptPattern.test(html)) {
        // Production build - inject before the first module script
        html = html.replace(
          productionScriptPattern,
          `${tenantScript}\n$&`
        );
      } else if (devScriptPattern.test(html)) {
        // Dev build
        html = html.replace(
          devScriptPattern,
          `${tenantScript}\n$&`
        );
      } else {
        // Fallback: inject before closing </head> tag
        html = html.replace(
          /<\/head>/i,
          `    ${tenantScript}\n</head>`
        );
      }
      
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
      
      // Never cache index.html — stale HTML causes MIME type errors after redeployment
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    } else {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(indexPath);
    }
  } catch (error) {
    console.error('Error injecting tenant config:', error);
    // Fallback to normal file serving
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  }
});

// Global error handler — must be last, after all routes
app.use((err, req, res, next) => {
    console.error('Unhandled application error:', err.stack);

    if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Malformatted id' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }

    const isDbConnectionError =
        err.message && (
            err.message.includes('database') ||
            err.message.includes('connection') ||
            err.message.includes('PostgreSQL')
        );

    if (isDbConnectionError) {
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

// Create server with optimized settings
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('=================================');
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- /api (search)');
    console.log('- /api/random (random quotes)');
    console.log('- /api/games (game list)');
    console.log('- /api/flag (flag quotes)');
    console.log('- /api/topic/:term (topic quotes)');
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
