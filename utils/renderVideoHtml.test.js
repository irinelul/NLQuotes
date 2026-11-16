import { expect, test } from 'vitest';
import { isoDuration, renderVideoHtml } from './renderVideoHtml';

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
