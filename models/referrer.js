// Pure referrer categorization (no imports, no DB, no side effects).
// The host-extraction + classification rules here MUST stay in lock-step with
// the SQL backfill in scripts/migrations/backfill-004.js, so that live events
// and backfilled historical rows share the same referrer_source /
// referrer_medium taxonomy (case-insensitive host-includes matching).

const ORGANIC_HOSTS = [
    'google', 'bing.com', 'duckduckgo.com', 'yahoo', 'yandex',
    'ecosia.org', 'search.brave.com', 'startpage.com',
];

const SOCIAL_HOSTS = [
    'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'youtu.be',
    'discord.com', 'discord.gg', 'tiktok.com', 'facebook.com',
    'instagram.com', 'linkedin.com', 'twitch.tv',
];

// Returns { source, medium } where `source` is a lowercase taxonomy bucket
// ('direct' | 'internal' | 'organic' | 'social' | 'other') and `medium` is the
// lowercased referring host (truncated to 100 chars) or null for direct traffic.
export function categorizeReferrer(referrer) {
    if (referrer === null || referrer === undefined || referrer === '' || referrer === '/') {
        return { source: 'direct', medium: null };
    }

    // Extract the host: strip a leading http(s)://, then keep everything up to
    // the first '/' or '?', then lowercase. Mirrors the HOST_EXPR in
    // scripts/migrations/backfill-004.js.
    const host = String(referrer)
        .replace(/^https?:\/\//i, '')
        .split(/[/:?]/, 1)[0]
        .toLowerCase();

    if (!host) {
        return { source: 'direct', medium: null };
    }

    let source;
    if (host.includes('nlquotes.com')) {
        source = 'internal';
    } else if (ORGANIC_HOSTS.some((d) => host.includes(d))) {
        source = 'organic';
    } else if (SOCIAL_HOSTS.some((d) => host.includes(d))) {
        source = 'social';
    } else {
        source = 'other';
    }

    return { source, medium: host.slice(0, 100) };
}
