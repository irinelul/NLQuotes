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

export function renderTopicHtml({ term, totalQuotes, videoGroups, siteBaseUrl }) {
  const safeTerm = escapeHtml(term);
  const canonical = `${siteBaseUrl}/topic/${encodeURIComponent(term)}`;
  const interactiveUrl = `${siteBaseUrl}/?q=${encodeURIComponent(term)}`;
  const description = `${totalQuotes || 0} Northernlion quotes featuring "${term}". Browse by video and jump straight to timestamps.`;

  const groupsHtml = videoGroups.length
    ? videoGroups.map((g) => {
        const title = escapeHtml(g.title || 'Untitled video');
        const channel = escapeHtml(g.channel_source || '');
        const uploadDate = g.upload_date ? escapeHtml(String(g.upload_date).slice(0, 10)) : '';
        const ytUrl = g.video_id
          ? `https://www.youtube.com/watch?v=${encodeURIComponent(g.video_id)}`
          : null;

        const quotesHtml = (g.quotes || [])
          .slice(0, 25)
          .map((q) => {
            const text = escapeHtml(stripSimpleTags(q.text || ''));
            const ts = escapeHtml(String(q.timestamp_start ?? ''));
            const tParam = q.timestamp_start != null
              ? `&t=${encodeURIComponent(String(q.timestamp_start))}`
              : '';
            const ytDeepLink = ytUrl ? `${ytUrl}${tParam}` : null;
            const spaDeepLink = `${siteBaseUrl}/?q=${encodeURIComponent(term)}`;
            return `
              <li class="quote-row">
                ${ytDeepLink
                  ? `<a class="ts-btn" href="${ytDeepLink}" target="_blank" rel="noopener noreferrer" title="Watch at this timestamp on YouTube">${ts}</a>`
                  : `<span class="ts-btn ts-static">${ts}</span>`}
                <span class="qt">${text}</span>
                <a class="search-btn" href="${spaDeepLink}" title="Search NLQuotes for this term">Search ↗</a>
              </li>`;
          })
          .join('');

        return `
          <article class="video-card">
            <div class="video-header">
              <h2 class="video-title">${title}</h2>
              <div class="video-meta">
                ${channel ? `<span>${channel}</span>` : ''}
                ${uploadDate ? `<span>${uploadDate}</span>` : ''}
                ${ytUrl ? `<a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="yt-link">Watch on YouTube ↗</a>` : ''}
              </div>
            </div>
            <ul class="quote-list">
              ${quotesHtml || '<li class="quote-row empty">No quotes found.</li>'}
            </ul>
          </article>`;
      }).join('')
    : '<p class="empty-state">No quotes found for this topic.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  <link rel="canonical" href="${canonical}" />
  <title>Quotes about &quot;${safeTerm}&quot; — NLQuotes</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="Quotes about &quot;${safeTerm}&quot; — NLQuotes" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${siteBaseUrl}/nlquotes/NLogo.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Quotes about &quot;${safeTerm}&quot; — NLQuotes" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${siteBaseUrl}/nlquotes/NLogo.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    :root {
      --bg:        #121212;
      --surface:   #1E1E1E;
      --surface2:  #252525;
      --border:    #333333;
      --text:      #FFFFFF;
      --text2:     #E0E0E0;
      --muted:     #A0A0A0;
      --accent:    #FF4B4B;
      --link:      #60a5fa;
      --ts:        #93c5fd;
      --radius:    10px;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
    }

    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Header ── */
    .site-header {
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .site-logo { height: 32px; width: auto; }
    .site-name { font-size: 18px; font-weight: 700; color: var(--text); text-decoration: none; }
    .site-name:hover { text-decoration: none; color: var(--accent); }

    /* ── Layout ── */
    .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }

    /* ── Hero ── */
    .hero { margin-bottom: 28px; }
    .hero h1 { margin: 0 0 8px; font-size: clamp(22px, 4vw, 32px); line-height: 1.25; }
    .hero-sub { color: var(--text2); margin: 0 0 20px; font-size: 15px; }

    /* ── Search bar ── */
    .search-form {
      display: flex;
      gap: 8px;
      max-width: 520px;
    }
    .search-input {
      flex: 1;
      padding: 10px 14px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-size: 15px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-submit {
      padding: 10px 18px;
      border-radius: var(--radius);
      border: none;
      background: var(--accent);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .search-submit:hover { opacity: 0.9; }

    /* ── Stats bar ── */
    .stats-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 24px;
      font-size: 14px;
      color: var(--text2);
    }
    .stats-bar strong { color: var(--text); }
    .cta-btn {
      margin-left: auto;
      padding: 7px 14px;
      border-radius: 8px;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--link);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .cta-btn:hover { background: var(--border); text-decoration: none; }

    /* ── Video cards ── */
    .video-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      overflow: hidden;
    }
    .video-header {
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--surface2);
    }
    .video-title { margin: 0 0 6px; font-size: 16px; color: var(--text); line-height: 1.35; }
    .video-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--muted); }
    .yt-link { color: var(--link); }

    /* ── Quote list ── */
    .quote-list { list-style: none; margin: 0; padding: 10px 16px 14px; display: flex; flex-direction: column; gap: 8px; }
    .quote-row {
      display: grid;
      grid-template-columns: 58px 1fr auto;
      align-items: baseline;
      gap: 10px;
    }
    .ts-btn {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--ts);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      text-align: center;
      white-space: nowrap;
    }
    .ts-btn:hover { border-color: var(--ts); text-decoration: none; }
    .ts-static { cursor: default; }
    .qt { color: var(--text2); font-size: 14px; }
    .search-btn {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
      padding: 2px 6px;
      border-radius: 5px;
    }
    .search-btn:hover { color: var(--link); background: var(--surface2); text-decoration: none; }
    .empty-state, .quote-row.empty { color: var(--muted); font-size: 14px; }

    /* ── Footer ── */
    .site-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    @media (max-width: 600px) {
      .quote-row { grid-template-columns: 52px 1fr; }
      .search-btn { display: none; }
      .stats-bar { flex-direction: column; align-items: flex-start; }
      .cta-btn { margin-left: 0; }
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

    <div class="hero">
      <h1>Quotes about &ldquo;${safeTerm}&rdquo;</h1>
      <p class="hero-sub">Search the full Northernlion archive below, or browse the quotes on this page.</p>
      <form class="search-form" action="${siteBaseUrl}/" method="get">
        <input class="search-input" type="text" name="q" value="${safeTerm}"
               placeholder="Search quotes…" autocomplete="off" />
        <button class="search-submit" type="submit">Search</button>
      </form>
    </div>

    <div class="stats-bar">
      <span>Found <strong>${Number(totalQuotes || 0).toLocaleString()} quotes</strong> mentioning &ldquo;${safeTerm}&rdquo;</span>
      <a class="cta-btn" href="${interactiveUrl}">Open full interactive search ↗</a>
    </div>

    ${groupsHtml}

    <footer class="site-footer">
      <a href="${siteBaseUrl}/">← Back to NLQuotes</a>
      <a href="${interactiveUrl}">Interactive search for &ldquo;${safeTerm}&rdquo;</a>
    </footer>

  </main>

</body>
</html>`;
}
