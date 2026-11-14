import dotenv from 'dotenv';
import pg from 'pg';
import { applyV2DatabaseSuffix, getTenantDatabaseUrl } from '../tenants/tenant-manager.js';
import { normalizeSearchTerm } from '../utils/searchTerm.js';
const { Pool } = pg;

dotenv.config();

// Pool manager - creates and caches pools per tenant
const pools = new Map();
// Tracks whether a pool's `quotes` table uses the v2 columns (`start_s`/`end_s`, integer `line_number`)
// vs the v1 columns (`timestamp_start`/`timestamp_start_seconds`, varchar `line_number`).
// Both v1 and v2 databases have the normalized `videos` table.
const poolQuotesSchema = new WeakMap();

function isV2QuotesConnectionString(connectionString = '') {
  return (
    process.env.USE_V2_DB === 'true' ||
    process.env.DB_SCHEMA_VERSION === '2' ||
    /\/[^/?#]+_v2(?:[?#]|$)/i.test(String(connectionString))
  );
}

export function getQuotesSchemaForPool(pool) {
  const isV2 = poolQuotesSchema.get(pool) ?? false;
  return isV2
    ? {
        isV2: true,
        tsStartCol: 'q.start_s',
        tsStartSecsCol: 'q.start_s',
        tsStartRawCol: 'start_s',
        lineOrderExpr: 'q.line_number',
      }
    : {
        isV2: false,
        tsStartCol: 'q.timestamp_start',
        tsStartSecsCol: 'q.timestamp_start_seconds',
        tsStartRawCol: 'timestamp_start',
        lineOrderExpr: 'q.line_number::int',
      };
}

function flipQuotesSchemaForPool(pool) {
  const current = poolQuotesSchema.get(pool) ?? false;
  poolQuotesSchema.set(pool, !current);
  return getQuotesSchemaForPool(pool);
}

function getPoolForTenant(tenant) {
  if (!tenant) {
    // Fallback to default pool
    const defaultId = 'default';
    if (!pools.has(defaultId)) {
      pools.set(defaultId, createPool(applyV2DatabaseSuffix(process.env.DATABASE_URL)));
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

  poolQuotesSchema.set(pool, isV2QuotesConnectionString(connectionString));

  // Better connection error handling
  pool.on('error', (err) => {
    console.error('PostgreSQL Error:', err.message);
  });

  return pool;
}

// Create default pool for backward compatibility
const defaultPool = createPool(applyV2DatabaseSuffix(process.env.DATABASE_URL));
pools.set('default', defaultPool);

export { getPoolForTenant };

// Warm up the default connection pool (skip during unit test runs)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && process.env.DATABASE_URL) {
  (async () => {
    try {
      const pool = getPoolForTenant(null);
      const client = await pool.connect();
      try {
        const schemaRes = await client.query(`
          SELECT
            EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'videos'
            ) AS has_videos,
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'start_s'
            ) AS has_start_s
        `);
        const { has_videos: hasVideos, has_start_s: hasStartS } = schemaRes.rows[0] || {};
        poolQuotesSchema.set(pool, Boolean(hasStartS));

        if (hasVideos) {
          // Summing quote_count from the normalized videos table reads ~24k rows
          // instead of scanning all 13.8M rows of quotes on every server boot.
          const countRes = await client.query(
            'SELECT COALESCE(SUM(quote_count), 0) AS quote_count, COUNT(*) AS video_count FROM videos'
          );
          const { quote_count: quoteCount, video_count: videoCount } = countRes.rows[0] || {};
          console.log(
            `Database connected successfully with ${quoteCount} quotes across ${videoCount} videos (schema: ${hasStartS ? 'v2' : 'v1+videos'})`
          );
        }
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Initial PostgreSQL connection failed:', err.message);
    }
  })();
}

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

  // Get list of unique games from the normalized videos table
  async getGameList(tenant = null) {
    try {
      const pool = getPoolForTenant(tenant);
      const client = await pool.connect();
      try {
        // Query the normalized `videos` table (~23.6k rows, 130 buffers, ~14ms)
        // instead of walking the 13.8M-row `quotes` table (which required 8,295
        // buffers with a recursive loose index scan or 407,286 buffers without it,
        // and does not have `game_name` in the v2 schema).
        const result = await client.query(`
          SELECT DISTINCT game_name
          FROM videos
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

  // Search quotes with pagination using PostgreSQL FTS and the normalized videos + quotes schema
  async search({ searchTerm, searchPath: _searchPath, gameName, selectedValue, year, sortOrder, page = 1, limit = 10, exactPhrase = false, tenant = null }) {
    // Validate and sanitize inputs
    // Ensure page and limit are positive integers
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 10)); // Cap at 50 items

    searchTerm = normalizeSearchTerm(searchTerm);
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
    // When exactPhrase (Strict mode) is requested and the term is not already
    // using quoted websearch syntax, use phraseto_tsquery so multi-word queries
    // match adjacent phrases (`'word1' <-> 'word2'`) rather than boolean AND.
    const trimmedTerm = hasTerm ? searchTerm.trim() : '';
    const tsQueryFn = exactPhrase && !trimmedTerm.includes('"')
      ? 'phraseto_tsquery'
      : 'websearch_to_tsquery';

    // --- Search Term Conditions (on quotes q) ---
    if (hasTerm) {
      whereClauses.push(`q.fts_doc @@ ${tsQueryFn}('simple', $${paramIndex})`);
      params.push(trimmedTerm);
      paramIndex += 1;
    }

    // --- Filter Conditions (on normalized videos v, leveraging B-tree indexes) ---
    if (gameName && gameName !== 'all') {
      // Validate game name - basic protection
      const cleanGameName = gameName.replace(/['";]/g, '').trim();
      if (cleanGameName.length > 2) {
        whereClauses.push(`v.game_name = $${paramIndex}`);
        params.push(cleanGameName);
        paramIndex++;
      }
    }

    if (selectedValue && selectedValue !== 'all') {
      // Resolve the channel id to the exact stored channel_source value from
      // tenant config (`dbValue` or `name`). Exact equality is index-friendly
      // on `idx_videos_channel`.
      const channels = (tenant?.channels?.length ? tenant.channels : [
        { id: 'librarian', name: 'Librarian', dbValue: 'Librarian' },
        { id: 'northernlion', name: 'Northernlion', dbValue: 'Northernlion' }
      ]);
      const lowerSelectedValue = selectedValue.toLowerCase();
      const channelMatch = channels.find(ch => ch.id !== 'all' && ch.id.toLowerCase() === lowerSelectedValue);
      if (channelMatch) {
        const dbChannelValue = channelMatch.dbValue || channelMatch.name;
        whereClauses.push(`v.channel_source = $${paramIndex}`);
        params.push(dbChannelValue);
        paramIndex++;
        console.log(`[Search] Applied channel filter: ${dbChannelValue}`);
      } else {
        console.warn(`[Search] Channel "${selectedValue}" not in valid channels list for tenant ${tenant?.id || 'default'}`);
      }
    }

    if (year && year.toString().trim() !== '') {
      // Validate year is a 4-digit number between reasonable bounds
      try {
        const yearInt = parseInt(year);
        if (!isNaN(yearInt)) {
          // Range condition instead of EXTRACT(YEAR ...) so idx_videos_upload_date stays usable.
          whereClauses.push(`v.upload_date >= $${paramIndex} AND v.upload_date < $${paramIndex + 1}`);
          params.push(`${yearInt}-01-01`, `${yearInt + 1}-01-01`);
          paramIndex += 2;
        } else {
          console.error("Invalid year parameter:", year);
        }
      } catch {
        console.error("Invalid year parameter:", year);
        return { data: [], total: 0, totalQuotes: 0 };
      }
    }

    const whereSql = whereClauses.join(' AND ');

    // --- Sorting ---
    // Always order deterministically on videos: LIMIT/OFFSET without a stable ORDER BY
    // lets pages repeat or skip videos between requests.
    let innerOrder = 'v.video_id';
    let outerOrder = 'p.video_id';
    if (sortOrder === 'newest' || sortOrder === 'oldest') {
      const dir = sortOrder === 'newest' ? 'DESC' : 'ASC';
      innerOrder = `v.upload_date ${dir}, v.video_id`;
      outerOrder = `p.upload_date ${dir}, p.video_id`;
    }

    const limitParamIdx = paramIndex;
    const offsetParamIdx = paramIndex + 1;
    params.push(limit, offset);

    const buildSearchQuery = (schema) => {
      const textExpr = hasTerm
        ? `ts_headline('simple', q.text, ${tsQueryFn}('simple', $1),'MaxWords=5, MinWords=5, HighlightAll=TRUE')`
        : `q.text`;

      if (hasTerm && schema.isV2) {
        // v2 FTS search path: `fts_doc` covers the 3-line sliding window
        // (prev + current + next line) so phrases split across a line break
        // match. Adjacent rows matching the same occurrence are collapsed into
        // one result via gaps-and-islands (`run`), preferring the line that
        // matches on its own text (`in_line = true`) or the starting line of a
        // cross-line phrase (`in_line = false`). When `in_line` is false, the
        // neighboring line text is joined so `ts_headline` highlights the full
        // cross-line phrase.
        const v2HeadlineTarget = `CASE
          WHEN h.in_line THEN h.text
          WHEN to_tsvector('simple', COALESCE(h.text || ' ' || nq.text, h.text)) @@ tsq.q
            THEN COALESCE(h.text || ' ' || nq.text, h.text)
          ELSE CONCAT_WS(' ', pq.text, h.text, nq.text)
        END`;
        return `
          WITH tsq AS (
            SELECT ${tsQueryFn}('simple', $1) AS q
          ),
          raw_hits AS (
            SELECT q.video_id,
                   q.line_number,
                   q.text,
                   ${schema.tsStartCol} AS timestamp_start,
                   v.title,
                   v.upload_date,
                   v.channel_source,
                   (to_tsvector('simple', q.text) @@ tsq.q) AS in_line,
                   q.line_number - ROW_NUMBER() OVER (PARTITION BY q.video_id ORDER BY q.line_number) AS run
            FROM quotes q
            JOIN videos v ON v.video_id = q.video_id
            CROSS JOIN tsq
            WHERE ${whereSql}
          ),
          hits AS (
            SELECT DISTINCT ON (h.video_id, h.run)
                   h.video_id,
                   h.line_number,
                   h.text,
                   h.timestamp_start,
                   h.title,
                   h.upload_date,
                   h.channel_source,
                   h.in_line
            FROM raw_hits h
            ORDER BY h.video_id, h.run, h.in_line DESC, h.line_number
          ),
          page AS (
            SELECT v.video_id,
                   v.title,
                   v.upload_date,
                   v.channel_source,
                   COUNT(*) OVER () AS total_videos,
                   SUM(COUNT(*)) OVER () AS total_quotes
            FROM hits v
            GROUP BY v.video_id, v.title, v.upload_date, v.channel_source
            ORDER BY ${innerOrder}
            LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
          )
          SELECT p.video_id, p.title, p.upload_date, p.channel_source,
                 p.total_videos, p.total_quotes,
                 json_agg(json_build_object(
                   'text', ts_headline('simple', ${v2HeadlineTarget}, tsq.q, 'MaxWords=5, MinWords=5, HighlightAll=TRUE'),
                   'line_number', h.line_number,
                   'timestamp_start', h.timestamp_start,
                   'in_line', h.in_line,
                   'title', p.title,
                   'upload_date', p.upload_date,
                   'channel_source', p.channel_source
                 ) ORDER BY h.line_number) AS quotes
          FROM page p
          CROSS JOIN tsq
          JOIN hits h ON h.video_id = p.video_id
          LEFT JOIN quotes pq ON pq.video_id = (CASE WHEN NOT h.in_line THEN h.video_id END) AND pq.line_number = h.line_number - 1
          LEFT JOIN quotes nq ON nq.video_id = (CASE WHEN NOT h.in_line THEN h.video_id END) AND nq.line_number = h.line_number + 1
          GROUP BY p.video_id, p.title, p.upload_date, p.channel_source, p.total_videos, p.total_quotes
          ORDER BY ${outerOrder}`;
      }

      if (hasTerm) {
        // v1 FTS search path: join quotes + videos in the `page` CTE to pick the
        // page of matching videos and compute totals in one pass, carrying
        // video metadata on `p` so the outer query only fetches quotes for the
        // <= `limit` videos on the current page.
        return `
          WITH page AS (
            SELECT v.video_id,
                   v.title,
                   v.upload_date,
                   v.channel_source,
                   COUNT(*) OVER () AS total_videos,
                   SUM(COUNT(*)) OVER () AS total_quotes
            FROM quotes q
            JOIN videos v ON v.video_id = q.video_id
            WHERE ${whereSql}
            GROUP BY v.video_id, v.title, v.upload_date, v.channel_source
            ORDER BY ${innerOrder}
            LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
          )
          SELECT p.video_id, p.title, p.upload_date, p.channel_source,
                 p.total_videos, p.total_quotes,
                 json_agg(json_build_object(
                   'text', ${textExpr},
                   'line_number', q.line_number,
                   'timestamp_start', ${schema.tsStartCol},
                   'title', p.title,
                   'upload_date', p.upload_date,
                   'channel_source', p.channel_source
                 ) ORDER BY ${schema.lineOrderExpr}) AS quotes
          FROM page p
          JOIN quotes q ON q.video_id = p.video_id
          WHERE q.fts_doc @@ ${tsQueryFn}('simple', $1)
          GROUP BY p.video_id, p.title, p.upload_date, p.channel_source, p.total_videos, p.total_quotes
          ORDER BY ${outerOrder}`;
      }

      // Filter-only / game-only browse path: scan only the small `videos` table
      // in the `page` CTE (using precomputed `v.quote_count` for `total_quotes`),
      // then join `quotes` only for the <= `limit` videos on the requested page.
      // Benchmarked on Isaac (4,194 videos / 325k quotes): 525ms & 108k buffers -> 23ms & 782 buffers.
      return `
        WITH page AS (
          SELECT v.video_id,
                 v.title,
                 v.upload_date,
                 v.channel_source,
                 COUNT(*) OVER () AS total_videos,
                 SUM(v.quote_count) OVER () AS total_quotes
          FROM videos v
          WHERE v.quote_count > 0 AND ${whereSql}
          ORDER BY ${innerOrder}
          LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
        )
        SELECT p.video_id, p.title, p.upload_date, p.channel_source,
               p.total_videos, p.total_quotes,
               json_agg(json_build_object(
                 'text', q.text,
                 'line_number', q.line_number,
                 'timestamp_start', ${schema.tsStartCol},
                 'title', p.title,
                 'upload_date', p.upload_date,
                 'channel_source', p.channel_source
               ) ORDER BY ${schema.lineOrderExpr}) AS quotes
        FROM page p
        JOIN quotes q ON q.video_id = p.video_id
        GROUP BY p.video_id, p.title, p.upload_date, p.channel_source, p.total_videos, p.total_quotes
        ORDER BY ${outerOrder}`;
    };

    try {
      console.log(`[Search] Getting database pool for tenant: ${tenantId}`);
      const pool = getPoolForTenant(tenant);
      if (!pool) {
        throw new Error(`Failed to get database pool for tenant ${tenantId}`);
      }
      const client = await pool.connect();

      try {
        let schema = getQuotesSchemaForPool(pool);
        let result;
        try {
          result = await client.query(buildSearchQuery(schema), params);
        } catch (err) {
          if (err.code === '42703') {
            schema = flipQuotesSchemaForPool(pool);
            result = await client.query(buildSearchQuery(schema), params);
          } else {
            throw err;
          }
        }

        let totalVideos = 0;
        let totalQuotes = 0;
        if (result.rows.length > 0) {
          totalVideos = parseInt(result.rows[0].total_videos, 10) || 0;
          totalQuotes = parseInt(result.rows[0].total_quotes, 10) || 0;
        } else if (offset > 0) {
          // A page past the last result has no rows to carry the window
          // totals — recount so the pager still gets real numbers.
          const countQuery = hasTerm
            ? schema.isV2
              ? `WITH tsq AS (
                   SELECT ${tsQueryFn}('simple', $1) AS q
                 ),
                 raw_hits AS (
                   SELECT q.video_id,
                          q.line_number,
                          (to_tsvector('simple', q.text) @@ tsq.q) AS in_line,
                          q.line_number - ROW_NUMBER() OVER (PARTITION BY q.video_id ORDER BY q.line_number) AS run
                   FROM quotes q
                   JOIN videos v ON v.video_id = q.video_id
                   CROSS JOIN tsq
                   WHERE ${whereSql}
                 ),
                 hits AS (
                   SELECT DISTINCT ON (h.video_id, h.run)
                          h.video_id,
                          h.line_number
                   FROM raw_hits h
                   ORDER BY h.video_id, h.run, h.in_line DESC, h.line_number
                 )
                 SELECT COUNT(*) AS total_videos, COALESCE(SUM(quote_count), 0) AS total_quotes
                 FROM (SELECT h.video_id, COUNT(*) AS quote_count
                       FROM hits h
                       GROUP BY h.video_id) AS video_counts`
              : `SELECT COUNT(*) AS total_videos, COALESCE(SUM(quote_count), 0) AS total_quotes
                 FROM (SELECT q.video_id, COUNT(*) AS quote_count
                       FROM quotes q
                       JOIN videos v ON v.video_id = q.video_id
                       WHERE ${whereSql}
                       GROUP BY q.video_id) AS video_counts`
            : `SELECT COUNT(*) AS total_videos, COALESCE(SUM(v.quote_count), 0) AS total_quotes
               FROM videos v
               WHERE v.quote_count > 0 AND ${whereSql}`;
          const countResult = await client.query(
            countQuery,
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
    // SYSTEM sampling reads only the randomly-chosen blocks, so ORDER BY
    // random() over the (small) sample stays cheap while drawing from the
    // whole table. Joining `videos` after sampling 10 rows performs only 10
    // primary-key lookups on `videos_pkey`.
    const sampled = (pct, schema) => `
        SELECT q.video_id, v.title, v.upload_date, v.channel_source,
               q.text, q.line_number, ${schema.tsStartCol} AS timestamp_start
        FROM (
          SELECT video_id, text, line_number, ${schema.tsStartRawCol}
          FROM quotes
          TABLESAMPLE SYSTEM (${pct})
          ORDER BY random()
          LIMIT 10
        ) q
        JOIN videos v ON v.video_id = q.video_id;`;

    const fullRandom = (schema) => `
        SELECT q.video_id, v.title, v.upload_date, v.channel_source,
               q.text, q.line_number, ${schema.tsStartCol} AS timestamp_start
        FROM (
          SELECT video_id, text, line_number, ${schema.tsStartRawCol}
          FROM quotes
          ORDER BY random()
          LIMIT 10
        ) q
        JOIN videos v ON v.video_id = q.video_id;`;

    let client;
    try {
      const pool = getPoolForTenant(tenant);
      client = await pool.connect();
      let schema = getQuotesSchemaForPool(pool);
      let result;
      try {
        result = await client.query(sampled(0.02, schema));
      } catch (err) {
        if (err.code === '42703') {
          schema = flipQuotesSchemaForPool(pool);
          result = await client.query(sampled(0.02, schema));
        } else {
          throw err;
        }
      }
      if (result.rows.length < 10) {
        result = await client.query(sampled(1, schema));
      }
      if (result.rows.length < 10) {
        result = await client.query(fullRandom(schema));
      }

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

  // Newest upload in the corpus. Used as an honest <lastmod> for the pages whose
  // content is "the current set of videos" (homepage, /videos hub).
  async getLatestUploadDate(tenant = null) {
    try {
      const pool = getPoolForTenant(tenant);
      const result = await pool.query('SELECT max(upload_date) AS latest FROM videos');
      return result.rows[0]?.latest || null;
    } catch (error) {
      console.error('Error fetching latest upload date:', error);
      return null;
    }
  },

  // One video and every quote in it, for the server-rendered /video/:id page.
  // Reads video metadata from the normalized `videos` primary key and aggregates
  // quote lines from `quotes` in line_number order.
  async getVideo(videoId, tenant = null) {
    if (!videoId || typeof videoId !== 'string') return null;

    const buildVideoQuery = (schema) => `
      SELECT v.video_id,
             v.title,
             v.channel_source,
             v.upload_date,
             v.game_name,
             count(q.id) AS total_quotes,
             json_agg(json_build_object(
               'text', q.text,
               'line_number', q.line_number,
               'timestamp_start', ${schema.tsStartCol},
               'timestamp_start_seconds', ${schema.tsStartSecsCol}
             ) ORDER BY ${schema.lineOrderExpr}) AS quotes
      FROM videos v
      JOIN quotes q ON q.video_id = v.video_id
      WHERE v.video_id = $1
      GROUP BY v.video_id, v.title, v.channel_source, v.upload_date, v.game_name`;

    let client;
    try {
      const pool = getPoolForTenant(tenant);
      client = await pool.connect();
      let schema = getQuotesSchemaForPool(pool);
      let result;
      try {
        result = await client.query(buildVideoQuery(schema), [videoId]);
      } catch (err) {
        if (err.code === '42703') {
          schema = flipQuotesSchemaForPool(pool);
          result = await client.query(buildVideoQuery(schema), [videoId]);
        } else {
          throw err;
        }
      }

      if (!result.rows.length) return null;
      const row = result.rows[0];
      return { ...row, total_quotes: parseInt(row.total_quotes, 10) };
    } catch (error) {
      console.error('Error fetching video:', error);
      throw new Error(`Failed to fetch video: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  },

  // Video ids eligible for their own page, newest first.
  //
  // Queries the normalized `videos` table directly using `v.quote_count` and
  // `idx_videos_upload_date` (`videos(upload_date DESC, video_id)`). Instead of
  // aggregating 13.8M rows (407,286 buffers / ~3.2 GB) of `quotes`, this scans
  // `videos` (~23.6k rows, 18–550 buffers) in ~15–56ms.
  async listVideosForIndex({ minQuotes = 20, since = null, limit = 0, timeoutMs = 0 } = {}, tenant = null) {
    let client;
    let inTxn = false;
    try {
      const pool = getPoolForTenant(tenant);
      client = await pool.connect();
      if (timeoutMs > 0) {
        // SET LOCAL only lasts until COMMIT/ROLLBACK, so the pooled connection
        // goes back with its normal timeout.
        await client.query('BEGIN');
        inTxn = true;
        await client.query(`SET LOCAL statement_timeout = ${parseInt(timeoutMs, 10)}`);
      }
      const result = await client.query(
        `SELECT v.video_id,
                v.title,
                v.game_name,
                v.upload_date,
                v.quote_count
         FROM videos v
         WHERE v.quote_count >= $1
           AND ($2::date IS NULL OR v.upload_date >= $2::date)
         ORDER BY v.upload_date DESC, v.video_id
         ${limit > 0 ? 'LIMIT ' + parseInt(limit, 10) : ''}`,
        [minQuotes, since]
      );
      if (inTxn) {
        await client.query('COMMIT');
        inTxn = false;
      }
      return result.rows.map((r) => ({
        videoId: r.video_id,
        title: r.title,
        gameName: r.game_name,
        uploadDate: r.upload_date,
        quoteCount: parseInt(r.quote_count, 10),
      }));
    } catch (error) {
      // Deliberately NOT swallowed into an empty array. This list decides which
      // video pages are indexable, so "the query failed" and "there are no
      // videos" must never look the same to the caller: returning [] once put
      // noindex on every video page for six hours.
      console.error('Error listing videos for index:', error);
      if (inTxn) await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Database error occurred: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  }
};

export default quoteModel;
