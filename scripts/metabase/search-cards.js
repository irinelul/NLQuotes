// Card definitions for the "Search behaviour" and "Server-rendered pages"
// dashboard sections. Pure data — provisioning lives in build-search-cards.js —
// so the SQL can be checked against a scratch database without Metabase.
//
// Conventions follow build-journey-cards.js: native SQL on analytics_events,
// 30-day window, no tenant_id filter (parity with card 40).

const WINDOW = `created_at >= now() - interval '30 days'`;

export const CARDS = [
  // ---- Search behaviour ----------------------------------------------------
  {
    name: 'Zero-result search rate %',
    display: 'scalar',
    description: 'Share of searches that found no quotes at all, last 30 days (%).',
    sql: `SELECT round(100.0 * count(*) FILTER (WHERE result_quotes = 0) / nullif(count(*), 0), 1) AS v FROM analytics_events WHERE event_type = 'search' AND ${WINDOW};`,
  },
  {
    name: 'Search p95 response time (ms)',
    display: 'scalar',
    description: '95th-percentile server time for a search, last 30 days (ms). The median hides the slow queries people actually complain about.',
    sql: `SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)) AS v FROM analytics_events WHERE event_type = 'search' AND response_time_ms IS NOT NULL AND ${WINDOW};`,
  },
  {
    name: 'Search to play conversion %',
    display: 'scalar',
    description: 'Of sessions that searched, the share that went on to play a quote (%), last 30 days. Only counts searches that carry a session id (logged from this release on).',
    sql: `SELECT round(100.0 * count(*) FILTER (WHERE played) / nullif(count(*), 0), 1) AS v FROM (SELECT session_id, bool_or(event_type = 'quote_play') AS played FROM analytics_events WHERE session_id IS NOT NULL AND ${WINDOW} GROUP BY 1 HAVING bool_or(event_type = 'search')) s;`,
  },
  {
    name: 'Searches per searching session',
    display: 'scalar',
    description: 'Average searches in a session that searched at least once (includes paging), last 30 days. High values mean people are rephrasing to find something.',
    sql: `SELECT round(avg(n), 1) AS v FROM (SELECT session_id, count(*) AS n FROM analytics_events WHERE event_type = 'search' AND session_id IS NOT NULL AND ${WINDOW} GROUP BY 1) s;`,
  },
  {
    name: 'Top zero-result searches',
    display: 'table',
    description: 'Most repeated searches that found nothing, last 30 days: transcription misses, spelling variants, or content that is not indexed.',
    sql: `SELECT search_term AS "Search", count(*) AS "Searches", max(created_at)::date AS "Last searched" FROM analytics_events WHERE event_type = 'search' AND result_quotes = 0 AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 25;`,
  },
  {
    name: 'Filter usage',
    display: 'bar',
    description: 'Filter changes by filter, last 30 days.',
    dim: 'Filter', metric: 'Changes',
    sql: `SELECT props->>'filter' AS "Filter", count(*) AS "Changes" FROM analytics_events WHERE event_type = 'filter_change' AND props ? 'filter' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC;`,
  },

  // ---- Server-rendered pages ------------------------------------------------
  {
    name: 'Server-rendered page views by type',
    display: 'bar',
    description: 'Views of the plain-HTML pages (video, videos hub, topic, removed topic), last 30 days. These pages run no JavaScript, so this is their only analytics. Bots excluded.',
    dim: 'Page type', metric: 'Views',
    sql: `SELECT props->>'kind' AS "Page type", count(*) AS "Views" FROM analytics_events WHERE event_type = 'ssr_page_view' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC;`,
  },
  {
    name: 'Server-rendered page traffic sources',
    display: 'bar',
    description: 'Where visitors to the plain-HTML pages came from, last 30 days. "organic" is search-engine traffic, the point of the video-page rollout.',
    dim: 'Source', metric: 'Views',
    sql: `SELECT coalesce(referrer_source, 'unknown') AS "Source", count(*) AS "Views" FROM analytics_events WHERE event_type = 'ssr_page_view' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC;`,
  },
  {
    name: 'Top video pages',
    display: 'table',
    description: 'Most viewed /video/ pages, last 30 days, and whether each is in the indexable rollout batch.',
    sql: `SELECT path AS "Page", count(*) AS "Views", bool_or((props->>'indexable')::boolean) AS "Indexable" FROM analytics_events WHERE event_type = 'ssr_page_view' AND props->>'kind' = 'video' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC LIMIT 25;`,
  },
];

// Grid layout, relative to each section's start row. Same sizes as the journey
// section: 24x1 headings, 6x3 scalars, 12x6 bars/tables.
// Cards this script used to create and no longer wants. Archived (restorable
// from Metabase's trash) on every run, along with their dashboard tiles.
// There is no strict/flexible search mode in the product, so the phrasing
// split charted nothing useful, and search errors are no longer tracked.
export const RETIRED_CARDS = [
  'Search phrasing (exact vs flexible)',
  'Search errors by kind',
];

export const SECTIONS = [
  {
    heading: '## 🔎 Search behaviour',
    layout: [
      { name: 'Zero-result search rate %', row: 1, col: 0, size_x: 6, size_y: 3 },
      { name: 'Search p95 response time (ms)', row: 1, col: 6, size_x: 6, size_y: 3 },
      { name: 'Search to play conversion %', row: 1, col: 12, size_x: 6, size_y: 3 },
      { name: 'Searches per searching session', row: 1, col: 18, size_x: 6, size_y: 3 },
      { name: 'Top zero-result searches', row: 4, col: 0, size_x: 12, size_y: 8 },
      { name: 'Filter usage', row: 4, col: 12, size_x: 12, size_y: 8 },
    ],
    height: 12,
  },
  {
    heading: '## 🗺️ Server-rendered pages',
    layout: [
      { name: 'Server-rendered page views by type', row: 1, col: 0, size_x: 12, size_y: 6 },
      { name: 'Server-rendered page traffic sources', row: 1, col: 12, size_x: 12, size_y: 6 },
      { name: 'Top video pages', row: 7, col: 0, size_x: 24, size_y: 8 },
    ],
    height: 15,
  },
];
