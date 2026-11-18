const SEARCH_PARAMS = ['q', 'game', 'channel', 'year', 'sort', 'page'];
const INDEX = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const NOINDEX = 'noindex,follow';

export function getSpaMetadata(pathname, searchParams, tenant) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const route = path.toLowerCase();
  const siteName = tenant?.metadata?.siteName || tenant?.displayName || 'NLQuotes';
  const creator = tenant?.name || 'Northernlion';
  const base = `https://${tenant?.hostnames?.[0] || 'nlquotes.com'}`;
  const isHome = route === '/' && !SEARCH_PARAMS.some((key) => searchParams.get(key));

  if (isHome) {
    return {
      title: tenant?.metadata?.title || `${siteName} - Search ${creator} Quotes`,
      description: tenant?.metadata?.description || `Search ${creator} quotes and find the videos and timestamps they come from.`,
      canonical: `${base}/`,
      robots: INDEX,
      status: 200,
      isHome,
    };
  }

  const pages = {
    '/changelog': ['Changelog', `Read release notes for ${siteName}, including updates to quote search, video transcripts, and the site.`],
    '/privacy': ['Privacy Policy', `Learn how ${siteName} handles anonymous analytics, feedback, and privacy preferences.`],
    '/stats': ['Site Statistics', tenant?.metabase?.publicDashboardUrl
      ? `See how many ${creator} videos are indexed on ${siteName} and explore the anonymous community usage dashboard.`
      : `View statistics for the ${creator} video archive on ${siteName}.`],
    '/search': ['Quote Search Results', `Search ${creator} quotes and open matching moments at their timestamps on YouTube.`],
  };
  const pagePath = route === '/' ? '/search' : route;
  const page = pages[pagePath];
  const isTopicFallback = /^\/topic\/[^/]+$/i.test(path);
  const [label, description] = page || (isTopicFallback
    ? ['Topic Search', `Browse quotes by topic on ${siteName}.`]
    : ['Page Not Found', `Find quotes or browse the video archive on ${siteName}.`]);

  return {
    title: `${label} | ${siteName}`,
    description,
    canonical: `${base}${page ? pagePath : path}`,
    robots: page && pagePath !== '/search' ? INDEX : NOINDEX,
    status: page ? 200 : isTopicFallback ? 503 : 404,
    isHome,
  };
}
