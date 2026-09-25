// scripts/metabase/build-search-cards.js
//
// Provisions the "Search behaviour" and "Server-rendered pages" sections of
// dashboard id=2 ('NLQuotes Usage (Public)'). Card SQL lives in
// search-cards.js. Same approach as build-journey-cards.js: idempotent
// upsert by card name, new dashcards appended below existing content, every
// existing dashcard carried through untouched.
//
// It also looks for the old strict/flexible cards: any other card whose SQL
// reads the search_mode column. That column said 'keyword' for every search
// until this release, so those charts show nothing real. They are listed by
// default and archived (not deleted — restorable from Metabase's trash) only
// with --archive-stale.
//
// Security: the API key is read ONLY from METABASE_API_KEY and never logged.
//
// Usage:
//   METABASE_API_KEY='...' node scripts/metabase/build-search-cards.js [--dry-run] [--archive-stale]
//
//   --dry-run        read-only: print what would change, write nothing
//   --archive-stale  archive the old cards that chart the search_mode column

import process from 'node:process';
import { CARDS, SECTIONS } from './search-cards.js';

const BASE_URL = (process.env.METABASE_BASE_URL || 'https://metabase.nlquotes.com').replace(/\/+$/, '');
const API_KEY = process.env.METABASE_API_KEY;
const DATABASE_ID = 2;
const DASHBOARD_ID = 2;
const DRY_RUN = process.argv.includes('--dry-run');
const ARCHIVE_STALE = process.argv.includes('--archive-stale');

if (!API_KEY) {
  console.error('ERROR: METABASE_API_KEY environment variable is not set. Refusing to run.');
  process.exit(1);
}

const HEADERS = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };

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
    err.body = json || raw;
    throw err;
  }
  return json;
}

// Writes go through here so --dry-run can report them instead.
async function write(method, path, body, label) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would ${label}`);
    return null;
  }
  return api(method, path, body);
}

// MBQL v2 shape this Metabase build (v0.62.x) stores; see build-journey-cards.js.
function datasetQuery(sql) {
  return {
    'lib/type': 'mbql/query',
    database: DATABASE_ID,
    stages: [{ 'lib/type': 'mbql.stage/native', native: sql }],
  };
}

// Native SQL of a card in either the v2 shape or the legacy one.
function cardSql(card) {
  const q = card?.dataset_query || {};
  const stage = q.stages?.[0]?.native;
  if (typeof stage === 'string') return stage;
  if (typeof stage?.query === 'string') return stage.query;
  if (typeof q.native?.query === 'string') return q.native.query;
  return '';
}

function vizSettingsFor(card) {
  return card.display === 'bar'
    ? { 'graph.dimensions': [card.dim], 'graph.metrics': [card.metric] }
    : {};
}

// Session-based cards need migration 004's session_id column.
async function precheck() {
  const sql = `SELECT 1 FROM information_schema.columns WHERE table_name='analytics_events' AND column_name='session_id' LIMIT 1`;
  const result = await api('POST', '/api/dataset', datasetQuery(sql));
  return (result?.data?.rows ?? []).length > 0;
}

async function upsertCards(allCards) {
  const byName = new Map(allCards.map((c) => [c.name, c]));
  const ids = {};
  for (const card of CARDS) {
    const existing = byName.get(card.name);
    const payload = {
      name: card.name,
      description: card.description,
      display: card.display,
      visualization_settings: vizSettingsFor(card),
      collection_id: null,
      dataset_query: datasetQuery(card.sql),
    };
    if (existing) {
      await write('PUT', `/api/card/${existing.id}`, payload, `update card ${existing.id} — ${card.name}`);
      ids[card.name] = existing.id;
      if (!DRY_RUN) console.log(`  updated card ${existing.id} — ${card.name}`);
    } else {
      const created = await write('POST', '/api/card', payload, `create card — ${card.name}`);
      if (created) {
        ids[card.name] = created.id;
        console.log(`  created card ${created.id} — ${card.name}`);
      }
    }
  }
  return ids;
}

async function handleStaleCards(allCards) {
  const ours = new Set(CARDS.map((c) => c.name));
  const stale = allCards.filter((c) => !ours.has(c.name) && /\bsearch_mode\b/i.test(cardSql(c)));
  if (stale.length === 0) {
    console.log('  none found.');
    return;
  }
  for (const c of stale) {
    if (ARCHIVE_STALE) {
      await write('PUT', `/api/card/${c.id}`, { archived: true }, `archive card ${c.id} — ${c.name}`);
      if (!DRY_RUN) console.log(`  archived card ${c.id} — ${c.name}`);
    } else {
      console.log(`  card ${c.id} — ${c.name}  (re-run with --archive-stale to archive it)`);
    }
  }
}

async function updateDashboard(ids) {
  const dash = await api('GET', `/api/dashboard/${DASHBOARD_ID}`);
  const existing = Array.isArray(dash.dashcards) ? dash.dashcards : [];
  const namesOnDash = new Set(existing.map((d) => d.card?.name).filter(Boolean));
  const headingsOnDash = new Set(existing.map((d) => d.visualization_settings?.text).filter(Boolean));
  const preserved = existing.map(({ card: _card, ...rest }) => rest);

  let baseRow = existing.reduce((m, d) => Math.max(m, (d.row || 0) + (d.size_y || 0)), 0);
  const added = [];
  let nextNegId = -1;

  for (const section of SECTIONS) {
    const pending = section.layout.filter((slot) => !namesOnDash.has(slot.name));
    if (pending.length === 0 && headingsOnDash.has(section.heading)) {
      console.log(`  "${section.heading}": already on the dashboard, skipping`);
      continue;
    }
    if (!headingsOnDash.has(section.heading)) {
      added.push({
        id: nextNegId--,
        card_id: null,
        row: baseRow, col: 0, size_x: 24, size_y: 1,
        visualization_settings: {
          virtual_card: { name: null, display: 'text', visualization_settings: {}, dataset_query: {}, archived: false },
          text: section.heading,
          'text.align_vertical': 'middle',
        },
        parameter_mappings: [],
      });
      console.log(`  + heading "${section.heading}" at row ${baseRow}`);
    }
    for (const slot of pending) {
      const card = CARDS.find((c) => c.name === slot.name);
      const cardId = ids[slot.name];
      if (!cardId) {
        console.log(`  + "${slot.name}" (placed once the card exists)`);
        continue;
      }
      added.push({
        id: nextNegId--,
        card_id: cardId,
        row: baseRow + slot.row, col: slot.col, size_x: slot.size_x, size_y: slot.size_y,
        visualization_settings: vizSettingsFor(card),
        parameter_mappings: [],
      });
      console.log(`  + "${slot.name}" (card ${cardId}) at row ${baseRow + slot.row}, col ${slot.col}`);
    }
    baseRow += section.height;
  }

  if (added.length === 0) return 0;
  await write('PUT', `/api/dashboard/${DASHBOARD_ID}`, { dashcards: [...preserved, ...added] },
    `save ${added.length} new dashcard(s) on dashboard ${DASHBOARD_ID}`);
  return added.length;
}

async function main() {
  console.log(`Metabase search-cards provisioning${DRY_RUN ? ' (dry run — no writes)' : ''}`);
  console.log(`  base url: ${BASE_URL}, database ${DATABASE_ID}, dashboard ${DASHBOARD_ID}, ${CARDS.length} cards\n`);

  if (!(await precheck())) {
    console.log('analytics_events.session_id is missing (migration 004 not applied). Apply it first.');
    process.exit(0);
  }

  const list = await api('GET', '/api/card?f=all&archived=false');
  const allCards = Array.isArray(list) ? list : [];

  console.log('Cards:');
  const ids = await upsertCards(allCards);

  console.log('\nOld cards charting the search_mode column:');
  await handleStaleCards(allCards);

  console.log(`\nDashboard ${DASHBOARD_ID}:`);
  const added = await updateDashboard(ids);

  console.log(`\nDone. ${CARDS.length} cards ensured, ${added} dashboard placement(s)${DRY_RUN ? ' would be' : ''} added.`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  if (err.body) console.error('response body:', JSON.stringify(err.body).slice(0, 1000));
  process.exit(1);
});
