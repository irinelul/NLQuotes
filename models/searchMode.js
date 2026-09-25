// How a search was phrased, for analytics. Search goes through Postgres'
// websearch_to_tsquery, so the syntax that changes the result is the user's
// own: "double quotes" force an exact phrase, `or` between words widens, and a
// leading `-` excludes. There is no strict toggle in the UI any more (the
// `strict` query param is always false and the query ignores it), so logging
// that flag recorded every search as the same mode. This reads the term instead.
//
//   exact    — the whole search is quoted phrase(s):  "hello chat"
//   mixed    — a quoted phrase plus loose words:      "hello chat" isaac
//   flexible — no quotes at all:                       hello chat
//
// Keep in step with SEARCH_MODE_SQL in scripts/metabase/build-search-cards.js,
// which applies the same rules to rows logged before this existed.
export function classifySearch(term) {
    const t = String(term || '').trim();
    const phrases = t.match(/"[^"]+"/g) || [];
    const loose = t.replace(/"[^"]+"/g, ' ').replace(/"/g, ' ').trim();

    let mode = 'flexible';
    if (phrases.length > 0) mode = loose === '' ? 'exact' : 'mixed';

    return {
        mode,
        props: {
            words: t === '' ? 0 : t.replace(/"/g, ' ').trim().split(/\s+/).filter(Boolean).length,
            has_or: /(^|\s)or(\s|$)/i.test(loose),
            has_exclude: /(^|\s)-\S/.test(loose),
        },
    };
}
