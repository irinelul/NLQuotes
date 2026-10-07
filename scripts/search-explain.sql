-- EXPLAIN ANALYZE the production search query (models/postgres.js search())
-- for one term, plus a capped-count variant to compare against.
--
-- Usage (read-only; EXPLAIN ANALYZE of a SELECT changes nothing):
--   for t in "the game" "game" "hello" "gamer"; do
--     psql "$DATABASE_URL" -v term="$t" -f scripts/search-explain.sql
--   done > search-explain.txt 2>&1
-- Run the loop twice and compare the second run: the first may be cold cache.

\pset pager off
\timing on
\echo
\echo '################################################################'
\echo '### term:' :'term'
\echo '################################################################'

\echo '--- how many rows / videos match'
SELECT count(*) AS matching_rows,
       count(DISTINCT video_id) AS matching_videos,
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'quotes') AS approx_table_rows
FROM quotes q
WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term');

\echo '--- A) current production query (page 1, limit 10, no filters, default sort)'
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
WITH page AS (
  SELECT q.video_id,
         COUNT(*) OVER () AS total_videos,
         SUM(COUNT(*)) OVER () AS total_quotes
  FROM quotes q
  WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
  GROUP BY q.video_id
  ORDER BY q.video_id
  LIMIT 10 OFFSET 0
)
SELECT q.video_id, q.title, q.upload_date, q.channel_source,
       p.total_videos, p.total_quotes,
       json_agg(json_build_object(
         'text', ts_headline('simple', q.text, websearch_to_tsquery('simple', :'term'),'MaxWords=5, MinWords=5, HighlightAll=TRUE'),
         'line_number', q.line_number,
         'timestamp_start', q.timestamp_start,
         'title', q.title,
         'upload_date', q.upload_date,
         'channel_source', q.channel_source
       ) ORDER BY q.line_number::int) AS quotes
FROM quotes q
JOIN page p ON p.video_id = q.video_id
WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
GROUP BY q.video_id, q.title, q.upload_date, q.channel_source, p.total_videos, p.total_quotes
ORDER BY q.video_id;

\echo '--- A2) same query, sort=newest'
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
WITH page AS (
  SELECT q.video_id,
         COUNT(*) OVER () AS total_videos,
         SUM(COUNT(*)) OVER () AS total_quotes
  FROM quotes q
  WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
  GROUP BY q.video_id
  ORDER BY MAX(q.upload_date) DESC, q.video_id
  LIMIT 10 OFFSET 0
)
SELECT q.video_id, p.total_videos, p.total_quotes,
       json_agg(ts_headline('simple', q.text, websearch_to_tsquery('simple', :'term'),'MaxWords=5, MinWords=5, HighlightAll=TRUE')
                ORDER BY q.line_number::int) AS quotes
FROM quotes q
JOIN page p ON p.video_id = q.video_id
WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
GROUP BY q.video_id, q.upload_date, p.total_videos, p.total_quotes
ORDER BY q.upload_date DESC, q.video_id;

\echo '--- B) capped alternative, step 1: page of video ids only (no window totals)'
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
SELECT q.video_id
FROM quotes q
WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
GROUP BY q.video_id
ORDER BY q.video_id
LIMIT 10 OFFSET 0;

\echo '--- B) capped alternative, step 2: count videos, stop at 1001 ("1000+")'
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
SELECT count(*) AS total_videos_capped
FROM (
  SELECT DISTINCT q.video_id
  FROM quotes q
  WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term')
  LIMIT 1001
) s;

\echo '--- C) cost of the bitmap index lookup alone'
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
SELECT count(*)
FROM quotes q
WHERE q.fts_doc @@ websearch_to_tsquery('simple', :'term');
