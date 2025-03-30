import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

// Create a connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Increase max connections to handle more concurrent users
  idleTimeoutMillis: 60000, // Increase idle timeout to 60s to keep connections alive longer
  connectionTimeoutMillis: 1000, // Reduce timeout to 1s for faster feedback
  keepAlive: true, // Enable TCP keepalive
  keepAliveInitialDelayMillis: 10000 // 10 seconds before first keepalive packet
});

// Test the connection and log timing
console.time('DB Connect');

// Initialize connection using an IIFE
(async () => {
  // Create a warmed-up client from the pool
  let client;
  try {
    client = await pool.connect();
    console.timeEnd('DB Connect'); // Logs connection time
    console.log('Connected to PostgreSQL successfully');
    
    // Test query to verify full connection functionality
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log(`PostgreSQL time: ${testResult.rows[0].current_time}`);
  } catch (error) {
    console.error('Error connecting to PostgreSQL:', error.message);
    // Don't exit - allow retries on subsequent requests
  } finally {
    if (client) {
      // Return client to pool for reuse
      client.release();
    }
  }
})().catch(err => console.error('Connection initialization error:', err));

// Quote model functions
const quoteModel = {
  // Search quotes with pagination using PostgreSQL FTS
  async search({ searchTerm, searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10 }) {
    // Validate and sanitize inputs
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 10)); // Cap at 50 items
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    const ftsLanguage = 'english'; // Define your FTS language configuration

    // Validate searchPath - only allow specific column names
    if (searchPath !== 'text' && searchPath !== 'title') {
      searchPath = 'text'; // Default to text if invalid
    }

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
    if (searchTerm && searchTerm.trim() !== '') {
      // Extra sanitization - remove any SQL injection patterns
      const cleanSearchTerm = searchTerm
        .replace(/['";=\\]/g, ' ') // Remove SQL injection characters
        .trim();
        
      if (cleanSearchTerm.length > 0) {
        if (searchPath === 'text') {
          // Use parameterized query to avoid injection
          whereClauses.push(`to_tsvector('simple', q.text) @@ phraseto_tsquery('simple', $${paramIndex})`);
          params.push(cleanSearchTerm);
          paramIndex += 1;
        }
      }
    }

    // --- Filter Conditions (Leverage B-tree indexes) ---
    if (gameName && gameName !== 'all') {
      // Validate game name - basic protection
      const cleanGameName = gameName.replace(/['";]/g, '').trim();
      if (cleanGameName.length > 0) {
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
    query += ` GROUP BY q.video_id, q.title, q.upload_date, q.channel_source`;

    // --- Sorting (Applied after grouping) ---
    // Uses idx_quotes_upload_date potentially for sorting
    // Add ranking here if needed based on FTS score (would require adding ts_rank to SELECT and ORDER BY)
    if (sortOrder) {
      // Ensure the column exists unambiguously after grouping
      query += ` ORDER BY q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}`;
    } else {
      // Default sort order
      query += ` ORDER BY q.upload_date DESC`; // Default sort by newest
    }

    // --- Pagination ---
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // --- Count Query ---
    // Counts distinct videos matching the filters (before pagination)
        let countQuery = `
        SELECT COUNT(*) AS total_videos, SUM(quote_count) AS total_quotes
        FROM (
          SELECT q.video_id, COUNT(*) AS quote_count
          FROM quotes q
      `;
      if (whereClauses.length > 0) {
          countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      countQuery += ` GROUP BY q.video_id) AS video_counts`;
  
  // Use the same countParams as before    // Parameters for count query are the same as the main query's WHERE clause parameters
    const countParams = params.slice(0, paramIndex - 1); // Exclude LIMIT and OFFSET params

    try {
      // Get a client from pool
      const client = await pool.connect();
      
      try {
        const startTime = Date.now();
        
        // Execute main query
        console.log("Executing Query:", query);
        console.log("Parameters:", params);
        const result = await client.query(query, params);
        
        // Execute count query
        console.log("Executing Count Query:", countQuery);
        console.log("Count Parameters:", countParams);
        const countResult = await client.query(countQuery, countParams);
        
        const queryTime = Date.now() - startTime;
        console.log(`Query execution completed in ${queryTime}ms`);
        
        // Get both total videos and total quotes
        const totalVideos = parseInt(countResult.rows[0]?.total_videos || 0, 10);
        const totalQuotes = parseInt(countResult.rows[0]?.total_quotes || 0, 10);
  
        return {
          data: result.rows,
          total: totalVideos, // For pagination (number of videos)
          totalQuotes: totalQuotes, // Total number of quotes matching the search
          queryTime: queryTime // Return query execution time for diagnostics
        };
      } finally {
        // Always release the client back to the pool
        client.release();
      }
    } catch (error) {
        console.error("Database Query Error:", error);
        // Rethrow or handle the error appropriately for your application
        throw new Error(`Failed to execute search query: ${error.message}`);
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