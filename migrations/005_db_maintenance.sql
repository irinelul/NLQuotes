-- 005_db_maintenance.sql
-- One-time maintenance on the quotes table, measured July 2026:
--   * 14 GB of the 19 GB table is dead TOAST left behind by the 13 dropped
--     semantic-search/movie-pipeline columns (DROP COLUMN never reclaims
--     TOAST until the table is rewritten).
--   * idx_channel_game (46 MB) has zero scans ever; idx_game_name (44 MB)
--     is redundant — idx_game_date has the same leading column and serves
--     every game_name = ... lookup.
--   * pg_stat monitoring counters were reset at some point and the table
--     has never been manually ANALYZEd since.
--
-- MUST run as an admin role (postgres owns the table); nlquotes_PROD cannot.
-- Run each statement separately; VACUUM cannot run inside a transaction.
-- Idempotent: safe to re-run (IF EXISTS / re-ANALYZE are no-ops).

-- 1. Drop unused/redundant indexes FIRST so the rewrite below doesn't
--    waste time rebuilding them. Instant, ~90 MB freed, less write
--    amplification on future ingests.
DROP INDEX IF EXISTS idx_channel_game;
DROP INDEX IF EXISTS idx_game_name;

-- 2. Reclaim the dead TOAST. Two options — pick ONE:
--
-- Option A (recommended — pg_repack 1.5.2 is available on this server,
-- near-zero locking, search stays up). From a shell on the DB host:
--
--   CREATE EXTENSION IF NOT EXISTS pg_repack;   -- as admin, in the DB
--   pg_repack --dbname=<PROD_DB> --table=public.quotes --no-superuser-check
--
-- Option B (simpler, but takes an ACCESS EXCLUSIVE lock — search is DOWN
-- for the duration, expect one to a few minutes; needs ~5 GB free disk
-- for the new copy):
--
--   VACUUM FULL quotes;
--
-- Expected result either way: quotes shrinks from ~19 GB to ~5 GB.

-- 3. Refresh planner statistics (autovacuum is on, but a manual pass after
--    the rewrite gives the planner fresh numbers immediately).
ANALYZE quotes;

-- 4. Better future diagnostics: track per-query I/O timings (superuser).
--    Negligible overhead on modern hardware.
ALTER SYSTEM SET track_io_timing = on;
SELECT pg_reload_conf();
