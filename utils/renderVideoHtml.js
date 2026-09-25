import { toDateOnly as isoDate, toIsoDateTime } from './dateOnly.js';
import { inlineJson } from './inlineJson.js';

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripSimpleTags(str) {
  return String(str).replace(/<[^>]*>/g, '');
}

// Timestamps are stored as seconds in a varchar ("41.220"). Render them as
// h:mm:ss / m:ss rather than the raw float the topic pages show.
function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}


/**
 * A per-video entity page: one real video, its metadata, and its full quote list.
 *
 * Unlike the topic pages these do not overlap — each video's transcript is
 * disjoint from every other's — so they cannot cannibalise one another the way
 * /topic/pretzel and /topic/soft pretzel did.
 */
// Links to other transcripts: nearby uploads of the same game, then the
// chronological neighbours. Only ever links to pages in the indexable batch.
function renderRelated(related, siteBaseUrl) {
  if (!related) return '';
  const link = (v) => `${siteBaseUrl}/video/${encodeURIComponent(v.videoId)}`;
  const item = (v) => {
    const date = isoDate(v.uploadDate);
    return `<li><a href="${link(v)}">${escapeHtml(v.title || 'Untitled video')}`
      + (date ? `<span class="related-date">${escapeHtml(date)}</span>` : '')
      + '</a></li>';
  };

  const parts = [];
  if (related.sameGame?.length) {
    parts.push(`<h2>More ${escapeHtml(related.gameName)} videos</h2>`
      + `<ul class="related-list">${related.sameGame.map(item).join('')}</ul>`);
  }
  if (related.newer || related.older) {
    parts.push('<nav class="prev-next" aria-label="Other videos">'
      + (related.older ? `<a href="${link(related.older)}" rel="prev">&larr; Previous upload: ${escapeHtml(related.older.title || 'Untitled video')}</a>` : '<span></span>')
      + (related.newer ? `<a href="${link(related.newer)}" rel="next">Next upload: ${escapeHtml(related.newer.title || 'Untitled video')} &rarr;</a>` : '')
      + '</nav>');
  }
  return parts.length ? `<section class="related">${parts.join('')}</section>` : '';
}

export function renderVideoHtml({ videoId, title, channel, uploadDate, gameName, totalQuotes, quotes, siteBaseUrl, indexable = true, creator = null, related = null }) {
  const safeId = encodeURIComponent(videoId);
  const canonical = `${siteBaseUrl}/video/${safeId}`;
  const ytUrl = `https://www.youtube.com/watch?v=${safeId}`;
  const thumbnail = `https://i.ytimg.com/vi/${safeId}/hqdefault.jpg`;
  const displayTitle = title || 'Untitled video';
  const safeTitle = escapeHtml(displayTitle);
  const published = isoDate(uploadDate);
  // Structured data needs the timestamp form; the visible meta line stays date-only.
  const publishedDateTime = toIsoDateTime(uploadDate);

  // The creator's name is what people put in the query ("northernlion <quote>")
  // and is rarely in the video title itself, so it goes in <title> too.
  const titleSuffix = creator ? `${escapeHtml(creator)} quotes &amp; transcript` : 'transcript &amp; quotes';

  const description =
    `Full searchable transcript of ${creator ? `${creator}'s ` : ''}"${displayTitle}"` +
    (gameName ? ` (${gameName})` : '') +
    ` — ${Number(totalQuotes || 0).toLocaleString()} lines, each linking straight to that moment on YouTube.`;
  const safeDescription = escapeHtml(description);

  const quotesHtml = (quotes || [])
    .map((q) => {
      const secs = q.timestamp_start_seconds ?? q.timestamp_start;
      const label = formatTimestamp(secs);
      const tParam = Math.max(0, Math.floor(Number(secs) || 0));
      const text = escapeHtml(stripSimpleTags(q.text || ''));
      return `
        <li class="quote-row">
          <a class="ts-btn" href="${ytUrl}&t=${tParam}" target="_blank" rel="noopener noreferrer"
             title="Watch at ${label} on YouTube">${label}</a>
          <span class="qt">${text}</span>
        </li>`;
    })
    .join('');

  // VideoObject describes the real video this page is about. Worth having for
  // the entity signals; note Google normally credits video rich results to the
  // canonical host (YouTube), so do not expect a video carousel from this.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: displayTitle,
    description,
    thumbnailUrl: thumbnail,
    embedUrl: `https://www.youtube.com/embed/${safeId}`,
    url: canonical,
    ...(publishedDateTime ? { uploadDate: publishedDateTime } : {}),
    ...(channel ? { creator: { '@type': 'Person', name: channel } } : {}),
  };

  const relatedHtml = renderRelated(related, siteBaseUrl);

  const metaBits = [
    channel ? `<span>${escapeHtml(channel)}</span>` : '',
    published ? `<span>${escapeHtml(published)}</span>` : '',
    gameName ? `<span>${escapeHtml(gameName)}</span>` : '',
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="${indexable
    ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    : 'noindex,follow'}" />
  <link rel="canonical" href="${canonical}" />
  <title>${safeTitle} — ${titleSuffix} | NLQuotes</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="video.other" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${safeTitle} — ${titleSuffix}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${thumbnail}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle} — ${titleSuffix}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${thumbnail}" />
  <script type="application/ld+json">${inlineJson(jsonLd)}</script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #121212; --surface: #1E1E1E; --surface2: #252525; --border: #333333;
      --text: #FFFFFF; --text2: #E0E0E0; --muted: #A0A0A0;
      --accent: #FF4B4B; --link: #60a5fa; --ts: #93c5fd; --radius: 10px;
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
    /* Sized in both axes so the header never reflows: an auto width is 0
       until the SVG arrives, which shoves the site name sideways on load.
       object-fit keeps the square PNG fallback undistorted in the same box. */
    .site-logo { width: 28px; height: 32px; object-fit: contain; }
    .site-name { font-size: 18px; font-weight: 700; color: var(--text); }
    .site-name:hover { text-decoration: none; color: var(--accent); }

    .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }

    .hero { display: flex; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
    .hero-thumb {
      width: 240px; max-width: 100%; border-radius: var(--radius);
      border: 1px solid var(--border); display: block;
    }
    .hero-body { flex: 1; min-width: 260px; }
    .hero h1 { margin: 0 0 8px; font-size: clamp(20px, 3.4vw, 28px); line-height: 1.25; }
    .video-meta {
      display: flex; flex-wrap: wrap; gap: 8px 16px;
      font-size: 13px; color: var(--muted); margin-bottom: 12px;
    }
    .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;
      background: var(--surface2); border: 1px solid var(--border); color: var(--link);
    }
    .btn:hover { background: var(--border); text-decoration: none; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { opacity: 0.9; background: var(--accent); }

    .stats-bar {
      padding: 12px 16px; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 20px; font-size: 14px; color: var(--text2);
    }
    .stats-bar strong { color: var(--text); }

    .quote-list {
      list-style: none; margin: 0; padding: 10px 16px 14px;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      display: flex; flex-direction: column; gap: 8px;
    }
    .quote-row { display: grid; grid-template-columns: 66px 1fr; align-items: baseline; gap: 12px; }
    .ts-btn {
      display: inline-block; padding: 2px 8px; border-radius: 6px;
      background: var(--surface2); border: 1px solid var(--border); color: var(--ts);
      font-size: 13px; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap;
    }
    .ts-btn:hover { border-color: var(--ts); text-decoration: none; }
    .qt { color: var(--text2); font-size: 14px; }

    .related { margin-top: 28px; }
    .related h2 { font-size: 18px; margin: 0 0 12px; }
    .related-list {
      list-style: none; margin: 0; padding: 0;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px;
    }
    .related-list a {
      display: block; padding: 10px 12px; border-radius: 8px; font-size: 14px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .related-list a:hover { border-color: var(--link); text-decoration: none; }
    .related-date { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
    .prev-next { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .prev-next a { font-size: 14px; max-width: 48%; }

    .site-footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border);
      font-size: 13px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap;
    }

    @media (max-width: 600px) {
      .quote-row { grid-template-columns: 60px 1fr; gap: 10px; }
      .hero-thumb { width: 100%; }
    }
  </style>
</head>
<body>

  <header class="site-header">
    <a href="${siteBaseUrl}/">
      <img src="${siteBaseUrl}/nlquotes/nlquotes.svg" alt="NLQuotes" class="site-logo" width="28" height="32"
           onerror="this.src='${siteBaseUrl}/nlquotes/NLogo.png'" />
    </a>
    <a href="${siteBaseUrl}/" class="site-name">NLQuotes</a>
  </header>

  <main class="page">

    <div class="hero">
      <a href="${ytUrl}" target="_blank" rel="noopener noreferrer">
        <img class="hero-thumb" src="${thumbnail}" alt="${safeTitle}" loading="lazy" width="240" height="180" />
      </a>
      <div class="hero-body">
        <h1>${safeTitle}</h1>
        <div class="video-meta">${metaBits}</div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${ytUrl}" target="_blank" rel="noopener noreferrer">Watch on YouTube &#8599;</a>
          <a class="btn" href="${siteBaseUrl}/videos">Latest videos</a>
        </div>
      </div>
    </div>

    <div class="stats-bar">
      <strong>${Number(totalQuotes || 0).toLocaleString()} lines</strong> transcribed from this video. Click any timestamp to jump to that moment.
    </div>

    <ul class="quote-list">
      ${quotesHtml || '<li class="quote-row"><span class="qt">No transcript lines found for this video.</span></li>'}
    </ul>

    ${relatedHtml}

    <footer class="site-footer">
      <a href="${siteBaseUrl}/">&larr; Back to NLQuotes</a>
      <a href="${siteBaseUrl}/videos">Latest videos</a>
    </footer>

  </main>

</body>
</html>`;
}
