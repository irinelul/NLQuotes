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
    // Server-side cancellation of slow queries. The previous Promise.race
    // timeouts abandoned the query but left it running on the connection,
    // so the next request checking out that pooled connection queued
    // behind the still-running statement.
    statement_timeout: 10000,
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
    const tenantId = tenant?.id || 'default';
    console.log(`[Search] PostgreSQL search - Tenant: ${tenantId}, term="${searchTerm}", game="${gameName}", channel=${selectedValue}, year=${year}, sort=${sortOrder}, page=${page}, exactPhrase=${exactPhrase}`);

    const whereClauses = [];

    // --- Search Term Conditions ---
    if (hasTerm) {
      whereClauses.push(`q.fts_doc @@ websearch_to_tsquery('simple', $${paramIndex})`);
      params.push(searchTerm.trim());
      paramIndex += 1;
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

    const whereSql = whereClauses.join(' AND ');

    // Highlight matches only when there is a term; game-only browsing has no $1 to reference.
    const textExpr = hasTerm
      ? `ts_headline('simple', q.text, websearch_to_tsquery('simple', $1),'MaxWords=5, MinWords=5, HighlightAll=TRUE')`
      : `q.text`;

    // --- Sorting ---
    // Always order deterministically: LIMIT/OFFSET without a stable ORDER BY
    // lets pages repeat or skip videos between requests.
    let innerOrder = 'q.video_id';
    let outerOrder = 'q.video_id';
    if (sortOrder === 'newest' || sortOrder === 'oldest') {
      const dir = sortOrder === 'newest' ? 'DESC' : 'ASC';
      innerOrder = `MAX(q.upload_date) ${dir}, q.video_id`;
      outerOrder = `q.upload_date ${dir}, q.video_id`;
    }

    // Single combined query. The inner CTE picks the page of video_ids from
    // the index-matched rows and computes the result totals in the same pass
    // (window functions over the grouped rows). This matters because:
    //  - the planner always starts from the GIN/btree index; the old
    //    GROUP BY ... ORDER BY video_id LIMIT shape tempted it into walking
    //    idx_video_line and filtering row-by-row, which cost ~1.7s for RARE
    //    terms (benchmarked July 2026);
    //  - ts_headline runs only for the <= `limit` videos on the page;
    //  - the separate count query (a second full FTS scan) is gone.
    const query = `
      WITH page AS (
        SELECT q.video_id,
               COUNT(*) OVER () AS total_videos,
               SUM(COUNT(*)) OVER () AS total_quotes
        FROM quotes q
        WHERE ${whereSql}
        GROUP BY q.video_id
        ORDER BY ${innerOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      )
      SELECT q.video_id, q.title, q.upload_date, q.channel_source,
             p.total_videos, p.total_quotes,
             json_agg(json_build_object(
               'text', ${textExpr},
               'line_number', q.line_number,
               'timestamp_start', q.timestamp_start,
               'title', q.title,
               'upload_date', q.upload_date,
               'channel_source', q.channel_source
             ) ORDER BY q.line_number::int) AS quotes
      FROM quotes q
      JOIN page p ON p.video_id = q.video_id
      WHERE ${whereSql}
      GROUP BY q.video_id, q.title, q.upload_date, q.channel_source, p.total_videos, p.total_quotes
      ORDER BY ${outerOrder}`;
    params.push(limit, offset);

    try {
      console.log(`[Search] Getting database pool for tenant: ${tenantId}`);
      const pool = getPoolForTenant(tenant);
      if (!pool) {
        throw new Error(`Failed to get database pool for tenant ${tenantId}`);
      }
      const client = await pool.connect();

      try {
        const result = await client.query(query, params);

        let totalVideos = 0;
        let totalQuotes = 0;
        if (result.rows.length > 0) {
          totalVideos = parseInt(result.rows[0].total_videos, 10) || 0;
          totalQuotes = parseInt(result.rows[0].total_quotes, 10) || 0;
        } else if (offset > 0) {
          // A page past the last result has no rows to carry the window
          // totals — recount so the pager still gets real numbers.
          const countResult = await client.query(
            `SELECT COUNT(*) AS total_videos, SUM(quote_count) AS total_quotes
             FROM (SELECT q.video_id, COUNT(*) AS quote_count
                   FROM quotes q
                   WHERE ${whereSql}
                   GROUP BY q.video_id) AS video_counts`,
            params.slice(0, params.length - 2)
          );
          totalVideos = parseInt(countResult.rows[0]?.total_videos || 0, 10);
          totalQuotes = parseInt(countResult.rows[0]?.total_quotes || 0, 10);
        }

        // Keep the response shape unchanged: totals travel on every row of
        // the combined query but don't belong in the per-video payload.
        const data = result.rows.map(({ total_videos: _tv, total_quotes: _tq, ...video }) => video);

        console.log(`[Search] Query completed for tenant ${tenantId} - Videos: ${totalVideos}, Quotes: ${totalQuotes}, Results returned: ${data.length}`);

        return {
          data,
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
      // 57014 = statement cancelled by statement_timeout
      if (error.code === '57014' || error.message.includes('timeout')) {
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
