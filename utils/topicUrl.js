// Canonical form for topic terms.
//
// Postgres FTS uses the 'simple' config, which lowercases every token, so
// /topic/OBSESSION and /topic/obsession return byte-identical result sets
// (verified against prod: both 246 quotes). Before this existed each variant
// minted its own URL with its own self-referencing canonical, which is a large
// part of why Search Console reported 286 pages as "Duplicate, Google chose
// different canonical than user".
//
// One term -> one URL. Everything else 301s here.

export function normalizeTopicTerm(term) {
  return String(term ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' '); // collapse runs of whitespace, including tabs/newlines
}

// Spaces stay percent-encoded rather than becoming hyphens: terms can legitimately
// contain hyphens ("free-to-play"), and we need to map the URL back to a search
// term losslessly.
export function topicPath(term) {
  return `/topic/${encodeURIComponent(normalizeTopicTerm(term))}`;
}

export function isNormalizedTopicTerm(term) {
  return String(term ?? '') === normalizeTopicTerm(term);
}
