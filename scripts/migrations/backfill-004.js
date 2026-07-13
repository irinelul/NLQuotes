// scripts/migrations/backfill-004.js
// Backfills referrer_source + referrer_medium on existing analytics_events rows
// using the canonical referrer categorization, so historical data populates the
// new referrer dashboards immediately. Idempotent: only touches rows where
// referrer_source IS NULL. Runs VACUUM ANALYZE afterwards (outside any tx).
//
// SSL is forced; NODE_ENV set to 'production'. No secrets are printed.
//
// Usage: node scripts/migrations/backfill-004.js

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
process.env.NODE_ENV = 'production';

const TENANTS = ['northernlion', 'hivemind', 'jrequotes', 'lttquotes', 'vinesauce'];
const CHUNK = 10000;       // batch size for large tables
const LARGE_THRESHOLD = 100000;

function loadTenantConfig(id) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'tenants', `${id}.json`), 'utf8'));
}

function makePool(connectionString) {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  });
}

// Host extraction: strip http(s)://, take up to the first / or ?, lowercase.
// This is the shared expression the backend JS impl must match.
const HOST_EXPR = "lower(substring(referrer from '(?:https?://)?([^/?:]+)'))";

const SOURCE_EXPR = `CASE
    WHEN referrer IS NULL OR referrer = '' OR referrer = '/' THEN 'DIRECT'
    WHEN ${HOST_EXPR} LIKE '%nlquotes.com' THEN 'INTERNAL'
    WHEN ${HOST_EXPR} ~ 'google|bing\\.com|duckduckgo\\.com|yahoo|yandex|ecosia\\.org|search\\.brave\\.com|startpage\\.com' THEN 'ORGANIC'
    WHEN ${HOST_EXPR} ~ 'reddit\\.com|twitter\\.com|x\\.com|youtube\\.com|youtu\\.be|discord\\.com|discord\\.gg|tiktok\\.com|facebook\\.com|instagram\\.com|linkedin\\.com|twitch\\.tv' THEN 'SOCIAL'
    ELSE 'OTHER'
  END`;

const MEDIUM_EXPR = `CASE
    WHEN referrer IS NULL OR referrer = '' OR referrer = '/' THEN NULL
    ELSE ${HOST_EXPR}
  END`;

const UPDATE_SQL = `
  UPDATE analytics_events
  SET referrer_source = ${SOURCE_EXPR},
      referrer_medium = ${MEDIUM_EXPR}
  WHERE referrer_source IS NULL`;

async function backfillForTenant(tenantId, envVar) {
  const out = { tenant: tenantId, status: 'unknown', total: null, toBackfill: null, backfilled: 0, batched: false, vacuumed: false, detail: null };

  const dbUrl = process.env[envVar];
  if (!dbUrl) {
    out.status = 'skipped-no-creds';
    out.detail = `env var ${envVar} is not set`;
    return out;
  }

  const pool = makePool(dbUrl);
  try {
    // If the table is missing entirely, nothing to backfill.
    const exists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'analytics_events'
      ) AS exists`);
    if (!exists.rows[0].exists) {
      out.status = 'no-table';
      out.detail = 'analytics_events does not exist in this DB';
      return out;
    }

    const totals = await pool.query('SELECT COUNT(*)::bigint AS n FROM analytics_events');
    out.total = Number(totals.rows[0].n);

    const pending = await pool.query('SELECT COUNT(*)::bigint AS n FROM analytics_events WHERE referrer_source IS NULL');
    out.toBackfill = Number(pending.rows[0].n);

    if (out.toBackfill === 0) {
      out.status = 'applied';
      return out; // nothing to do, still vacuum below
    }

    if (out.total <= LARGE_THRESHOLD) {
      // Single UPDATE — small table.
      const res = await pool.query(UPDATE_SQL);
      out.backfilled = res.rowCount || 0;
    } else {
      // Batched by id range to avoid long locks.
      out.batched = true;
      const bounds = await pool.query(`
        SELECT min(id)::bigint AS lo, max(id)::bigint AS hi
        FROM analytics_events WHERE referrer_source IS NULL`);
      const lo = Number(bounds.rows[0].lo);
      const hi = Number(bounds.rows[0].hi);
      for (let cur = lo; cur <= hi; cur += CHUNK) {
        const res = await pool.query(
          `${UPDATE_SQL} AND id >= $1 AND id < $2`,
          [cur, cur + CHUNK]
        );
        out.backfilled += res.rowCount || 0;
      }
    }

    // VACUUM ANALYZE — must run outside a transaction block (autocommit).
    await pool.query('VACUUM ANALYZE analytics_events');
    out.vacuumed = true;
    out.status = 'applied';
  } catch (err) {
    out.status = 'error';
    out.detail = `${err.code || 'ERROR'}: ${err.message}`;
  } finally {
    await pool.end();
  }
  return out;
}

async function main() {
  const results = [];
  for (const tenantId of TENANTS) {
    let envVar;
    try {
      envVar = loadTenantConfig(tenantId).database?.envVar;
    } catch (e) {
      results.push({ tenant: tenantId, status: 'error', detail: `cannot read tenant config: ${e.message}` });
      continue;
    }
    results.push(await backfillForTenant(tenantId, envVar));
  }

  console.log('\n========== backfill-004 results ==========');
  for (const r of results) {
    if (r.status === 'applied') {
      console.log(`[${r.tenant}] DONE  total=${r.total} backfilled=${r.backfilled}${r.batched ? ' (batched)' : ''} vacuum=${r.vacuumed ? 'ok' : 'skipped'}`);
    } else if (r.status === 'skipped-no-creds') {
      console.log(`[${r.tenant}] SKIPPED  ${r.detail}`);
    } else if (r.status === 'no-table') {
      console.log(`[${r.tenant}] NO-TABLE  ${r.detail}`);
    } else {
      console.log(`[${r.tenant}] ERROR  ${r.detail}`);
    }
  }
  console.log('==========================================\n');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
