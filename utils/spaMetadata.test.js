import { expect, test } from 'vitest';
import { getSpaMetadata } from './spaMetadata.js';

const tenant = {
  name: 'Northernlion',
  displayName: 'NLQuotes',
  hostnames: ['nlquotes.com', 'www.nlquotes.com'],
  metadata: { title: 'NLQuotes - Search Northernlion Quotes', description: 'Search Northernlion videos.' },
};

function metadataFor(path, search = '') {
  return getSpaMetadata(path, new URLSearchParams(search), tenant);
}

test('public SPA routes have distinct titles, descriptions, and canonical URLs', () => {
  const paths = ['/', '/privacy', '/changelog', '/stats'];
  const pages = paths.map((path) => metadataFor(path, '?utm_source=example'));
  for (const key of ['title', 'description']) {
    expect(new Set(pages.map((page) => page[key])).size).toBe(paths.length);
  }
  expect(pages.map((page) => page.canonical)).toEqual(paths.map((path) => 'https://nlquotes.com' + path));
  expect(pages.every((page) => page.status === 200 && page.robots.startsWith('index,'))).toBe(true);
  expect(pages[0].title).toBe(tenant.metadata.title);
  expect(metadataFor('/STATS/').canonical).toBe(pages[3].canonical);
});

test('search results and legacy home search URLs are excluded from indexing', () => {
  const search = metadataFor('/search', '?q=egg');
  expect(search).toMatchObject({ isHome: false, status: 200, robots: 'noindex,follow', canonical: 'https://nlquotes.com/search' });
  expect(metadataFor('/', '?q=egg')).toEqual(search);
  expect(metadataFor('/', '?game=Balatro')).toEqual(search);
});

test('topic fallbacks and missing pages do not inherit indexable home metadata', () => {
  expect(metadataFor('/topic/egg')).toMatchObject({ status: 503, robots: 'noindex,follow' });
  expect(metadataFor('/topic/egg/typo')).toMatchObject({ status: 404, robots: 'noindex,follow' });
});
