// scripts/metabase/build-journey-cards.js
//
// Reproducible Metabase provisioning for the NLQuotes session-journey dashboard
// cards. Creates (or updates) 9 native-SQL cards against database id=2 ('PGSQL',
// Postgres) table `analytics_events`, and appends them to dashboard id=2
// ('NLQuotes Usage (Public)', the iframe-embedded public dashboard).
//
// Idempotent: safe to run repeatedly. On the first run after migration 004
// (which adds `session_id`, `referrer_source`, `referrer_medium`,
// `session_duration_ms`) lands, the cards + dashboard layout are created. Before
// the migration is applied this script DETECTS the missing column and SKIPS
// gracefully (exit 0) so it never creates cards against a missing column.
//
// Conventions matched by inspecting card id=40 ('Total searches (30 days)'):
//   - collection_id: null          (analytics cards live at the root collection)
//   - query_type:   native
//   - display:      scalar / bar / table
//   - dataset_query uses the new MBQL v2 `lib/type` shape that this Metabase
//     build (v0.62.x) returns and stores:
//       { "lib/type":"mbql/query", database:2,
//         stages:[ { "lib/type":"mbql.stage/native", native: <sql> } ] }
//   - NO `tenant_id = '...'` filter (card 40 does not filter by tenant, so the
//     session-journey cards intentionally omit it too, to keep parity).
//
// Security: the Metabase API key is read ONLY from the environment variable
// METABASE_API_KEY. It is never written to a file, never committed, and never
// logged. The script hard-exits if it is unset.
//
// Usage:
//   METABASE_API_KEY='...' \
//   METABASE_BASE_URL='https://metabase.nlquotes.com' \
//   node scripts/metabase/build-journey-cards.js

import process from 'node:process';

const BASE_URL = (process.env.METABASE_BASE_URL || 'https://metabase.nlquotes.com').replace(/\/+$/, '');
const API_KEY = process.env.METABASE_API_KEY;
const DATABASE_ID = 2;
const DASHBOARD_ID = 2;

if (!API_KEY) {
  console.error('ERROR: METABASE_API_KEY environment variable is not set. Refusing to run.');
  console.error('Set it inline, e.g.: METABASE_API_KEY="..." node scripts/metabase/build-journey-cards.js');
  process.exit(1);
}

const HEADERS = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Tiny fetch wrapper around the Metabase REST API.
// ---------------------------------------------------------------------------
async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
  if (!res.ok) {
    const detail = json?.message || json?.errors || raw || res.statusText;
    const err = new Error(`Metabase API ${method} ${path} -> HTTP ${res.status}: ${detail}`);
    err.status = res.status;
    err.body = json || raw;
    throw err;
  }
  return json;
}

// Build a dataset_query in the new MBQL v2 shape used by this Metabase build.
function datasetQuery(sql) {
  return {
    'lib/type': 'mbql/query',
    database: DATABASE_ID,
    stages: [{ 'lib/type': 'mbql.stage/native', native: sql }],
  };
}

// ---------------------------------------------------------------------------
// Card definitions. SQL is exactly as specified for the session-journey cards
// (30-day window). No tenant_id filter, matching card 40's convention.
// `viz` is the dashcard visualization_settings for bar/table/scalar parity with
// existing cards (card 47 sets graph.dimensions/graph.metrics for its bars).
// ---------------------------------------------------------------------------
const CARDS = [
  {
    name: 'Traffic sources',
    display: 'bar',
    description: 'Distinct sessions per referrer source over the last 30 days.',
    dim: 'Source', metric: 'Sessions',
    sql: `SELECT referrer_source AS "Source", count(DISTINCT session_id) AS "Sessions" FROM analytics_events WHERE event_type='session_start' AND created_at >= now()-interval '30 days' AND referrer_source IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;`,
  },
  {
    name: 'Top referrer domains',
    display: 'bar',
    description: 'Top referring domains (excluding direct/internal) by distinct sessions, last 30 days.',
    dim: 'Domain', metric: 'Sessions',
    sql: `SELECT referrer_medium AS "Domain", count(DISTINCT session_id) AS "Sessions" FROM analytics_events WHERE event_type='session_start' AND created_at >= now()-interval '30 days' AND referrer_source NOT IN ('direct','internal') AND referrer_medium IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`,
  },
  {
    name: 'Top entry pages',
    display: 'bar',
    description: 'Most common session-start pages over the last 30 days.',
    dim: 'Entry page', metric: 'Sessions',
    sql: `SELECT path AS "Entry page", count(*) AS "Sessions" FROM analytics_events WHERE event_type='session_start' AND created_at >= now()-interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`,
  },
  {
    name: 'Top exit pages',
    display: 'bar',
    description: 'Most common session-end pages over the last 30 days.',
    dim: 'Exit page', metric: 'Sessions',
    sql: `SELECT path AS "Exit page", count(*) AS "Sessions" FROM analytics_events WHERE event_type='session_end' AND created_at >= now()-interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 15;`,
  },
  {
    name: 'Avg session duration (s)',
    display: 'scalar',
    description: 'Average session duration in seconds (sessions with >=2 events), last 30 days.',
    sql: `SELECT round(avg(dur)) AS v FROM (SELECT session_id, EXTRACT(EPOCH FROM (max(created_at)-min(created_at))) AS dur FROM analytics_events WHERE created_at >= now()-interval '30 days' AND session_id IS NOT NULL GROUP BY 1 HAVING count(*)>=2) s;`,
  },
  {
    name: 'Events per session',
    display: 'scalar',
    description: 'Average number of events per session over the last 30 days.',
    sql: `SELECT round(avg(cnt)) AS v FROM (SELECT session_id, count(*) AS cnt FROM analytics_events WHERE created_at >= now()-interval '30 days' AND session_id IS NOT NULL GROUP BY 1) s;`,
  },
  {
    name: 'Entry to exit paths',
    display: 'table',
    description: 'Most frequent entry-page -> exit-page paths over the last 30 days.',
    sql: `SELECT e.path AS "Entry", x.path AS "Exit", count(*) AS "Sessions" FROM analytics_events e JOIN analytics_events x ON x.session_id=e.session_id AND x.tenant_id=e.tenant_id AND x.event_type='session_end' WHERE e.event_type='session_start' AND e.created_at >= now()-interval '30 days' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15;`,
  },
  {
    name: 'Bounce rate %',
    display: 'scalar',
    description: 'Share of single-event sessions over the last 30 days (%).',
    sql: `SELECT round(100.0*sum(CASE WHEN cnt=1 THEN 1 ELSE 0 END)/count(*),1) AS v FROM (SELECT session_id, count(*) AS cnt FROM analytics_events WHERE created_at >= now()-interval '30 days' AND session_id IS NOT NULL GROUP BY 1) s;`,
  },
  {
    name: 'Exit-beacon coverage %',
    display: 'scalar',
    description: 'Data-quality: share of sessions with a session_end beacon (last 30 days, %).',
    sql: `SELECT round(100.0*count(DISTINCT CASE WHEN event_type='session_end' THEN session_id END)/nullif(count(DISTINCT CASE WHEN event_type='session_start' THEN session_id END),0),1) AS v FROM analytics_events WHERE created_at >= now()-interval '30 days' AND session_id IS NOT NULL;`,
  },
];

// Dashboard grid layout for the new cards, RELATIVE to the section start row.
// Matches existing conventions: section heading is a 24x1 text card; scalars are
// 6x3 tiles (like cards 40/41/52/53); bars/tables are 12x6 (like card 47); the
// wide entry->exit table spans the full 24-col width. No overlaps.
const HEADING_TEXT = '## 🧭 Session journey';
const LAYOUT = [
  { kind: 'heading', text: HEADING_TEXT, row: 0, col: 0, size_x: 24, size_y: 1 },
  { name: 'Avg session duration (s)', row: 1, col: 0, size_x: 6, size_y: 3 },
  { name: 'Events per session', row: 1, col: 6, size_x: 6, size_y: 3 },
  { name: 'Bounce rate %', row: 1, col: 12, size_x: 6, size_y: 3 },
  { name: 'Exit-beacon coverage %', row: 1, col: 18, size_x: 6, size_y: 3 },
  { name: 'Traffic sources', row: 4, col: 0, size_x: 12, size_y: 6 },
  { name: 'Top referrer domains', row: 4, col: 12, size_x: 12, size_y: 6 },
  { name: 'Top entry pages', row: 10, col: 0, size_x: 12, size_y: 6 },
  { name: 'Top exit pages', row: 10, col: 12, size_x: 12, size_y: 6 },
  { name: 'Entry to exit paths', row: 16, col: 0, size_x: 24, size_y: 6 },
];

function vizSettingsFor(card) {
  if (card.display === 'bar') {
    return { 'graph.dimensions': [card.dim], 'graph.metrics': [card.metric] };
  }
  // scalar + table: no overrides needed (matches card 40 scalar -> {}).
  return {};
}

// ---------------------------------------------------------------------------
// Step 1: pre-check. Bail out cleanly if migration 004 is not yet applied.
// ---------------------------------------------------------------------------
async function precheck() {
  const sql = `SELECT 1 FROM information_schema.columns WHERE table_name='analytics_events' AND column_name='session_id' LIMIT 1`;
  const result = await api('POST', '/api/dataset', datasetQuery(sql));
  const rows = result?.data?.rows ?? [];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Step 2: upsert each card (idempotent). Returns name -> card id.
// ---------------------------------------------------------------------------
async function upsertCards() {
  const list = await api('GET', '/api/card?f=all&archived=false');
  const byName = new Map((Array.isArray(list) ? list : []).map((c) => [c.name, c]));

  const ids = {};
  for (const card of CARDS) {
    const existing = byName.get(card.name);
    const payload = {
      name: card.name,
      description: card.description,
      display: card.display,
      visualization_settings: vizSettingsFor(card),
      collection_id: null, // matches card 40 / analytics cards
      dataset_query: datasetQuery(card.sql),
    };
    if (existing) {
      await api('PUT', `/api/card/${existing.id}`, payload);
      ids[card.name] = existing.id;
      console.log(`  updated card ${existing.id} — ${card.name} (${card.display})`);
    } else {
      const created = await api('POST', '/api/card', payload);
      ids[card.name] = created.id;
      console.log(`  created card ${created.id} — ${card.name} (${card.display})`);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Step 3: append the cards to dashboard 2 below existing content.
// Preserves every existing dashcard exactly; skips cards already placed.
// ---------------------------------------------------------------------------
async function updateDashboard(ids) {
  const dash = await api('GET', `/api/dashboard/${DASHBOARD_ID}`);
  const existing = Array.isArray(dash.dashcards) ? dash.dashcards : [];

  // Names / heading text already present on the dashboard.
  const namesOnDash = new Set(existing.map((d) => d.card?.name).filter(Boolean));
  const headingPresent = existing.some((d) => d.visualization_settings?.text === HEADING_TEXT);

  // Preserve every existing dashcard, dropping only the server-expanded nested
  // `card` object (its SQL/metadata are read-only here and live on the card).
  // All positioning + viz overrides + parameter mappings are kept verbatim.
  const preserved = existing.map(({ card: _card, ...rest }) => rest);

  // First free row below all existing content.
  const baseRow = existing.reduce((m, d) => Math.max(m, (d.row || 0) + (d.size_y || 0)), 0);

  const newDashcards = [];
  let nextNegId = -1;
  const nextId = () => nextNegId--;

  for (const slot of LAYOUT) {
    if (slot.kind === 'heading') {
      if (headingPresent) {
        console.log(`  dashboard: heading already present, skipping`);
        continue;
      }
      newDashcards.push({
        id: nextId(),
        card_id: null,
        row: baseRow + slot.row,
        col: slot.col,
        size_x: slot.size_x,
        size_y: slot.size_y,
        visualization_settings: {
          virtual_card: { name: null, display: 'text', visualization_settings: {}, dataset_query: {}, archived: false },
          text: slot.text,
          'text.align_vertical': 'middle',
        },
        parameter_mappings: [],
      });
      console.log(`  dashboard: + heading "${slot.text}" at row ${baseRow + slot.row}`);
      continue;
    }

    const card = CARDS.find((c) => c.name === slot.name);
    if (namesOnDash.has(slot.name)) {
      console.log(`  dashboard: "${slot.name}" already on dashboard, skipping`);
      continue;
    }
    const cardId = ids[slot.name];
    if (!cardId) {
      console.warn(`  dashboard: no card id for "${slot.name}", skipping placement`);
      continue;
    }
    newDashcards.push({
      id: nextId(),
      card_id: cardId,
      row: baseRow + slot.row,
      col: slot.col,
      size_x: slot.size_x,
      size_y: slot.size_y,
      visualization_settings: vizSettingsFor(card),
      parameter_mappings: [],
    });
    console.log(`  dashboard: + "${slot.name}" (card ${cardId}) at row ${baseRow + slot.row}, col ${slot.col}`);
  }

  if (newDashcards.length === 0) {
    console.log('  dashboard: nothing to add (all cards + heading already present).');
    return { added: 0 };
  }

  // PUT only the reconciled dashcards set; existing cards are carried through
  // untouched in `preserved`, so nothing is removed or modified.
  await api('PUT', `/api/dashboard/${DASHBOARD_ID}`, { dashcards: [...preserved, ...newDashcards] });
  console.log(`  dashboard: saved ${newDashcards.length} new dashcard(s).`);
  return { added: newDashcards.length };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Metabase journey-cards provisioning`);
  console.log(`  base url   : ${BASE_URL}`);
  console.log(`  database   : ${DATABASE_ID}`);
  console.log(`  dashboard  : ${DASHBOARD_ID}`);
  console.log(`  cards      : ${CARDS.length} defined`);
  console.log('');

  console.log('Pre-check: verifying analytics_events.session_id exists ...');
  const ok = await precheck();
  if (!ok) {
    console.log('Migration 004 not applied yet (session_id column absent). Skipping card creation. Re-run after the migration is applied.');
    process.exit(0);
  }
  console.log('  session_id present. Proceeding to create/update cards.');
  console.log('');

  console.log('Creating / updating cards (idempotent) ...');
  const ids = await upsertCards();
  console.log('');

  console.log('Appending cards to dashboard 2 ...');
  const { added } = await updateDashboard(ids);
  console.log('');

  console.log(`Done. ${CARDS.length} cards ensured, ${added} dashboard placement(s) added.`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.body) console.error('response body:', JSON.stringify(err.body).slice(0, 1000));
  process.exit(1);
});
