// Prevents certain search terms from getting a generated topic page so that
// slurs don't appear in URLs, page titles, or the sitemap.
// Uses a pattern match rather than listing terms explicitly.

// Matches common slurs and hate speech patterns (case-insensitive, whole term).
// Written as patterns to avoid spelling them out verbatim in source.
const BLOCKED_PATTERNS = [
  /^ni+g+[ae]r?s?$/,          // n-word variants
  /^f[a@]g+[o0]ts?$/,         // f-slur variants
  /^f[a@]gs?$/,
  /^ki+k+e?s?$/,               // k-slur
  /^ch[i1]nks?$/,              // c-slur (asian)
  /^sp[i1]cs?$/,               // s-slur (hispanic)
  /^wetbacks?$/,
  /^g[o0]+ks?$/,               // g-slur (asian)
  /^trann(y|ies)$/,            // t-slur
  /^ret[a@]rd(ed|s)?$/,        // r-slur
  /^cunts?$/,
];

/**
 * Returns true if the term should be blocked from getting a topic page.
 */
export function isBlockedTopic(term) {
  if (!term) return true;
  const lower = term.trim().toLowerCase();
  return BLOCKED_PATTERNS.some((re) => re.test(lower));
}
