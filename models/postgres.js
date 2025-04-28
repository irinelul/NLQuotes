import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();


// Create connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Disable SSL requirements completely
  max: 15, // Reduced from 20 to prevent connection overload
  min: 2, // Keep at least 2 connections ready
  idleTimeoutMillis: 30000, // Reduced from 60000 to recycle connections faster
  connectionTimeoutMillis: 5000, // Increased from 1000 for better reliability
  allowExitOnIdle: false, // Don't close pool on idle
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000 // Reduced from 10000
});

// Better connection error handling
pool.on('error', (err, client) => {
  console.error('PostgreSQL Error:', err.message);
});

// Track connection events
let totalConnections = 0;
pool.on('connect', () => {
  totalConnections++;
});

pool.on('acquire', (client) => {
});

pool.on('remove', (client) => {
});

// Warm up the connection pool with one verified connection
(async () => {
  try {
    const client = await pool.connect();
    try {
      const tableRes = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'quotes'
        ) as table_exists
      `);
      
      if (tableRes.rows[0].table_exists) {
        const countRes = await client.query('SELECT COUNT(*) as quote_count FROM quotes');
        const sampleRes = await client.query('SELECT video_id, text FROM quotes LIMIT 1');
        if (sampleRes.rows.length > 0) {
          console.log(`Database connected successfully with ${countRes.rows[0].quote_count} quotes`);
        }
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Initial PostgreSQL connection failed:', err.message);
    
    // Attempt a second connection with different SSL settings for troubleshooting
    try {
      const { Client } = pg;
      const testClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      await testClient.connect();
      await testClient.end();
    } catch (fallbackErr) {
      console.error('Fallback connection failed:', fallbackErr.message);
    }
  }
})();

// Health check function to verify database connectivity
const checkDatabaseHealth = async () => {
  let client;
  try {
    client = await pool.connect();
    const startTime = Date.now();
    const result = await client.query('SELECT 1 as healthcheck, NOW() as server_time');
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    return {
      healthy: true,
      responseTime: `${responseTime}ms`,
      serverTime: result.rows[0].server_time,
      poolInfo: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingCount: pool.waitingCount || 0
      }
    };
  } catch (err) {
    console.error('Database health check failed:', err.message);
    return {
      healthy: false,
      error: err.message,
      errorCode: err.code
    };
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Quote model functions
const quoteModel = {
  // Database health check exposed to API
  checkHealth: checkDatabaseHealth,
  
  // Get list of unique games
  async getGameList() {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT DISTINCT game_name 
          FROM game_mapping 
          WHERE game_name IS NOT NULL 
          ORDER BY game_name ASC
        `);
        return result.rows.map(row => row.game_name);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error fetching game list:', error);
      return [];
    }
  },
  
  // Search quotes with pagination using PostgreSQL FTS
  async search({ searchTerm, searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10, exactPhrase = false }) {
    // Validate and sanitize inputs
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 10)); // Cap at 50 items
    
    // Validate search term length
    if (searchTerm && searchTerm.trim().length < 3) {
      return { data: [], total: 0, totalQuotes: 0 };
    }

    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    const ftsLanguage = 'simple'; // Use 'simple' instead of 'english' to preserve stop words

    // We only search in text now, so no need to validate searchPath
    // log search parameters
    console.log(`🔍 PostgreSQL search with params: term="${searchTerm}", game="${gameName}", channel=${selectedValue}, year=${year}, sort=${sortOrder}, page=${page}, exactPhrase=${exactPhrase}`);

    // Base query structure remains similar
    let query = `
      SELECT q.video_id, q.title, q.upload_date, q.channel_source,
             json_agg(json_build_object(
               'text', ts_headline('simple', q.text, websearch_to_tsquery('simple', $1),'MaxWords=5, MinWords=5, HighlightAll=TRUE'),
               'line_number', q.line_number,
               'timestamp_start', q.timestamp_start,
               'title', q.title,          -- Keep for context within quote object
               'upload_date', q.upload_date,  -- Keep for context within quote object
               'channel_source', q.channel_source -- Keep for context within quote object
             ) ORDER BY q.line_number::int) AS quotes
      FROM quotes q
    `; // WHERE clause will be built dynamically

    let whereClauses = []; // Start with an empty array for WHERE conditions

    // --- Search Term Conditions ---
    let cleanSearchTerm = '';
    
    if (searchTerm && searchTerm.trim() !== '') {
      // Extra sanitization - remove any SQL injection patterns 
      cleanSearchTerm = searchTerm.trim(); 
    
      if (cleanSearchTerm.length > 2) {
        whereClauses.push(`q.fts_doc @@ websearch_to_tsquery('simple', $${paramIndex})`);
        params.push(cleanSearchTerm);
        paramIndex += 1;
      }
    }
    
    // --- Filter Conditions (Leverage B-tree indexes) ---
    if (gameName && gameName !== 'all') {
      // Validate game name - basic protection
      const cleanGameName = gameName.replace(/['";]/g, '').trim();
      if (cleanGameName.length > 2) {
        whereClauses.push(`q.game_name = $${paramIndex}`);
        params.push(cleanGameName);
        paramIndex++;
      }
    }

    if (selectedValue && selectedValue !== 'all') { // Assuming selectedValue is channel_source
      // Whitelist approach for channel_source with case-insensitive comparison
      const validChannels = ['librarian', 'northernlion']; // Using lowercase for consistency
      const lowerSelectedValue = selectedValue.toLowerCase();
      if (validChannels.includes(lowerSelectedValue)) {
        whereClauses.push(`LOWER(q.channel_source) = $${paramIndex}`);
        params.push(lowerSelectedValue);
        paramIndex++;
      }
    }

    if (year && year.toString().trim() !== '') {
      // Validate year is a 4-digit number between reasonable bounds
      try {
        const yearInt = parseInt(year);
        if (!isNaN(yearInt)) {
          whereClauses.push(`EXTRACT(YEAR FROM q.upload_date) = $${paramIndex}`);
          params.push(yearInt);
          paramIndex++;
        } else {
          console.error("Invalid year parameter:", year);
        }
      } catch (e) {
        console.error("Invalid year parameter:", year);
        // Handle invalid year input appropriately, e.g., return error or empty result
        return { data: [], total: 0, totalQuotes: 0 };
      }
    }

    // --- Combine WHERE clauses ---
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    } else {
      // Handle case with no filters if necessary, though often you might want *some* filter
      // or limit the results heavily if no filters are applied.
      // For this example, we allow no filters.
    }

    // --- Grouping ---
    // Group by video fields AFTER filtering. This aggregates all quotes
    // for videos where AT LEAST ONE quote matched the WHERE criteria.
    if (exactPhrase && searchTerm && searchTerm.trim() !== '') {
      query += ` GROUP BY q.video_id, q.title, q.upload_date, q.channel_source, rank`;
    } else {
      query += ` GROUP BY q.video_id, q.title, q.upload_date, q.channel_source`;
    }
// --- Sorting (Applied after grouping) ---
if (sortOrder === 'default') {
  if (exactPhrase && searchTerm && searchTerm.trim() !== '') {
    query += ` ORDER BY rank DESC`;
  }
} else if (sortOrder === 'newest' || sortOrder === 'oldest') {
  if (exactPhrase && searchTerm && searchTerm.trim() !== '') {
    query += ` ORDER BY rank DESC, q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}`;
  } else {
    query += ` ORDER BY q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}`;
  }
}


    // --- Pagination ---
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // --- Count Query ---
    // Counts distinct videos matching the filters (before pagination)
    let countQuery;
    let countParams;
    
    if (exactPhrase && searchTerm && searchTerm.trim() !== '' && cleanSearchTerm.length > 0) {
      // Include the same rank calculation in the count query
      countQuery = `
        SELECT COUNT(*) AS total_videos, SUM(quote_count) AS total_quotes
        FROM (
          SELECT q.video_id, COUNT(*) AS quote_count
          FROM quotes q
          CROSS JOIN websearch_to_tsquery('simple', $1) AS query
          WHERE q.fts_text_simple @@ query
      `;
      
      // Skip the first parameter as we already included it in the CROSS JOIN
      let countWhereClauses = whereClauses.slice(1);
      if (countWhereClauses.length > 0) {
        // Adjust parameter indices since we used $1 in the CROSS JOIN
        countWhereClauses = countWhereClauses.map(clause => {
          return clause.replace(/\$(\d+)/g, (match, index) => `$${parseInt(index) - 1}`);
        });
        countQuery += ` AND ${countWhereClauses.join(' AND ')}`;
      }
      countQuery += ` GROUP BY q.video_id) AS video_counts`;
      
      // Adjust countParams to remove the first parameter and reuse it in the CROSS JOIN
      countParams = [cleanSearchTerm];
      if (params.length > 2) {
        countParams = countParams.concat(params.slice(2, paramIndex - 1));
      }
    } else {
      countQuery = `
        SELECT COUNT(*) AS total_videos, SUM(quote_count) AS total_quotes
        FROM (
          SELECT q.video_id, COUNT(*) AS quote_count
          FROM quotes q
      `;
      if (whereClauses.length > 0) {
        countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      countQuery += ` GROUP BY q.video_id) AS video_counts`;
      
      // Use the same countParams as before, but make sure they exist
      if (params.length >= paramIndex - 1) {
        countParams = params.slice(0, paramIndex - 1); // Exclude LIMIT and OFFSET params
      } else {
        countParams = [];
      }
    }

    try {
      // Get a client with timeout to prevent hanging connections
      const clientPromise = pool.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      );
      
      const client = await Promise.race([clientPromise, timeoutPromise])
        .catch(err => {
          if (err.message === 'Database connection timeout') {
            throw new Error('Database connection timed out after 5s');
          }
          throw err;
        });
      
      try {
        const startTime = Date.now();
        
        // Execute main query with timeout
        const queryPromise = client.query(query, params);
        const queryTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query execution timeout')), 10000)
        );
        
        const result = await Promise.race([queryPromise, queryTimeoutPromise])
          .catch(err => {
            if (err.message === 'Query execution timeout') {
              throw new Error('Query timed out after 10s');
            }
            throw err;
          });
        
        // Execute count query with timeout
        const countPromise = client.query(countQuery, countParams);
        const countTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Count query timeout')), 5000)
        );
        
        const countResult = await Promise.race([countPromise, countTimeoutPromise])
          .catch(err => {
            if (err.message === 'Count query timeout') {
              // Return empty count result instead of failing
              return { rows: [{ total_videos: 0, total_quotes: 0 }] };
            }
            throw err;
          });
        
        const queryTime = Date.now() - startTime;
        
        // Get both total videos and total quotes
        const totalVideos = parseInt(countResult.rows[0]?.total_videos || 0, 10);
        const totalQuotes = parseInt(countResult.rows[0]?.total_quotes || 0, 10);
  
        return {
          data: result.rows,
          total: totalVideos,
          totalQuotes: totalQuotes,
          queryTime: queryTime
        };
      } finally {
        // Always release the client back to the pool
        client.release();
      }
    } catch (error) {
      console.error("Database Query Error:", error);
      // Provide a meaningful error without exposing details
      if (error.message.includes('timeout')) {
        throw new Error('Database query timed out. Please try again or with a more specific search.');
      } else {
        throw new Error('Database error occurred. Please try again later.');
      }
    }
  },

  // Get stats (no changes needed, assumes indexes help GROUP BY)
  async getStats() {
    const query = `
      SELECT
        COALESCE(channel_source, 'Unknown') AS channel_source,
        COUNT(DISTINCT video_id) AS "videoCount",
        COUNT(*) AS "totalQuotes"
      FROM quotes
      WHERE channel_source IS NOT NULL AND channel_source <> '' -- Added condition to exclude empty strings if needed
      GROUP BY channel_source
      ORDER BY "videoCount" DESC
    `;

    let client;
    try {
      client = await pool.connect();
      const startTime = Date.now();
      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      console.error("Error fetching stats:", error);
      throw new Error(`Failed to fetch stats: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  },

  // Get random quotes (using TABLESAMPLE SYSTEM for better performance on large tables)
  async getRandom() {
    const query = `
        SELECT
        video_id, title, upload_date, channel_source, text, line_number, timestamp_start
        FROM quotes
        TABLESAMPLE BERNOULLI (0.01) 
        LIMIT 10;`;

    let client;
    try {
      client = await pool.connect();
      const startTime = Date.now();
      const result = await client.query(query);
      
      if (!result.rows || result.rows.length === 0) {
        console.warn('No random quotes found in the database');
        return [];
      }
      
      // Transform the result to match the expected format
      return result.rows.map(row => ({
        video_id: row.video_id,
        title: row.title,
        upload_date: row.upload_date,
        channel_source: row.channel_source,
        quotes: [{
          text: row.text,
          line_number: row.line_number,
          timestamp_start: row.timestamp_start,
          title: row.title,
          upload_date: row.upload_date,
          channel_source: row.channel_source
        }]
      }));
    } catch (error) {
      console.error("Error fetching random quotes:", error);
      throw new Error(`Failed to fetch random quotes: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  },

  // Get NLDLE game data for a specific date
  async getNLDLEGame(date = new Date()) {
    try {
      console.log('Fetching NLDLE game for date:', date);
      const client = await pool.connect();
      try {
        // Convert date to UTC and format as YYYY-MM-DD
        const utcDate = new Date(date);
        const formattedDate = utcDate.toISOString().split('T')[0];
        console.log('Formatted date for query:', formattedDate);
        
        const result = await client.query(`
          SELECT game_data 
          FROM nldle_games 
          WHERE game_date = $1
        `, [formattedDate]);
        
        console.log('Query result:', result.rows);
        
        if (result.rows.length === 0) {
          console.log('No game data found for date:', formattedDate);
          return null;
        }
        
        return result.rows[0].game_data;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error fetching NLDLE game:', error);
      return null;
    }
  }
};

export default quoteModel;