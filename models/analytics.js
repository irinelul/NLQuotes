import pkg from 'pg';
const { Pool } = pkg;

// Create a new pool for analytics with a separate connection string
let analyticsConnectionString;
if (process.env.ANALYTICS_DATABASE_URL) {
  analyticsConnectionString = process.env.ANALYTICS_DATABASE_URL;
  console.log('Using ANALYTICS_DATABASE_URL from environment');
} else if (process.env.DATABASE_URL) {
  // Replace the database name in the connection string with 'analytics'
  analyticsConnectionString = process.env.DATABASE_URL.replace(/\/([^/]+)$/, '/analytics');
  console.log('Using DATABASE_URL with analytics database substitution');
} else {
  throw new Error('Neither ANALYTICS_DATABASE_URL nor DATABASE_URL is set');
}

console.log('Analytics connection string (masked):', analyticsConnectionString.replace(/:[^:]*@/, ':****@'));

const pool = new Pool({
  connectionString: analyticsConnectionString,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Track connection events
let totalConnections = 0;
pool.on('connect', () => {
  totalConnections++;
  console.log('Analytics database connection established');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle analytics client', err);
});

// Analytics model functions
const analyticsModel = {
  // Store a track event
  async storeEvent(eventData) {
    console.log('Attempting to store analytics event:', eventData);
    const client = await pool.connect();
    try {
      // Validate required fields
      if (!eventData.type) {
        throw new Error('Missing required field: type');
      }

      let query;
      let values;

      if (eventData.type === 'page_view') {
        // Handle page view events
        if (!eventData.path || !eventData.start_time) {
          throw new Error('Missing required fields for page_view: path and start_time are required');
        }

        query = `
          INSERT INTO track_event (
            type,
            path,
            query_params,
            referrer,
            user_hash,
            start_time,
            duration_seconds,
            created_at,
            device,
            os,
            browser,
            screen_width,
            screen_height,
            pixel_ratio,
            language,
            timezone,
            region,
            city,
            domain,
            session_id,
            game
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          RETURNING id
        `;

        values = [
          eventData.type,
          eventData.path,
          eventData.query_params || null,
          eventData.referrer || null,
          eventData.user_hash,
          eventData.start_time,
          eventData.duration_seconds || 0,
          eventData.timestamp || new Date().toISOString(),
          eventData.device || null,
          eventData.os || null,
          eventData.browser || null,
          eventData.screen?.width || null,
          eventData.screen?.height || null,
          eventData.screen?.pixelRatio || null,
          eventData.language || null,
          eventData.timezone || null,
          eventData.region || null,
          eventData.city || null,
          eventData.domain || null,
          eventData.session_id || null,
          eventData.game || null
        ];
      } else if (eventData.type === 'ending_session') {
        // Handle ending_session events (session end/page unload)
        if (!eventData.path || !eventData.start_time) {
          throw new Error('Missing required fields for ending_session: path and start_time are required');
        }

        query = `
          INSERT INTO track_event (
            type,
            path,
            query_params,
            referrer,
            user_hash,
            start_time,
            duration_seconds,
            created_at,
            device,
            os,
            browser,
            screen_width,
            screen_height,
            pixel_ratio,
            language,
            timezone,
            region,
            city,
            domain,
            session_id,
            response_time_ms,
            game
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          RETURNING id
        `;

        values = [
          eventData.type,
          eventData.path,
          eventData.query_params || null,
          eventData.referrer || null,
          eventData.user_hash,
          eventData.start_time,
          eventData.duration_seconds || 0,
          eventData.timestamp || new Date().toISOString(),
          eventData.device || null,
          eventData.os || null,
          eventData.browser || null,
          eventData.screen?.width || null,
          eventData.screen?.height || null,
          eventData.screen?.pixelRatio || null,
          eventData.language || null,
          eventData.timezone || null,
          eventData.region || null,
          eventData.city || null,
          eventData.domain || null,
          eventData.session_id || null,
          eventData.response_time_ms || null,
          eventData.game || null
        ];
      } else if (eventData.type === 'starting_session') {
        // Handle starting_session events (session start/page load)
        if (!eventData.path) {
          throw new Error('Missing required field for starting_session: path');
        }

        query = `
          INSERT INTO track_event (
            type,
            path,
            query_params,
            referrer,
            user_hash,
            start_time,
            duration_seconds,
            created_at,
            device,
            os,
            browser,
            screen_width,
            screen_height,
            pixel_ratio,
            language,
            timezone,
            region,
            city,
            domain,
            session_id,
            response_time_ms,
            game
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          RETURNING id
        `;

        values = [
          eventData.type,
          eventData.path,
          eventData.query_params || null,
          eventData.referrer || null,
          eventData.user_hash,
          eventData.start_time || new Date().toISOString(),
          eventData.duration_seconds || 0,
          eventData.timestamp || new Date().toISOString(),
          eventData.device || null,
          eventData.os || null,
          eventData.browser || null,
          eventData.screen?.width || null,
          eventData.screen?.height || null,
          eventData.screen?.pixelRatio || null,
          eventData.language || null,
          eventData.timezone || null,
          eventData.region || null,
          eventData.city || null,
          eventData.domain || null,
          eventData.session_id || null,
          eventData.response_time_ms || null,
          eventData.game || null
        ];
      } else if (eventData.type === 'search') {
        // Handle search events
        if (!eventData.search_term) {
          throw new Error('Missing required field for search: search_term');
        }

        query = `
          INSERT INTO track_event (
            type,
            path,
            search_term,
            channel,
            year,
            sort_order,
            game,
            strict,
            user_hash,
            created_at,
            device,
            os,
            browser,
            screen_width,
            screen_height,
            pixel_ratio,
            language,
            timezone,
            region,
            city,
            domain,
            session_id,
            page,
            total_pages,
            response_time_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          RETURNING id
        `;

        values = [
          eventData.type,
          eventData.path || null,
          eventData.search_term,
          eventData.channel || null,
          eventData.year || null,
          eventData.sort_order || null,
          eventData.game || null,
          eventData.strict || false,
          eventData.user_hash,
          eventData.timestamp || new Date().toISOString(),
          eventData.device || null,
          eventData.os || null,
          eventData.browser || null,
          eventData.screen?.width || null,
          eventData.screen?.height || null,
          eventData.screen?.pixelRatio || null,
          eventData.language || null,
          eventData.timezone || null,
          eventData.region || null,
          eventData.city || null,
          eventData.domain || null,
          eventData.session_id || null,
          eventData.page || 1,
          eventData.total_pages || null,
          eventData.response_time_ms || null
        ];
      } else if (eventData.type === 'pagination') {
        // Handle pagination events
        if (!eventData.search_term || !eventData.page) {
          throw new Error('Missing required fields for pagination: search_term and page');
        }

        query = `
          INSERT INTO track_event (
            type,
            path,
            search_term,
            channel,
            year,
            sort_order,
            game,
            strict,
            page,
            total_pages,
            user_hash,
            created_at,
            device,
            os,
            browser,
            screen_width,
            screen_height,
            pixel_ratio,
            language,
            timezone,
            region,
            city,
            domain,
            session_id,
            response_time_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          RETURNING id
        `;

        values = [
          eventData.type,
          eventData.path || null,
          eventData.search_term,
          eventData.channel || null,
          eventData.year || null,
          eventData.sort_order || null,
          eventData.game || null,
          eventData.strict || false,
          eventData.page,
          eventData.total_pages || null,
          eventData.user_hash,
          eventData.timestamp || new Date().toISOString(),
          eventData.device || null,
          eventData.os || null,
          eventData.browser || null,
          eventData.screen?.width || null,
          eventData.screen?.height || null,
          eventData.screen?.pixelRatio || null,
          eventData.language || null,
          eventData.timezone || null,
          eventData.region || null,
          eventData.city || null,
          eventData.domain || null,
          eventData.session_id || null,
          eventData.response_time_ms || null
        ];
      } else {
        throw new Error(`Unknown event type: ${eventData.type}`);
      }

      console.log('Executing query with', values.length, 'parameters');
      const result = await client.query(query, values);
      console.log('Query executed successfully, inserted row with id:', result.rows[0]?.id);
      return result.rows[0];
    } catch (error) {
      console.error(' Error storing analytics event:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
        where: error.where,
        stack: error.stack
      });
      console.error('Event data that failed:', JSON.stringify(eventData, null, 2));
      console.error('Query that failed:', query);
      console.error('Values that failed:', values);
      throw error;
    } finally {
      client.release();
    }
  },

  // Get analytics data (for admin purposes)
  async getAnalytics(limit = 100) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT *
        FROM track_event
        ORDER BY created_at DESC
        LIMIT $1
      `;

      const result = await client.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Get popular search terms for AdSense pages
  async getPopularSearchTerms(limit = 20, timeRange = '7d') {
    const client = await pool.connect();
    try {
      let timeFilter = '';
      let params = [limit];
      
      // Add time-based filtering
      switch (timeRange) {
        case '1d':
          timeFilter = "AND created_at >= NOW() - INTERVAL '1 day'";
          break;
        case '2d':
          timeFilter = "AND created_at >= NOW() - INTERVAL '2 days'";
          break;
        case '7d':
          timeFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          timeFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          timeFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
          break;
        case 'all':
        default:
          timeFilter = '';
          break;
      }

      const query = `
        SELECT 
          search_term,
          COUNT(*) as count
        FROM track_event 
        WHERE type = 'search' 
          AND search_term IS NOT NULL 
          AND search_term != ''
          AND LENGTH(search_term) >= 2
          ${timeFilter}
        GROUP BY search_term 
        ORDER BY count DESC 
        LIMIT $1
      `;

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching popular search terms:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Check database connection
  async checkConnection() {
    try {
      const client = await pool.connect();
      try {
        // First check basic connectivity
        await client.query('SELECT 1');
        
        // Check if track_event table exists
        const tableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'track_event'
          ) as table_exists
        `);
        
        if (!tableCheck.rows[0].table_exists) {
          console.error('track_event table does not exist in the database!');
          console.error('Please create the track_event table. Check migrations or create it manually.');
          return false;
        }
        
        console.log('track_event table exists');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Analytics database connection check failed:', error);
      console.error('Connection error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail
      });
      return false;
    }
  }
};

export default analyticsModel; 