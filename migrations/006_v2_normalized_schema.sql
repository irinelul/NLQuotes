-- Normalized `videos` table + indexes for the v2 query architecture in models/postgres.js.
--
-- Decouples per-video metadata (`title`, `channel_source`, `upload_date`, `game_name`,
-- `duration_seconds`, `quote_count`) from the 13.8M+ row `quotes` table so:
--   - `getGameList` scans ~24k video rows (130 buffers, ~14ms) instead of walking `quotes` (8,295+ buffers)
--   - `getLatestUploadDate` is a 1-row index tip lookup on `idx_videos_upload_date` (<1ms)
--   - `listVideosForIndex` scans `videos` (18–550 buffers, ~15–56ms) instead of aggregating 407k buffers of `quotes`
--   - Filter-only/game-only `search` computes `total_videos` and `total_quotes` (`SUM(v.quote_count)`) directly
--     from `videos` (22x faster, 138x fewer buffers on large games like Isaac)
--
-- Works identically on both v1 databases (`quotes`, `hivemind`, `vinesauce`) and isolated
-- Parakeet v2 databases (`quotes_v2`, `hivemind_v2`, `vinesauce_v2`).

CREATE TABLE IF NOT EXISTS videos (
  video_id VARCHAR(32) PRIMARY KEY,
  title TEXT NOT NULL,
  channel_source VARCHAR(64) NOT NULL,
  upload_date DATE NOT NULL,
  game_name VARCHAR(128),
  duration_seconds REAL,
  quote_count INTEGER NOT NULL DEFAULT 0,
  transcription_model VARCHAR(64) DEFAULT 'nvidia/parakeet-tdt-0.6b-v3',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_channel_date ON videos (channel_source, upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_videos_upload_date  ON videos (upload_date DESC, video_id);
CREATE INDEX IF NOT EXISTS idx_videos_game         ON videos (game_name) WHERE game_name IS NOT NULL;
