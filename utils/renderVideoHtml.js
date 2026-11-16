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

// 2289 -> "PT38M9S" (schema.org duration).
export function isoDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) return null;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}

// 2289 -> "38-minute", 4350 -> "1-hour 13-minute" (used attributively).
function spokenDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (total < 60) return null;
  const mins = Math.round(total / 60);
  if (mins < 60) return `${mins}-minute`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}-hour${m ? ` ${m}-minute` : ''}`;
}

// 2289 -> "38 min", 4350 -> "1 h 13 min" (for the meta description).
function shortDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (total < 60) return null;
  const mins = Math.round(total / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h${m ? ` ${m} min` : ''}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// '2026-07-05' -> 'July 5, 2026'. Built from the date-only string so the
// server's timezone can't shift it by a day.
function longDate(dateOnly) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly || '');
  if (!m) return null;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

// Whole seconds into the video at which a transcript line starts.
function lineSeconds(q) {
  return Math.max(0, Math.floor(Number(q.timestamp_start_seconds ?? q.timestamp_start) || 0));
}

// The line being spoken at `seconds`: the last one that starts at or before it.
// Returns { quote, t } with t the line's own start, or null when `seconds` is
// missing, invalid or before the first line. Assumes quotes are in order.
export function findMoment(quotes, seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return null;
  const at = Number(seconds);
  if (!Number.isFinite(at) || at < 0) return null;
  let found = null;
  for (const q of quotes || []) {
    const t = lineSeconds(q);
    if (t > at) break;
    found = { quote: q, t };
  }
  return found;
}

// Cuts at a word boundary and marks the cut.
function excerpt(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—-]+$/, '')}…`;
}

// Rounded so the figure reads as the estimate it is.
function approxWords(quotes) {
  let n = 0;
  for (const q of quotes || []) n += String(q.text || '').split(/\s+/).filter(Boolean).length;
  return n < 100 ? n : Math.round(n / 100) * 100;
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

// Breadcrumb trail up to the archive pages this video is listed on, both as
// visible links and as BreadcrumbList structured data. The game is the more
// meaningful parent, so it wins the structured trail when there is one.
// archive: { month: { label, path } | null, game: { name, path } | null }
function renderCrumbs(archive, siteBaseUrl, canonical, displayTitle) {
  const trail = [{ name: 'NLQuotes', path: '/' }, { name: 'Videos', path: '/videos' }];
  if (archive?.game) trail.push({ name: archive.game.name, path: archive.game.path });
  else if (archive?.month) trail.push({ name: archive.month.label, path: archive.month.path });

  const visible = [...trail];
  if (archive?.game && archive?.month) visible.push({ name: archive.month.label, path: archive.month.path });

  const html = `<nav class="crumbs" aria-label="Breadcrumb">${visible
    .map((c) => `<a href="${siteBaseUrl}${c.path}">${escapeHtml(c.name)}</a>`)
    .join('<span class="sep">&rsaquo;</span>')}</nav>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      ...trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${siteBaseUrl}${c.path}` })),
      { '@type': 'ListItem', position: trail.length + 1, name: displayTitle, item: canonical },
    ],
  };
  return { html, jsonLd };
}

export function renderVideoHtml({ videoId, title, channel, uploadDate, gameName, totalQuotes, quotes, siteBaseUrl, indexable = true, creator = null, related = null, archive = null, durationSeconds = null, sharedAt = null }) {
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

  // The description and intro are built from this video's own facts (length,
  // date, game, size of the transcript) rather than one sentence with the title
  // swapped in, which is how 23,000 pages came to read as near-duplicates.
  const who = creator || channel || '';
  const lineCount = Number(totalQuotes || 0).toLocaleString('en-US');
  const words = approxWords(quotes);
  const runtime = spokenDuration(durationSeconds);
  const uploadedOn = longDate(published);

  const facts = [gameName, uploadedOn, shortDuration(durationSeconds)].filter(Boolean).join(', ');
  const description =
    `Transcript of ${who ? `${who}'s ` : ''}"${displayTitle}"` +
    (facts ? ` (${facts})` : '') +
    ` — ${lineCount} timestamped lines to read, search and play from any moment.`;
  const safeDescription = escapeHtml(description);

  const introHtml =
    `The full transcript of <strong>${safeTitle}</strong>, ` +
    `a ${runtime ? `${runtime} ` : ''}${who ? `${escapeHtml(who)} ` : ''}video` +
    (gameName ? ` (${escapeHtml(gameName)})` : '') +
    (uploadedOn ? ` uploaded on ${uploadedOn}` : '') +
    `: ${lineCount} timestamped lines` +
    (words ? `, about ${words.toLocaleString('en-US')} words` : '') +
    '. Press any timestamp to play the video from that moment.';

  // A shared link is /video/<id>?t=<seconds>: the same page, opened on one
  // line. The canonical stays the bare video URL, so every link to a moment
  // counts toward the video page rather than minting a page of its own.
  const moment = findMoment(quotes, sharedAt);
  const momentLabel = moment ? formatTimestamp(moment.t) : null;
  const momentText = moment ? stripSimpleTags(moment.quote.text || '').trim() : '';

  // The link buttons are <button>s, not links, on purpose. As <a href="?t=…">
  // they would hand crawlers a hundred extra URLs per video (2.3M site-wide),
  // which is the crawl waste the retired /topic/ pages were.
  const quotesHtml = (quotes || [])
    .map((q) => {
      const tParam = lineSeconds(q);
      const label = formatTimestamp(tParam);
      const text = escapeHtml(stripSimpleTags(q.text || ''));
      const isMoment = moment && q === moment.quote;
      return `
        <li class="quote-row${isMoment ? ' hl' : ''}"${isMoment ? ' id="moment-line"' : ''}>
          <a class="ts-btn" href="${ytUrl}&t=${tParam}" data-t="${tParam}" target="_blank" rel="noopener noreferrer"
             title="Play from ${label}">${label}</a>
          <span class="qt">${text}</span>
          <button type="button" class="link-btn" data-link="${tParam}" title="Copy a link to this moment"
                  aria-label="Copy a link to ${label}">&#128279;</button>
        </li>`;
    })
    .join('');

  const momentHtml = moment ? `
    <aside class="moment" aria-label="Shared moment">
      <div class="moment-label">Shared moment &middot; ${momentLabel}</div>
      <blockquote>${escapeHtml(momentText)}</blockquote>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${ytUrl}&t=${moment.t}" data-t="${moment.t}" target="_blank" rel="noopener noreferrer">&#9654; Play from ${momentLabel}</a>
        <a class="btn" href="#moment-line">Show in transcript</a>
      </div>
    </aside>` : '';

  // What a chat app or social site shows when the link is pasted. For a shared
  // moment that is the quote itself; og:url keeps the ?t= so a scraper that
  // re-fetches og:url lands on the same card.
  const shareUrl = moment ? `${canonical}?t=${moment.t}` : canonical;
  const shareTitle = moment
    ? `${safeTitle} — at ${momentLabel}`
    : `${safeTitle} — ${titleSuffix}`;
  const shareDescription = moment
    ? escapeHtml(`“${excerpt(momentText, 280)}”${who ? ` — ${who}` : ''}`)
    : safeDescription;

  // VideoObject describes the real video this page is about, which plays on the
  // page itself (the player below). Search Console's video report had already
  // indexed 103 of these as video pages on the structured data alone.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: displayTitle,
    description,
    thumbnailUrl: thumbnail,
    embedUrl: `https://www.youtube.com/embed/${safeId}`,
    url: canonical,
    ...(publishedDateTime ? { uploadDate: publishedDateTime } : {}),
    ...(isoDuration(durationSeconds) ? { duration: isoDuration(durationSeconds) } : {}),
    ...(channel ? { creator: { '@type': 'Person', name: channel } } : {}),
  };

  const relatedHtml = renderRelated(related, siteBaseUrl);
  const crumbs = renderCrumbs(archive, siteBaseUrl, canonical, displayTitle);

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
  <meta property="og:site_name" content="NLQuotes" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:title" content="${shareTitle}" />
  <meta property="og:description" content="${shareDescription}" />
  <meta property="og:image" content="${thumbnail}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${shareTitle}" />
  <meta name="twitter:description" content="${shareDescription}" />
  <meta name="twitter:image" content="${thumbnail}" />
  <script type="application/ld+json">${inlineJson(jsonLd)}</script>
  <script type="application/ld+json">${inlineJson(crumbs.jsonLd)}</script>
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

    .page { max-width: 900px; margin: 0 auto; padding: 24px 20px 64px; }

    .crumbs { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
    .crumbs .sep { margin: 0 8px; }

    /* The video itself. Until it is played this is only the thumbnail, so the
       page makes no request to YouTube; the iframe is created on first play. */
    .player {
      position: relative; width: 100%; max-width: 640px; aspect-ratio: 16 / 9;
      margin: 0 0 20px; background: #000; overflow: hidden;
      border: 1px solid var(--border); border-radius: var(--radius);
    }
    /* Once playing it follows the reader down the transcript. */
    .player.playing {
      position: sticky; top: 8px; z-index: 5; max-width: 480px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    }
    .player iframe { width: 100%; height: 100%; border: 0; display: block; }
    .player-facade {
      display: block; width: 100%; height: 100%; padding: 0; border: 0;
      background: none; cursor: pointer; position: relative;
    }
    .player-facade img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .play-icon {
      position: absolute; left: 50%; top: 50%; width: 68px; height: 48px;
      transform: translate(-50%, -50%); border-radius: 12px; background: var(--accent);
    }
    .play-icon::after {
      content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-40%, -50%);
      border-style: solid; border-width: 10px 0 10px 18px;
      border-color: transparent transparent transparent #fff;
    }
    .player-facade:hover .play-icon, .player-facade:focus-visible .play-icon { opacity: 0.85; }

    .hero { margin-bottom: 20px; }
    .intro { margin: 0 0 14px; font-size: 15px; color: var(--text2); }
    .intro strong { color: var(--text); font-weight: 600; }
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

    .quote-list {
      list-style: none; margin: 0; padding: 10px 16px 14px;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      display: flex; flex-direction: column; gap: 8px;
    }
    /* scroll-margin leaves room for the sticky player above a jumped-to line. */
    .quote-row {
      display: grid; grid-template-columns: 66px 1fr 30px; align-items: baseline; gap: 12px;
      padding: 2px 6px; margin: 0 -6px; border-radius: 6px; scroll-margin-top: 300px;
    }
    .quote-row.hl { background: rgba(255, 75, 75, 0.12); box-shadow: inset 3px 0 0 var(--accent); }
    .link-btn {
      padding: 2px 4px; border: 0; border-radius: 6px; background: none; cursor: pointer;
      font-size: 13px; line-height: 1.4; color: var(--muted); opacity: 0.35;
    }
    .quote-row:hover .link-btn, .link-btn:focus-visible, .link-btn.copied { opacity: 1; }
    .link-btn.copied { color: #4CAF50; }

    /* The quote a shared link points at, shown above the fold with its own play button. */
    .moment {
      margin: 0 0 20px; padding: 14px 16px; background: var(--surface);
      border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius);
    }
    .moment-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .moment blockquote { margin: 6px 0 12px; font-size: 16px; color: var(--text); }

    .toast {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 10;
      padding: 8px 14px; border-radius: 8px; font-size: 14px;
      background: var(--surface2); border: 1px solid var(--border); color: var(--text);
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
    }
    .toast.show { opacity: 1; }
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
      .quote-row { grid-template-columns: 60px 1fr 28px; gap: 10px; scroll-margin-top: 240px; }
      .link-btn { opacity: 0.7; }
      .player.playing { max-width: 100%; top: 0; }
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

    ${crumbs.html}

    <div class="player" id="player" data-id="${safeId}" data-title="${safeTitle}" data-start="${moment ? moment.t : 0}">
      <button type="button" class="player-facade" aria-label="Play ${safeTitle}">
        <img src="${thumbnail}" alt="${safeTitle}" width="480" height="360" fetchpriority="high" />
        <span class="play-icon" aria-hidden="true"></span>
      </button>
    </div>
${momentHtml}

    <div class="hero">
      <h1>${safeTitle}</h1>
      <div class="video-meta">${metaBits}</div>
      <p class="intro">${introHtml}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${ytUrl}" target="_blank" rel="noopener noreferrer">Watch on YouTube &#8599;</a>
        <a class="btn" href="${siteBaseUrl}/">Search all quotes</a>
        <a class="btn" href="${siteBaseUrl}/videos">Latest videos</a>
      </div>
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

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <script>
  // Plays the video on this page, from the top or from a transcript timestamp.
  // Without JavaScript every timestamp is still a plain link to YouTube.
  (function () {
    var box = document.getElementById('player');
    if (!box) return;
    var id = box.getAttribute('data-id');
    var origin = 'https://www.youtube-nocookie.com';
    var frame = null, ready = false;

    function command(func, args) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), origin);
    }

    function play(t) {
      t = t > 0 ? Math.floor(t) : 0;
      if (frame && ready) {
        command('seekTo', [t, true]);
        command('playVideo');
        return;
      }
      if (!frame) {
        frame = document.createElement('iframe');
        frame.title = box.getAttribute('data-title') || 'Video player';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.addEventListener('load', function () { ready = true; });
        box.textContent = '';
        box.appendChild(frame);
        box.classList.add('playing');
      }
      ready = false;
      frame.src = origin + '/embed/' + id + '?autoplay=1&rel=0&enablejsapi=1&start=' + t;
    }

    // On a shared link the big play button starts at the shared moment.
    box.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.player-facade')) {
        play(parseInt(box.getAttribute('data-start'), 10) || 0);
      }
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-t]');
      // Leave modified clicks alone so "open in new tab" still goes to YouTube.
      if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      play(parseInt(a.getAttribute('data-t'), 10) || 0);
    });

    // Copy a link to one line: /video/<id>?t=<seconds>.
    var toast = document.getElementById('toast'), toastTimer;
    function say(text) {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button.link-btn');
      if (!b) return;
      var url = location.origin + location.pathname + '?t=' + b.getAttribute('data-link');
      var row = b.closest('.quote-row');
      var old = document.querySelector('.quote-row.hl');
      if (old) old.classList.remove('hl');
      if (row) row.classList.add('hl');
      // The address bar then holds the same link, for anyone who copies from there.
      try { history.replaceState(null, '', url); } catch (err) { /* file:// and the like */ }
      var done = function () {
        b.classList.add('copied');
        setTimeout(function () { b.classList.remove('copied'); }, 1800);
        say('Link to this moment copied');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
      } else {
        window.prompt('Copy this link', url);
      }
    });
  })();
  </script>

</body>
</html>`;
}
