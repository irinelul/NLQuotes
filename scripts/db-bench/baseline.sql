-- scripts/db-bench/baseline.sql
--
-- Read-only health/efficiency snapshot of one Postgres database. Run it once
-- per database (NLQuotes tenant DBs AND the ChatAudit DB) on the current
-- server, and again on the new server after the move, then diff the files.
--
--   psql "$DATABASE_URL" -X -q -f scripts/db-bench/baseline.sql > baseline-old-nlquotes.txt
--
-- Nothing here writes. Sections that need an extension (pg_stat_statements,
-- pg_buffercache) or a newer server (pg_stat_io = 16+, pg_stat_checkpointer =
-- 17+) are skipped when unavailable.
--
-- Counters are cumulative since the stats reset shown in section 0, so the
-- ratios describe the whole period since then, not "right now".

\pset footer off
\pset null '-'
SET statement_timeout = '120s';
SET default_transaction_read_only = on;

SELECT current_setting('server_version_num')::int >= 160000 AS pg16,
       current_setting('server_version_num')::int >= 170000 AS pg17,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS has_pgss,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_buffercache') AS has_bufcache,
       current_setting('track_io_timing') = 'on' AS io_timing
\gset

\echo
\echo '=== 0. Server ============================================================'
SELECT version();
SELECT current_database() AS db,
       pg_postmaster_start_time() AS started,
       now() - pg_postmaster_start_time() AS uptime,
       (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS db_stats_reset;

-- Settings that decide whether a disk swap can help at all. If the new server
-- gets different values for these you are benchmarking the config, not the disk.
SELECT name, setting, unit, source
FROM pg_settings
WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem',
               'maintenance_work_mem', 'random_page_cost', 'seq_page_cost',
               'effective_io_concurrency', 'maintenance_io_concurrency',
               'max_connections', 'max_parallel_workers_per_gather',
               'wal_buffers', 'max_wal_size', 'checkpoint_timeout',
               'checkpoint_completion_target', 'synchronous_commit',
               'wal_compression', 'jit', 'track_io_timing', 'huge_pages',
               'data_directory', 'shared_preload_libraries')
ORDER BY name;

\echo
\echo '=== 1. Size ==============================================================='
SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE NOT datistemplate
ORDER BY pg_database_size(datname) DESC;

-- Heap / TOAST / index split per table. Partitioned tables (ChatAudit
-- messages) are rolled up to the parent so 90 monthly partitions show as one
-- line; the partition count is listed alongside.
WITH rel AS (
  SELECT c.oid,
         COALESCE(p.inhparent, c.oid) AS root,
         c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_inherits p ON p.inhrelid = c.oid
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND c.relkind IN ('r', 'm')
)
SELECT root::regclass AS table_name,
       count(*) FILTER (WHERE root <> oid) AS partitions,
       pg_size_pretty(sum(pg_relation_size(oid))) AS heap,
       pg_size_pretty(sum(pg_total_relation_size(oid) - pg_relation_size(oid) - pg_indexes_size(oid))) AS toast,
       pg_size_pretty(sum(pg_indexes_size(oid))) AS indexes,
       pg_size_pretty(sum(pg_total_relation_size(oid))) AS total,
       sum(c.reltuples)::bigint AS est_rows
FROM rel JOIN pg_class c USING (oid)
GROUP BY root
ORDER BY sum(pg_total_relation_size(oid)) DESC
LIMIT 25;

-- Working set vs memory: if the hot tables + indexes fit in shared_buffers +
-- OS cache, steady-state reads never touch the disk and an SSD only helps
-- cold starts, writes and anything that spills.
SELECT pg_size_pretty(pg_database_size(current_database())) AS this_db,
       current_setting('shared_buffers') AS shared_buffers,
       current_setting('effective_cache_size') AS effective_cache_size;

\echo
\echo '=== 2. Cache hit =========================================================='
-- blks_read are reads that missed shared_buffers. They may still have been
-- served by the OS page cache, which is why avg_read_ms matters more than the
-- hit ratio: ~0.01-0.05 ms = OS cache, ~0.1 ms = NVMe, 1-10+ ms = HDD/network
-- disk. Needs track_io_timing = on (migration 005 turns it on).
SELECT datname,
       round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 3) AS hit_pct,
       blks_read,
       blks_hit,
       round(blk_read_time::numeric, 0) AS read_ms_total,
       round((blk_read_time / NULLIF(blks_read, 0))::numeric, 3) AS avg_read_ms,
       round(blk_write_time::numeric, 0) AS write_ms_total,
       temp_files,
       pg_size_pretty(temp_bytes) AS temp_spilled,
       xact_commit, xact_rollback, deadlocks
FROM pg_stat_database
WHERE datname = current_database();

\if :io_timing
\else
\echo '!! track_io_timing is off: avg_read_ms and all *_read_time columns are 0.'
\echo '!! ALTER SYSTEM SET track_io_timing = on; SELECT pg_reload_conf();  (superuser)'
\endif

-- Per table: heap / index / TOAST hit ratio and how much was read.
SELECT relname,
       round(100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0), 2) AS heap_hit_pct,
       heap_blks_read,
       round(100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0), 2) AS idx_hit_pct,
       idx_blks_read,
       round(100.0 * toast_blks_hit / NULLIF(toast_blks_hit + toast_blks_read, 0), 2) AS toast_hit_pct,
       toast_blks_read
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read + COALESCE(idx_blks_read, 0) > 0
ORDER BY heap_blks_read + COALESCE(idx_blks_read, 0) + COALESCE(toast_blks_read, 0) DESC
LIMIT 20;

-- Top indexes by disk reads.
SELECT relname, indexrelname,
       idx_blks_read,
       round(100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0), 2) AS hit_pct,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_statio_user_indexes
ORDER BY idx_blks_read DESC
LIMIT 15;

\if :pg16
\echo
\echo '--- pg_stat_io (cluster-wide, client backends + background) ---'
SELECT backend_type, object, context,
       reads, round(read_time::numeric, 0) AS read_ms,
       round((read_time / NULLIF(reads, 0))::numeric, 3) AS avg_read_ms,
       writes, round(write_time::numeric, 0) AS write_ms,
       extends, fsyncs, round(fsync_time::numeric, 0) AS fsync_ms,
       hits, evictions
FROM pg_stat_io
WHERE COALESCE(reads, 0) + COALESCE(writes, 0) + COALESCE(extends, 0) > 0
ORDER BY COALESCE(read_time, 0) + COALESCE(write_time, 0) DESC, reads DESC
LIMIT 15;
\endif

\if :has_bufcache
\echo
\echo '--- What is in shared_buffers right now (pg_buffercache) ---'
SELECT c.relname,
       pg_size_pretty(count(*) * 8192) AS buffered,
       round(100.0 * count(*) / (SELECT setting::int FROM pg_settings WHERE name = 'shared_buffers'), 1) AS pct_of_sb,
       round(100.0 * count(*) * 8192 / NULLIF(pg_relation_size(c.oid), 0), 1) AS pct_of_rel
FROM pg_buffercache b
JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
WHERE b.reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND c.relnamespace NOT IN ('pg_catalog'::regnamespace, 'pg_toast'::regnamespace)
GROUP BY c.oid, c.relname
ORDER BY count(*) DESC
LIMIT 15;
\endif

\echo
\echo '=== 3. Efficiency ========================================================='
-- Access pattern per table. Large seq_tup_read on a big table = full scans
-- (disk-bandwidth bound); high idx_scan with low hit ratio = random reads
-- (disk-latency bound, where an SSD helps most).
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
       n_tup_ins, n_tup_upd, n_tup_del,
       n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum::date AS last_autovac, last_autoanalyze::date AS last_autoanalyze
FROM pg_stat_user_tables
ORDER BY seq_tup_read + COALESCE(idx_tup_fetch, 0) DESC
LIMIT 20;

-- Indexes that cost writes and buffer space without serving reads.
SELECT s.relname, s.indexrelname, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan < 50 AND NOT i.indisunique AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 15;

\if :pg17
SELECT num_timed, num_requested, write_time AS write_ms, sync_time AS sync_ms,
       buffers_written, stats_reset
FROM pg_stat_checkpointer;
\else
SELECT checkpoints_timed, checkpoints_req,
       checkpoint_write_time AS write_ms, checkpoint_sync_time AS sync_ms,
       buffers_checkpoint, buffers_clean, buffers_backend, buffers_backend_fsync,
       maxwritten_clean, stats_reset
FROM pg_stat_bgwriter;
\endif

SELECT wal_records, pg_size_pretty(wal_bytes) AS wal_bytes, wal_buffers_full,
       wal_write, wal_sync,
       round(wal_write_time::numeric, 0) AS wal_write_ms,
       round(wal_sync_time::numeric, 0) AS wal_sync_ms,
       round((wal_sync_time / NULLIF(wal_sync, 0))::numeric, 3) AS avg_sync_ms,
       stats_reset
FROM pg_stat_wal;

SELECT state, count(*), max(now() - state_change) AS longest_in_state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count(*) DESC;

\echo
\echo '=== 4. Top statements (pg_stat_statements) ================================'
\if :has_pgss
\if :pg17
SELECT round(total_exec_time::numeric, 0) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_pct,
       shared_blks_read,
       round(shared_blk_read_time::numeric, 0) AS read_ms,
       round((100.0 * shared_blk_read_time / NULLIF(total_exec_time, 0))::numeric, 1) AS io_pct,
       temp_blks_written,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC
LIMIT 25;
\else
SELECT round(total_exec_time::numeric, 0) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_pct,
       shared_blks_read,
       round(blk_read_time::numeric, 0) AS read_ms,
       round((100.0 * blk_read_time / NULLIF(total_exec_time, 0))::numeric, 1) AS io_pct,
       temp_blks_written,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC
LIMIT 25;
\endif
\else
\echo 'pg_stat_statements not installed in this database. It is the single most'
\echo 'useful input for this decision (io_pct per query = the share an SSD can'
\echo 'remove). To enable: shared_preload_libraries = pg_stat_statements, restart,'
\echo 'CREATE EXTENSION pg_stat_statements; then let it collect for a few days.'
\endif

\echo
\echo '=== 5. Verdict inputs ====================================================='
-- One line to compare between servers / over time. read_load_pct = backend
-- read-wait time per wall-clock second (>100 = several backends waiting at once).
SELECT current_database() AS db,
       pg_size_pretty(pg_database_size(current_database())) AS size,
       round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 3) AS hit_pct,
       round((blk_read_time / NULLIF(blks_read, 0))::numeric, 3) AS avg_read_ms,
       round((blks_read / GREATEST(extract(epoch FROM now() - COALESCE(stats_reset, pg_postmaster_start_time())), 1))::numeric, 1) AS reads_per_s,
       round((blk_read_time / 1000 / GREATEST(extract(epoch FROM now() - COALESCE(stats_reset, pg_postmaster_start_time())), 1) * 100)::numeric, 2) AS read_load_pct,
       pg_size_pretty(temp_bytes) AS temp_spilled
FROM pg_stat_database
WHERE datname = current_database();
