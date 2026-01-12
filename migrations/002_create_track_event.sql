-- Create track_event table for analytics
CREATE TABLE IF NOT EXISTS track_event (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    path VARCHAR(500),
    query_params JSONB,
    referrer VARCHAR(1000),
    user_hash VARCHAR(64),
    start_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device VARCHAR(50),
    os VARCHAR(50),
    browser VARCHAR(50),
    screen_width INTEGER,
    screen_height INTEGER,
    pixel_ratio NUMERIC(5, 2),
    language VARCHAR(10),
    timezone VARCHAR(100),
    region VARCHAR(100),
    city VARCHAR(100),
    domain VARCHAR(255),
    session_id VARCHAR(36),
    response_time_ms INTEGER,
    game VARCHAR(255),
    -- Search-specific fields
    search_term VARCHAR(500),
    channel VARCHAR(100),
    year INTEGER,
    sort_order VARCHAR(50),
    strict BOOLEAN DEFAULT FALSE,
    page INTEGER,
    total_pages INTEGER
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_track_event_type ON track_event(type);
CREATE INDEX IF NOT EXISTS idx_track_event_created_at ON track_event(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_event_search_term ON track_event(search_term) WHERE search_term IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_event_session_id ON track_event(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_event_user_hash ON track_event(user_hash) WHERE user_hash IS NOT NULL;

-- Create index for popular searches query (type = 'search' and search_term is not null)
CREATE INDEX IF NOT EXISTS idx_track_event_search_type ON track_event(type, created_at DESC) WHERE type = 'search' AND search_term IS NOT NULL;

