-- 004_session_journey.sql
-- Adds session/journey columns to analytics_events for session attribution
-- and referrer dashboards. All new columns are nullable and carry no default,
-- so ALTER is metadata-only (no table rewrite) and safe on large tables.
-- Idempotent: safe to re-run.

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS session_id        VARCHAR(36),
  ADD COLUMN IF NOT EXISTS referrer_source   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS referrer_medium   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS session_duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;
