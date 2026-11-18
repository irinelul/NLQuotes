// In-memory index over the list of indexable videos (newest first), built once
// per load in index.js, and the related-video picks the video pages link to.

import { toDateOnly } from './dateOnly.js';

function videoTitleQualifiers(list) {
  const byTitle = new Map();
  for (const video of list) {
    const title = (video.title || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() || 'untitled video';
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(video);
  }

  // Distinguish repeated titles by upload date. Use the video ID when a date
  // is missing or more than one video with the title was uploaded that day.
  const qualifiers = new Map();
  for (const videos of byTitle.values()) {
    if (videos.length < 2) continue;
    const dates = videos.map((video) => toDateOnly(video.uploadDate));
    const dateCounts = new Map();
    for (const date of dates) dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    videos.forEach(({ videoId }, i) => {
      const date = dates[i];
      qualifiers.set(videoId, date && dateCounts.get(date) === 1
        ? date
        : [date, videoId].filter(Boolean).join(', '));
    });
  }
  return qualifiers;
}

export function buildVideoIndex(list) {
  const position = new Map(); // videoId -> index in list (newest first)
  const byGame = new Map();   // gameName -> [index, ...] newest first
  list.forEach((v, i) => {
    position.set(v.videoId, i);
    if (v.gameName) {
      if (!byGame.has(v.gameName)) byGame.set(v.gameName, []);
      byGame.get(v.gameName).push(i);
    }
  });
  const titleQualifiers = videoTitleQualifiers(list);
  return { list, ids: new Set(position.keys()), position, byGame, titleQualifiers, ...buildArchives(list, byGame) };
}

// Other video pages to link from a video page, so crawlers can walk from one
// transcript to the next instead of reaching them only through the sitemap:
// the chronological neighbours, plus the nearest uploads of the same game.
export function relatedVideos(batch, videoId, { sameGame = 8 } = {}) {
  if (!batch) return { newer: null, older: null, sameGame: [], gameName: null };
  const i = batch.position.get(videoId);
  if (i === undefined) return { newer: null, older: null, sameGame: [], gameName: null };

  const { list } = batch;
  const gameName = list[i].gameName || null;
  const picks = [];
  if (gameName) {
    const positions = batch.byGame.get(gameName) || [];
    const at = positions.indexOf(i);
    // Take the closest uploads on either side, alternating outward.
    for (let d = 1; picks.length < sameGame && (at - d >= 0 || at + d < positions.length); d++) {
      if (at - d >= 0) picks.push(positions[at - d]);
      if (picks.length < sameGame && at + d < positions.length) picks.push(positions[at + d]);
    }
  }
  return {
    newer: i > 0 ? list[i - 1] : null,
    older: i < list.length - 1 ? list[i + 1] : null,
    sameGame: picks.map((p) => list[p]),
    gameName,
  };
}

// ---- Archive pages -------------------------------------------------------
// The paginated /videos hub is a single chain ~470 pages long, so a video from
// 2014 sits dozens of clicks from the homepage and Google never gets that far
// ("Discovered - currently not indexed"). The month and game archives put every
// video two clicks from /videos instead.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// 'YYYY-MM' -> 'May 2024'
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

export const monthPath = (ym) => `/videos/${ym.replace('-', '/')}`;
export const gamePath = (slug) => `/videos/game/${slug}`;

export function slugifyGame(name) {
  return String(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'game';
}

const TOP_GAMES = 12;

// months: Map 'YYYY-MM' -> [list index, ...]  (newest month first, newest video first)
// games:  Map slug -> { slug, name, indices }  (alphabetical by name)
// slugByGame: Map game name -> slug
//
// Slugs are assigned in alphabetical order of the game name, so two names that
// slugify alike ("Game!" / "Game?") get the same slug each on every rebuild
// unless a new colliding name sorts in ahead of them.
export function buildArchives(list, byGame) {
  const months = new Map();
  list.forEach((v, i) => {
    const date = toDateOnly(v.uploadDate);
    if (!date) return;
    const ym = date.slice(0, 7);
    if (!months.has(ym)) months.set(ym, []);
    months.get(ym).push(i);
  });

  const games = new Map();
  const slugByGame = new Map();
  [...byGame.keys()].sort((a, b) => a.localeCompare(b, 'en')).forEach((name) => {
    const base = slugifyGame(name);
    let slug = base;
    for (let n = 2; games.has(slug); n++) slug = `${base}-${n}`;
    games.set(slug, { slug, name, indices: byGame.get(name) });
    slugByGame.set(name, slug);
  });

  // The games with the most videos, for the home page's crawlable links.
  const topGames = [...games.values()]
    .sort((a, b) => b.indices.length - a.indices.length || a.name.localeCompare(b.name, 'en'))
    .slice(0, TOP_GAMES)
    .map((g) => ({ slug: g.slug, name: g.name, count: g.indices.length }));

  return { months, games, slugByGame, topGames };
}

// The archive pages a given video belongs to, for its breadcrumb links.
export function archiveLinksFor(batch, videoId) {
  const i = batch?.position.get(videoId);
  if (i === undefined || !batch.months) return { month: null, game: null };
  const v = batch.list[i];
  const ym = toDateOnly(v.uploadDate)?.slice(0, 7);
  const month = ym && batch.months.has(ym) ? { label: monthLabel(ym), path: monthPath(ym) } : null;
  const slug = v.gameName ? batch.slugByGame.get(v.gameName) : null;
  return { month, game: slug ? { name: v.gameName, path: gamePath(slug) } : null };
}
