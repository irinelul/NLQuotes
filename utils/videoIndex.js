// In-memory index over the list of indexable videos (newest first), built once
// per load in index.js, and the related-video picks the video pages link to.

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
  return { list, ids: new Set(position.keys()), position, byGame };
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
