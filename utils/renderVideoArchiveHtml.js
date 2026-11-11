import { toDateOnly as isoDate } from './dateOnly.js';
import { inlineJson } from './inlineJson.js';
import { monthLabel, monthPath, gamePath } from './videoIndex.js';

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const num = (n) => Number(n || 0).toLocaleString('en-US');

// Shared shell for the archive pages (a month, a game, the games directory).
// crumbs: [{ name, path }] from the site root down to the page itself.
function shell({ title, description, canonical, heading, intro, crumbs, body, siteBaseUrl }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: `${siteBaseUrl}${c.path}`,
    })),
  };
  const crumbsHtml = crumbs.map((c, i) => (i === crumbs.length - 1
    ? `<span aria-current="page">${escapeHtml(c.name)}</span>`
    : `<a href="${siteBaseUrl}${c.path}">${escapeHtml(c.name)}</a>`)).join('<span class="sep">&rsaquo;</span>');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
  <link rel="canonical" href="${canonical}" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <script type="application/ld+json">${inlineJson(breadcrumbLd)}</script>
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
    .site-logo { width: 28px; height: 32px; object-fit: contain; }
    .site-name { font-size: 18px; font-weight: 700; color: var(--text); }
    .site-name:hover { text-decoration: none; color: var(--accent); }
    .page { max-width: 900px; margin: 0 auto; padding: 24px 20px 64px; }
    .crumbs { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
    .crumbs .sep { margin: 0 8px; }
    h1 { margin: 0 0 8px; font-size: clamp(22px, 4vw, 30px); line-height: 1.25; }
    .sub { color: var(--text2); margin: 0 0 24px; font-size: 15px; }
    .video-list { list-style: none; margin: 0 0 28px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .video-row {
      padding: 12px 16px; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
    }
    .video-link { font-size: 15px; color: var(--text2); font-weight: 500; }
    .video-link:hover { color: var(--link); }
    .video-meta { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .game-list {
      list-style: none; margin: 0 0 28px; padding: 0;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px;
    }
    .game-list a {
      display: flex; justify-content: space-between; gap: 12px; padding: 8px 12px; font-size: 14px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    }
    .game-list a:hover { border-color: var(--link); text-decoration: none; }
    .count { color: var(--muted); font-variant-numeric: tabular-nums; }
    .prev-next { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 14px; }
    .site-footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border);
      font-size: 13px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap;
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
    <nav class="crumbs" aria-label="Breadcrumb">${crumbsHtml}</nav>
    <h1>${escapeHtml(heading)}</h1>
    <p class="sub">${escapeHtml(intro)}</p>
    ${body}
    <footer class="site-footer">
      <a href="${siteBaseUrl}/">&larr; Back to NLQuotes</a>
      <a href="${siteBaseUrl}/videos">Latest videos</a>
      <a href="${siteBaseUrl}/videos/games">Browse by game</a>
    </footer>
  </main>

</body>
</html>`;
}

function videoRows(videos, siteBaseUrl, { showGame = true } = {}) {
  return videos.map((v) => {
    const published = isoDate(v.uploadDate);
    const meta = [
      published ? escapeHtml(published) : '',
      showGame && v.gameName ? escapeHtml(v.gameName) : '',
      `${num(v.quoteCount)} lines`,
    ].filter(Boolean).join(' &middot; ');
    return `
      <li class="video-row">
        <a class="video-link" href="${siteBaseUrl}/video/${encodeURIComponent(v.videoId)}">${escapeHtml(v.title || 'Untitled video')}</a>
        <div class="video-meta">${meta}</div>
      </li>`;
  }).join('');
}

const HOME = { name: 'NLQuotes', path: '/' };
const VIDEOS = { name: 'Videos', path: '/videos' };

/** Every video uploaded in one calendar month. newer/older are adjacent 'YYYY-MM' keys. */
export function renderVideoMonthHtml({ ym, videos, newer = null, older = null, siteBaseUrl, creator = null }) {
  const label = monthLabel(ym);
  const who = creator || 'Video';
  const nav = (newer || older) ? '<nav class="prev-next" aria-label="Other months">'
    + (older ? `<a href="${siteBaseUrl}${monthPath(older)}" rel="prev">&larr; ${escapeHtml(monthLabel(older))}</a>` : '<span></span>')
    + (newer ? `<a href="${siteBaseUrl}${monthPath(newer)}" rel="next">${escapeHtml(monthLabel(newer))} &rarr;</a>` : '')
    + '</nav>' : '';

  return shell({
    title: `${who} videos from ${label} — transcripts & quotes | NLQuotes`,
    description: `All ${num(videos.length)} ${creator ? `${creator} ` : ''}videos uploaded in ${label}, each with a full searchable transcript and timestamps that link straight to YouTube.`,
    canonical: `${siteBaseUrl}${monthPath(ym)}`,
    heading: `${who} videos from ${label}`,
    intro: `${num(videos.length)} videos uploaded in ${label}, each with a full searchable transcript.`,
    crumbs: [HOME, VIDEOS, { name: label, path: monthPath(ym) }],
    body: `<ul class="video-list">${videoRows(videos, siteBaseUrl)}</ul>${nav}`,
    siteBaseUrl,
  });
}

/** Every video of one game, newest first. */
export function renderVideoGameHtml({ game, videos, siteBaseUrl, creator = null }) {
  const who = creator ? `${creator} ` : '';
  return shell({
    title: `${who}${game.name} videos — transcripts & quotes | NLQuotes`,
    description: `All ${num(videos.length)} ${who}${game.name} videos with full searchable transcripts. Every line links straight to that moment on YouTube.`,
    canonical: `${siteBaseUrl}${gamePath(game.slug)}`,
    heading: `${who}${game.name} videos`,
    intro: `${num(videos.length)} ${game.name} videos, newest first, each with a full searchable transcript.`,
    crumbs: [HOME, VIDEOS, { name: 'Games', path: '/videos/games' }, { name: game.name, path: gamePath(game.slug) }],
    body: `<ul class="video-list">${videoRows(videos, siteBaseUrl, { showGame: false })}</ul>`,
    siteBaseUrl,
  });
}

/** Directory of every game that has a page. games: [{ slug, name, count }] alphabetical. */
export function renderVideoGamesHtml({ games, siteBaseUrl, creator = null }) {
  const who = creator ? `${creator} ` : '';
  const heading = who ? `${who}videos by game` : 'Videos by game';
  const items = games.map((g) =>
    `<li><a href="${siteBaseUrl}${gamePath(g.slug)}"><span>${escapeHtml(g.name)}</span><span class="count">${num(g.count)}</span></a></li>`).join('');
  return shell({
    title: `${heading} — transcripts & quotes | NLQuotes`,
    description: `Browse ${who}video transcripts by game: ${num(games.length)} games, every video with a full searchable transcript.`,
    canonical: `${siteBaseUrl}/videos/games`,
    heading,
    intro: `${num(games.length)} games. Pick one to see every video and its transcript.`,
    crumbs: [HOME, VIDEOS, { name: 'Games', path: '/videos/games' }],
    body: `<ul class="game-list">${items}</ul>`,
    siteBaseUrl,
  });
}
