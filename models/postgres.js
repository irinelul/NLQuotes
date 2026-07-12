import dotenv from 'dotenv';
import pg from 'pg';
import { getTenantDatabaseUrl } from '../tenants/tenant-manager.js';
const { Pool } = pg;

dotenv.config();

// Pool manager - creates and caches pools per tenant
const pools = new Map();

function getPoolForTenant(tenant) {
  if (!tenant) {
    // Fallback to default pool
    const defaultId = 'default';
    if (!pools.has(defaultId)) {
      pools.set(defaultId, createPool(process.env.DATABASE_URL));
    }
    return pools.get(defaultId);
  }
  
  const tenantId = tenant.id || 'default';
  
  if (!pools.has(tenantId)) {
    const dbUrl = getTenantDatabaseUrl(tenant);
    if (!dbUrl) {
      throw new Error(`No database URL configured for tenant ${tenantId}`);
    }
    pools.set(tenantId, createPool(dbUrl));
    console.log(`Created database pool for tenant: ${tenantId}`);
  }
  
  return pools.get(tenantId);
}

function createPool(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 15,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000
  });
  
  // Better connection error handling
  pool.on('error', (err) => {
    console.error('PostgreSQL Error:', err.message);
  });
  
  return pool;
}

// Create default pool for backward compatibility
const defaultPool = createPool(process.env.DATABASE_URL);
pools.set('default', defaultPool);

export { getPoolForTenant };

// Warm up the default connection pool
(async () => {
  try {
    const pool = getPoolForTenant(null);
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
  }
})();

// Health check function to verify database connectivity
const checkDatabaseHealth = async (tenant = null) => {
  let client;
  try {
    const pool = getPoolForTenant(tenant);
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
  async getGameList(tenant = null) {
    try {
      const pool = getPoolForTenant(tenant);
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT DISTINCT game_name 
          FROM quotes 
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
  async search({ searchTerm, searchPath: _searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10, exactPhrase = false, tenant = null }) {
    // Validate and sanitize inputs
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 10)); // Cap at 50 items
    
    // Validate search term length
    if (searchTerm && searchTerm.trim().length < 3) {
      return { data: [], total: 0, totalQuotes: 0 };
    }

    const hasTerm = !!(searchTerm && searchTerm.trim().length > 2);
    const hasGameFilter = !!(gameName && gameName !== 'all' && gameName.replace(/['";]/g, '').trim().length > 2);

    // Nothing to search or browse by — answer without touching the database.
    // (An unfiltered query would otherwise GROUP BY the entire quotes table.)
    if (!hasTerm && !hasGameFilter) {
      return { data: [], total: 0, totalQuotes: 0 };
    }

    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    // We only search in text now, so no need to validate searchPath
    // log search parameters with tenant info
    const tenantId = tenant?.id || 'default';
    console.log(`[Search] PostgreSQL search - Tenant: ${tenantId}, term="${searchTerm}", game="${gameName}", channel=${selectedValue}, year=${year}, sort=${sortOrder}, page=${page}, exactPhrase=${exactPhrase}`);

    // Highlight matches only when there is a term; game-only browsing has no $1 to reference.
    const textExpr = hasTerm
      ? `ts_headline('simple', q.text, websearch_to_tsquery('simple', $1),'MaxWords=5, MinWords=5, HighlightAll=TRUE')`
      : `q.text`;

    // Base query structure remains similar
    let query = `
      SELECT q.video_id, q.title, q.upload_date, q.channel_source,
             json_agg(json_build_object(
               'text', ${textExpr},
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
      // Resolve the channel id to the exact stored channel_source value from
      // tenant config (config `name` mirrors the DB value). Exact equality is
      // index-friendly; LOWER(channel_source) forced a scan of the whole index.
      const channels = (tenant?.channels?.length ? tenant.channels : [
        { id: 'librarian', name: 'Librarian' },
        { id: 'northernlion', name: 'Northernlion' }
      ]);
      const lowerSelectedValue = selectedValue.toLowerCase();
      const channelMatch = channels.find(ch => ch.id !== 'all' && ch.id.toLowerCase() === lowerSelectedValue);
      if (channelMatch) {
        whereClauses.push(`q.channel_source = $${paramIndex}`);
        params.push(channelMatch.name);
        paramIndex++;
        console.log(`[Search] Applied channel filter: ${channelMatch.name}`);
      } else {
        console.warn(`[Search] Channel "${selectedValue}" not in valid channels list for tenant ${tenant?.id || 'default'}`);
      }
    }

    if (year && year.toString().trim() !== '') {
      // Validate year is a 4-digit number between reasonable bounds
      try {
        const yearInt = parseInt(year);
        if (!isNaN(yearInt)) {
          // Range condition instead of EXTRACT(YEAR ...) so the upload_date
          // btree indexes stay usable.
          whereClauses.push(`q.upload_date >= $${paramIndex} AND q.upload_date < $${paramIndex + 1}`);
          params.push(`${yearInt}-01-01`, `${yearInt + 1}-01-01`);
          paramIndex += 2;
        } else {
          console.error("Invalid year parameter:", year);
        }
      } catch {
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
    // Always order deterministically: LIMIT/OFFSET without a stable ORDER BY
    // lets pages repeat or skip videos between requests.
    if (sortOrder === 'newest' || sortOrder === 'oldest') {
      query += ` ORDER BY q.upload_date ${sortOrder === 'newest' ? 'DESC' : 'ASC'}, q.video_id`;
    } else {
      query += ` ORDER BY q.video_id`;
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
          WHERE q.fts_doc @@ query
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
      console.log(`[Search] Getting database pool for tenant: ${tenantId}`);
      const pool = getPoolForTenant(tenant);
      if (!pool) {
        throw new Error(`Failed to get database pool for tenant ${tenantId}`);
      }
      console.log(`[Search] Database pool obtained, connecting...`);
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
        // Execute main query with timeout
        const queryPromise = client.query(query, params);
        const queryTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query execution timeout')), 10000)
        );
        
        const result = await Promise.race([queryPromise, queryTimeoutPromise])
          .catch(err => {
            console.error(`[Search] Query execution error for tenant ${tenantId}:`, err.message);
            if (err.message === 'Query execution timeout') {
              throw new Error('Query timed out after 10s');
            }
            throw err;
          });
        
        console.log(`[Search] Main query executed successfully, rows: ${result.rows?.length || 0}`);
        
        // Execute count query with timeout
        const countPromise = client.query(countQuery, countParams);
        const countTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Count query timeout')), 5000)
        );
        
        const countResult = await Promise.race([countPromise, countTimeoutPromise])
          .catch(err => {
            console.error(`[Search] Count query error for tenant ${tenantId}:`, err.message);
            if (err.message === 'Count query timeout') {
              // Return empty count result instead of failing
              return { rows: [{ total_videos: 0, total_quotes: 0 }] };
            }
            throw err;
          });
        
        // Get both total videos and total quotes
        const totalVideos = parseInt(countResult.rows[0]?.total_videos || 0, 10);
        const totalQuotes = parseInt(countResult.rows[0]?.total_quotes || 0, 10);
        
        console.log(`[Search] Query completed for tenant ${tenantId} - Videos: ${totalVideos}, Quotes: ${totalQuotes}, Results returned: ${result.rows?.length || 0}`);
  
        return {
          data: result.rows,
          total: totalVideos,
          totalQuotes: totalQuotes,
          queryTime: null
        };
      } finally {
        // Always release the client back to the pool
        client.release();
      }
    } catch (error) {
      console.error(`[Search] Database Query Error for tenant ${tenantId}:`, error);
      console.error(`[Search] Error details:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      // Provide a meaningful error without exposing details
      if (error.message.includes('timeout')) {
        throw new Error('Database query timed out. Please try again or with a more specific search.');
      } else if (error.message.includes('permission denied') || error.code === '42501') {
        console.error(`[Search] PERMISSION ERROR: Database user may not have required permissions for tenant ${tenantId}`);
        throw new Error('Database permission error. Please check database user permissions.');
      } else {
        throw new Error(`Database error occurred: ${error.message}`);
      }
    }
  },

  async getRandom(tenant = null) {
    const query = `
        SELECT
        video_id, title, upload_date, channel_source, text, line_number, timestamp_start
        FROM quotes
        TABLESAMPLE BERNOULLI (0.01) 
        LIMIT 10;`;

    let client;
    try {
      const pool = getPoolForTenant(tenant);
      client = await pool.connect();
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
  }
};

export default quoteModel;