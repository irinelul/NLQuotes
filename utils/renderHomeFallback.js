// Crawler-facing copy for the home page.
//
// The home page is a client-rendered search box, so a crawler that doesn't run
// JavaScript (ClaudeBot, GPTBot, CCBot and most other AI crawlers) used to get
// one <noscript> sentence and no links. These two renderers give them the same
// facts in forms they can read: a block inside #root that React replaces on
// mount, and /llms.txt.

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function siteFacts(tenant) {
  const siteName = tenant?.metadata?.siteName || tenant?.displayName || 'Quotes';
  const creator = tenant?.name || '';
  const description = tenant?.metadata?.description || 'Search through quotes and moments from videos.';
  const disclaimer = tenant?.texts?.disclaimer || '';
  return { siteName, creator, description, disclaimer };
}

function howItWorks(creator) {
  const whose = creator ? `${creator} videos` : 'the videos';
  return `Type a word or phrase to find every moment it was said in ${whose}. `
    + 'Each result shows the quote, the video it comes from, and a timestamp link that opens the video at that moment.';
}

// Static content for <div id="root"> on the home page. createRoot() discards it
// as soon as the app mounts, so browsers with JavaScript only see it for the
// moment before the bundle runs.
export function renderHomeFallbackHtml(tenant, siteBaseUrl) {
  const { siteName, creator, description, disclaimer } = siteFacts(tenant);
  const heading = creator ? `${siteName} - search ${creator} quotes` : siteName;
  return `<main style="max-width:40rem;margin:3rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.5">
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>${escapeHtml(howItWorks(creator))}</p>
  <ul>
    <li><a href="${siteBaseUrl}/videos">All videos, newest first</a></li>
    <li><a href="${siteBaseUrl}/videos/games">Videos by game</a></li>
    <li><a href="${siteBaseUrl}/stats">Site statistics</a></li>
  </ul>
  ${disclaimer ? `<p><small>${escapeHtml(disclaimer)}</small></p>` : ''}
</main>`;
}

// https://llmstxt.org — a plain-Markdown summary of the site for language models.
export function renderLlmsTxt(tenant, siteBaseUrl) {
  const { siteName, creator, description, disclaimer } = siteFacts(tenant);
  const lines = [
    `# ${siteName}`,
    '',
    `> ${description}`,
    '',
    howItWorks(creator),
    '',
    `To search, open ${siteBaseUrl}/search?q=<words> in a browser. Results are rendered client-side.`,
    `Every video also has a server-rendered page at ${siteBaseUrl}/video/<youtube-video-id> with its transcript quotes and timestamps.`,
  ];
  if (disclaimer) lines.push('', disclaimer);
  lines.push(
    '',
    '## Pages',
    '',
    `- [Search](${siteBaseUrl}/): search every quote`,
    `- [Videos](${siteBaseUrl}/videos): all indexed videos, newest first, with links to each month`,
    `- [Games](${siteBaseUrl}/videos/games): videos grouped by game`,
    `- [Stats](${siteBaseUrl}/stats): usage statistics`,
    `- [Sitemap](${siteBaseUrl}/sitemap.xml): every indexable URL`,
    '',
  );
  return lines.join('\n');
}
