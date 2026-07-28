import { toDateOnly as isoDate } from './dateOnly.js';

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


const pagePath = (n) => (n <= 1 ? '/videos' : `/videos/page/${n}`);

/**
 * Crawlable index of the video pages.
 *
 * This exists because sitemap-only URLs reliably stall in Search Console as
 * "Discovered - currently not indexed". Internal links are what actually get
 * pages crawled, so every indexable video is reachable from here in a few hops.
 */
export function renderVideosHubHtml({ videos, page, totalPages, totalVideos, siteBaseUrl }) {
  const canonical = `${siteBaseUrl}${pagePath(page)}`;
  const description =
    `Browse ${Number(totalVideos || 0).toLocaleString()} Northernlion videos with full searchable transcripts` +
    (totalPages > 1 ? ` (page ${page} of ${totalPages})` : '') + '.';

  const rowsHtml = videos.map((v) => {
    const published = isoDate(v.uploadDate);
    const meta = [
      published ? escapeHtml(published) : '',
      v.gameName ? escapeHtml(v.gameName) : '',
      `${Number(v.quoteCount || 0).toLocaleString()} lines`,
    ].filter(Boolean).join(' &middot; ');

    return `
      <li class="video-row">
        <a class="video-link" href="${siteBaseUrl}/video/${encodeURIComponent(v.videoId)}">${escapeHtml(v.title || 'Untitled video')}</a>
        <div class="video-meta">${meta}</div>
      </li>`;
  }).join('');

  const prevLink = page > 1 ? `<a class="btn" href="${siteBaseUrl}${pagePath(page - 1)}">&larr; Previous</a>` : '';
  const nextLink = page < totalPages ? `<a class="btn" href="${siteBaseUrl}${pagePath(page + 1)}">Next &rarr;</a>` : '';

  // A window of numbered links around the current page keeps the click depth to
  // any given page small without emitting hundreds of links per page.
  const windowStart = Math.max(1, page - 3);
  const windowEnd = Math.min(totalPages, page + 3);
  const numbered = [];
  for (let n = windowStart; n <= windowEnd; n++) {
    numbered.push(n === page
      ? `<span class="pg pg-current">${n}</span>`
      : `<a class="pg" href="${siteBaseUrl}${pagePath(n)}">${n}</a>`);
  }
  if (windowStart > 1) {
    numbered.unshift(`<a class="pg" href="${siteBaseUrl}${pagePath(1)}">1</a><span class="pg-gap">&hellip;</span>`);
  }
  if (windowEnd < totalPages) {
    numbered.push(`<span class="pg-gap">&hellip;</span><a class="pg" href="${siteBaseUrl}${pagePath(totalPages)}">${totalPages}</a>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
  <link rel="canonical" href="${canonical}" />
  ${page > 1 ? `<link rel="prev" href="${siteBaseUrl}${pagePath(page - 1)}" />` : ''}
  ${page < totalPages ? `<link rel="next" href="${siteBaseUrl}${pagePath(page + 1)}" />` : ''}
  <title>All videos${totalPages > 1 ? ` (page ${page} of ${totalPages})` : ''} — NLQuotes</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #121212; --surface: #1E1E1E; --surface2: #252525; --border: #333333;
      --text: #FFFFFF; --text2: #E0E0E0; --muted: #A0A0A0;
      --accent: #FF4B4B; --link: #60a5fa; --radius: 10px;
    }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
    }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .site-header {
      border-bottom: 1px solid var(--border); padding: 12px 24px;
      display: flex; align-items: center; gap: 16px;
    }
    .site-logo { height: 32px; width: auto; }
    .site-name { font-size: 18px; font-weight: 700; color: var(--text); }
    .site-name:hover { text-decoration: none; color: var(--accent); }
    .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { margin: 0 0 8px; font-size: clamp(22px, 4vw, 30px); }
    .sub { color: var(--text2); margin: 0 0 24px; font-size: 15px; }
    .video-list { list-style: none; margin: 0 0 28px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .video-row {
      padding: 12px 16px; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
    }
    .video-link { font-size: 15px; color: var(--text2); font-weight: 500; }
    .video-link:hover { color: var(--link); }
    .video-meta { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .pager { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .btn, .pg {
      padding: 7px 14px; border-radius: 8px; background: var(--surface2);
      border: 1px solid var(--border); color: var(--link); font-size: 14px; font-weight: 600;
    }
    .btn:hover, .pg:hover { background: var(--border); text-decoration: none; }
    .pg { padding: 7px 12px; }
    .pg-current { background: var(--accent); border-color: var(--accent); color: #fff; }
    .pg-gap { color: var(--muted); padding: 0 4px; }
    .site-footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border);
      font-size: 13px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap;
    }
  </style>
</head>
<body>

  <header class="site-header">
    <a href="${siteBaseUrl}/">
      <img src="${siteBaseUrl}/nlquotes/nlquotes.svg" alt="NLQuotes" class="site-logo"
           onerror="this.src='${siteBaseUrl}/nlquotes/NLogo.png'" />
    </a>
    <a href="${siteBaseUrl}/" class="site-name">NLQuotes</a>
  </header>

  <main class="page">
    <h1>All videos</h1>
    <p class="sub">${Number(totalVideos || 0).toLocaleString()} videos with full searchable transcripts. Every timestamp links straight to that moment on YouTube.</p>

    <ul class="video-list">
      ${rowsHtml || '<li class="video-row"><span class="video-meta">No videos available.</span></li>'}
    </ul>

    <nav class="pager">
      ${prevLink}
      ${numbered.join('')}
      ${nextLink}
    </nav>

    <footer class="site-footer">
      <a href="${siteBaseUrl}/">&larr; Back to NLQuotes</a>
    </footer>
  </main>

</body>
</html>`;
}
