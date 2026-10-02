// scripts/db-bench/query-bench.js
//
// Replays the queries NLQuotes and ChatAudit actually run against Postgres and
// measures them the same way on two servers, so "would the SSD box be faster"
// gets answered with our own workload instead of a synthetic one.
//
//   NLQ_DATABASE_URL=postgres://... CHATAUDIT_DATABASE_URL=postgres://... \
//     node scripts/db-bench/query-bench.js run --label old
//   # -> db-bench-old.json and db-bench-old.params.json
//
//   # On the new server, replay the SAME parameters:
//   NLQ_DATABASE_URL=... CHATAUDIT_DATABASE_URL=... \
//     node scripts/db-bench/query-bench.js run --label new --params db-bench-old.params.json
//
//   node scripts/db-bench/query-bench.js compare db-bench-old.json db-bench-new.json
//
// Either URL may be omitted to bench only the other app. Options:
//   --samples N       parameter sets per query (default 5)
//   --concurrency N   clients in the load phase (default 8)
//   --duration S      load phase seconds (default 60, 0 to skip)
//   --assume-read-ms  per-block read latency to project cold times with (default 0.1 = NVMe)
//   --no-ssl          connect without SSL (prod pools force SSL, so it is on by default)
//
// Phases, per query and parameter set:
//   cold   EXPLAIN (ANALYZE, BUFFERS) on parameters this run has not touched
//          yet. Only truly cold after a Postgres restart + OS cache drop on the
//          DB host (see README); otherwise "first touch".
//   warm   the same EXPLAIN again, now cached.
//   client the plain query (no EXPLAIN), timed from here: includes network
//          round trip and result transfer.
//   load   a weighted mix of the request-path queries from N concurrent clients.
//
// Read-only: every session runs with default_transaction_read_only = on.
//
// The SQL below is copied from models/postgres.js, models/analytics.js
// (NLQuotes) and server/routes/search.js, scripts/update_user_stats.js
// (ChatAudit). If those change, update it here or the benchmark drifts from
// production.

import fs from 'fs';
import pg from 'pg';

const { Client, Pool } = pg;

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

// --------------------------------------------------------------- statistics
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = sorted(xs);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const median = (xs) => pct(xs, 50);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// ------------------------------------------------------------- connections
function connConfig(url) {
  return {
    connectionString: url,
    ssl: flag('no-ssl') ? false : { rejectUnauthorized: false },
    application_name: 'db-bench',
    options: '-c default_transaction_read_only=on -c statement_timeout=120000',
  };
}

// ------------------------------------------------------- parameter sampling
// Parameters come from the database itself so they look like real traffic.
// They are saved to a file so the second server replays identical inputs
// (TABLESAMPLE picks physical blocks, which differ after a dump/restore).
async function sampleNlq(c, n) {
  const one = async (sql, vals = []) => (await c.query(sql, vals).catch(() => ({ rows: [] }))).rows;

  let common = (await one(
    `SELECT search_term AS t FROM analytics_events
     WHERE event_type = 'search' AND search_term IS NOT NULL AND result_quotes >= 200
     GROUP BY 1 ORDER BY count(*) DESC LIMIT $1`, [n * 3])).map((r) => r.t);
  let rare = (await one(
    `SELECT search_term AS t FROM analytics_events
     WHERE event_type = 'search' AND search_term IS NOT NULL AND result_quotes BETWEEN 1 AND 30
       AND length(search_term) > 3
     GROUP BY 1 ORDER BY max(created_at) DESC LIMIT $1`, [n * 3])).map((r) => r.t);
  if (common.length < n) common = common.concat(['what is going on', 'chat', 'nice', 'game', 'actually', 'oh no']);
  if (rare.length < n) rare = rare.concat(['flabbergasted', 'quintessential', 'serendipity', 'perpendicular', 'onomatopoeia']);

  const games = (await one(
    `SELECT game_name AS g FROM quotes TABLESAMPLE SYSTEM (1)
     WHERE game_name IS NOT NULL GROUP BY 1 ORDER BY random() LIMIT $1`, [n])).map((r) => r.g);
  const videos = (await one(
    `SELECT video_id AS v FROM quotes TABLESAMPLE SYSTEM (0.5) GROUP BY 1 ORDER BY random() LIMIT $1`,
    [n * 2])).map((r) => r.v);
  const years = (await one(
    `SELECT DISTINCT extract(year FROM upload_date)::int AS y FROM quotes TABLESAMPLE SYSTEM (0.2)
     WHERE upload_date IS NOT NULL ORDER BY 1`)).map((r) => r.y);
  const tenant = (await one(
    `SELECT tenant_id AS t FROM analytics_events GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`))[0]?.t || 'default';

  return {
    common: shuffle(common).slice(0, n),
    rare: shuffle(rare).slice(0, n),
    games, videos, years, tenant,
  };
}

async function sampleChatAudit(c, n) {
  const one = async (sql, vals = []) => (await c.query(sql, vals)).rows;
  // Users in three activity buckets: a light user is a handful of partition
  // probes, a heavy one pages through years of history.
  const bucket = (lo, hi) => one(
    `SELECT um.name, um.id, f.message_count, f.first_message_date
     FROM user_activity_facts f TABLESAMPLE SYSTEM (5)
     JOIN user_mapping um ON um.id = f.commenter_id
     WHERE f.message_count BETWEEN $1 AND $2
     ORDER BY random() LIMIT $3`, [lo, hi, n]);
  const light = await bucket(5, 200);
  const medium = await bucket(201, 5000);
  const heavy = await one(
    `SELECT um.name, um.id, f.message_count, f.first_message_date
     FROM (SELECT commenter_id, message_count, first_message_date FROM user_activity_facts
           ORDER BY message_count DESC LIMIT 300) f
     JOIN user_mapping um ON um.id = f.commenter_id
     ORDER BY random() LIMIT $1`, [n]);
  return { light, medium, heavy, filters: ['lol', 'KEKW', 'the', 'what', 'pog'] };
}

function shuffle(xs) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------ NLQuotes SQL
// Mirrors quoteModel.search() in models/postgres.js.
function nlqSearch({ term, game, year, sort, page = 1, limit = 10 }) {
  const params = [];
  const where = [];
  let i = 1;
  if (term) { where.push(`q.fts_doc @@ websearch_to_tsquery('simple', $${i++})`); params.push(term); }
  if (game) { where.push(`q.game_name = $${i++}`); params.push(game); }
  if (year) {
    where.push(`q.upload_date >= $${i} AND q.upload_date < $${i + 1}`);
    params.push(`${year}-01-01`, `${year + 1}-01-01`);
    i += 2;
  }
  const whereSql = where.join(' AND ');
  const textExpr = term
    ? `ts_headline('simple', q.text, websearch_to_tsquery('simple', $1),'MaxWords=5, MinWords=5, HighlightAll=TRUE')`
    : 'q.text';
  let innerOrder = 'q.video_id';
  let outerOrder = 'q.video_id';
  if (sort === 'newest' || sort === 'oldest') {
    const dir = sort === 'newest' ? 'DESC' : 'ASC';
    innerOrder = `MAX(q.upload_date) ${dir}, q.video_id`;
    outerOrder = `q.upload_date ${dir}, q.video_id`;
  }
  const text = `
      WITH page AS (
        SELECT q.video_id,
               COUNT(*) OVER () AS total_videos,
               SUM(COUNT(*)) OVER () AS total_quotes
        FROM quotes q
        WHERE ${whereSql}
        GROUP BY q.video_id
        ORDER BY ${innerOrder}
        LIMIT $${i} OFFSET $${i + 1}
      )
      SELECT q.video_id, q.title, q.upload_date, q.channel_source,
             p.total_videos, p.total_quotes,
             json_agg(json_build_object(
               'text', ${textExpr},
               'line_number', q.line_number,
               'timestamp_start', q.timestamp_start,
               'title', q.title,
               'upload_date', q.upload_date,
               'channel_source', q.channel_source
             ) ORDER BY q.line_number::int) AS quotes
      FROM quotes q
      JOIN page p ON p.video_id = q.video_id
      WHERE ${whereSql}
      GROUP BY q.video_id, q.title, q.upload_date, q.channel_source, p.total_videos, p.total_quotes
      ORDER BY ${outerOrder}`;
  params.push(limit, (page - 1) * limit);
  return { text, values: params };
}

const NLQ_GET_VIDEO = `
  SELECT q.video_id,
         max(q.title) AS title, max(q.channel_source) AS channel_source,
         max(q.upload_date) AS upload_date, max(q.game_name) AS game_name,
         count(*) AS total_quotes,
         json_agg(json_build_object(
           'text', q.text, 'line_number', q.line_number,
           'timestamp_start', q.timestamp_start,
           'timestamp_start_seconds', q.timestamp_start_seconds
         ) ORDER BY q.line_number::int) AS quotes
  FROM quotes q WHERE q.video_id = $1 GROUP BY q.video_id`;

const NLQ_GAME_LIST = `
  WITH RECURSIVE walk AS (
    (SELECT game_name FROM quotes WHERE game_name IS NOT NULL ORDER BY game_name LIMIT 1)
    UNION ALL
    SELECT (SELECT q.game_name FROM quotes q
             WHERE q.game_name > w.game_name AND q.game_name IS NOT NULL
             ORDER BY q.game_name LIMIT 1)
      FROM walk w WHERE w.game_name IS NOT NULL
  )
  SELECT game_name FROM walk WHERE game_name IS NOT NULL ORDER BY game_name ASC`;

const NLQ_RANDOM = `
  SELECT video_id, title, upload_date, channel_source, text, line_number, timestamp_start
  FROM quotes TABLESAMPLE SYSTEM (0.02) ORDER BY random() LIMIT 10`;

const NLQ_LATEST = 'SELECT max(upload_date) AS latest FROM quotes';

const NLQ_VIDEO_INDEX = `
  SELECT q.video_id, max(q.title) AS title, max(q.game_name) AS game_name,
         max(q.upload_date) AS upload_date, count(*) AS quote_count
  FROM quotes q
  WHERE ($2::date IS NULL OR q.upload_date >= $2::date)
  GROUP BY q.video_id
  HAVING count(*) >= $1 AND ($2::date IS NULL OR max(q.upload_date) >= $2::date)
  ORDER BY max(q.upload_date) DESC, q.video_id
  LIMIT 50000`;

const NLQ_REMOVED_TERMS = `
  SELECT DISTINCT lower(btrim(search_term)) AS term
  FROM analytics_events
  WHERE event_type = 'search' AND search_term IS NOT NULL
    AND btrim(search_term) <> '' AND tenant_id = $1
  LIMIT $2`;

// ----------------------------------------------------------- ChatAudit SQL
// Mirrors server/routes/search.js (includeStats = true on the first page).
const CA_USER = `
  SELECT c.id, c.name, c.display_name, cm.logo, cm.bio,
         f.message_count, f.first_message_date, f.last_message_date,
         f.avg_messages_per_day, f.most_active_hours, f.day_of_week_activity,
         f.last_updated, f.last_update_attempt, f.name_history,
         f.latest_subscription_message, f.message_length_stats, f.emote_usage,
         f.time_between_messages, f.message_velocity, f.reaction_counts,
         f.monthly_activity, f.word_frequency, f.message_count AS actual_message_count
  FROM user_mapping c
  LEFT JOIN commenters cm ON cm.commenter_id = c.id
  LEFT JOIN user_activity_facts f ON c.id = f.commenter_id
  WHERE LOWER(c.name) = LOWER($1)`;

function caMessages({ id, first, page = 1, filter, dir = 'DESC' }) {
  const values = [id, 50, (page - 1) * 50];
  let lower = '';
  if (first) { values.push(first); lower = `AND m.created_at >= $${values.length}`; }
  let filt = '';
  if (filter) { values.push(`%${filter}%`); filt = `AND m.message_body ILIKE $${values.length}`; }
  const text = `
    SELECT m.*, vd.title AS vod_title,
           COALESCE(refs.reference_chain, '[]'::jsonb) AS reference_chain
    FROM (
      SELECT m.* FROM messages m
      JOIN vod_details vd ON m.vod_id = vd.id
      WHERE m.commenter_id = $1
      AND m.created_at <= now()
      ${lower}
      AND ((vd.created_at < '2020-09-13 20:05:14+00') OR (vd.created_at >= '2020-09-13 20:05:14+00' AND LOWER(vd.type) = 'archive'))
      ${filt}
      ORDER BY m.created_at ${dir}
      LIMIT $2 OFFSET $3
    ) m
    LEFT JOIN vod_details vd ON m.vod_id = vd.id
    LEFT JOIN LATERAL (
      WITH RECURSIVE chain AS (
        SELECT mr.referenced_message_id AS message_id, mr.referenced_username,
               mr.referenced_message_body AS message_body, 1 AS depth,
               ARRAY[m._id, mr.referenced_message_id]::varchar[] AS visited_ids
        FROM message_references mr WHERE mr.message_id = m._id
        UNION ALL
        SELECT next_ref.referenced_message_id, next_ref.referenced_username,
               next_ref.referenced_message_body, chain.depth + 1,
               chain.visited_ids || next_ref.referenced_message_id
        FROM chain
        JOIN message_references next_ref ON next_ref.message_id = chain.message_id
        WHERE NOT next_ref.referenced_message_id = ANY(chain.visited_ids)
      )
      SELECT jsonb_agg(jsonb_build_object('_id', message_id, 'username', referenced_username,
               'message_body', message_body, 'depth', depth) ORDER BY depth) AS reference_chain
      FROM chain
    ) refs ON true
    ORDER BY m.created_at ${dir}`;
  return { text, values };
}

const CA_ALERT = 'SELECT notice FROM alerts ORDER BY created_at DESC LIMIT 1';

// scripts/update_user_stats.js — the first two scans of a stats refresh.
const CA_STATS_MONTHS = `
  SELECT DISTINCT TO_CHAR(m.created_at, 'YYYY-MM') AS year_month
  FROM messages m LEFT JOIN vod_details vd ON m.vod_id = vd.id
  WHERE m.commenter_id = $1
  AND ((vd.created_at >= '2020-09-13 20:05:14+00' AND vd.type = 'archive') OR vd.created_at < '2020-09-13 20:05:14+00')
  ORDER BY year_month`;

// --------------------------------------------------------------- catalogue
// kind: 'request' runs on a user-facing request (part of the load mix);
// 'background' is boot-time / cron / admin work, measured but not loaded.
// weight: rough share of request traffic for the load phase.
function buildCatalogue(P) {
  const q = [];
  const add = (app, name, kind, weight, instances) =>
    instances.length && q.push({ app, name, kind, weight, instances });

  if (P.nlq) {
    const n = P.nlq;
    add('nlq', 'search.common_term', 'request', 25, n.common.map((t) => nlqSearch({ term: t })));
    add('nlq', 'search.rare_term', 'request', 10, n.rare.map((t) => nlqSearch({ term: t })));
    add('nlq', 'search.term+newest', 'request', 5, n.common.map((t) => nlqSearch({ term: t, sort: 'newest' })));
    add('nlq', 'search.term+year', 'request', 3, n.common.filter(() => n.years.length).map((t, k) =>
      nlqSearch({ term: t, year: n.years[k % n.years.length] })));
    add('nlq', 'search.term_page3', 'request', 3, n.common.map((t) => nlqSearch({ term: t, page: 3 })));
    add('nlq', 'search.game_browse', 'request', 4, n.games.map((g) => nlqSearch({ game: g })));
    add('nlq', 'video_page', 'request', 20, n.videos.map((v) => ({ text: NLQ_GET_VIDEO, values: [v] })));
    add('nlq', 'random', 'request', 5, [{ text: NLQ_RANDOM, values: [] }]);
    add('nlq', 'game_list', 'background', 0, [{ text: NLQ_GAME_LIST, values: [] }]);
    add('nlq', 'latest_upload', 'background', 0, [{ text: NLQ_LATEST, values: [] }]);
    add('nlq', 'video_index_full', 'background', 0, [{ text: NLQ_VIDEO_INDEX, values: [20, null] }]);
    add('nlq', 'removed_topic_terms', 'background', 0, [{ text: NLQ_REMOVED_TERMS, values: [n.tenant, 45000] }]);
  }

  if (P.chataudit) {
    const c = P.chataudit;
    const all = [...c.light, ...c.medium, ...c.heavy];
    const first = (u) => u.first_message_date || null;
    add('chataudit', 'user_lookup', 'request', 15, all.map((u) => ({ text: CA_USER, values: [u.name] })));
    add('chataudit', 'messages.light_p1', 'request', 6, c.light.map((u) => caMessages({ id: u.id, first: first(u) })));
    add('chataudit', 'messages.medium_p1', 'request', 6, c.medium.map((u) => caMessages({ id: u.id, first: first(u) })));
    add('chataudit', 'messages.heavy_p1', 'request', 4, c.heavy.map((u) => caMessages({ id: u.id, first: first(u) })));
    add('chataudit', 'messages.heavy_p40', 'request', 2, c.heavy.map((u) => caMessages({ id: u.id, first: first(u), page: 40 })));
    add('chataudit', 'messages.heavy_oldest', 'request', 1, c.heavy.map((u) => caMessages({ id: u.id, first: first(u), dir: 'ASC' })));
    add('chataudit', 'messages.medium_filter', 'request', 2, c.medium.map((u, k) =>
      caMessages({ id: u.id, first: first(u), filter: c.filters[k % c.filters.length] })));
    add('chataudit', 'alert', 'request', 3, [{ text: CA_ALERT, values: [] }]);
    add('chataudit', 'stats_refresh_months', 'background', 0, (c.medium.length ? c.medium : all).slice(0, 3).map((u) => ({ text: CA_STATS_MONTHS, values: [u.id] })));
  }
  return q;
}

// -------------------------------------------------------------- measuring
async function explain(client, inst) {
  const res = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${inst.text}`, inst.values);
  const top = res.rows[0]['QUERY PLAN'][0];
  const p = top.Plan;
  return {
    execMs: top['Execution Time'],
    planMs: top['Planning Time'],
    hit: p['Shared Hit Blocks'] || 0,
    read: p['Shared Read Blocks'] || 0,
    // PG 17 renamed "I/O Read Time" to "Shared I/O Read Time".
    ioMs: p['Shared I/O Read Time'] ?? p['I/O Read Time'] ?? 0,
    tempWritten: p['Temp Written Blocks'] || 0,
  };
}

async function timed(client, inst) {
  const t = process.hrtime.bigint();
  await client.query(inst.text, inst.values);
  return Number(process.hrtime.bigint() - t) / 1e6;
}

async function runApp(url, app, catalogue, log) {
  const client = new Client(connConfig(url));
  await client.connect();
  try {
    // Superuser-only; without it ioMs stays 0 and cold projections are skipped.
    let ioTiming = (await client.query('SHOW track_io_timing')).rows[0].track_io_timing === 'on';
    if (!ioTiming) {
      ioTiming = await client.query('SET track_io_timing = on').then(() => true, () => false);
    }

    const pings = [];
    for (let k = 0; k < 20; k++) pings.push(await timed(client, { text: 'SELECT 1', values: [] }));

    const out = {};
    for (const q of catalogue.filter((x) => x.app === app)) {
      const rec = { kind: q.kind, cold: [], warm: [], clientMs: [] };
      for (const inst of q.instances) {
        try {
          rec.cold.push(await explain(client, inst));
          rec.warm.push(await explain(client, inst));
          const tries = [];
          for (let k = 0; k < 3; k++) tries.push(await timed(client, inst));
          rec.clientMs.push(median(tries));
        } catch (e) {
          rec.error = e.message;
          log(`  ! ${app}/${q.name}: ${e.message}`);
          break;
        }
      }
      out[q.name] = rec;
      const c = rec.cold;
      if (c.length) {
        log(`  ${app}/${q.name.padEnd(24)} cold ${r1(median(c.map((x) => x.execMs)))} ms ` +
            `(read ${median(c.map((x) => x.read))} blk, io ${r1(median(c.map((x) => x.ioMs)))} ms)  ` +
            `warm ${r1(median(rec.warm.map((x) => x.execMs)))} ms  client ${r1(median(rec.clientMs))} ms`);
      }
    }
    const server = (await client.query(
      `SELECT version() AS version,
              current_setting('shared_buffers') AS shared_buffers,
              current_setting('effective_cache_size') AS effective_cache_size,
              current_setting('work_mem') AS work_mem,
              current_setting('random_page_cost') AS random_page_cost,
              current_setting('effective_io_concurrency') AS effective_io_concurrency,
              pg_size_pretty(pg_database_size(current_database())) AS db_size`)).rows[0];
    return { server, ioTiming, pingMs: { p50: median(pings), p95: pct(pings, 95) }, queries: out };
  } finally {
    await client.end();
  }
}

async function runLoad(urls, catalogue, concurrency, durationS, log) {
  const req = catalogue.filter((q) => q.kind === 'request' && urls[q.app]);
  if (!req.length || durationS <= 0) return null;
  const pools = {};
  for (const app of Object.keys(urls)) {
    if (urls[app]) pools[app] = new Pool({ ...connConfig(urls[app]), max: concurrency });
  }
  const totalW = sum(req.map((q) => q.weight));
  const pick = () => {
    let r = Math.random() * totalW;
    for (const q of req) { if ((r -= q.weight) <= 0) return q; }
    return req[req.length - 1];
  };
  const lat = Object.fromEntries(req.map((q) => [q.name, []]));
  let errors = 0;
  const end = Date.now() + durationS * 1000;
  log(`  load: ${concurrency} clients for ${durationS}s ...`);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (Date.now() < end) {
      const q = pick();
      const inst = q.instances[Math.floor(Math.random() * q.instances.length)];
      const t = process.hrtime.bigint();
      try {
        await pools[q.app].query(inst.text, inst.values);
        lat[q.name].push(Number(process.hrtime.bigint() - t) / 1e6);
      } catch {
        errors++;
      }
    }
  }));
  await Promise.all(Object.values(pools).map((p) => p.end()));
  const all = Object.values(lat).flat();
  const perQuery = Object.fromEntries(Object.entries(lat).map(([k, v]) =>
    [k, { n: v.length, p50: median(v), p95: pct(v, 95), p99: pct(v, 99) }]));
  return {
    concurrency, durationS, errors,
    qps: all.length / durationS,
    p50: median(all), p95: pct(all, 95), p99: pct(all, 99),
    perQuery,
  };
}

// ---------------------------------------------------------------- reports
// Cold time if every block read cost assumeMs instead of what it cost here.
// Only meaningful with track_io_timing; it ignores CPU-side effects.
function projectCold(rec, assumeMs) {
  const c = rec.cold;
  if (!c.length) return null;
  const exec = median(c.map((x) => x.execMs));
  const io = median(c.map((x) => x.ioMs));
  const reads = median(c.map((x) => x.read));
  if (!io || !reads) return exec;
  // Never project slower than measured: if reads here already beat assumeMs
  // they came from the OS cache, and a faster disk changes nothing.
  const projected = Math.max(exec - io + reads * assumeMs, median(rec.warm.map((x) => x.execMs)));
  return Math.min(exec, projected);
}

function printReport(res, assumeMs) {
  for (const [app, a] of Object.entries(res.apps)) {
    console.log(`\n== ${app} (${a.server.db_size}, shared_buffers ${a.server.shared_buffers}, ` +
                `ping p50 ${r1(a.pingMs.p50)} ms, track_io_timing ${a.ioTiming ? 'on' : 'OFF'})`);
    console.log('query'.padEnd(26) + 'kind'.padEnd(11) +
      ['cold ms', 'read blk', 'io ms', 'io %', 'ms/read', 'warm ms', 'client ms', `@${assumeMs}ms/rd`]
        .map((h) => h.padStart(10)).join(''));
    for (const [name, rec] of Object.entries(a.queries)) {
      if (!rec.cold.length) { console.log(`${name.padEnd(26)}${rec.kind.padEnd(11)}  error: ${rec.error}`); continue; }
      const exec = median(rec.cold.map((x) => x.execMs));
      const io = median(rec.cold.map((x) => x.ioMs));
      const reads = median(rec.cold.map((x) => x.read));
      const cells = [
        r1(exec), reads, r1(io),
        a.ioTiming ? r1((100 * io) / exec) : '-',
        a.ioTiming && reads ? (io / reads).toFixed(2) : '-',
        r1(median(rec.warm.map((x) => x.execMs))),
        r1(median(rec.clientMs)),
        a.ioTiming ? r1(projectCold(rec, assumeMs)) : '-',
      ];
      console.log(name.padEnd(26) + rec.kind.padEnd(11) + cells.map((x) => String(x).padStart(10)).join(''));
    }
  }
  if (res.load) {
    const l = res.load;
    console.log(`\n== load: ${l.concurrency} clients x ${l.durationS}s -> ${r1(l.qps)} qps, ` +
                `p50 ${r1(l.p50)} / p95 ${r1(l.p95)} / p99 ${r1(l.p99)} ms, errors ${l.errors}`);
    for (const [k, v] of Object.entries(l.perQuery)) {
      console.log(`  ${k.padEnd(26)} n=${String(v.n).padStart(6)}  p50 ${String(r1(v.p50)).padStart(8)}  ` +
                  `p95 ${String(r1(v.p95)).padStart(8)}  p99 ${String(r1(v.p99)).padStart(8)}`);
    }
  }
}

function compare(aPath, bPath) {
  const A = JSON.parse(fs.readFileSync(aPath, 'utf8'));
  const B = JSON.parse(fs.readFileSync(bPath, 'utf8'));
  const ratio = (x, y) => (x && y ? `${(x / y).toFixed(2)}x` : '-');
  console.log(`${A.label} -> ${B.label}   (ratio > 1 = ${B.label} faster)`);
  for (const app of Object.keys(A.apps)) {
    if (!B.apps[app]) continue;
    const a = A.apps[app], b = B.apps[app];
    console.log(`\n== ${app}  ping ${r1(a.pingMs.p50)} -> ${r1(b.pingMs.p50)} ms`);
    console.log('query'.padEnd(26) + ['cold A', 'cold B', 'ratio', 'warm A', 'warm B', 'ratio', 'client A', 'client B', 'ratio']
      .map((h) => h.padStart(9)).join(''));
    for (const name of Object.keys(a.queries)) {
      const qa = a.queries[name], qb = b.queries[name];
      if (!qb || !qa.cold.length || !qb.cold.length) continue;
      const m = (rec, f) => median(rec[f].map((x) => x.execMs));
      const ca = m(qa, 'cold'), cb = m(qb, 'cold'), wa = m(qa, 'warm'), wb = m(qb, 'warm');
      const la = median(qa.clientMs), lb = median(qb.clientMs);
      console.log(name.padEnd(26) + [r1(ca), r1(cb), ratio(ca, cb), r1(wa), r1(wb), ratio(wa, wb), r1(la), r1(lb), ratio(la, lb)]
        .map((x) => String(x).padStart(9)).join(''));
    }
  }
  if (A.load && B.load) {
    console.log(`\n== load  qps ${r1(A.load.qps)} -> ${r1(B.load.qps)} (${ratio(B.load.qps, A.load.qps)})  ` +
      `p95 ${r1(A.load.p95)} -> ${r1(B.load.p95)} ms (${ratio(A.load.p95, B.load.p95)})  ` +
      `p99 ${r1(A.load.p99)} -> ${r1(B.load.p99)} ms (${ratio(A.load.p99, B.load.p99)})`);
  }
}

// ------------------------------------------------------------------- main
async function main() {
  if (cmd === 'compare') return compare(argv[1], argv[2]);
  if (cmd === 'report') return printReport(JSON.parse(fs.readFileSync(argv[1], 'utf8')), Number(opt('assume-read-ms', 0.1)));
  if (cmd !== 'run') {
    console.error('usage: query-bench.js run --label NAME [--params FILE] | compare A.json B.json | report A.json');
    process.exit(2);
  }

  const label = opt('label', 'run');
  const samples = parseInt(opt('samples', '5'), 10);
  const concurrency = parseInt(opt('concurrency', '8'), 10);
  const duration = parseInt(opt('duration', '60'), 10);
  const assumeMs = Number(opt('assume-read-ms', '0.1'));
  const urls = {
    nlq: process.env.NLQ_DATABASE_URL || null,
    chataudit: process.env.CHATAUDIT_DATABASE_URL || null,
  };
  if (!urls.nlq && !urls.chataudit) {
    console.error('Set NLQ_DATABASE_URL and/or CHATAUDIT_DATABASE_URL.');
    process.exit(2);
  }
  const log = (s) => console.error(s);

  let params;
  const paramsFile = opt('params', null);
  if (paramsFile) {
    params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
    log(`params: replaying ${paramsFile}`);
  } else {
    params = {};
    for (const [app, url] of Object.entries(urls)) {
      if (!url) continue;
      const c = new Client(connConfig(url));
      await c.connect();
      try {
        params[app] = app === 'nlq' ? await sampleNlq(c, samples) : await sampleChatAudit(c, samples);
      } finally {
        await c.end();
      }
    }
    fs.writeFileSync(`db-bench-${label}.params.json`, JSON.stringify(params, null, 2));
    log(`params: sampled -> db-bench-${label}.params.json (pass it with --params on the other server)`);
  }

  const catalogue = buildCatalogue(params);
  const res = { label, startedAt: new Date().toISOString(), apps: {} };
  for (const app of ['nlq', 'chataudit']) {
    if (!urls[app] || !params[app]) continue;
    log(`${app}: cold / warm / client passes`);
    res.apps[app] = await runApp(urls[app], app, catalogue, log);
  }
  res.load = await runLoad(urls, catalogue.filter((q) => params[q.app]), concurrency, duration, log);

  fs.writeFileSync(`db-bench-${label}.json`, JSON.stringify(res, null, 2));
  printReport(res, assumeMs);
  log(`\nsaved db-bench-${label}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
