import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import dotenv from 'dotenv';
import { renderTopicHtml } from '../utils/renderTopicHtml.js';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(name, defaultValue = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return defaultValue;
  return value;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Umami DB: fetch popular search terms ────────────────────────────────────
async function getPopularSearchTerms({ limit, websiteId, timeRange, umamiDbUrl }) {
  const pool = new Pool({
    connectionString: umamiDbUrl,
    max: 3,
    connectionTimeoutMillis: 5000,
    ssl: false,
  });

  let timeFilter = '';
  switch (timeRange) {
    case '7d':  timeFilter = "AND created_at >= NOW() - INTERVAL '7 days'"; break;
    case '30d': timeFilter = "AND created_at >= NOW() - INTERVAL '30 days'"; break;
    case '90d': timeFilter = "AND created_at >= NOW() - INTERVAL '90 days'"; break;
    default:    timeFilter = '';
  }

  const limitClause = limit > 0 ? `LIMIT ${parseInt(limit, 10)}` : '';

  // Known non-search event names that should be excluded
  const excludedNames = ['quote_search', 'pageview', 'page_view'];
  const excludePlaceholders = excludedNames.map((_, i) => `$${i + 2}`).join(', ');

  try {
    const result = await pool.query(
      `SELECT event_name AS search_term, COUNT(*) AS count,
              MAX(created_at) AS last_searched
       FROM website_event
       WHERE website_id = $1
         AND event_type = 2
         AND event_name IS NOT NULL
         AND LENGTH(event_name) >= 2
         AND event_name NOT IN (${excludePlaceholders})
         ${timeFilter}
       GROUP BY event_name
       HAVING COUNT(*) >= 1
       ORDER BY count DESC
       ${limitClause}`,
      [websiteId, ...excludedNames]
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  dotenv.config();

  if (process.env.SKIP_STATIC_TOPICS === 'true' || process.env.SKIP_STATIC_TOPICS === '1') {
    console.log('[static-topics] Skipping (SKIP_STATIC_TOPICS is set)');
    return;
  }

  const distDir    = getArg('outDir',      path.resolve(__dirname, '..', 'dist'));
  const limit      = Number(getArg('limit', '0')); // 0 = no limit
  const siteBaseUrl = getArg('siteBaseUrl', process.env.NLQ_SITE_BASE_URL || 'https://nlquotes.com');
  const timeRange  = getArg('timeRange',   process.env.NLQ_STATIC_TIMERANGE || '90d');
  const strict     = hasFlag('strict');

  const umamiDbUrl  = process.env.UMAMI_DATABASE_URL;
  const websiteId   = process.env.UMAMI_WEBSITE_ID || 'e357d8bf-1892-4c3f-92ea-b25b0a39e7c8';

  if (!fs.existsSync(distDir)) {
    const msg = `dist dir not found at ${distDir}. Run 'vite build' first.`;
    if (strict) throw new Error(msg);
    console.warn(`[static-topics] ${msg} Skipping.`);
    return;
  }

  if (!umamiDbUrl) {
    console.warn('[static-topics] UMAMI_DATABASE_URL not set — skipping topic generation.');
    console.warn('[static-topics] Set SKIP_STATIC_TOPICS=true to suppress this warning.');
    writeEmptyJson({ distDir });
    return;
  }

  console.log(`[static-topics] Fetching top ${limit} search terms from Umami (timeRange=${timeRange})…`);

  let terms;
  try {
    terms = await Promise.race([
      getPopularSearchTerms({ limit, websiteId, timeRange, umamiDbUrl }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Umami query timeout after 30s')), 30000)
      ),
    ]);
  } catch (e) {
    const msg = `Failed to fetch terms from Umami: ${e.message}`;
    if (strict) throw new Error(msg);
    console.warn(`[static-topics] ${msg}`);
    writeEmptyJson({ distDir });
    return;
  }

  console.log(`[static-topics] Got ${terms.length} terms. Generating pages into ${distDir}/topic/…`);

  let quoteModel;
  try {
    quoteModel = (await import('../models/postgres.js')).default;
  } catch (e) {
    const msg = `Unable to load postgres model: ${e.message}`;
    if (strict) throw new Error(msg);
    console.warn(`[static-topics] ${msg}`);
    writeEmptyJson({ distDir });
    return;
  }

  const topicOutRoot = path.join(distDir, 'topic');

  // Wipe and recreate the topic directory so stale pages (old template, removed
  // search terms) never linger. On-demand pages generated during runtime will
  // simply be recreated on the next visit after a restart.
  if (fs.existsSync(topicOutRoot)) {
    fs.rmSync(topicOutRoot, { recursive: true, force: true });
    console.log('[static-topics] Cleared existing topic pages.');
  }
  ensureDir(topicOutRoot);

  const written = [];
  const seenTerms = new Set(); // guard against duplicate rows from Umami

  for (const row of terms) {
    const term = row?.search_term?.trim();
    if (!term) continue;

    const encoded = encodeURIComponent(term);

    // Skip duplicates (shouldn't happen with GROUP BY but be safe)
    if (seenTerms.has(encoded)) {
      console.log(`[static-topics] Skipping duplicate "${term}"`);
      continue;
    }
    seenTerms.add(encoded);

    let topicData;
    try {
      topicData = await Promise.race([
        quoteModel.search({
          searchTerm: term,
          searchPath: 'text',
          gameName: 'all',
          selectedValue: 'all',
          year: '',
          sortOrder: 'default',
          page: 1,
          limit: 10,
          exactPhrase: false,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Search timeout after 15s')), 15000)
        ),
      ]);
    } catch (e) {
      console.warn(`[static-topics] Skipping "${term}": ${e.message}`);
      continue;
    }

    if (!topicData?.totalQuotes || topicData.totalQuotes === 0) {
      console.log(`[static-topics] Skipping "${term}" — no quotes found`);
      continue;
    }

    const outDir = path.join(topicOutRoot, encoded);
    ensureDir(outDir);

    fs.writeFileSync(
      path.join(outDir, 'index.html'),
      renderTopicHtml({
        term,
        totalQuotes:  topicData?.totalQuotes || 0,
        videoGroups:  topicData?.data || [],
        siteBaseUrl,
      }),
      'utf8'
    );

    written.push({ term, url: `/topic/${encoded}`, lastSearched: row.last_searched });
    console.log(`[static-topics] Wrote /topic/${encoded}`);
  }

  // Write JSON index — the Express /sitemap.xml route reads this to build a fresh sitemap
  fs.writeFileSync(
    path.join(distDir, 'static-topic-pages.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), timeRange, limit, pages: written }, null, 2),
    'utf8'
  );

  console.log(`[static-topics] Done. ${written.length} topic pages generated.`);
}

function writeEmptyJson({ distDir }) {
  fs.writeFileSync(
    path.join(distDir, 'static-topic-pages.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), pages: [] }, null, 2),
    'utf8'
  );
}

async function run() {
  let exitCode = 0;
  try {
    await main();
  } catch (err) {
    console.error('[static-topics] Fatal:', err);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
}

run();
