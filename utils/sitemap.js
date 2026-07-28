// Sitemap XML builders.
//
// Two deliberate omissions from what this used to emit:
//
//  * No <priority>. Google has stated outright that it ignores the field. The
//    old code computed a popularity-scaled priority per topic; that was work
//    done for nobody.
//
//  * No invented <lastmod>. The old code set lastmod to the time a term was last
//    *searched*, which has nothing to do with when the page's content changed.
//    Google only honours lastmod while it looks trustworthy, and consistently
//    wrong values train it to ignore the signal across the whole site. Here
//    lastmod is emitted only when we actually know it, and omitted otherwise.

import { toDateOnly } from './dateOnly.js';

const escXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const asDate = toDateOnly;

// urls: [{ loc, lastmod? }]
export function buildUrlset(urls) {
  const body = urls
    .map(({ loc, lastmod }) => {
      const when = asDate(lastmod);
      return (
        '  <url>\n' +
        `    <loc>${escXml(loc)}</loc>\n` +
        (when ? `    <lastmod>${when}</lastmod>\n` : '') +
        '  </url>'
      );
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    (body ? body + '\n' : '') +
    '</urlset>\n'
  );
}

// sitemaps: [{ loc, lastmod? }]
export function buildSitemapIndex(sitemaps) {
  const body = sitemaps
    .map(({ loc, lastmod }) => {
      const when = asDate(lastmod);
      return (
        '  <sitemap>\n' +
        `    <loc>${escXml(loc)}</loc>\n` +
        (when ? `    <lastmod>${when}</lastmod>\n` : '') +
        '  </sitemap>'
      );
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    (body ? body + '\n' : '') +
    '</sitemapindex>\n'
  );
}

// The spec caps a child sitemap at 50,000 URLs / 50MB uncompressed. 10k keeps
// each file comfortably small and makes partial refetches cheap.
export const SITEMAP_CHUNK_SIZE = 10000;

export function chunk(items, size = SITEMAP_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
