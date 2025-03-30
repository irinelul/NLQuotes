import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quoteModel from './models/postgres.js';
import axios from 'axios';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Rate limiting and brute force protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skip: (req) => {
    // Skip rate limiting for certain paths
    return req.path === '/' || req.path.startsWith('/assets/');
  }
});

// Apply slower response times after limit threshold to discourage abuse
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 30, // allow 30 requests per 15 minutes without slowing down
  delayMs: (hits) => hits * 100, // add 100ms delay per request above threshold
  skip: (req) => {
    return req.path === '/' || req.path.startsWith('/assets/');
  }
});

// Apply rate limiting and speed limiting to all requests
app.use(apiLimiter);
app.use(speedLimiter);

// Security middleware
app.use((req, res, next) => {
  // Basic security headers for all responses
  res.set({
    'X-Content-Type-Options': 'nosniff', // Prevents MIME type sniffing
    'X-Frame-Options': 'DENY', // Prevents clickjacking through iframes
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', // Enforce HTTPS
    'X-XSS-Protection': '1; mode=block', // Enable browser's XSS protection
    'Referrer-Policy': 'strict-origin-when-cross-origin', // Control referrer information
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()', // Restrict browser features
  });
  
  // Block suspicious requests
  const userAgent = req.get('User-Agent') || '';
  const requestPath = req.path || '';
  
  // Check for common vulnerability scanners or suspicious requests
  const suspiciousPatterns = [
    /sqlmap|nessus|nikto|nmap|acunetix|w3af|burpsuite|ZAP/i, // Common scanner UAs
    /wp-admin|wp-login|wp-content|xmlrpc|administrator|admin-console|manager\/html/i, // Common attack paths
    /\.php$|\.asp$|\.aspx$|\.jsp$|\.cgi$/i // File extensions we don't use
  ];
  
  if (
    suspiciousPatterns.some(pattern => pattern.test(userAgent)) ||
    suspiciousPatterns.some(pattern => pattern.test(requestPath))
  ) {
    console.warn(`Blocked suspicious request: ${req.ip}, ${userAgent}, ${requestPath}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Prevent HTTP parameter pollution
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][0]; // Take only the first value
      }
    });
  }
  
  next();
});

// Configure cors with specific options
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours in seconds - tells browsers to cache preflight requests
};

app.use(cors(corsOptions));
app.use(express.json());

// Add middleware to set connection headers for all responses
app.use((req, res, next) => {
  // Set Keep-Alive headers to maintain persistent connections
  res.set('Connection', 'keep-alive');
  res.set('Keep-Alive', 'timeout=120'); // 2 minutes timeout
  
  // Add Cache-Control headers for static resources (but not for API responses)
  if (req.path.startsWith('/assets/') || req.path.includes('.')) {
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours for static assets
  }
  
  // Log connection information
  const connectionInfo = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    time: new Date().toISOString()
  };
  console.log('Connection from:', connectionInfo);
  
  next();
});

app.use(express.static('dist', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        
        // Add caching headers for static files
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    }
}));

// Configure morgan for logging
morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('bodyLength', (req) => (JSON.stringify(req.body)).length);
app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'));

app.get('/api', async (req, res) => {
    // Input validation and sanitization
    const page = Math.max(1, parseInt(req.query.page) || 1); // Ensure page is at least 1
    const strict = req.query.strict === 'true';
    
    // Sanitize searchTerm - remove dangerous SQL characters
    let searchTerm = '';
    if (req.query.searchTerm) {
        // Basic sanitization - Remove SQL injection characters
        searchTerm = req.query.searchTerm.replace(/['";=\-\(\)\{\}\[\]\\\/]/g, ' ').trim();
        searchTerm = strict ? `\\b${searchTerm}\\b` : searchTerm;
    }
    
    // Validate and sanitize selectedValue
    const allowedValues = ['all', 'Librarian', 'Northernlion']; // Add all valid channels here
    const selectedValue = allowedValues.includes(req.query.selectedValue) ? 
                          req.query.selectedValue : 'all';
    
    // Validate and sanitize selectedMode
    const allowedModes = ['searchTitle', 'searchText'];
    const selectedMode = allowedModes.includes(req.query.selectedMode) ? 
                         req.query.selectedMode : 'searchText';
    
    // Validate year is a 4-digit number
    let year = null;
    if (req.query.year) {
        const yearInt = parseInt(req.query.year);
        if (!isNaN(yearInt) && yearInt >= 1990 && yearInt <= new Date().getFullYear()) {
            year = yearInt.toString();
        }
    }
    
    // Validate sortOrder
    const allowedSortOrders = ['newest', 'oldest', 'default'];
    const sortOrder = allowedSortOrders.includes(req.query.sortOrder) ? 
                      req.query.sortOrder : 'default';
    
    // Safely handle gameName
    let gameName = "all";
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
    
    const searchPath = selectedMode === "searchTitle" ? "title" : "text";

    // Generate an ETag based on the sanitized query parameters
    const requestETag = `W/"quotes-${searchTerm}-${selectedValue}-${selectedMode}-${year}-${sortOrder}-${gameName}-${page}"`;
    
    // Check if client has a matching ETag
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === requestETag) {
        // Client already has the data, send 304 Not Modified
        console.log('Cache hit, returning 304 Not Modified');
        return res.status(304).send();
    }

    try {
        // Add rate limiting check
        // ... (add rate limiting code here if needed)
        
        const startTime = Date.now();
        const result = await quoteModel.search({
            searchTerm,
            searchPath,
            gameName,
            selectedValue,
            year,
            sortOrder,
            page
        });
        const totalTime = Date.now() - startTime;

        // Set security headers along with performance and caching headers
        res.set({
            'ETag': requestETag,
            'Cache-Control': 'private, max-age=300', // Cache for 5 minutes on client
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
            selectedMode,
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

app.get('/stats', async (req, res) => {
    try {
        const stats = await quoteModel.getStats();
        res.json({ data: stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
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
                    }
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
            throw new Error('Discord webhook URL not configured');
        }

        await axios.post(webhookUrl, webhookMessage);
        
        // Set security headers
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store'
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error flagging quote:', error);
        res.status(500).json({ error: 'Failed to flag quote' });
    }
});

app.get('/api/random', async (req, res) => {
    try {
        const result = await quoteModel.getRandom();
        res.json({ quotes: result });
    } catch (error) {
        console.error('Error fetching random quotes:', error);
        res.status(500).json({ error: 'Failed to fetch random quotes' });
    }
});

app.get('/api/games', async (req, res) => {
    try {
        const games = await fs.promises.readFile('game_titles.txt', 'utf8');
        const gameList = games.split('\n')
            .map(game => game.trim())
            .filter(game => game !== '');
        res.json({ games: gameList });
    } catch (error) {
        console.error('Error reading game titles:', error);
        res.status(500).json({ error: 'Failed to fetch game titles' });
    }
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

// Create server with optimized settings
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
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
  });
});



