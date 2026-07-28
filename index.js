import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quoteModel from './models/postgres.js';
import { logSearchEvent, logClientEvent, getRemovedTopicTerms } from './models/analytics.js';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import querystring from 'node:querystring';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectTenant, getTenantById, getAllTenants } from './tenants/tenant-manager.js';
import { renderTopicHtml } from './utils/renderTopicHtml.js';
import { renderRemovedTopicHtml } from './utils/renderGoneHtml.js';
import { renderVideoHtml } from './utils/renderVideoHtml.js';
import { renderVideosHubHtml } from './utils/renderVideosHubHtml.js';
import { isBlockedTopic } from './utils/topicBlocklist.js';
import { isAllowlistedTopic, allowlistedTopics } from './utils/topicAllowlist.js';
import { normalizeTopicTerm, topicPath } from './utils/topicUrl.js';
import { buildUrlset, buildSitemapIndex, chunk } from './utils/sitemap.js';

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

// Express 5 re-parses req.query on every property access, so mutating the
// returned object downstream is a no-op. Flatten repeated params here in the
// parser itself (?search=a&search=b -> 'a') — the only place that sticks —
// so handlers never see arrays where they expect strings.
app.set('query parser', (str) => {
  const parsed = querystring.parse(str);
  for (const key of Object.keys(parsed)) {
    if (Array.isArray(parsed[key])) parsed[key] = parsed[key][0];
  }
  return parsed;
});
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
    } catch {
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
    // Connection optimization (matches server.keepAliveTimeout below)
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=120',
    
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
  } else if (/^\/(nlquotes|hivemind|jrequotes|vinesauce|lttquotes)\//.test(req.path)) {
    // Tenant branding/logo folders are unhashed public assets (not under
    // /assets/): cache briefly but always revalidate so a branding change
    // (e.g. a new logo upload) propagates within an hour. NOT immutable —
    // these files are not content-hashed, unlike /assets/*.
    res.set('Cache-Control', 'public, max-age=3600, must-revalidate');
  }
  
  next();
});

// ======= RATE LIMITING =======
// Mounted at '/api', so req.path inside the limiter is relative to the mount
// point ('/' here IS the search endpoint). No skip conditions: the old ones
// were written for global mounting and silently exempted the search endpoint
// (req.path === '/') — the heaviest endpoint ran with no limit at all.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  // Sent as the JSON body of 429 responses; the frontend shows its own
  // rate-limit message, this is for anyone hitting the API directly.
  message: {
    error: 'Too many requests',
    message: "You've hit the per-minute request limit. Wait a few seconds and try again."
  }
});

// Slow down bursts to the flag endpoint (feeds a Discord webhook).
const speedLimiter = slowDown({
  windowMs: 5 * 60 * 1000, // 5 minutes
  delayAfter: 50,
  delayMs: (hits) => Math.min(500, hits * 50) // Cap delay at 500ms
});

app.use('/api', apiLimiter);
app.use('/api/flag', speedLimiter);

// ======= OPTIMIZED CORS =======
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'If-None-Match', 'X-NLQ-Opt-Out'],
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
// /sitemap.xml is a sitemap index; the actual URLs live in chunked children.
// See utils/sitemap.js for why there is no <priority> and why <lastmod> is
// omitted rather than invented.
const SITEMAP_CACHE_MS = 6 * 60 * 60 * 1000;

// Videos are rolled out deliberately rather than all at once. Only the videos in
// this set get index,follow, a sitemap entry, and a link from the /videos hub;
// everything else still renders for humans but is noindex. Raising the limit is
// how we scale up once Search Console shows the first batch earning impressions
// — not just getting indexed, since ~7,000 indexed topic pages earned ~26 clicks
// across 28 days.
const VIDEO_MIN_QUOTES = 20;   // 23,308 of 23,595 videos clear this
const VIDEO_INDEX_LIMIT = parseInt(process.env.VIDEO_INDEX_LIMIT || '250', 10);
const VIDEOS_PER_HUB_PAGE = 50;

const videoIndexCache = new Map(); // tenantId -> { at, value }

async function getIndexableVideos(tenant) {
  const tenantId = tenant?.id || 'default';
  const cached = videoIndexCache.get(tenantId);
  if (cached && Date.now() - cached.at < SITEMAP_CACHE_MS) return cached.value;

  const list = await quoteModel.listVideosForIndex(
    { minQuotes: VIDEO_MIN_QUOTES, limit: VIDEO_INDEX_LIMIT },
    tenant
  );
  const value = { list, ids: new Set(list.map((v) => v.videoId)) };
  videoIndexCache.set(tenantId, { at: Date.now(), value });
  return value;
}

// Newest upload in the corpus — an honest lastmod for the homepage and hub,
// since what changes about those pages is the underlying set of videos.
const corpusDateCache = new Map();
async function getCorpusLastModified(tenant) {
  const tenantId = tenant?.id || 'default';
  const cached = corpusDateCache.get(tenantId);
  if (cached && Date.now() - cached.at < SITEMAP_CACHE_MS) return cached.value;
  const value = await quoteModel.getLatestUploadDate(tenant);
  corpusDateCache.set(tenantId, { at: Date.now(), value });
  return value;
}

function sitemapBase(req) {
  return `https://${req.tenant?.hostnames?.[0] || 'nlquotes.com'}`;
}

function sendXml(res, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
}

// Sitemap index. Only lists children that actually have URLs, so an empty topic
// allowlist doesn't advertise an empty sitemap.
//
// /sitemap-removed.xml is deliberately NOT listed here: it exists to speed up
// de-indexing of the pruned topic pages, and listing 410s alongside live URLs
// would fill the Search Console sitemap report with errors. Submit it by hand,
// then delete it once the old pages have dropped out.
app.get('/sitemap.xml', async (req, res) => {
  const base = sitemapBase(req);
  const children = [];

  try {
    const corpusDate = await getCorpusLastModified(req.tenant);
    children.push({ loc: `${base}/sitemap-core.xml`, lastmod: corpusDate });

    if (allowlistedTopics().length > 0) {
      children.push({ loc: `${base}/sitemap-topics.xml` });
    }

    const { list } = await getIndexableVideos(req.tenant);
    const videoChunks = chunk(list);
    videoChunks.forEach((_, i) => {
      children.push({ loc: `${base}/sitemap-videos-${i + 1}.xml`, lastmod: corpusDate });
    });
  } catch (e) {
    console.error('Error building sitemap index:', e.message);
  }

  sendXml(res, buildSitemapIndex(children));
});

app.get('/sitemap-core.xml', async (req, res) => {
  const base = sitemapBase(req);
  let corpusDate = null;
  try {
    corpusDate = await getCorpusLastModified(req.tenant);
  } catch (e) {
    console.error('Error reading corpus date:', e.message);
  }

  // /privacy and /changelog carry no lastmod — we genuinely don't track when
  // they last changed, and a made-up date is worse than none.
  sendXml(res, buildUrlset([
    { loc: `${base}/`, lastmod: corpusDate },
    { loc: `${base}/videos`, lastmod: corpusDate },
    { loc: `${base}/changelog` },
    { loc: `${base}/privacy` },
  ]));
});

app.get('/sitemap-topics.xml', async (req, res) => {
  const base = sitemapBase(req);
  // No lastmod: a topic page's content changes when matching quotes are added,
  // which we would have to run a query per term to know.
  sendXml(res, buildUrlset(
    allowlistedTopics().map((term) => ({ loc: `${base}${topicPath(term)}` }))
  ));
});

// RegExp route rather than '/sitemap-videos-:n.xml' so the chunk number can't be
// confused with the file extension.
app.get(/^\/sitemap-videos-(\d+)\.xml$/, async (req, res) => {
  const base = sitemapBase(req);
  const index = parseInt(req.params[0], 10) - 1;

  try {
    const { list } = await getIndexableVideos(req.tenant);
    const chunks = chunk(list);
    if (index < 0 || index >= chunks.length) {
      return res.status(404).type('xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
    }
    // lastmod is the video's upload date: the transcript is fixed once ingested,
    // so this is the real "last changed" for the page.
    sendXml(res, buildUrlset(chunks[index].map((v) => ({
      loc: `${base}/video/${encodeURIComponent(v.videoId)}`,
      lastmod: v.uploadDate,
    }))));
  } catch (e) {
    console.error('Error building video sitemap:', e.message);
    sendXml(res, buildUrlset([]));
  }
});

// Best-effort list of the retired /topic/ URLs, to get them recrawled (and so
// dropped) faster than Google would revisit them on its own. Sourced from search
// analytics, which only goes back to 2026-07-07 — the older pages predate it, so
// this is a partial list. The Search Console prefix removal is the complete and
// immediate lever; this just accelerates the permanent 410-driven drop.
app.get('/sitemap-removed.xml', async (req, res) => {
  const base = sitemapBase(req);
  try {
    const terms = await getRemovedTopicTerms(req.tenant, { limit: 45000 });
    sendXml(res, buildUrlset(
      terms
        .filter((t) => !isAllowlistedTopic(t))
        .map((t) => ({ loc: `${base}${topicPath(t)}` }))
    ));
  } catch (e) {
    console.error('Error building removal sitemap:', e.message);
    sendXml(res, buildUrlset([]));
  }
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
  
  // Simplified pattern matching for better performance. The admin check is
  // anchored to the path START so legit content paths (e.g. a topic page for
  // "administrator") aren't 403'd by a substring match.
  if (
    /sqlmap|nikto|nmap|acunetix|burpsuite|ZAP/i.test(userAgent) ||
    /wp-|xmlrpc|\.php|\.asp/i.test(requestPath) ||
    /^\/admin/i.test(requestPath)
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // (HTTP parameter pollution is handled by the custom query parser above —
  // mutating req.query here does nothing on Express 5.)

  next();
});

// Add console logs at the start of the file to check routes loading

// In-memory set to prevent concurrent duplicate on-demand topic generation
const topicGenerating = new Set();

// A topic term earns a static page (and a sitemap slot) only if it looks like a
// real phrase: 3-40 chars, letters/digits/spaces/'/- only, at most 4 words.
// Anything a visitor can type becomes a public page otherwise (e.g. the junk
// `/topic/%22%20a%20lot%20of%20Furry%22` pages already in the sitemap).
function isIndexableTopic(term) {
  if (typeof term !== 'string') return false;
  const t = term.trim();
  if (t.length < 3 || t.length > 40) return false;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u.test(t)) return false;
  if (t.split(/\s+/).length > 4) return false;
  return true;
}

// Minimum matches before a topic page is worth generating — thin pages hurt SEO.
const TOPIC_MIN_QUOTES = 10;

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
        // Keep a previously loaded list if we have one; only seed [] when empty
        if (!cachedGameLists.has(tenant.id)) {
            cachedGameLists.set(tenant.id, []);
        }
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
      metabase: tenant.metabase,
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
                message: 'The server could not resolve the site configuration for this request. Please try again.'
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

        if (searchTerm.trim().length >= 3) {
            logSearchEvent(req, {
                event_type: 'search',
                path: '/search',
                search_term: searchTerm.trim().toLowerCase(),
                search_mode: exactPhrase ? 'strict' : 'keyword',
                game: gameName !== 'all' ? gameName : null,
                channel: selectedValue !== 'all' ? selectedValue : null,
                year: year || null,
                sort_order: sortOrder !== 'default' ? sortOrder : null,
                page,
                result_videos: result.total,
                result_quotes: result.totalQuotes,
                response_time_ms: totalTime
            });
        }

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
        // A cancelled statement (statement_timeout) is worth distinguishing:
        // the user can fix it by narrowing the search, so tell them that.
        const timedOut = /timed out/i.test(error.message || '');
        res.status(timedOut ? 504 : 500).json({
            error: timedOut ? 'Search timed out' : 'Search failed',
            message: timedOut
                ? 'The search took too long and was cancelled — try a more specific phrase or add a filter.'
                : 'The server hit an unexpected error while searching. Please try again in a moment.'
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

        // line_number is stored as text in the DB; accept digits only
        const lineNumber = /^\d{1,10}$/.test(String(req.body.lineNumber ?? '')) ?
                           String(req.body.lineNumber) : null;
        
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
            return res.status(400).json({
                error: 'Potential spam detected',
                message: 'Your report was rejected by the spam filter — remove any links and try again.'
            });
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
                    ...(videoId !== "invalid" ? [{
                        name: "Video ID",
                        value: `\`${videoId}\``,
                        inline: true
                    }] : []),
                    ...(videoId !== "invalid" && lineNumber ? [{
                        name: "Line",
                        value: `\`${lineNumber}\``,
                        inline: true
                    }] : []),
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
                    // Copy-paste query to locate the flagged row; videoId and
                    // lineNumber are regex-validated above so interpolation is safe
                    ...(videoId !== "invalid" ? [{
                        name: "DB Query",
                        value: [
                            '```sql',
                            `SELECT * FROM quotes WHERE video_id = '${videoId}'${lineNumber ? ` AND line_number = '${lineNumber}'` : ''};`,
                            '```'
                        ].join('\n'),
                        inline: false
                    }] : []),
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
                error: 'Reporting not configured',
                message: 'Reporting is temporarily unavailable. Please try again later.'
            });
        }

        try {
            await axios.post(webhookUrl, webhookMessage);
        } catch (discordError) {
            // Log the detail server-side; don't leak webhook internals to clients.
            console.error('Error sending to Discord webhook:', discordError.message);
            return res.status(500).json({
                error: 'Failed to deliver report',
                message: 'Your report could not be delivered. Please try again in a moment.'
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
            error: 'Failed to flag quote',
            message: 'The server hit an unexpected error while sending your report. Please try again.'
        });
    }
});

app.get('/api/random', async (req, res) => {
    try {
        const result = await quoteModel.getRandom(req.tenant);
        logSearchEvent(req, { event_type: 'random_quote', path: '/' });
        res.json({ quotes: result });
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        res.status(500).json({
            error: 'Failed to fetch random quotes',
            message: 'The server could not pick random quotes right now. Please try again.'
        });
    }
});

app.get('/api/games', async (req, res) => {
    try {
        const tenant = req.tenant || detectTenant(req.get('host') || 'localhost');
        let cachedGameList = cachedGameLists.get(tenant.id);

        // An empty list is a failed load (a healthy DB has games), so treat it
        // as a cache miss and retry — otherwise one bad query at startup would
        // serve an empty dropdown until the next restart.
        if (!cachedGameList || cachedGameList.length === 0) {
            await loadGameTitles(tenant);
            cachedGameList = cachedGameLists.get(tenant.id) || [];
        }

        // Only let clients cache a populated list; an empty one must be retried.
        // ETag hashes the content — a changed list of equal length must not 304.
        res.set(cachedGameList.length > 0
            ? {
                'Cache-Control': 'public, max-age=3600',
                'ETag': `"${crypto.createHash('sha1').update(JSON.stringify(cachedGameList)).digest('hex').slice(0, 16)}"`
              }
            : { 'Cache-Control': 'no-store' });

        res.json({ games: cachedGameList });
    } catch (error) {
        console.error('Error serving game titles:', error);
        res.status(500).json({
            error: 'Failed to fetch game titles',
            message: 'The server could not load the game list. The game filter may be empty — reload to retry.'
        });
    }
});

// In-house analytics collector. Path is deliberately terse ("/api/ev") so
// generic ad-blocker filter rules (/track, /collect, /beacon, ...) don't match.
// Accepts sendBeacon/fetch JSON bodies; validation lives in models/analytics.js.
app.post('/api/ev', (req, res) => {
    try {
        logClientEvent(req, req.body); // fire-and-forget insert
        res.status(204).end();
    } catch (error) {
        console.error('Error accepting analytics event:', error);
        res.status(204).end(); // never surface analytics errors to the client
    }
});

// Topic quotes endpoint
app.get('/api/topic/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!term || term.trim().length < 2) {
      return res.status(400).json({
        error: 'Invalid topic term',
        message: 'Topic terms must be at least 2 characters long.'
      });
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
    const timedOut = /timed out/i.test(error.message || '');
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Topic lookup timed out' : 'Failed to fetch topic quotes',
      message: timedOut
        ? 'Loading this topic took too long and was cancelled. Please try again.'
        : 'The server hit an unexpected error while loading this topic. Please try again.'
    });
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
//
// Two gates run before any of that, in order:
//   1. Non-canonical spellings 301 onto the normalized term, so case and
//      whitespace variants stop minting duplicate pages.
//   2. Anything not on the curated allowlist returns 410 Gone. This is the
//      prune: ~7,000 uncurated pages accumulated here because on-demand
//      generation let any visitor create a permanent indexable URL.
app.get('/topic/:term', async (req, res, next) => {
  const rawTerm = req.params.term;
  const term = normalizeTopicTerm(rawTerm);
  const hostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
  const siteBaseUrl = `https://${hostname}`;

  // One term, one URL.
  if (rawTerm !== term) {
    return res.redirect(301, topicPath(term));
  }

  // 410 rather than 404: it is the strongest "this is permanently gone" signal
  // and Google drops 410s from the index faster. The response body is still a
  // useful page for the humans arriving from stale search results.
  //
  // Note for whoever revisits this: do NOT add these paths to robots.txt until
  // Search Console shows them dropped. Blocking crawl stops Google ever seeing
  // the 410, which freezes them in the index permanently.
  if (!isAllowlistedTopic(term) || isBlockedTopic(term) || !isIndexableTopic(term)) {
    return res
      .status(410)
      .set('Cache-Control', 'public, max-age=86400')
      .type('html')
      .send(renderRemovedTopicHtml({ term, siteBaseUrl }));
  }

  const encoded = encodeURIComponent(term);
  const staticPath = path.resolve(__dirname, 'dist', 'topic', encoded, 'index.html');

  // Serve existing file immediately
  try {
    if (fs.existsSync(staticPath)) {
      return res.sendFile(staticPath);
    }
  } catch (e) {
    console.error('Error checking static topic page:', e);
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

      if (!topicData?.totalQuotes || topicData.totalQuotes < TOPIC_MIN_QUOTES) {
        // Allowlisted but too thin to be worth indexing — treat it the same as
        // any other removed topic rather than serving a thin 200.
        return res
          .status(410)
          .set('Cache-Control', 'public, max-age=86400')
          .type('html')
          .send(renderRemovedTopicHtml({ term, siteBaseUrl }));
      }

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

// ======= VIDEO ENTITY PAGES =======
// One page per real video: its metadata plus the full transcript, every line
// deep-linking to that moment on YouTube. These are entity pages rather than
// query pages — each video's transcript is disjoint from every other's, so
// unlike the old topic pages they can't cannibalise each other.
//
// Any video with enough lines renders for humans; only videos inside the current
// rollout batch are indexable.

async function renderVideosHub(req, res, next, page) {
  try {
    const { list } = await getIndexableVideos(req.tenant);
    const totalPages = Math.max(1, Math.ceil(list.length / VIDEOS_PER_HUB_PAGE));
    if (page > totalPages) return next();

    const start = (page - 1) * VIDEOS_PER_HUB_PAGE;
    const html = renderVideosHubHtml({
      videos: list.slice(start, start + VIDEOS_PER_HUB_PAGE),
      page,
      totalPages,
      totalVideos: list.length,
      siteBaseUrl: sitemapBase(req),
    });

    res.set('Cache-Control', 'public, max-age=3600').type('html').send(html);
  } catch (e) {
    console.error('Error rendering videos hub:', e);
    next();
  }
}

app.get('/videos', (req, res, next) => renderVideosHub(req, res, next, 1));

app.get('/videos/page/:n', (req, res, next) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isInteger(n) || n < 1) return next();
  // Page 1 already lives at /videos; don't let a second URL serve it.
  if (n === 1) return res.redirect(301, '/videos');
  return renderVideosHub(req, res, next, n);
});

app.get('/video/:videoId', async (req, res, next) => {
  const { videoId } = req.params;

  // YouTube ids are 11 chars of [A-Za-z0-9_-]. Reject anything else before it
  // reaches the database.
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return next();

  try {
    const video = await quoteModel.getVideo(videoId, req.tenant);

    if (!video) {
      const hostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
      return res
        .status(404)
        .type('html')
        .send(renderRemovedTopicHtml({ term: '', siteBaseUrl: `https://${hostname}` }));
    }

    // Batch membership already implies the video cleared VIDEO_MIN_QUOTES.
    // Everything outside the batch still renders — it just isn't indexable yet.
    const { ids } = await getIndexableVideos(req.tenant);

    const html = renderVideoHtml({
      videoId: video.video_id,
      title: video.title,
      channel: video.channel_source,
      uploadDate: video.upload_date,
      gameName: video.game_name,
      totalQuotes: video.total_quotes,
      quotes: video.quotes || [],
      siteBaseUrl: sitemapBase(req),
      indexable: ids.has(video.video_id),
    });

    res.set('Cache-Control', 'public, max-age=3600').type('html').send(html);
  } catch (e) {
    console.error('Error rendering video page:', e);
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

// Routes that were removed but are still sitting in Google's index. Without this
// they fall through to the SPA fallback and answer 200 with an empty shell —
// a soft 404, which Google keeps around far longer than an explicit 410.
const RETIRED_PATHS = new Set(['/nldle']);

app.use((req, res, next) => {
  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  if (!RETIRED_PATHS.has(normalizedPath)) return next();

  const hostname = req.tenant?.hostnames?.[0] || 'nlquotes.com';
  return res
    .status(410)
    .set('Cache-Control', 'public, max-age=86400')
    .type('html')
    .send(renderRemovedTopicHtml({ term: '', siteBaseUrl: `https://${hostname}` }));
});

// The built index.html ships placeholder https://example.com URLs — canonical,
// og:url/og:image, twitter:url/twitter:image, and the JSON-LD url/target. Nothing
// ever rewrote them, so every SPA-served URL declared a canonical pointing at a
// domain we don't own. Search Console logged ~1k pages under "Alternate page with
// proper canonical tag" and "Duplicate, Google chose different canonical than
// user" as a result. Rewrite them from the real host on every response.
function applySeoUrls(html, { base, pathname }) {
  // Canonical deliberately drops the query string: /?q=foo renders the same
  // document as /, and keeping the query would mint a distinct canonical for
  // every search term anyone has ever typed.
  const cleanPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const canonical = `${base}${cleanPath}`;

  return html
    .replace(/(<link rel="canonical" href=")[^"]*(")/i, `$1${canonical}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/i, `$1${canonical}$2`)
    .replace(/(<meta name="twitter:url" content=")[^"]*(")/i, `$1${canonical}$2`)
    // Sweeps up what's left: og:image, twitter:image, and the JSON-LD WebSite
    // url + SearchAction target. Runs last so it can't clobber the three
    // canonical URLs set above (they no longer contain the placeholder).
    .replaceAll('https://example.com', base);
}

// SPA fallback for React Router with CSP header
// This must be LAST so it doesn't catch API routes
app.use((req, res) => {
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
    "frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://umami.nlquotes.com https://metabase.nlquotes.com; " +
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

      // Rewrite the placeholder SEO URLs first, before any other injection.
      // tenantDomain comes from tenant config, never the raw Host header, so a
      // spoofed Host can't inject a canonical pointing somewhere else.
      html = applySeoUrls(html, { base: tenantDomain, pathname: req.path });

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
        metabase: tenant.metabase,
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
// _next: Express needs arity 4 to treat this as an error handler
app.use((err, req, res, _next) => {
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
            ? 'The server hit an unexpected error. Please try again in a moment.'
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

// Handle graceful shutdown. server.close() waits for open keep-alive sockets
// (up to keepAliveTimeout/server.timeout), so every handler arms an unref'd
// force-exit timer — otherwise a crashed process can hang half-alive instead
// of exiting and being restarted by Coolify.
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => {
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 5000).unref();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
  setTimeout(() => process.exit(1), 5000).unref();
});
