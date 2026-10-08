// websearch_to_tsquery only treats straight ASCII quotes as phrase delimiters.
export function normalizeSearchTerm(term) {
  if (typeof term !== 'string') return term;
  return term
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'");
}
