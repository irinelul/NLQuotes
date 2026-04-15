// Search terms that should never get a generated topic page.
// Prevents slurs from appearing in URLs, titles, and the sitemap.
// All entries lowercase — check is case-insensitive exact match.
const BLOCKLIST = new Set([
  'nigger', 'niggers', 'nigga', 'niggas',
  'faggot', 'faggots', 'fag',
  'kike', 'kikes',
  'chink', 'chinks',
  'spic', 'spics',
  'wetback', 'wetbacks',
  'gook', 'gooks',
  'tranny', 'trannies',
  'retard', 'retarded', 'retards',
  'cunt', 'cunts',
]);

/**
 * Returns true if the term should be blocked from getting a topic page.
 * Exact whole-term match only — "scunthorpe" is not blocked by "cunt".
 */
export function isBlockedTopic(term) {
  if (!term) return true;
  return BLOCKLIST.has(term.trim().toLowerCase());
}
