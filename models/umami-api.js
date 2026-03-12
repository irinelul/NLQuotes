/**
 * Umami API client for querying analytics data (search events, etc.)
 * 
 * Self-hosted Umami exposes a REST API. We use it server-side to pull
 * custom event data (e.g. search queries) so we can serve a
 * "Popular Searches" endpoint without a separate analytics DB.
 *
 * Required env vars:
 *   UMAMI_API_URL      – Base URL of your Umami instance (e.g. https://umami.nlquotes.com)
 *   UMAMI_API_TOKEN    – API key created in Umami Settings → API Keys
 *                        (alternatively, set UMAMI_USERNAME + UMAMI_PASSWORD for login-based auth)
 */

const UMAMI_API_URL = (process.env.UMAMI_API_URL || 'https://umami.nlquotes.com').replace(/\/+$/, '');
const UMAMI_API_TOKEN = process.env.UMAMI_API_TOKEN || '';
const UMAMI_USERNAME = process.env.UMAMI_USERNAME || '';
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || '';

// Cache the login token so we don't re-auth on every request
let cachedToken = UMAMI_API_TOKEN || null;
let tokenExpiry = UMAMI_API_TOKEN ? Date.now() + 365 * 24 * 60 * 60 * 1000 : 0; // API keys don't expire

/**
 * Get a valid auth token — uses static API key if set,
 * otherwise logs in with username/password.
 */
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!UMAMI_USERNAME || !UMAMI_PASSWORD) {
    throw new Error('Umami API: No UMAMI_API_TOKEN or UMAMI_USERNAME/UMAMI_PASSWORD configured');
  }

  const res = await fetch(`${UMAMI_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: UMAMI_USERNAME, password: UMAMI_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Umami login failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.token;
  // Umami login tokens last ~24h — refresh well before that
  tokenExpiry = Date.now() + 12 * 60 * 60 * 1000;
  return cachedToken;
}

/**
 * Helper to call an authenticated Umami API endpoint.
 */
async function umamiGet(path, params = {}) {
  const token = await getToken();
  const url = new URL(`${UMAMI_API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Umami API ${path} failed: ${res.status} ${res.statusText} — ${text}`);
  }

  return res.json();
}

/**
 * Convert a human-readable time range string to { startAt, endAt } timestamps.
 */
function timeRangeToTimestamps(timeRange = '7d') {
  const now = Date.now();
  const ranges = {
    '1d': 1,
    '2d': 2,
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };

  const days = ranges[timeRange];
  if (!days) {
    // 'all' — go back ~2 years
    return { startAt: now - 730 * 24 * 60 * 60 * 1000, endAt: now };
  }
  return { startAt: now - days * 24 * 60 * 60 * 1000, endAt: now };
}

// ─── Public API ────────────────────────────────────────────

const umamiApi = {
  /**
   * Get popular search terms from Umami custom event data.
   *
   * Queries the event named "search" and the field "query" which
   * the frontend sends via `umami.track('search', { query: ... })`.
   *
   * @param {string} websiteId  Umami website ID (UUID)
   * @param {object} opts
   * @param {number} opts.limit     Max results (default 20)
   * @param {string} opts.timeRange '1d' | '2d' | '7d' | '30d' | '90d' | 'all'
   * @returns {Promise<Array<{ value: string, total: number }>>}
   */
  async getPopularSearches(websiteId, { limit = 20, timeRange = '7d' } = {}) {
    if (!websiteId) {
      throw new Error('Umami API: websiteId is required');
    }

    const { startAt, endAt } = timeRangeToTimestamps(timeRange);

    // GET /api/websites/:websiteId/event-data/values
    // Returns: [{ value: "search term", total: 5 }, ...]
    const data = await umamiGet(`/api/websites/${websiteId}/event-data/values`, {
      startAt,
      endAt,
      eventName: 'search',
      fieldName: 'query',
    });

    // Sort by total descending and limit
    const sorted = (Array.isArray(data) ? data : [])
      .filter(item => item.value && String(item.value).trim().length >= 2)
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, limit);

    return sorted;
  },

  /**
   * Check if the Umami API is reachable and authenticated.
   */
  async healthCheck() {
    try {
      const token = await getToken();
      return { healthy: true, hasToken: !!token };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  },
};

export default umamiApi;
