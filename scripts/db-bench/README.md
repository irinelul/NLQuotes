# db-bench: would moving Postgres to an SSD box help?

These scripts answer that question for NLQuotes and ChatAudit by measuring the
current server and then the candidate server **the same way**. Three tools,
from cheapest to most realistic:

| Script | Runs where | Answers |
|---|---|---|
| `baseline.sql` | DataGrip or psql | One query, one result grid (`section · object · metric · value · detail`): size, cache hit, per-read latency, scans, spills, checkpoints, top statements. This is the "current baseline". |
| `disk-bench.sh` | **on the DB host** (needs `fio`) | Raw disk latency and throughput in Postgres-shaped I/O (8k random reads, WAL fsync). |
| `query-bench.js` | any machine with Node + `pg` | Our real queries (copied from both apps): cold, warm, client-observed, and under concurrent load. |

Everything is read-only, apart from `disk-bench.sh`'s temporary test file.

## What we already know

We already have evidence, taken from comments in both repos:

- **ChatAudit**: `sql/search_performance_20260714.sql` measured **~25 ms per
  cold random read** on the current disk. A SATA/NVMe SSD does that in
  0.05 to 0.2 ms, which is 100 to 500 times faster. The messages table is
  about 90 monthly partitions, so a single cold user lookup used to cost
  around 200 random reads, roughly 5 s.
- **NLQuotes**: the cold-cache incidents (`/api/games` taking 3.7 s after
  every deploy, and `listVideosForIndex` hitting the 10 s `statement_timeout`)
  happened because cold reads are slow. Both were fixed by reading fewer
  blocks. That treated the symptom; the disk underneath is still slow.
- After the TOAST reclaim (migration 005), `quotes` is about 5 GB
  (407k heap pages, about 3.2 GB of heap).

So the SSD should help **cold paths** a lot: after restarts and deploys,
rare search terms, heavy ChatAudit users, the video-index aggregate, and
ChatAudit ingest. It will help **warm, steady-state requests** only if the
working set does not fit in RAM. The steps below test exactly that.

## Protocol

Use the same Postgres major version, the same `shared_buffers`, `work_mem`,
`random_page_cost` and `effective_io_concurrency`, and **the same amount of
RAM** on both boxes. Otherwise you are benchmarking the configuration or the
memory, not the disk. `baseline.sql` section 0 prints these settings, so you
can diff them. Run `query-bench.js` from the same machine both times (ideally
the app server), so that network latency matches production.

1. **Baseline on the current server** (do this first, today). In DataGrip,
   open a console on each database, run `baseline.sql`, and export the grid
   (CSV/TSV) as `baseline-old-<db>.csv`. Or use psql:
   ```sh
   # once per database: each NLQuotes tenant DB and the ChatAudit DB
   psql "$DATABASE_URL"           -X -q -f scripts/db-bench/baseline.sql > baseline-old-nlquotes.txt
   psql "$CHATAUDIT_DATABASE_URL" -X -q -f scripts/db-bench/baseline.sql > baseline-old-chataudit.txt
   ```
   If `track_io_timing` is off, turn it on first (`ALTER SYSTEM SET
   track_io_timing = on; SELECT pg_reload_conf();` as superuser). Ideally also
   enable `pg_stat_statements` and let it collect for a few days. Without
   these, the most useful columns (`avg_read_ms`, `io %`) stay empty.

2. **Raw disk, both hosts** (the dir must be on the PGDATA mount):
   ```sh
   sudo ./scripts/db-bench/disk-bench.sh /var/lib/postgresql/fio-test
   ```

3. **Query benchmark on the current server.** For true cold numbers, restart
   Postgres and drop the OS cache on the DB host first
   (`sudo systemctl restart postgresql && sync && echo 3 | sudo tee /proc/sys/vm/drop_caches`).
   Do this off-peak:
   ```sh
   NLQ_DATABASE_URL=... CHATAUDIT_DATABASE_URL=... \
     node scripts/db-bench/query-bench.js run --label old
   ```
   This writes `db-bench-old.json` and `db-bench-old.params.json`.

4. **Restore to the SSD box**, apply the same settings, run `ANALYZE`, then do
   the same restart and cache drop. Replay **the same parameters**:
   ```sh
   NLQ_DATABASE_URL=... CHATAUDIT_DATABASE_URL=... \
     node scripts/db-bench/query-bench.js run --label new --params db-bench-old.params.json
   node scripts/db-bench/query-bench.js compare db-bench-old.json db-bench-new.json
   ```
   Keep `--concurrency` and `--duration` the same on both runs. Run each side
   twice: run-to-run noise on the same box is around ±30% for individual
   queries, so treat differences under 1.3x as noise.

## Reading the results

The most useful number is the **time per block read**:
`avg_read_ms` in `baseline.sql` and `ms/read` in `query-bench.js`.

| ms per read | What it means |
|---|---|
| < 0.05 | Served from the OS page cache. The disk is not involved, so an SSD changes nothing for that query. |
| 0.05 to 0.3 | SSD class already. |
| 1 to 30 | HDD or throttled network disk. **This is where an SSD helps.** |

From there:

- **`io %`** (query-bench, pg_stat_statements) is the share of a query's time
  spent waiting for reads. It is the upper bound on what a faster disk can
  remove from that query.
- **`@0.1ms/rd`** projects the cold time if each read took 0.1 ms. You get a
  per-query estimate *before* migrating; the real run on the SSD box then
  confirms it.
- **cold vs warm**: if they are close, the query is CPU-bound (for example
  `ts_headline` on common terms), and a faster disk will not change it; more
  or faster cores would.
- **`read_load_pct`** in the verdict line: read-wait time per wall-clock
  second, accumulated since the stats reset. Near 0 means the steady state is
  cached. A large value means production is waiting on the disk right now.
- **`temp_spilled`** / `temp_blks_written`: sorts and hashes spilling past
  `work_mem`. An SSD makes spills cheaper, but raising `work_mem` is free.
- **WAL fsync** (`disk-bench.sh`, `avg_sync_ms`): NLQuotes analytics INSERTs
  commit synchronously, so each one waits for this. ChatAudit ingest uses
  `synchronous_commit=off` and cares more about `randwrite`, because of index
  maintenance on 7 indexes across the partitions.

### When the move is worth it

Move if **either** of these holds:
- `avg_read_ms` on the current server is ≥ 1 ms, **and** reads are frequent
  (cold-path queries show `io %` above 50 and a meaningful `read blk`), or
- the load phase shows p95/p99 rising with concurrency while `disk-bench`
  `randread-8k-qd16` IOPS on the current box are in the hundreds.

Do not expect gains if hit ratios are above 99.9%, `avg_read_ms` is below
0.05, and cold and warm times are close. In that case the workload is
CPU-bound or limited by network round trips (compare `ping` and
`client ms` against `warm ms`).

## Covered queries

NLQuotes (`models/postgres.js`, `models/analytics.js`):
- search, with variants: common term, rare term, newest, year filter, page 3, game browse
- video page
- random quotes
- game list (loose index scan)
- latest upload
- full video-index aggregate
- removed-topic terms

ChatAudit (`server/routes/search.js`, `scripts/update_user_stats.js`):
- user lookup with stats
- message page 1 for light, medium and heavy users
- deep page (page 40)
- oldest-first
- ILIKE filter
- alert
- the stats-refresh month scan

The load mix covers only request-path queries. Background queries are
measured, but they are not part of the load.

If the SQL in either app changes, update `query-bench.js` to match.
