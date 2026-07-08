-- In-house privacy-friendly analytics.
-- One row per event. No IPs, no cookies: visitors are identified only by a
-- 16-hex-char hash of (daily rotating salt + IP + user agent), computed
-- server-side. The salt lives in analytics_salt and is never reused across
-- days, so hashes cannot be correlated across days or reversed to an IP.

CREATE TABLE IF NOT EXISTS analytics_salt (
    day DATE PRIMARY KEY,
    salt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id VARCHAR(50) NOT NULL,
    -- 'server' events are logged by API handlers (searches), 'client' events
    -- arrive via POST /api/ev (UI interactions)
    source VARCHAR(10) NOT NULL DEFAULT 'client',
    event_type VARCHAR(50) NOT NULL,
    visitor_hash VARCHAR(16),

    -- request context
    path VARCHAR(500),
    referrer VARCHAR(500),
    country VARCHAR(2),
    device VARCHAR(20),
    os VARCHAR(50),
    browser VARCHAR(50),
    language VARCHAR(35),
    screen_width INTEGER,
    screen_height INTEGER,

    -- search context (hot columns, denormalized for cheap GROUP BYs)
    search_term VARCHAR(500),
    search_mode VARCHAR(20),      -- keyword | strict
    game VARCHAR(255),
    channel VARCHAR(100),
    year SMALLINT,
    sort_order VARCHAR(20),
    page SMALLINT,
    result_videos INTEGER,
    result_quotes INTEGER,
    response_time_ms INTEGER,

    -- quote interaction context
    video_id VARCHAR(20),
    quote_timestamp INTEGER,      -- seconds into the video

    -- anything else (filter name/value, share target, ...)
    props JSONB
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time
    ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_time
    ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_search_term
    ON analytics_events (search_term) WHERE search_term IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_game
    ON analytics_events (game) WHERE game IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor
    ON analytics_events (visitor_hash, created_at DESC) WHERE visitor_hash IS NOT NULL;
