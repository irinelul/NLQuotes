// Which topic terms are allowed to exist as indexable pages.
//
// On-demand generation used to mean any visitor — or any crawler following a
// link — could mint a permanent, indexable page. That is how ~7,000 pages
// accumulated, of which Search Console indexed ~7,000 and Google separately
// rejected 721 as "Crawled - currently not indexed". The fix is to decouple
// "we can render this" from "this deserves to be in the index".
//
// This gate gates a *destructive* response (410 Gone), so it is deliberately a
// static committed file rather than a live analytics query: a transient DB
// failure must never be able to tombstone good pages.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeTopicTerm } from './topicUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = path.join(__dirname, 'topic-allowlist.json');

function loadAllowlist() {
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    const terms = Array.isArray(raw?.terms) ? raw.terms : [];
    return new Set(terms.map(normalizeTopicTerm).filter(Boolean));
  } catch (err) {
    // Fail closed. An unreadable allowlist means "nothing is indexable", which
    // costs us traffic we can restore; failing open would re-open the exact
    // uncurated-page hole this module exists to close.
    console.error('[topics] Could not read topic allowlist, treating as empty:', err.message);
    return new Set();
  }
}

const allowed = loadAllowlist();

console.log(`[topics] Topic allowlist loaded: ${allowed.size} indexable term(s)`);

export function isAllowlistedTopic(term) {
  return allowed.has(normalizeTopicTerm(term));
}

export function allowlistedTopics() {
  return [...allowed];
}
