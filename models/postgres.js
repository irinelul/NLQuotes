import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

console.log('Initializing PostgreSQL connection module...');

// Create connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Disable SSL requirements completely
  max: 10, // Reduced from 20 to prevent connection overload
  min: 2, // Keep at least 2 connections ready
  idleTimeoutMillis: 30000, // Reduced from 60000 to recycle connections faster
  connectionTimeoutMillis: 5000, // Increased from 1000 for better reliability
  allowExitOnIdle: false, // Don't close pool on idle
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000 // Reduced from 10000
});

// Better connection error handling
pool.on('error', (err, client) => {
  console.error('❌ PostgreSQL ERROR:', err.message);
  console.error('Error details:', err);
  console.error('This connection error occurred but was handled gracefully');
  // Don't crash the server on connection errors
});

// Track connection events
let totalConnections = 0;
pool.on('connect', () => {
  totalConnections++;
  console.log(`🔌 PostgreSQL connection #${totalConnections} established`);
});

pool.on('acquire', (client) => {
  console.log(`🔄 PostgreSQL client acquired from pool (${pool.totalCount} total, ${pool.idleCount} idle)`);
});

pool.on('remove', (client) => {
  console.log(`👋 PostgreSQL client removed from pool (${pool.totalCount} total, ${pool.idleCount} idle)`);
});

// Warm up the connection pool with one verified connection
(async () => {
  console.time('⏱️ DB Connect');
  try {
    console.log('🔍 Attempting to connect to PostgreSQL...');
    console.log(`📝 Connection string: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`); // Hide password
    
    // Extract host and database name for logging (without exposing full credentials)
    const urlParts = process.env.DATABASE_URL.match(/postgres(?:ql)?:\/\/[^:]+:[^@]+@([^:]+):(\d+)\/(.+)/i);
    if (urlParts && urlParts.length >= 4) {
      console.log(`🌐 Target: Host=${urlParts[1]}, Port=${urlParts[2]}, Database=${urlParts[3]}`);
    }
    
    console.log('🔒 SSL settings:', JSON.stringify({
      ssl: { rejectUnauthorized: false }
    }));
    
    const client = await pool.connect();
    try {
      console.log('✅ Initial connection successful, running diagnostic queries...');
      
      // Get server version and time
      const versionRes = await client.query('SELECT version() as version');
      console.log(`📊 PostgreSQL version: ${versionRes.rows[0].version}`);
      
      // Get current time to verify connectivity
      const timeRes = await client.query('SELECT NOW() as connection_time');
      console.log(`🕒 PostgreSQL server time: ${timeRes.rows[0].connection_time}`);
      
      // Check for the quotes table
      const tableRes = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'quotes'
        ) as table_exists
      `);
      
      if (tableRes.rows[0].table_exists) {
        console.log('✅ The "quotes" table exists in the database');
        
        // Count the number of quotes
        const countRes = await client.query('SELECT COUNT(*) as quote_count FROM quotes');
        console.log(`📈 Total quotes in database: ${countRes.rows[0].quote_count}`);
        
        // Get sample quote to verify data access
        const sampleRes = await client.query('SELECT video_id, text FROM quotes LIMIT 1');
        if (sampleRes.rows.length > 0) {
          console.log('✅ Successfully retrieved sample quote data');
          console.log(`🔹 Sample video_id: ${sampleRes.rows[0].video_id}`);
          console.log(`🔹 Sample text: ${sampleRes.rows[0].text.substring(0, 50)}...`);
        } else {
          console.log('⚠️ The quotes table exists but appears to be empty');
        }
      } else {
        console.error('❌ ERROR: The "quotes" table does not exist in the database!');
      }
      
      console.timeEnd('⏱️ DB Connect');
      console.log('🎉 PostgreSQL connection and diagnostic tests completed successfully!');
    } finally {
      client.release();
      console.log('🔄 Released connection back to pool');
    }
  } catch (err) {
    console.error('❌ ERROR during initial PostgreSQL connection:', err.message);
    console.error('Connection error details:', err);
    console.timeEnd('⏱️ DB Connect');
    
    // Attempt a second connection with different SSL settings for troubleshooting
    try {
      console.log('🔄 Attempting alternate connection configuration...');
      const { Client } = pg;
      const testClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      
      await testClient.connect();
      console.log('✅ Alternate connection successful!');
      const result = await testClient.query('SELECT version()');
      console.log('📊 PostgreSQL version:', result.rows[0].version);
      await testClient.end();
    } catch (fallbackErr) {
      console.error('❌ Fallback connection also failed:', fallbackErr.message);
      console.error('❌ CRITICAL: Unable to establish any PostgreSQL connection');
      
      // Log more specific SSL-related error details if relevant
      if (fallbackErr.message.includes('ssl')) {
        console.error('SSL ERROR DETECTED: This may be an SSL configuration issue');
        console.error('Check if the database requires SSL and if the configuration is correct');
        console.error('Current NODE_ENV:', process.env.NODE_ENV);
        console.error('Current SSL config:', JSON.stringify({
          ssl: process.env.NODE_ENV === 'production' ? true : { rejectUnauthorized: false }
        }));
      }
      
      console.error('Please check:');
      console.error('1. DATABASE_URL environment variable is correct');
      console.error('2. PostgreSQL server is running and accessible');
      console.error('3. Network allows connections to the database port');
      console.error('4. Database user has proper permissions');
    }
  }
})();

// Health check function to verify database connectivity
const checkDatabaseHealth = async () => {
  let client;
  console.log('🔍 Running database health check...');
  try {
    client = await pool.connect();
    const startTime = Date.now();
    const result = await client.query('SELECT 1 as healthcheck, NOW() as server_time');
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`✅ Database health check passed (response time: ${responseTime}ms)`);
    console.log(`🕒 Server time: ${result.rows[0].server_time}`);
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
    console.error('❌ Database health check failed:', err.message);
    return {
      healthy: false,
      error: err.message,
      errorCode: err.code,
      errorStack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    };
  } finally {
    if (client) {
      client.release();
      console.log('🔄 Health check connection released');
    }
  }
};

// Quote model functions
const quoteModel = {
  // Database health check exposed to API
  checkHealth: checkDatabaseHealth,
  
  // Search quotes with pagination using PostgreSQL FTS
  async search({ searchTerm, searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10, exactPhrase = false }) {
    // Validate and sanitize inputs
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 10)); // Cap at 50 items
    
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
               'text', q.text,
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
    // Define cleanSearchTerm at the function scope level so it's available for the count query
    let cleanSearchTerm = '';
    
    if (searchTerm && searchTerm.trim() !== '') {
      // Extra sanitization - remove any SQL injection patterns - REMOVED unnecessary replace()
      cleanSearchTerm = searchTerm.trim(); // <-- Apply trim to cleanSearchTerm
    
      if (cleanSearchTerm.length >2 ) {
        whereClauses.push(`q.fts_doc @@ phraseto_tsquery('simple', $${paramIndex})`);
        query = query.replace('SELECT q.*', `SELECT ts_rank(q.fts_doc, phraseto_tsquery('simple', $${paramIndex})) as rank, q.*`);
        params.push(cleanSearchTerm); // Use the trimmed term
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
      // Whitelist approach for channel_source
      const validChannels = ['Librarian', 'Northernlion']; // Add all your valid channels
      if (validChannels.includes(selectedValue)) {
        whereClauses.push(`q.channel_source = $${paramIndex}`);
        params.push(selectedValue);
        paramIndex++;
      }
    }

    if (year && year.toString().trim() !== '') {
      // Validate year is a 4-digit number between reasonable bounds
      try {
        const yearInt = parseInt(year);
        if (!isNaN(yearInt) && yearInt >= 1990 && yearInt <= new Date().getFullYear()) {
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
    // If we did an exact phrase search and added a rank field, sort by rank first
    if (sortOrder) {
      // Ensure the column exists unambiguously after grouping
      if (exactPhrase && searchTerm && searchTerm.trim() !== '') {
        // Sort by rank first, then by date
        query += ` ORDER BY rank DESC, q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}`;
      } else {
        query += ` ORDER BY q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}`;
      }
    } else {
      // Default sort order - also include rank if available
      if (exactPhrase && searchTerm && searchTerm.trim() !== '') {
        query += ` ORDER BY rank DESC, q.upload_date DESC`; 
      } else {
        query += ` ORDER BY q.upload_date DESC`; // Default sort by newest
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
          CROSS JOIN phraseto_tsquery('simple', $1) AS query
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
      console.log(`Stats query completed in ${Date.now() - startTime}ms`);
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
    // TABLESAMPLE SYSTEM provides a block-level sample, much faster than ORDER BY RANDOM() on full table.
    // The percentage (e.g., 1) determines how many blocks are read. Adjust as needed.
    // We then randomly order the small sample.
     const query = `
      WITH sampled_quotes AS (
        SELECT * FROM quotes TABLESAMPLE SYSTEM (1) -- Sample approx 1% of table blocks
      ),
      random_video_ids AS (
        SELECT DISTINCT video_id
        FROM sampled_quotes
        ORDER BY RANDOM()
        LIMIT 5 -- Limit to 5 random videos from the sample
      )
      SELECT q.video_id, q.title, q.upload_date, q.channel_source,
             json_agg(json_build_object(
               'text', q.text,
               'line_number', q.line_number,
               'timestamp_start', q.timestamp_start,
               'title', q.title,
               'upload_date', q.upload_date,
               'channel_source', q.channel_source
             ) ORDER BY q.line_number::int) AS quotes
      FROM quotes q
      JOIN random_video_ids rvi ON q.video_id = rvi.video_id
      GROUP BY q.video_id, q.title, q.upload_date, q.channel_source
      ORDER BY RANDOM() -- Optional: Randomize the order of the 5 selected videos
      LIMIT 5;
    `;

    let client;
    try {
      client = await pool.connect();
      const startTime = Date.now();
      const result = await client.query(query);
      console.log(`Random quotes query completed in ${Date.now() - startTime}ms`);
      return result.rows;
    } catch (error) {
      console.error("Error fetching random quotes:", error);
      throw new Error(`Failed to fetch random quotes: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  }
};

export default quoteModel;