import crypto from 'crypto';
import { getPoolForTenant } from './postgres.js';

// In-house privacy-friendly analytics (see migrations/003_create_analytics_events.sql).
// Every write here is fire-and-forget: analytics must never slow down or break
// a user-facing request, so callers do NOT await and all errors are swallowed
// after a console.error.

const CLIENT_EVENT_TYPES = new Set([
    'page_view',
    'filter_change',
    'pagination',
    'quote_play',
    'quote_copy',
    'youtube_open',
    'tweet_share',
    'quote_flag',
    'flag_submit',
    'feedback_open',
    'feedback_submit',
    'changelog_open',
    'theme_toggle',
    'external_link',
    'video_watch',          // props: { seconds, reason } — how long a clip actually played
    'video_thumbnail_play', // direct thumbnail click (no timestamp), invisible to quote_play
    'scroll_depth',         // props: { depth } — 25/50/75/100, once per search
    'nldle_start',
    'nldle_guess',          // props: { round, correct }
    'nldle_finish',         // props: { score, total, perfect, streak }
]);

// ---- opt-out ----------------------------------------------------------------

// A request is trackable unless the user opted out on the privacy page
// (the frontend then sends X-NLQ-Opt-Out) or the browser broadcasts
// Do Not Track / Global Privacy Control.
export function shouldTrack(req) {
    if (req.get('x-nlq-opt-out') === '1') return false;
    if (req.get('dnt') === '1') return false;
    if (req.get('sec-gpc') === '1') return false;
    return true;
}

// ---- anonymous visitor hash --------------------------------------------------

// Daily rotating salt, persisted so hashes stay stable across server restarts
// within the same day but can never be correlated across days.
const saltCache = new Map(); // day string -> salt

async function getDailySalt(pool) {
    const day = new Date().toISOString().slice(0, 10);
    if (saltCache.has(day)) return saltCache.get(day);

    const fresh = crypto.randomBytes(32).toString('hex');
    // Upsert-read: first writer wins, everyone gets the same salt for the day.
    const result = await pool.query(
        `INSERT INTO analytics_salt (day, salt) VALUES ($1, $2)
         ON CONFLICT (day) DO UPDATE SET salt = analytics_salt.salt
         RETURNING salt`,
        [day, fresh]
    );
    const salt = result.rows[0].salt;
    saltCache.clear(); // drop yesterday's entry
    saltCache.set(day, salt);
    return salt;
}

function clientIp(req) {
    // Cloudflare -> Coolify proxy -> express. Never stored, only hashed.
    return req.get('cf-connecting-ip')
        || (req.get('x-forwarded-for') || '').split(',')[0].trim()
        || req.ip
        || '';
}

async function visitorHash(req, pool) {
    const salt = await getDailySalt(pool);
    const ua = req.get('user-agent') || '';
    return crypto.createHash('sha256')
        .update(`${salt}|${clientIp(req)}|${ua}`)
        .digest('hex')
        .slice(0, 16);
}

// ---- user agent parsing (coarse on purpose — device class, not fingerprint) --

export function parseUserAgent(ua = '') {
    let device = 'desktop';
    if (/ipad|tablet/i.test(ua)) device = 'tablet';
    else if (/mobi|iphone|android.*mobile/i.test(ua)) device = 'mobile';
    else if (/bot|crawl|spider|slurp|preview/i.test(ua)) device = 'bot';

    let os = 'other';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
    else if (/mac os/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'other';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
    else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua)) browser = 'Safari';

    return { device, os, browser };
}

// ---- insert ------------------------------------------------------------------

const trunc = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));
const toInt = (v) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : null;
};

async function insertEvent(tenant, fields) {
    const pool = getPoolForTenant(tenant);
    await pool.query(
        `INSERT INTO analytics_events (
            tenant_id, source, event_type, visitor_hash,
            path, referrer, country, device, os, browser, language,
            screen_width, screen_height,
            search_term, search_mode, game, channel, year, sort_order, page,
            result_videos, result_quotes, response_time_ms,
            video_id, quote_timestamp, props
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
        [
            tenant?.id || 'default', fields.source, fields.event_type, fields.visitor_hash,
            trunc(fields.path, 500), trunc(fields.referrer, 500), trunc(fields.country, 2),
            trunc(fields.device, 20), trunc(fields.os, 50), trunc(fields.browser, 50), trunc(fields.language, 35),
            toInt(fields.screen_width), toInt(fields.screen_height),
            trunc(fields.search_term, 500), trunc(fields.search_mode, 20), trunc(fields.game, 255),
            trunc(fields.channel, 100), toInt(fields.year), trunc(fields.sort_order, 20), toInt(fields.page),
            toInt(fields.result_videos), toInt(fields.result_quotes), toInt(fields.response_time_ms),
            trunc(fields.video_id, 20), toInt(fields.quote_timestamp),
            fields.props ? JSON.stringify(fields.props) : null,
        ]
    );
}

function requestContext(req) {
    const { device, os, browser } = parseUserAgent(req.get('user-agent'));
    return {
        country: trunc(req.get('cf-ipcountry'), 2),
        device, os, browser,
        language: trunc((req.get('accept-language') || '').split(',')[0], 35),
    };
}

// Server-side logging for search endpoints. Fire-and-forget: do not await.
export function logSearchEvent(req, event) {
    if (!shouldTrack(req)) return;
    const ctx = requestContext(req);
    if (ctx.device === 'bot') return;
    const tenant = req.tenant;
    const pool = getPoolForTenant(tenant);
    visitorHash(req, pool)
        .then((hash) => insertEvent(tenant, {
            source: 'server',
            visitor_hash: hash,
            ...ctx,
            ...event,
        }))
        .catch((err) => console.error('[Analytics] failed to log search event:', err.message));
}

// ---- aggregations for the public stats page ----------------------------------

// Everything returned here is aggregate-only (no visitor hashes, no raw rows),
// so it is safe to serve publicly. Cached per tenant+window for 5 minutes.
const statsCache = new Map(); // `${tenantId}:${days}` -> { at, data }
const STATS_CACHE_MS = 5 * 60 * 1000;

export async function getUsageStats(tenant, days = 30) {
    const tenantId = tenant?.id || 'default';
    const key = `${tenantId}:${days}`;
    const hit = statsCache.get(key);
    if (hit && Date.now() - hit.at < STATS_CACHE_MS) return hit.data;

    const pool = getPoolForTenant(tenant);
    const since = [days, tenantId]; // $1 = days back, $2 = tenant
    const windowClause = `created_at >= now() - ($1 || ' days')::interval AND tenant_id = $2`;

    const [totals, perDay, topTerms, topGames, zeroResults, filterUsage, eventMix, devices, countries, byHour,
           trendingTerms, topVideos, byDayOfWeek, speed] = await Promise.all([
        pool.query(
            `SELECT
                count(*) FILTER (WHERE event_type = 'search') AS searches,
                count(DISTINCT visitor_hash) AS visitors,
                count(*) FILTER (WHERE event_type IN ('quote_play','quote_copy','youtube_open','tweet_share')) AS interactions,
                count(*) FILTER (WHERE event_type = 'search' AND result_quotes = 0) AS zero_result_searches,
                count(*) FILTER (WHERE event_type = 'quote_play') AS quote_plays,
                count(*) FILTER (WHERE event_type = 'quote_copy') AS quote_copies,
                count(*) FILTER (WHERE event_type IN ('tweet_share','youtube_open')) AS shares,
                count(*) FILTER (WHERE event_type = 'random_quote') AS random_quotes,
                COALESCE(sum(CASE WHEN event_type = 'video_watch' AND props->>'seconds' ~ '^[0-9]{1,6}$'
                                  THEN (props->>'seconds')::int ELSE 0 END), 0) AS watch_seconds
             FROM analytics_events WHERE ${windowClause}`, since),
        pool.query(
            `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS searches
             FROM analytics_events WHERE ${windowClause} AND event_type = 'search'
             GROUP BY 1 ORDER BY 1`, since),
        pool.query(
            `SELECT search_term AS label, count(*) AS value
             FROM analytics_events WHERE ${windowClause} AND event_type = 'search' AND search_term IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`, since),
        pool.query(
            `SELECT game AS label, count(*) AS value
             FROM analytics_events WHERE ${windowClause} AND game IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`, since),
        pool.query(
            `SELECT search_term AS label, count(*) AS value
             FROM analytics_events WHERE ${windowClause} AND event_type = 'search' AND result_quotes = 0 AND search_term IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`, since),
        pool.query(
            `SELECT props->>'filter' AS label, count(*) AS value
             FROM analytics_events WHERE ${windowClause} AND event_type = 'filter_change' AND props->>'filter' IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC`, since),
        pool.query(
            `SELECT event_type AS label, count(*) AS value
             FROM analytics_events WHERE ${windowClause}
                AND event_type IN ('quote_play','quote_copy','youtube_open','tweet_share','quote_flag','random_quote')
             GROUP BY 1 ORDER BY 2 DESC`, since),
        pool.query(
            `SELECT device AS label, count(DISTINCT visitor_hash) AS value
             FROM analytics_events WHERE ${windowClause} AND device IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC`, since),
        pool.query(
            `SELECT country AS label, count(DISTINCT visitor_hash) AS value
             FROM analytics_events WHERE ${windowClause} AND country IS NOT NULL
             GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, since),
        pool.query(
            `SELECT extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS hour, count(*) AS value
             FROM analytics_events WHERE ${windowClause}
             GROUP BY 1 ORDER BY 1`, since),
        // Trending: terms searched this window, ranked by growth vs the previous
        // window of the same length. A term never seen before ranks by raw count.
        pool.query(
            `WITH cur AS (
                SELECT search_term, count(*) AS c
                FROM analytics_events
                WHERE ${windowClause} AND event_type = 'search' AND search_term IS NOT NULL
                GROUP BY 1
             ), prev AS (
                SELECT search_term, count(*) AS c
                FROM analytics_events
                WHERE tenant_id = $2 AND event_type = 'search' AND search_term IS NOT NULL
                  AND created_at >= now() - ((($1)::int * 2)::text || ' days')::interval
                  AND created_at <  now() - (($1 || ' days'))::interval
                GROUP BY 1
             )
             SELECT cur.search_term AS label, cur.c AS value, COALESCE(prev.c, 0) AS prev
             FROM cur LEFT JOIN prev USING (search_term)
             WHERE cur.c >= 3
             ORDER BY cur.c::float / GREATEST(COALESCE(prev.c, 0), 1) DESC, cur.c DESC
             LIMIT 10`, since),
        // Most replayed videos; title looked up per row (only 10) from quotes.
        pool.query(
            `SELECT v.video_id,
                    v.value,
                    (SELECT title FROM quotes q WHERE q.video_id = v.video_id LIMIT 1) AS label
             FROM (
                SELECT video_id, count(*) AS value
                FROM analytics_events
                WHERE ${windowClause} AND event_type = 'quote_play' AND video_id IS NOT NULL
                GROUP BY 1 ORDER BY 2 DESC LIMIT 10
             ) v`, since),
        pool.query(
            `SELECT extract(isodow FROM created_at AT TIME ZONE 'UTC')::int AS dow, count(*) AS value
             FROM analytics_events WHERE ${windowClause}
             GROUP BY 1 ORDER BY 1`, since),
        pool.query(
            `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
                    percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95
             FROM analytics_events
             WHERE ${windowClause} AND event_type = 'search' AND response_time_ms IS NOT NULL`, since),
    ]);

    const toRows = (r) => r.rows.map((row) => ({ label: row.label, value: parseInt(row.value) }));
    const data = {
        days,
        totals: {
            searches: parseInt(totals.rows[0].searches),
            visitors: parseInt(totals.rows[0].visitors),
            interactions: parseInt(totals.rows[0].interactions),
            zeroResultSearches: parseInt(totals.rows[0].zero_result_searches),
            quotePlays: parseInt(totals.rows[0].quote_plays),
            quoteCopies: parseInt(totals.rows[0].quote_copies),
            shares: parseInt(totals.rows[0].shares),
            randomQuotes: parseInt(totals.rows[0].random_quotes),
            watchSeconds: parseInt(totals.rows[0].watch_seconds),
        },
        searchesPerDay: perDay.rows.map((row) => ({ day: row.day, value: parseInt(row.searches) })),
        topTerms: toRows(topTerms),
        topGames: toRows(topGames),
        zeroResults: toRows(zeroResults),
        filterUsage: toRows(filterUsage),
        eventMix: toRows(eventMix),
        devices: toRows(devices),
        countries: toRows(countries),
        byHour: byHour.rows.map((row) => ({ hour: parseInt(row.hour), value: parseInt(row.value) })),
        trendingTerms: trendingTerms.rows.map((row) => ({
            label: row.label,
            value: parseInt(row.value),
            prev: parseInt(row.prev),
        })),
        topVideos: topVideos.rows.map((row) => ({
            videoId: row.video_id,
            label: row.label || row.video_id,
            value: parseInt(row.value),
        })),
        byDayOfWeek: byDayOfWeek.rows.map((row) => ({ dow: parseInt(row.dow), value: parseInt(row.value) })),
        speed: {
            p50: speed.rows[0].p50 === null ? null : Math.round(speed.rows[0].p50),
            p95: speed.rows[0].p95 === null ? null : Math.round(speed.rows[0].p95),
        },
        generatedAt: new Date().toISOString(),
    };
    statsCache.set(key, { at: Date.now(), data });
    return data;
}

// Top search terms for the sitemap: what people actually searched recently,
// with when they last searched it. Only terms that found enough quotes to
// earn a topic page. Returns [] on any failure so the sitemap never breaks.
export async function getTopSearchTopics(tenant, { days = 30, limit = 15, minQuotes = 10 } = {}) {
    try {
        const pool = getPoolForTenant(tenant);
        const result = await pool.query(
            `SELECT search_term AS term,
                    count(*) AS searches,
                    max(created_at) AS last_searched
             FROM analytics_events
             WHERE event_type = 'search'
               AND search_term IS NOT NULL
               AND result_quotes >= $3
               AND created_at >= now() - ($1 || ' days')::interval
               AND tenant_id = $2
             GROUP BY search_term
             ORDER BY count(*) DESC, max(created_at) DESC
             LIMIT $4`,
            [days, tenant?.id || 'default', minQuotes, limit]
        );
        return result.rows.map((r) => ({
            term: r.term,
            searches: parseInt(r.searches),
            lastSearched: r.last_searched,
        }));
    } catch (err) {
        console.error('[Analytics] failed to load top search topics:', err.message);
        return [];
    }
}

// Client events arriving via POST /api/ev.
export function logClientEvent(req, body) {
    if (!shouldTrack(req)) return { accepted: false, reason: 'opted-out' };
    if (!body || typeof body !== 'object') return { accepted: false, reason: 'bad-body' };
    if (!CLIENT_EVENT_TYPES.has(body.event_type)) return { accepted: false, reason: 'unknown-event' };
    const ctx = requestContext(req);
    if (ctx.device === 'bot') return { accepted: false, reason: 'bot' };

    // Only allow a small, flat props object.
    let props = null;
    if (body.props && typeof body.props === 'object' && !Array.isArray(body.props)) {
        props = {};
        for (const [k, v] of Object.entries(body.props).slice(0, 10)) {
            if (['string', 'number', 'boolean'].includes(typeof v)) {
                props[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 255) : v;
            }
        }
    }

    const tenant = req.tenant;
    const pool = getPoolForTenant(tenant);
    visitorHash(req, pool)
        .then((hash) => insertEvent(tenant, {
            source: 'client',
            event_type: body.event_type,
            visitor_hash: hash,
            path: body.path,
            referrer: body.referrer,
            ...ctx,
            screen_width: body.screen_width,
            screen_height: body.screen_height,
            search_term: body.search_term,
            search_mode: body.search_mode,
            game: body.game,
            channel: body.channel,
            year: body.year,
            sort_order: body.sort_order,
            page: body.page,
            video_id: body.video_id,
            quote_timestamp: body.quote_timestamp,
            props,
        }))
        .catch((err) => console.error('[Analytics] failed to log client event:', err.message));

    return { accepted: true };
}
