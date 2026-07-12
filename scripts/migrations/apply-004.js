// scripts/migrations/apply-004.js
// Applies migration 004 (session/journey columns + index) to every tenant DB
// whose connection env var is present in .env.
//
// Safety notes:
//  - SSL is forced (ssl:{rejectUnauthorized:false}) regardless of NODE_ENV, and
//    NODE_ENV is also set to 'production' for belt-and-suspenders parity with
//    models/postgres.js.
//  - The ALTER is one statement; CREATE INDEX CONCURRENTLY is its OWN separate
//    statement. No statement is wrapped in an explicit transaction (pg autocommits
//    each pool.query), which is required because CONCURRENTLY cannot run inside a
//    transaction block.
//  - Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX CONCURRENTLY IF NOT EXISTS).
//  - Never prints connection strings or secrets.
//
// Usage: node scripts/migrations/apply-004.js

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

// Load .env from repo root and force production SSL behavior.
dotenv.config({ path: path.join(repoRoot, '.env') });
process.env.NODE_ENV = 'production';

// The 5 tenants this product ships. Each tenant's DB URL lives in the env var
// named by its tenant config's database.envVar.
const TENANTS = ['northernlion', 'hivemind', 'jrequotes', 'lttquotes', 'vinesauce'];

function loadTenantConfig(id) {
  const filePath = path.join(repoRoot, 'tenants', `${id}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makePool(connectionString) {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // required by the prod DBs
    max: 2,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
  });
}

// Build a password-free conninfo string for the manual-run fallback message.
// Never returns the password.
function redactedConnInfo(dbUrl) {
  try {
    const u = new URL(dbUrl);
    const host = u.hostname;
    const port = u.port || '5432';
    const db = (u.pathname || '/').replace(/^\//, '');
    const user = u.username || 'postgres';
    return `host=${host} port=${port} dbname=${db} user=${user} sslmode=require`;
  } catch {
    return '<unparseable connection string>';
  }
}

const ALTER_SQL = `
  ALTER TABLE analytics_events
    ADD COLUMN IF NOT EXISTS session_id        VARCHAR(36),
    ADD COLUMN IF NOT EXISTS referrer_source   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS referrer_medium   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS session_duration_ms INTEGER;
`;

// CONCURRENTLY must be its own statement; not in a transaction block.
const INDEX_SQL = `
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_session
    ON analytics_events (session_id, created_at DESC)
    WHERE session_id IS NOT NULL;
`;

async function applyForTenant(tenantId, envVar) {
  const outcome = {
    tenant: tenantId,
    envVar,
    status: 'unknown', // applied | skipped-no-creds | failed-permission | error
    rowCount: null,
    detail: null,
    manual: null,
  };

  const dbUrl = process.env[envVar];
  if (!dbUrl) {
    outcome.status = 'skipped-no-creds';
    outcome.detail = `env var ${envVar} is not set`;
    return outcome;
  }

  const pool = makePool(dbUrl);
  try {
    // 1) ALTER — one statement, autocommitted (nullable cols, metadata-only).
    await pool.query(ALTER_SQL);

    // 2) CONCURRENTLY index — separate single statement.
    await pool.query(INDEX_SQL);

    // 3) Row count for the report.
    const ct = await pool.query('SELECT COUNT(*)::bigint AS n FROM analytics_events');
    outcome.rowCount = Number(ct.rows[0].n);
    outcome.status = 'applied';
  } catch (err) {
    if (err.code === '42501') {
      // permission denied — stop, leave migration file intact, give manual cmd.
      outcome.status = 'failed-permission';
      outcome.detail = `${err.code}: ${err.message}`;
      outcome.manual =
        `psql "${redactedConnInfo(dbUrl)}" ` +
        `-f migrations/004_session_journey.sql`;
    } else {
      outcome.status = 'error';
      outcome.detail = `${err.code || 'ERROR'}: ${err.message}`;
    }
  } finally {
    await pool.end();
  }
  return outcome;
}

async function main() {
  const results = [];
  for (const tenantId of TENANTS) {
    let cfg;
    try {
      cfg = loadTenantConfig(tenantId);
    } catch (e) {
      results.push({ tenant: tenantId, envVar: null, status: 'error', detail: `cannot read tenant config: ${e.message}` });
      continue;
    }
    const envVar = cfg.database?.envVar;
    results.push(await applyForTenant(tenantId, envVar));
  }

  // Compact, secret-free report.
  console.log('\n========== apply-004 results ==========');
  for (const r of results) {
    if (r.status === 'applied') {
      console.log(`[${r.tenant}] APPLIED  (rows: ${r.rowCount})`);
    } else if (r.status === 'skipped-no-creds') {
      console.log(`[${r.tenant}] SKIPPED  no creds (${r.detail})`);
    } else if (r.status === 'failed-permission') {
      console.log(`[${r.tenant}] FAILED   permission denied: ${r.detail}`);
      console.log(`           manual: ${r.manual}`);
    } else {
      console.log(`[${r.tenant}] ERROR    ${r.detail}`);
    }
  }
  console.log('======================================\n');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
