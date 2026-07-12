import { expect, test } from 'vitest';
import { categorizeReferrer } from './referrer';

test('direct traffic with no usable host', () => {
    expect(categorizeReferrer(null)).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer(undefined)).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer('')).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer('/')).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer('https://')).toEqual({ source: 'direct', medium: null });
});

test('internal referrer (nlquotes.com)', () => {
    expect(categorizeReferrer('https://nlquotes.com/search')).toEqual({ source: 'internal', medium: 'nlquotes.com' });
    expect(categorizeReferrer('http://www.nlquotes.com')).toEqual({ source: 'internal', medium: 'www.nlquotes.com' });
    expect(categorizeReferrer('nlquotes.com/topic/isaac')).toEqual({ source: 'internal', medium: 'nlquotes.com' });
});

test('organic search referrers', () => {
    expect(categorizeReferrer('https://www.google.com/search?q=isaac')).toEqual({ source: 'organic', medium: 'www.google.com' });
    expect(categorizeReferrer('https://www.bing.com/')).toEqual({ source: 'organic', medium: 'www.bing.com' });
    expect(categorizeReferrer('duckduckgo.com')).toEqual({ source: 'organic', medium: 'duckduckgo.com' });
    expect(categorizeReferrer('https://search.yahoo.com/search?p=nl')).toEqual({ source: 'organic', medium: 'search.yahoo.com' });
    expect(categorizeReferrer('https://yandex.ru/')).toEqual({ source: 'organic', medium: 'yandex.ru' });
    expect(categorizeReferrer('https://www.ecosia.org/search')).toEqual({ source: 'organic', medium: 'www.ecosia.org' });
    expect(categorizeReferrer('https://search.brave.com/search?q=x')).toEqual({ source: 'organic', medium: 'search.brave.com' });
    expect(categorizeReferrer('https://www.startpage.com/sp/search')).toEqual({ source: 'organic', medium: 'www.startpage.com' });
});

test('social referrers', () => {
    expect(categorizeReferrer('https://www.reddit.com/r/northernlion')).toEqual({ source: 'social', medium: 'www.reddit.com' });
    expect(categorizeReferrer('https://twitter.com/nlquotes')).toEqual({ source: 'social', medium: 'twitter.com' });
    expect(categorizeReferrer('https://x.com/nlquotes')).toEqual({ source: 'social', medium: 'x.com' });
    expect(categorizeReferrer('https://www.youtube.com/watch?v=abc')).toEqual({ source: 'social', medium: 'www.youtube.com' });
    expect(categorizeReferrer('https://youtu.be/abc')).toEqual({ source: 'social', medium: 'youtu.be' });
    expect(categorizeReferrer('https://discord.com/invite/abc')).toEqual({ source: 'social', medium: 'discord.com' });
    expect(categorizeReferrer('https://discord.gg/abc')).toEqual({ source: 'social', medium: 'discord.gg' });
    expect(categorizeReferrer('https://www.tiktok.com/@user')).toEqual({ source: 'social', medium: 'www.tiktok.com' });
    expect(categorizeReferrer('https://www.facebook.com/')).toEqual({ source: 'social', medium: 'www.facebook.com' });
    expect(categorizeReferrer('https://www.instagram.com/')).toEqual({ source: 'social', medium: 'www.instagram.com' });
    expect(categorizeReferrer('https://www.linkedin.com/')).toEqual({ source: 'social', medium: 'www.linkedin.com' });
    expect(categorizeReferrer('https://www.twitch.tv/northernlion')).toEqual({ source: 'social', medium: 'www.twitch.tv' });
});

test('other referrer', () => {
    expect(categorizeReferrer('https://example.com/page')).toEqual({ source: 'other', medium: 'example.com' });
    expect(categorizeReferrer('https://blog.example.co.uk/post?a=1')).toEqual({ source: 'other', medium: 'blog.example.co.uk' });
});

test('strips scheme, path and query, and lowercases the host', () => {
    expect(categorizeReferrer('HTTPS://WWW.Google.COM/Search?q=x')).toEqual({ source: 'organic', medium: 'www.google.com' });
    expect(categorizeReferrer('https://www.reddit.com/r/x?utm_source=foo')).toEqual({ source: 'social', medium: 'www.reddit.com' });
    expect(categorizeReferrer('Reddit.COM/path')).toEqual({ source: 'social', medium: 'reddit.com' });
});

test('truncates medium to 100 chars', () => {
    const longHost = 'a'.repeat(150) + '.example.org';
    const { source, medium } = categorizeReferrer('https://' + longHost + '/path');
    expect(source).toBe('other');
    expect(medium.length).toBe(100);
    expect(medium).toBe('a'.repeat(100));
});

test('internal takes precedence over a host that also matches a social keyword', () => {
    // nlquotes.com is checked first, so even contrived hosts fall to internal.
    expect(categorizeReferrer('https://nlquotes.com.youtube.com')).toEqual({ source: 'internal', medium: 'nlquotes.com.youtube.com' });
});

test('task-required referrer inputs across all five categories', () => {
    // direct
    expect(categorizeReferrer(null)).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer('')).toEqual({ source: 'direct', medium: null });
    expect(categorizeReferrer('/')).toEqual({ source: 'direct', medium: null });

    // organic (full-scheme URL with path)
    expect(categorizeReferrer('https://www.google.com/search?q=x')).toEqual({ source: 'organic', medium: 'www.google.com' });
    expect(categorizeReferrer('https://duckduckgo.com/')).toEqual({ source: 'organic', medium: 'duckduckgo.com' });

    // social
    expect(categorizeReferrer('https://www.reddit.com/r/foo')).toEqual({ source: 'social', medium: 'www.reddit.com' });
    expect(categorizeReferrer('https://youtu.be/abc')).toEqual({ source: 'social', medium: 'youtu.be' });
    expect(categorizeReferrer('https://x.com/someone')).toEqual({ source: 'social', medium: 'x.com' });

    // internal — bare domain and an arbitrary subdomain (metabase)
    expect(categorizeReferrer('https://nlquotes.com/stats')).toEqual({ source: 'internal', medium: 'nlquotes.com' });
    expect(categorizeReferrer('https://metabase.nlquotes.com/x')).toEqual({ source: 'internal', medium: 'metabase.nlquotes.com' });

    // other
    expect(categorizeReferrer('https://example.org/page')).toEqual({ source: 'other', medium: 'example.org' });

    // host extraction: query string AND fragment must be stripped from the host
    expect(categorizeReferrer('https://www.google.com/search?q=x#top')).toEqual({ source: 'organic', medium: 'www.google.com' });
    expect(categorizeReferrer('https://example.org/?ref=abc#frag')).toEqual({ source: 'other', medium: 'example.org' });
});
