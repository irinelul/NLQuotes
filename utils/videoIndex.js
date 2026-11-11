// In-memory index over the list of indexable videos (newest first), built once
// per load in index.js, and the related-video picks the video pages link to.

import { toDateOnly } from './dateOnly.js';

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
  return { list, ids: new Set(position.keys()), position, byGame, ...buildArchives(list, byGame) };
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

  return { months, games, slugByGame };
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
