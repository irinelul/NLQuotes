// Card definitions for the "Search behaviour" and "Server-rendered pages"
// dashboard sections. Pure data — provisioning lives in build-search-cards.js —
// so the SQL can be checked against a scratch database without Metabase.
//
// Conventions follow build-journey-cards.js: native SQL on analytics_events,
// 30-day window, no tenant_id filter (parity with card 40).

// Search phrasing, derived from the stored term rather than the search_mode
// column. Rows logged before models/searchMode.js existed all say 'keyword'
// (the UI has had no strict toggle for a long time), so the column can't be
// trusted for history — but the term still carries the quotes the user typed.
// Same rules as classifySearch(): exact = only quoted phrase(s), mixed = a
// phrase plus loose words, flexible = no complete quoted phrase.
export const SEARCH_MODE_SQL = `CASE
  WHEN search_term !~ '"[^"]+"' THEN 'Flexible'
  WHEN btrim(translate(regexp_replace(search_term, '"[^"]+"', ' ', 'g'), '"', ' ')) = '' THEN 'Exact phrase'
  ELSE 'Mixed'
END`;

const WINDOW = `created_at >= now() - interval '30 days'`;

export const CARDS = [
  // ---- Search behaviour ----------------------------------------------------
  {
    name: 'Search phrasing (exact vs flexible)',
    display: 'bar',
    description: 'Searches by how they were phrased, last 30 days. "Exact phrase" = the whole search in double quotes, "Mixed" = a quoted phrase plus loose words, "Flexible" = no quotes. Derived from the search text, so it is correct for older rows too (their search_mode column is always "keyword").',
    dim: 'Phrasing', metric: 'Searches',
    sql: `SELECT ${SEARCH_MODE_SQL} AS "Phrasing", count(*) AS "Searches" FROM analytics_events WHERE event_type = 'search' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC;`,
  },
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
    name: 'Search errors by kind',
    display: 'bar',
    description: 'Searches the visitor saw fail, by cause, last 30 days (timeout, rate_limited, server_error, network, ...). Reported by the browser, so it includes failures the server never logs.',
    dim: 'Kind', metric: 'Errors',
    sql: `SELECT coalesce(props->>'kind', 'unknown') AS "Kind", count(*) AS "Errors" FROM analytics_events WHERE event_type = 'search_error' AND ${WINDOW} GROUP BY 1 ORDER BY 2 DESC;`,
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
export const SECTIONS = [
  {
    heading: '## 🔎 Search behaviour',
    layout: [
      { name: 'Zero-result search rate %', row: 1, col: 0, size_x: 6, size_y: 3 },
      { name: 'Search p95 response time (ms)', row: 1, col: 6, size_x: 6, size_y: 3 },
      { name: 'Search to play conversion %', row: 1, col: 12, size_x: 6, size_y: 3 },
      { name: 'Searches per searching session', row: 1, col: 18, size_x: 6, size_y: 3 },
      { name: 'Search phrasing (exact vs flexible)', row: 4, col: 0, size_x: 12, size_y: 6 },
      { name: 'Search errors by kind', row: 4, col: 12, size_x: 12, size_y: 6 },
      { name: 'Top zero-result searches', row: 10, col: 0, size_x: 12, size_y: 8 },
      { name: 'Filter usage', row: 10, col: 12, size_x: 12, size_y: 8 },
    ],
    height: 18,
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
