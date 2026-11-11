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

// ---- archives ----
import { archiveLinksFor, slugifyGame } from './videoIndex';
import { renderVideoMonthHtml, renderVideoGameHtml, renderVideoGamesHtml } from './renderVideoArchiveHtml';
import { renderVideosHubHtml } from './renderVideosHubHtml';

const dated = buildVideoIndex([
    { videoId: 'a', title: 'A', gameName: 'Balatro', uploadDate: '2024-06-02', quoteCount: 30 },
    { videoId: 'b', title: 'B', gameName: "Don't Starve", uploadDate: '2024-05-20', quoteCount: 30 },
    { videoId: 'c', title: 'C', gameName: 'Balatro', uploadDate: '2024-05-03', quoteCount: 30 },
    { videoId: 'd', title: 'D', gameName: 'Dont Starve!', uploadDate: '2013-01-09', quoteCount: 30 },
    { videoId: 'e', title: 'E' },
]);

test('every dated video lands in exactly one month, newest month first', () => {
    expect([...dated.months.keys()]).toEqual(['2024-06', '2024-05', '2013-01']);
    expect(dated.months.get('2024-05').map((i) => dated.list[i].videoId)).toEqual(['b', 'c']);
    const total = [...dated.months.values()].reduce((n, m) => n + m.length, 0);
    expect(total).toBe(4); // 'e' has no date
});

test('game slugs are url-safe and colliding names stay distinct', () => {
    expect(slugifyGame('The Binding of Isaac: Rebirth')).toBe('the-binding-of-isaac-rebirth');
    expect(slugifyGame('Pokémon & Friends')).toBe('pokemon-and-friends');
    expect(slugifyGame('???')).toBe('game');
    expect([...dated.games.keys()].sort()).toEqual(['balatro', 'dont-starve', 'dont-starve-2']);
    expect(dated.games.get('balatro').indices.map((i) => dated.list[i].videoId)).toEqual(['a', 'c']);
});

test('a video links up to its month and game archives', () => {
    expect(archiveLinksFor(dated, 'c')).toEqual({
        month: { label: 'May 2024', path: '/videos/2024/05' },
        game: { name: 'Balatro', path: '/videos/game/balatro' },
    });
    expect(archiveLinksFor(dated, 'e')).toEqual({ month: null, game: null });
    expect(archiveLinksFor(null, 'c')).toEqual({ month: null, game: null });

    const html = renderVideoHtml({
        videoId: 'ccccccccccc', title: 'C', quotes: [], siteBaseUrl: 'https://nlquotes.com',
        archive: archiveLinksFor(dated, 'c'),
    });
    expect(html).toContain('href="https://nlquotes.com/videos/game/balatro"');
    expect(html).toContain('href="https://nlquotes.com/videos/2024/05"');
    expect(html).toContain('"BreadcrumbList"');
});

test('archive pages list their videos with a self canonical', () => {
    const base = 'https://nlquotes.com';
    const month = renderVideoMonthHtml({
        ym: '2024-05', videos: dated.months.get('2024-05').map((i) => dated.list[i]),
        newer: '2024-06', older: '2013-01', siteBaseUrl: base, creator: 'Northernlion',
    });
    expect(month).toContain('<link rel="canonical" href="https://nlquotes.com/videos/2024/05" />');
    expect(month).toContain('<h1>Northernlion videos from May 2024</h1>');
    expect(month).toContain('href="https://nlquotes.com/video/b"');
    expect(month).toContain('href="https://nlquotes.com/videos/2024/06"');
    expect(month).toContain('href="https://nlquotes.com/videos/2013/01"');

    const game = dated.games.get('dont-starve');
    const gameHtml = renderVideoGameHtml({ game, videos: game.indices.map((i) => dated.list[i]), siteBaseUrl: base });
    expect(gameHtml).toContain('<link rel="canonical" href="https://nlquotes.com/videos/game/dont-starve" />');
    expect(gameHtml).toContain('Don&#39;t Starve videos');

    const dir = renderVideoGamesHtml({
        games: [...dated.games.values()].map((g) => ({ slug: g.slug, name: g.name, count: g.indices.length })),
        siteBaseUrl: base,
    });
    expect(dir).toContain('href="https://nlquotes.com/videos/game/dont-starve-2"');
});

test('the hub links to every month archive', () => {
    const html = renderVideosHubHtml({
        videos: dated.list, page: 1, totalPages: 1, totalVideos: 5, siteBaseUrl: 'https://nlquotes.com',
        months: [...dated.months].map(([ym, idx]) => ({ ym, count: idx.length })), gameCount: dated.games.size,
    });
    for (const p of ['/videos/2024/06', '/videos/2024/05', '/videos/2013/01', '/videos/games']) {
        expect(html).toContain(`href="https://nlquotes.com${p}"`);
    }
});
