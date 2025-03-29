import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

// Create a connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // Limit max connections to prevent overload
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000 // Fail fast if connection takes >2s
});

// Test the connection and log timing
console.time('DB Connect');
pool.query('SELECT 1') // Simple query to test connection
  .then(() => {
    console.timeEnd('DB Connect'); // Logs connection time
    console.log('Connected to PostgreSQL');
  })
  .catch(error => {
    console.error('Error connecting to PostgreSQL:', error.message);
  });

// Quote model functions
const quoteModel = {
  // Search quotes with pagination using PostgreSQL FTS
  async search({ searchTerm, searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    const ftsLanguage = 'english'; // Define your FTS language configuration

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
    if (searchTerm) {
      if (searchPath === 'text') {
        // *** USE PostgreSQL Full-Text Search for 'text' ***
        // This uses the GIN index idx_quotes_text_fts
        // plainto_tsquery parses the search term, handling spaces as AND operators
        // NEW: Uses FOLLOWED BY (phrase) logic
        whereClauses.push(`to_tsvector('simple', q.text) @@ phraseto_tsquery('simple', $${paramIndex})`);
        params.push(searchTerm);
        paramIndex += 1;
              }
    }

    // --- Filter Conditions (Leverage B-tree indexes) ---
    if (gameName && gameName !== 'all') {
      // Uses idx_quotes_game_name
      whereClauses.push(`q.game_name = $${paramIndex}`);
      params.push(gameName);
      paramIndex++;
    }

    if (selectedValue && selectedValue !== 'all') { // Assuming selectedValue is channel_source
      // Uses idx_quotes_channel_source
      whereClauses.push(`q.channel_source = $${paramIndex}`);
      params.push(selectedValue);
      paramIndex++;
    }

    if (year && year.toString().trim() !== '') {
       // Uses idx_quotes_upload_date (efficiently if filtering on the indexed column)
       // EXTRACT is generally well-optimized on indexed date/timestamp columns
      whereClauses.push(`EXTRACT(YEAR FROM q.upload_date) = $${paramIndex}`);
      try {
        const yearInt = parseInt(year);
        if (isNaN(yearInt)) {
          throw new Error('Invalid year provided');
        }
        params.push(yearInt);
        paramIndex++;
      } catch (e) {
        console.error("Invalid year parameter:", year);
        // Handle invalid year input appropriately, e.g., return error or empty result
        return { data: [], total: 0 };
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
        SELECT COUNT(*) AS total
        FROM quotes q
      `;
      if (whereClauses.length > 0) {
          countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
      }
  // Use the same countParams as before    // Parameters for count query are the same as the main query's WHERE clause parameters
    const countParams = params.slice(0, paramIndex - 1); // Exclude LIMIT and OFFSET params

    try {
      // Execute queries
      console.log("Executing Query:", query);
      console.log("Parameters:", params);
      const result = await pool.query(query, params);

      console.log("Executing Count Query:", countQuery);
      console.log("Count Parameters:", countParams);
      const countResult = await pool.query(countQuery, countParams);
      const total = countResult.rows[0]?.total || 0;

      return {
        data: result.rows,
        total: parseInt(total, 10) // Ensure total is an integer
      };
    } catch (error) {
        console.error("Database Query Error:", error);
        // Rethrow or handle the error appropriately for your application
        throw new Error('Failed to execute search query.');
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

    const result = await pool.query(query);
    return result.rows;
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

    try {
        const result = await pool.query(query);
        return result.rows;
    } catch(error){
        console.error("Error fetching random quotes:", error);
        throw new Error('Failed to fetch random quotes.');
    }
  }
};

export default quoteModel;