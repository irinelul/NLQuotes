function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Body for retired /topic/ URLs. Served with HTTP 410 Gone — the status code is
// what Google acts on, so the body is free to be useful to the handful of humans
// who land here from a stale search result. noindex is belt-and-braces: a 410
// already drops the URL, but if anything ever downgrades the status to 200 this
// still keeps it out of the index.
export function renderRemovedTopicHtml({ term, siteBaseUrl }) {
  const safeTerm = escapeHtml(term || '');
  const searchUrl = `${siteBaseUrl}/?q=${encodeURIComponent(term || '')}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,follow" />
  <title>Page removed — NLQuotes</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #121212;
      color: #FFFFFF;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 24px;
    }
    .card { max-width: 460px; text-align: center; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { color: #A0A0A0; font-size: 15px; margin: 0 0 24px; }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      border-radius: 10px;
      background: #FF4B4B;
      color: #fff;
      font-weight: 600;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.9; }
    .alt { display: block; margin-top: 16px; color: #60a5fa; font-size: 14px; text-decoration: none; }
    .alt:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="card">
    <h1>This page has been removed</h1>
    <p>${safeTerm
      ? `The standalone page for &ldquo;${safeTerm}&rdquo; is gone, but the quotes are still searchable.`
      : 'This page is gone, but the quotes are still searchable.'}</p>
    <a class="btn" href="${searchUrl}">Search for &ldquo;${safeTerm}&rdquo;</a>
    <a class="alt" href="${siteBaseUrl}/">Go to NLQuotes home</a>
  </main>
</body>
</html>`;
}
