import { expect, test } from 'vitest';
import { findMoment, isoDuration, renderVideoHtml } from './renderVideoHtml';

const page = (over = {}) => renderVideoHtml({
    videoId: 'J0vgWp-vrrU',
    title: 'One shot <how> hard',
    channel: 'Northernlion',
    creator: 'Northernlion',
    uploadDate: '2026-07-05',
    gameName: 'Normal Golf Game',
    totalQuotes: 2,
    durationSeconds: 2289.4,
    quotes: [
        { text: 'first line of the video', timestamp_start_seconds: 0 },
        { text: 'second line here', timestamp_start_seconds: 3725.9 },
    ],
    siteBaseUrl: 'https://nlquotes.com',
    ...over,
});

test('isoDuration formats schema.org durations', () => {
    expect(isoDuration(2289.4)).toBe('PT38M9S');
    expect(isoDuration(3600)).toBe('PT1H');
    expect(isoDuration(3725)).toBe('PT1H2M5S');
    expect(isoDuration(45)).toBe('PT45S');
    expect(isoDuration(0)).toBeNull();
    expect(isoDuration(null)).toBeNull();
});

test('the video plays on the page and timestamps carry their offset', () => {
    const html = page();
    expect(html).toContain('<div class="player" id="player" data-id="J0vgWp-vrrU"');
    // No request to YouTube until the visitor presses play.
    expect(html).not.toContain('<iframe');
    expect(html).toContain('data-t="3725"');
    // Still a working link without JavaScript.
    expect(html).toContain('href="https://www.youtube.com/watch?v=J0vgWp-vrrU&t=3725"');
    expect(html).toContain('>1:02:05</a>');
});

test('intro, description and structured data use the video\'s own facts', () => {
    const html = page();
    expect(html).toContain('a 38-minute Northernlion video (Normal Golf Game) uploaded on July 5, 2026: 2 timestamped lines, about 8 words.');
    expect(html).toContain('(Normal Golf Game, July 5, 2026, 38 min)');
    expect(html).toContain('"duration":"PT38M9S"');
    expect(html).toContain('<h1>One shot &lt;how&gt; hard</h1>');
    expect(html).not.toContain('<how>');
});

test('missing duration, date and game are left out rather than invented', () => {
    const html = page({ durationSeconds: null, uploadDate: null, gameName: null, creator: null, channel: null });
    expect(html).not.toContain('"duration"');
    expect(html).toContain('<strong>One shot &lt;how&gt; hard</strong>, a video: 2 timestamped lines');
    // Everything above the player script (which legitimately says `null`).
    const markup = html.slice(0, html.lastIndexOf('<script>'));
    expect(markup).not.toMatch(/undefined|null|NaN/);
});

test('pages outside the indexable batch stay noindex', () => {
    expect(page({ indexable: false })).toContain('<meta name="robots" content="noindex,follow" />');
    expect(page()).toContain('content="index,follow,');
});

test('findMoment picks the line being spoken at a given second', () => {
    const quotes = [
        { text: 'a', timestamp_start_seconds: 0 },
        { text: 'b', timestamp_start_seconds: 39.4 },
        { text: 'c', timestamp_start_seconds: 68.9 },
    ];
    expect(findMoment(quotes, 39)).toEqual({ quote: quotes[1], t: 39 });
    expect(findMoment(quotes, 50).quote.text).toBe('b');
    expect(findMoment(quotes, 99999).quote.text).toBe('c');
    expect(findMoment(quotes, 0).quote.text).toBe('a');
    expect(findMoment(quotes, null)).toBeNull();
    expect(findMoment(quotes, -5)).toBeNull();
    expect(findMoment(quotes, 'abc')).toBeNull();
    expect(findMoment([{ text: 'late', timestamp_start_seconds: 30 }], 10)).toBeNull();
});

test('a shared link opens on its quote and previews as that quote', () => {
    const html = page({ sharedAt: 3800 });
    expect(html).toContain('Shared moment &middot; 1:02:05');
    expect(html).toContain('<blockquote>second line here</blockquote>');
    expect(html).toContain('data-start="3725"');
    expect(html).toContain('<li class="quote-row hl" id="moment-line">');
    // The preview card carries the quote and keeps the ?t= link...
    expect(html).toContain('<meta property="og:url" content="https://nlquotes.com/video/J0vgWp-vrrU?t=3725" />');
    expect(html).toContain('<meta property="og:title" content="One shot &lt;how&gt; hard — at 1:02:05" />');
    expect(html).toContain('<meta property="og:description" content="“second line here” — Northernlion" />');
    // ...while search engines are still pointed at the one video page.
    expect(html).toContain('<link rel="canonical" href="https://nlquotes.com/video/J0vgWp-vrrU" />');
    expect(html).toContain('<title>One shot &lt;how&gt; hard — Northernlion quotes &amp; transcript | NLQuotes</title>');
});

test('without a shared moment the page is the plain video page', () => {
    const html = page();
    expect(html).not.toContain('class="moment"');
    expect(html).not.toContain('quote-row hl');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('<meta property="og:url" content="https://nlquotes.com/video/J0vgWp-vrrU" />');
    // A time before the first line, or junk, is ignored rather than guessed at.
    expect(page({ sharedAt: 'x' })).not.toContain('class="moment"');
});

test('copy-link controls are buttons, never crawlable ?t= links', () => {
    const html = page();
    expect(html).toContain('<button type="button" class="link-btn" data-link="3725"');
    expect(html).not.toMatch(/href="[^"]*\?t=/);
});

test('long shared quotes are cut at a word boundary in the preview', () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const html = page({ quotes: [{ text: long, timestamp_start_seconds: 5 }], sharedAt: 5 });
    const desc = /property="og:description" content="([^"]*)"/.exec(html)[1];
    expect(desc.length).toBeLessThan(310);
    expect(desc).toMatch(/word\d+…” — Northernlion$/);
    // The page itself shows the whole line.
    expect(html).toContain(`<blockquote>${long}</blockquote>`);
});
