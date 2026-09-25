import { expect, test } from 'vitest';
import { buildVideoIndex, relatedVideos } from './videoIndex';
import { renderVideoHtml } from './renderVideoHtml';

// Newest first, as listVideosForIndex returns it.
const list = [
    { videoId: 'v0', title: 'Isaac 5', gameName: 'Isaac' },
    { videoId: 'v1', title: 'Balatro 2', gameName: 'Balatro' },
    { videoId: 'v2', title: 'Isaac 4', gameName: 'Isaac' },
    { videoId: 'v3', title: 'Isaac 3', gameName: 'Isaac' },
    { videoId: 'v4', title: 'Balatro 1', gameName: 'Balatro' },
    { videoId: 'v5', title: 'Isaac 2', gameName: 'Isaac' },
    { videoId: 'v6', title: 'No game' },
];
const batch = buildVideoIndex(list);

test('chronological neighbours', () => {
    const r = relatedVideos(batch, 'v3');
    expect(r.newer.videoId).toBe('v2');
    expect(r.older.videoId).toBe('v4');
    expect(relatedVideos(batch, 'v0').newer).toBeNull();
    expect(relatedVideos(batch, 'v6').older).toBeNull();
});

test('same-game picks are the nearest uploads, never the video itself', () => {
    const r = relatedVideos(batch, 'v3', { sameGame: 2 });
    expect(r.gameName).toBe('Isaac');
    expect(r.sameGame.map((v) => v.videoId)).toEqual(['v2', 'v5']);
    expect(relatedVideos(batch, 'v3').sameGame.map((v) => v.videoId)).not.toContain('v3');
});

test('videos outside the batch, or with no game, get no same-game links', () => {
    expect(relatedVideos(batch, 'nope')).toEqual({ newer: null, older: null, sameGame: [], gameName: null });
    expect(relatedVideos(null, 'v3').sameGame).toEqual([]);
    expect(relatedVideos(batch, 'v6').sameGame).toEqual([]);
});

test('video page links to related transcripts and names the creator', () => {
    const html = renderVideoHtml({
        videoId: 'abcdefghijk', title: 'Isaac 3', quotes: [], siteBaseUrl: 'https://nlquotes.com',
        creator: 'Northernlion', related: relatedVideos(batch, 'v3'),
    });
    expect(html).toContain('<title>Isaac 3 — Northernlion quotes &amp; transcript | NLQuotes</title>');
    expect(html).toContain('More Isaac videos');
    expect(html).toContain('href="https://nlquotes.com/video/v2"');
    expect(html).toContain('rel="prev"');
});
