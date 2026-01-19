import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

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

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripSimpleTags(str) {
  // We only expect <b> from ts_headline; strip all tags to be safe.
  return String(str).replace(/<[^>]*>/g, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderTopicHtml({ term, totalQuotes, videoGroups, siteBaseUrl }) {
  const safeTerm = escapeHtml(term);
  const canonical = `${siteBaseUrl}/topic/${encodeURIComponent(term)}`;
  const description = `Browse ${totalQuotes || 0} Northernlion quotes featuring "${term}". Jump to timestamps and discover memorable moments across videos.`;

  const groupsHtml = videoGroups.length
    ? videoGroups
        .map((g) => {
          const title = escapeHtml(g.title || 'Untitled video');
          const channel = escapeHtml(g.channel_source || '');
          const uploadDate = g.upload_date ? escapeHtml(String(g.upload_date).slice(0, 10)) : '';
          const ytUrl = g.video_id ? `https://www.youtube.com/watch?v=${encodeURIComponent(g.video_id)}` : null;

          const quotesHtml = (g.quotes || [])
            .slice(0, 25)
            .map((q) => {
              const text = escapeHtml(stripSimpleTags(q.text || ''));
              const ts = escapeHtml(String(q.timestamp_start ?? ''));
              const tParam = q.timestamp_start != null ? `&t=${encodeURIComponent(String(q.timestamp_start))}` : '';
              const deepLink = ytUrl ? `${ytUrl}${tParam}` : null;
              return `<li class="quote"><span class="ts">${ts}</span> <span class="qt">${text}</span>${
                deepLink ? ` <a class="yt" href="${deepLink}" rel="noopener noreferrer" target="_blank">YouTube ↗</a>` : ''
              }</li>`;
            })
            .join('\n');

          return `
            <section class="group">
              <h2 class="video-title">${title}</h2>
              <div class="meta">${channel}${channel && uploadDate ? ' • ' : ''}${uploadDate}${ytUrl ? ` • <a href="${ytUrl}" rel="noopener noreferrer" target="_blank">Watch on YouTube ↗</a>` : ''}</div>
              <ol class="quotes">
                ${quotesHtml || '<li class="quote">No quotes found.</li>'}
              </ol>
            </section>
          `.trim();
        })
        .join('\n\n')
    : '<p class="empty">No quotes found for this topic.</p>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />
    <title>Quotes about "${safeTerm}" – Northernpedia</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="Quotes about &quot;${safeTerm}&quot; – Northernpedia" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${siteBaseUrl}/NLogo.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Quotes about &quot;${safeTerm}&quot; – Northernpedia" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${siteBaseUrl}/NLogo.png" />
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 0; background: #0b0b0f; color: #f3f4f6; }
      a { color: #93c5fd; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 56px; }
      .top { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
      h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
      .sub { color: #cbd5e1; margin: 0 0 16px; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .btn { display: inline-block; padding: 10px 12px; border-radius: 10px; background: #111827; border: 1px solid #1f2937; }
      .btn:hover { background: #0f172a; }
      .group { background: #0f172a; border: 1px solid #1f2937; border-radius: 14px; padding: 14px 14px 10px; margin-top: 14px; }
      .video-title { margin: 0 0 6px; font-size: 18px; color: #fff; }
      .meta { color: #94a3b8; font-size: 13px; margin-bottom: 10px; }
      .quotes { margin: 0; padding-left: 20px; }
      .quote { margin: 0 0 10px; }
      .ts { display: inline-block; min-width: 54px; color: #60a5fa; font-variant-numeric: tabular-nums; }
      .qt { color: #e5e7eb; }
      .yt { margin-left: 8px; font-size: 12px; }
      .footer { margin-top: 22px; color: #94a3b8; font-size: 13px; }
      .empty { color: #cbd5e1; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <div>
          <h1>Quotes about "${safeTerm}"</h1>
          <p class="sub">Found ${Number(totalQuotes || 0).toLocaleString()} quotes. This page is crawlable and lightweight for search engines.</p>
        </div>
        <div class="actions">
          <a class="btn" href="${siteBaseUrl}/search?q=${encodeURIComponent(term)}">Open interactive search</a>
          <a class="btn" href="${siteBaseUrl}/popular-searches">Popular searches</a>
          <a class="btn" href="${siteBaseUrl}/">Home</a>
        </div>
      </div>

      ${groupsHtml}

      <div class="footer">
        <div>Northernpedia – Northernlion quote archive.</div>
      </div>
    </div>
  </body>
</html>`;
}

async function main() {
  // Ensure env is available when running as part of `npm run build`
  dotenv.config();

  const distDir = getArg('outDir', path.resolve(__dirname, '..', 'dist'));
  const limit = Number(getArg('limit', '20'));
  const domain = getArg('domain', process.env.NLQ_STATIC_DOMAIN || 'nlquotes.com');
  const year = Number(getArg('year', process.env.NLQ_STATIC_YEAR || String(new Date().getFullYear())));
  const timeRange = getArg('timeRange', process.env.NLQ_STATIC_TIMERANGE || 'all');
  const siteBaseUrl = getArg('siteBaseUrl', process.env.NLQ_SITE_BASE_URL || 'https://nlquotes.com');
  const strict = hasFlag('strict');

  if (!fs.existsSync(distDir)) {
    const msg = `dist output dir not found at ${distDir}. Run 'vite build' first.`;
    if (strict) throw new Error(msg);
    console.warn(`[static-topics] ${msg} Skipping.`);
    return;
  }

  // Models are ESM and read env at import-time; import after dotenv.config().
  let analyticsModel;
  let quoteModel;
  try {
    analyticsModel = (await import('../models/analytics.js')).default;
    quoteModel = (await import('../models/postgres.js')).default;
  } catch (e) {
    const msg = `[static-topics] Unable to initialize DB models (missing env vars?): ${e.message}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
    return;
  }

  console.log(`[static-topics] Generating static topic pages into: ${distDir}`);
  console.log(`[static-topics] Popular terms source: domain=${domain}, year=${year}, timeRange=${timeRange}, limit=${limit}`);

  let terms;
  try {
    terms = await analyticsModel.getPopularSearchTerms({ limit, timeRange, domain, year });
  } catch (e) {
    const msg = `[static-topics] Failed to fetch popular terms: ${e.message}`;
    if (strict) throw new Error(msg);
    console.warn(msg);
    return;
  }

  const topicOutRoot = path.join(distDir, 'topic');
  ensureDir(topicOutRoot);

  const written = [];
  for (const row of terms) {
    const term = row?.search_term?.trim();
    if (!term) continue;

    let topicData;
    try {
      // Keep it lightweight: first "page" only.
      topicData = await quoteModel.search({
        searchTerm: term,
        searchPath: 'text',
        gameName: 'all',
        selectedValue: 'all',
        year: '',
        sortOrder: 'default',
        page: 1,
        limit: 10,
        exactPhrase: false
      });
    } catch (e) {
      console.warn(`[static-topics] Skipping "${term}" due to quote query error: ${e.message}`);
      continue;
    }

    const encoded = encodeURIComponent(term);
    const outDir = path.join(topicOutRoot, encoded);
    ensureDir(outDir);
    const outFile = path.join(outDir, 'index.html');

    const html = renderTopicHtml({
      term,
      totalQuotes: topicData?.totalQuotes || 0,
      videoGroups: topicData?.data || [],
      siteBaseUrl
    });

    fs.writeFileSync(outFile, html, 'utf8');
    written.push({ term, url: `/topic/${encoded}` });
    console.log(`[static-topics] Wrote ${outFile}`);
  }

  // Sitemap (only includes the generated topic pages + a couple main pages)
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${siteBaseUrl}/`, priority: '1.0' },
    { loc: `${siteBaseUrl}/popular-searches`, priority: '0.7' },
    ...written.map((p) => ({ loc: `${siteBaseUrl}${p.url}`, priority: '0.6' })),
  ];

  const sitemapXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${escapeHtml(u.loc)}</loc>\n` +
          `    <lastmod>${today}</lastmod>\n` +
          (u.priority ? `    <priority>${u.priority}</priority>\n` : '') +
          `  </url>`
      )
      .join('\n') +
    `\n</urlset>\n`;

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(distDir, 'static-topic-pages.json'), JSON.stringify({ generatedAt: new Date().toISOString(), domain, year, timeRange, limit, pages: written }, null, 2), 'utf8');

  console.log(`[static-topics] Wrote sitemap.xml with ${urls.length} urls`);
  console.log(`[static-topics] Done. Generated ${written.length} topic pages.`);
}

main().catch((err) => {
  console.error('[static-topics] Fatal:', err);
  process.exit(1);
});

