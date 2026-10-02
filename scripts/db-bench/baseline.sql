-- scripts/db-bench/baseline.sql
--
-- Read-only health/efficiency snapshot of one Postgres database, as ONE query
-- returning ONE result grid (section | object | metric | value | detail), so
-- DataGrip / any GUI shows everything in a single tab. Run it once per database
-- (each NLQuotes tenant DB and the ChatAudit DB) on the current server and
-- again on the new one, then compare.
--
--   DataGrip: open a console on the target database, run, export as CSV/TSV.
--   psql:     psql "$DATABASE_URL" -X -q -f scripts/db-bench/baseline.sql > baseline-old-nlquotes.txt
--
-- Sections that depend on the server version (pg_stat_io = 16+,
-- pg_stat_checkpointer = 17+, pg_stat_wal timing columns = 14-17) or on an
-- extension (pg_stat_statements, pg_buffercache) run as dynamic SQL through
-- query_to_xml, so the query works everywhere and those rows simply don't
-- appear when unavailable.
--
-- Counters are cumulative since the stats reset shown under "0 server", so the
-- ratios describe that whole period, not "right now".
--
-- "avg ms per read" = blocks Postgres had to fetch from outside shared_buffers:
-- ~0.01-0.05 ms = OS page cache, ~0.1 ms = SSD, 1-30 ms = HDD/network disk
-- (where an SSD helps). Needs track_io_timing = on.

WITH
v AS (
  SELECT current_setting('server_version_num')::int AS ver,
         EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS has_pgss,
         EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_buffercache') AS has_bufcache,
         (SELECT oid FROM pg_database WHERE datname = current_database()) AS dboid,
         (SELECT setting::bigint FROM pg_settings WHERE name = 'shared_buffers') AS sb_pages
),
db AS (
  SELECT d.*,
         GREATEST(extract(epoch FROM now() - COALESCE(d.stats_reset, pg_postmaster_start_time())), 1) AS secs
  FROM pg_stat_database d WHERE d.datname = current_database()
),

-- ---------------------------------------------------------------- 0 server
s0 AS (
  SELECT 0 AS sec, 1 AS ord, 'server' AS object, 'version' AS metric,
         split_part(version(), ' on ', 1) AS value, NULL::text AS detail
  UNION ALL
  SELECT 0, 2, current_database(), 'uptime',
         date_trunc('second', now() - pg_postmaster_start_time())::text,
         'stats since ' || COALESCE((SELECT stats_reset::timestamp(0)::text FROM db), 'server start')
  UNION ALL
  SELECT 0, 2 + row_number() OVER (ORDER BY name)::int, name, 'setting',
         current_setting(name),
         CASE WHEN source NOT IN ('default', 'override') THEN 'set in ' || source END
  FROM pg_settings
  WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem',
                 'maintenance_work_mem', 'random_page_cost', 'seq_page_cost',
                 'effective_io_concurrency', 'maintenance_io_concurrency',
                 'max_connections', 'max_parallel_workers_per_gather',
                 'wal_buffers', 'max_wal_size', 'checkpoint_timeout',
                 'checkpoint_completion_target', 'synchronous_commit',
                 'wal_compression', 'jit', 'track_io_timing', 'huge_pages',
                 'shared_preload_libraries')
),

-- ------------------------------------------------------------------ 1 size
s1 AS (
  SELECT 1 AS sec, row_number() OVER (ORDER BY pg_database_size(datname) DESC)::int AS ord,
         datname::text AS object, 'database size' AS metric,
         pg_size_pretty(pg_database_size(datname)) AS value,
         CASE WHEN datname = current_database() THEN '<- this database · shared_buffers '
              || current_setting('shared_buffers') || ' · effective_cache_size '
              || current_setting('effective_cache_size') END AS detail
  FROM pg_database WHERE NOT datistemplate
  UNION ALL
  -- Partitioned tables (ChatAudit messages) rolled up to the parent.
  SELECT 1, 100 + row_number() OVER (ORDER BY sum(pg_total_relation_size(r.oid)) DESC)::int,
         r.root::regclass::text, 'table total',
         pg_size_pretty(sum(pg_total_relation_size(r.oid))),
         'heap ' || pg_size_pretty(sum(pg_relation_size(r.oid)))
         || ' · toast ' || pg_size_pretty(sum(pg_total_relation_size(r.oid) - pg_relation_size(r.oid) - pg_indexes_size(r.oid)))
         || ' · indexes ' || pg_size_pretty(sum(pg_indexes_size(r.oid)))
         || ' · ~' || sum(GREATEST(c.reltuples, 0))::bigint || ' rows'
         || CASE WHEN count(*) > 1 THEN ' · ' || count(*) - 1 || ' partitions' ELSE '' END
  FROM (SELECT c.oid, COALESCE(i.inhparent, c.oid) AS root
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_inherits i ON i.inhrelid = c.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND c.relkind IN ('r', 'm', 'p')) r
  JOIN pg_class c ON c.oid = r.oid
  GROUP BY r.root
),

-- ------------------------------------------------------------- 2 cache hit
s2 AS (
  SELECT 2 AS sec, 1 AS ord, current_database()::text AS object, 'hit %' AS metric,
         round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 3)::text AS value,
         blks_read || ' blocks read, ' || blks_hit || ' hit' AS detail
  FROM db
  UNION ALL
  SELECT 2, 2, current_database(), 'avg ms per read',
         CASE WHEN current_setting('track_io_timing') = 'on'
              THEN round((blk_read_time / NULLIF(blks_read, 0))::numeric, 3)::text
              ELSE 'n/a' END,
         CASE WHEN current_setting('track_io_timing') = 'on'
              THEN '<0.05 OS cache · ~0.1 SSD · >1 slow disk · total read wait ' || round(blk_read_time / 1000)::text || ' s'
              ELSE 'track_io_timing is OFF: ALTER SYSTEM SET track_io_timing = on; SELECT pg_reload_conf();' END
  FROM db
  UNION ALL
  SELECT 2, 3, current_database(), 'temp spilled',
         pg_size_pretty(temp_bytes), temp_files || ' temp files (sorts/hashes over work_mem)'
  FROM db
  UNION ALL
  SELECT 2, 4, current_database(), 'transactions',
         xact_commit::text, xact_rollback || ' rollbacks · ' || deadlocks || ' deadlocks'
  FROM db
),
s2t AS (
  SELECT 2 AS sec, 10 + row_number() OVER (ORDER BY heap_blks_read + COALESCE(idx_blks_read, 0) + COALESCE(toast_blks_read, 0) DESC)::int AS ord,
         relname::text AS object, 'table hit % (heap)' AS metric,
         COALESCE(round(100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0), 2)::text, '-') AS value,
         'heap read ' || heap_blks_read
         || ' · idx hit ' || COALESCE(round(100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0), 2)::text, '-')
         || '% read ' || COALESCE(idx_blks_read, 0)
         || ' · toast hit ' || COALESCE(round(100.0 * toast_blks_hit / NULLIF(toast_blks_hit + toast_blks_read, 0), 2)::text, '-')
         || '% read ' || COALESCE(toast_blks_read, 0) AS detail
  FROM pg_statio_user_tables
  WHERE heap_blks_hit + heap_blks_read + COALESCE(idx_blks_read, 0) > 0
  ORDER BY heap_blks_read + COALESCE(idx_blks_read, 0) + COALESCE(toast_blks_read, 0) DESC
  LIMIT 15
),
s2i AS (
  SELECT 2 AS sec, 100 + row_number() OVER (ORDER BY idx_blks_read DESC)::int AS ord,
         relname || '.' || indexrelname AS object, 'index hit %' AS metric,
         COALESCE(round(100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0), 2)::text, '-') AS value,
         idx_blks_read || ' blocks read · size ' || pg_size_pretty(pg_relation_size(indexrelid)) AS detail
  FROM pg_statio_user_indexes
  WHERE idx_blks_read > 0
  ORDER BY idx_blks_read DESC
  LIMIT 10
),

-- ------------------------------------------------------------ 3 efficiency
s3 AS (
  SELECT 3 AS sec, row_number() OVER (ORDER BY seq_tup_read + COALESCE(idx_tup_fetch, 0) DESC)::int AS ord,
         relname::text AS object, 'rows read: seq / idx' AS metric,
         seq_tup_read || ' / ' || COALESCE(idx_tup_fetch, 0) AS value,
         seq_scan || ' seq scans, ' || COALESCE(idx_scan, 0) || ' idx scans · '
         || n_live_tup || ' live, ' || n_dead_tup || ' dead ('
         || COALESCE(round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1)::text, '0') || '%) · '
         || 'ins/upd/del ' || n_tup_ins || '/' || n_tup_upd || '/' || n_tup_del
         || ' · last autovacuum ' || COALESCE(last_autovacuum::date::text, 'never')
         || ' · last analyze ' || COALESCE(GREATEST(last_analyze, last_autoanalyze)::date::text, 'never') AS detail
  FROM pg_stat_user_tables
  ORDER BY seq_tup_read + COALESCE(idx_tup_fetch, 0) DESC
  LIMIT 15
),
s3u AS (
  SELECT 3 AS sec, 100 + row_number() OVER (ORDER BY pg_relation_size(s.indexrelid) DESC)::int AS ord,
         s.relname || '.' || s.indexrelname AS object, 'rarely used index' AS metric,
         pg_size_pretty(pg_relation_size(s.indexrelid)) AS value,
         s.idx_scan || ' scans since stats reset (costs writes + cache, serves few reads)' AS detail
  FROM pg_stat_user_indexes s
  JOIN pg_index i ON i.indexrelid = s.indexrelid
  WHERE s.idx_scan < 50 AND NOT i.indisunique AND NOT i.indisprimary
  ORDER BY pg_relation_size(s.indexrelid) DESC
  LIMIT 10
),
s3c AS (
  SELECT 3 AS sec, 200 AS ord, COALESCE(state, 'background') AS object, 'connections' AS metric,
         count(*)::text AS value,
         'longest in state ' || COALESCE(date_trunc('second', max(now() - state_change))::text, '-') AS detail
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state
),

-- ----------------------------------------------- version/extension dependent
-- Each entry is a SQL string returning text columns object, metric, value,
-- detail. A NULL string (feature missing) is skipped and never parsed.
dyn_src AS (
  SELECT 2 AS sec, 200 AS base,
         CASE WHEN ver >= 160000 THEN $q$
           SELECT backend_type || ' / ' || object || ' / ' || context AS object,
                  'pg_stat_io avg ms per read' AS metric,
                  COALESCE(round((read_time / NULLIF(reads, 0))::numeric, 3)::text, '-') AS value,
                  'reads ' || COALESCE(reads, 0) || ' (' || round(COALESCE(read_time, 0)::numeric) || ' ms)'
                  || ' · writes ' || COALESCE(writes, 0) || ' (' || round(COALESCE(write_time, 0)::numeric) || ' ms)'
                  || ' · extends ' || COALESCE(extends, 0)
                  || ' · fsyncs ' || COALESCE(fsyncs, 0) || ' (' || round(COALESCE(fsync_time, 0)::numeric) || ' ms)'
                  || ' · hits ' || COALESCE(hits, 0) || ' · evictions ' || COALESCE(evictions, 0) AS detail
           FROM pg_stat_io
           WHERE COALESCE(reads, 0) + COALESCE(writes, 0) + COALESCE(extends, 0) > 0
           ORDER BY COALESCE(read_time, 0) + COALESCE(write_time, 0) DESC, reads DESC NULLS LAST
           LIMIT 12 $q$ END AS sql
  FROM v
  UNION ALL
  SELECT 2, 300,
         CASE WHEN has_bufcache THEN format($q$
           SELECT c.relname::text AS object, 'in shared_buffers now' AS metric,
                  pg_size_pretty(count(*) * 8192) AS value,
                  round(100.0 * count(*) / %1$s, 1) || '%% of shared_buffers · '
                  || COALESCE(round(100.0 * count(*) * 8192 / NULLIF(pg_relation_size(c.oid), 0), 1)::text, '-')
                  || '%% of the relation' AS detail
           FROM pg_buffercache b
           JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
           WHERE b.reldatabase = %2$s
             AND c.relnamespace NOT IN ('pg_catalog'::regnamespace, 'pg_toast'::regnamespace)
           GROUP BY c.oid, c.relname
           ORDER BY count(*) DESC
           LIMIT 10 $q$, sb_pages, dboid) END
  FROM v
  UNION ALL
  SELECT 3, 300,
         CASE WHEN ver >= 170000 THEN $q$
           SELECT 'checkpointer' AS object, 'checkpoints timed / requested' AS metric,
                  num_timed || ' / ' || num_requested AS value,
                  'write ' || round(write_time::numeric) || ' ms · sync ' || round(sync_time::numeric) || ' ms · '
                  || buffers_written || ' buffers written · since ' || stats_reset::timestamp(0) AS detail
           FROM pg_stat_checkpointer $q$
         ELSE $q$
           SELECT 'checkpointer' AS object, 'checkpoints timed / requested' AS metric,
                  checkpoints_timed || ' / ' || checkpoints_req AS value,
                  'write ' || round(checkpoint_write_time::numeric) || ' ms · sync ' || round(checkpoint_sync_time::numeric) || ' ms · '
                  || buffers_checkpoint || ' by checkpoint, ' || buffers_clean || ' by bgwriter, '
                  || buffers_backend || ' by backends (' || buffers_backend_fsync || ' backend fsyncs) · since '
                  || stats_reset::timestamp(0) AS detail
           FROM pg_stat_bgwriter $q$ END
  FROM v
  UNION ALL
  SELECT 3, 310,
         CASE WHEN ver BETWEEN 140000 AND 179999 THEN $q$
           SELECT 'wal' AS object, 'avg ms per WAL sync' AS metric,
                  COALESCE(round((wal_sync_time / NULLIF(wal_sync, 0))::numeric, 3)::text, '-') AS value,
                  pg_size_pretty(wal_bytes) || ' WAL · ' || wal_records || ' records · '
                  || wal_sync || ' syncs (' || round(wal_sync_time::numeric) || ' ms) · '
                  || wal_write || ' writes (' || round(wal_write_time::numeric) || ' ms) · buffers full '
                  || wal_buffers_full AS detail
           FROM pg_stat_wal $q$
              WHEN ver >= 180000 THEN $q$
           SELECT 'wal' AS object, 'WAL generated' AS metric, pg_size_pretty(wal_bytes) AS value,
                  wal_records || ' records · buffers full ' || wal_buffers_full
                  || ' (WAL sync timing lives in pg_stat_io on 18+)' AS detail
           FROM pg_stat_wal $q$ END
  FROM v
  UNION ALL
  SELECT 4, 0,
         CASE WHEN has_pgss THEN format($q$
           SELECT left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS object,
                  'total ms' AS metric,
                  round(total_exec_time::numeric)::text AS value,
                  calls || ' calls · mean ' || round(mean_exec_time::numeric, 2) || ' ms · hit '
                  || COALESCE(round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2)::text, '-')
                  || '%% · read ' || shared_blks_read || ' blk (' || round(%1$s::numeric) || ' ms) · io '
                  || COALESCE(round((100.0 * %1$s / NULLIF(total_exec_time, 0))::numeric, 1)::text, '0')
                  || '%% of time · temp written ' || temp_blks_written || ' blk' AS detail
           FROM pg_stat_statements
           WHERE dbid = %2$s
           ORDER BY total_exec_time DESC
           LIMIT 25 $q$,
           CASE WHEN ver >= 170000 THEN 'shared_blk_read_time' ELSE 'blk_read_time' END,
           dboid) END
  FROM v
),
dyn AS (
  SELECT d.sec, d.base + x.n AS ord, x.object, x.metric, x.value, x.detail
  FROM dyn_src d,
       LATERAL xmltable('/table/row'
         PASSING query_to_xml(d.sql, true, false, '')
         COLUMNS n FOR ORDINALITY,
                 object text PATH 'object',
                 metric text PATH 'metric',
                 value  text PATH 'value',
                 detail text PATH 'detail') x
  WHERE d.sql IS NOT NULL
),
s4 AS (
  SELECT 4 AS sec, 0 AS ord, 'pg_stat_statements' AS object, 'not installed' AS metric,
         '-' AS value,
         'Most useful input for this decision (io % per query = the share an SSD can remove). '
         || 'Enable: shared_preload_libraries = pg_stat_statements, restart, CREATE EXTENSION pg_stat_statements; collect a few days.' AS detail
  FROM v WHERE NOT has_pgss
),

-- --------------------------------------------------------------- 5 verdict
s5 AS (
  SELECT 5 AS sec, 1 AS ord, current_database()::text AS object, 'VERDICT INPUTS' AS metric,
         pg_size_pretty(pg_database_size(current_database())) AS value,
         'hit ' || COALESCE(round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 3)::text, '-') || '%'
         || ' · avg ms/read ' || COALESCE(round((blk_read_time / NULLIF(blks_read, 0))::numeric, 3)::text, 'n/a')
         || ' · reads/s ' || round((blks_read / secs)::numeric, 1)
         || ' · read_load ' || round((blk_read_time / 1000 / secs * 100)::numeric, 2) || '%'
         || ' (read-wait per wall-clock second; >100 = several backends waiting at once)'
         || ' · temp spilled ' || pg_size_pretty(temp_bytes) AS detail
  FROM db
)

SELECT CASE sec WHEN 0 THEN '0 server' WHEN 1 THEN '1 size' WHEN 2 THEN '2 cache'
                WHEN 3 THEN '3 efficiency' WHEN 4 THEN '4 top statements' ELSE '5 verdict' END AS section,
       object, metric, value, detail
FROM (
            SELECT * FROM s0
  UNION ALL SELECT * FROM s1
  UNION ALL SELECT * FROM s2
  UNION ALL SELECT * FROM s2t
  UNION ALL SELECT * FROM s2i
  UNION ALL SELECT * FROM s3
  UNION ALL SELECT * FROM s3u
  UNION ALL SELECT * FROM s3c
  UNION ALL SELECT * FROM dyn
  UNION ALL SELECT * FROM s4
  UNION ALL SELECT * FROM s5
) all_rows
ORDER BY sec, ord;
