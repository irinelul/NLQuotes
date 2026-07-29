/**
 * Format a Postgres DATE as YYYY-MM-DD without shifting it.
 *
 * node-postgres parses a DATE column into a JS Date at *local* midnight, so
 * `.toISOString().slice(0, 10)` converts to UTC and rolls the date back a day
 * for any positive UTC offset. A column holding 2019-04-18 came out as
 * "2019-04-17" on a GMT+3 machine — wrong in every sitemap lastmod, every
 * rendered upload date, and the VideoObject uploadDate.
 *
 * The local calendar components are the true date, so read those directly.
 */
export function toDateOnly(value) {
  if (!value) return null;

  // Already a plain date string: take it verbatim, no timezone in play.
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The same date as a full ISO 8601 timestamp with an explicit offset.
 *
 * Schema.org datetime properties (VideoObject.uploadDate) want date *and* time
 * with a timezone — Search Console flags a bare "2026-07-27" as both an invalid
 * datetime and a missing timezone. We only know the calendar date, so pin it to
 * midnight UTC; that is the conventional stand-in and keeps the day intact.
 */
export function toIsoDateTime(value) {
  const date = toDateOnly(value);
  return date ? `${date}T00:00:00+00:00` : null;
}
