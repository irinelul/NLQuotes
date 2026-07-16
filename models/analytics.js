import crypto from 'crypto';
import { getPoolForTenant } from './postgres.js';
import { categorizeReferrer } from './referrer.js';

// Convenience re-export so callers can import everything from one module.
export { categorizeReferrer } from './referrer.js';

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
    'theme_toggle',
    'external_link',
    'video_watch',          // props: { seconds, reason } — how long a clip actually played
    'video_thumbnail_play', // direct thumbnail click (no timestamp), invisible to quote_play
    'scroll_depth',         // props: { depth } — 25/50/75/100, once per search
    'session_start',        // front-end session beacon
    'session_end',          // props: { duration_ms } — final beacon before unload
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
// within the same day but can never be correlated across days. Cached per
// tenant AND day: tenants can have separate databases (separate analytics_salt
// rows), so a day-only cache would leak one tenant's salt to another and churn
// visitor hashes mid-day.
const saltCache = new Map(); // `${tenantId}|${day}` -> salt

async function getDailySalt(pool, tenantId) {
    const day = new Date().toISOString().slice(0, 10);
    const cacheKey = `${tenantId}|${day}`;
    if (saltCache.has(cacheKey)) return saltCache.get(cacheKey);

    const fresh = crypto.randomBytes(32).toString('hex');
    // Upsert-read: first writer wins, everyone gets the same salt for the day.
    const result = await pool.query(
        `INSERT INTO analytics_salt (day, salt) VALUES ($1, $2)
         ON CONFLICT (day) DO UPDATE SET salt = analytics_salt.salt
         RETURNING salt`,
        [day, fresh]
    );
    const salt = result.rows[0].salt;
    // Drop yesterday's entries; keep other tenants' salts for today.
    for (const key of saltCache.keys()) {
        if (!key.endsWith(`|${day}`)) saltCache.delete(key);
    }
    saltCache.set(cacheKey, salt);
    return salt;
}

function clientIp(req) {
    // Cloudflare -> Coolify proxy -> express. Never stored, only hashed.
    return req.get('cf-connecting-ip')
        || (req.get('x-forwarded-for') || '').split(',')[0].trim()
        || req.ip
        || '';
}

async function visitorHash(req, pool, tenantId) {
    const salt = await getDailySalt(pool, tenantId);
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
            video_id, quote_timestamp, props,
            session_id, referrer_source, referrer_medium, session_duration_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
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
            trunc(fields.session_id, 36), trunc(fields.referrer_source, 20),
            trunc(fields.referrer_medium, 100), toInt(fields.session_duration_ms),
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
    // Server-side search events have no body.referrer, so derive the referrer
    // from the request's Referer header and categorize it for source dashboards.
    const referrer = req.get('referer') || null;
    const { source: referrer_source, medium: referrer_medium } = categorizeReferrer(referrer);
    visitorHash(req, pool, tenant?.id || 'default')
        .then((hash) => insertEvent(tenant, {
            source: 'server',
            visitor_hash: hash,
            ...ctx,
            referrer,
            referrer_source,
            referrer_medium,
            ...event,
        }))
        .catch((err) => console.error('[Analytics] failed to log search event:', err.message));
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
    const { source: referrer_source, medium: referrer_medium } = categorizeReferrer(body.referrer);
    visitorHash(req, pool, tenant?.id || 'default')
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
            session_id: body.session_id,
            referrer_source,
            referrer_medium,
            session_duration_ms: body.session_duration_ms,
            props,
        }))
        .catch((err) => console.error('[Analytics] failed to log client event:', err.message));

    return { accepted: true };
}
