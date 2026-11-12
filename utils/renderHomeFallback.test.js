import { expect, test } from 'vitest';
import { renderHomeFallbackHtml, renderLlmsTxt } from './renderHomeFallback';

const tenant = {
    name: 'Northernlion',
    displayName: 'NLQuotes',
    metadata: { siteName: 'NLQuotes', description: "Search quotes from Northernlion's videos." },
    texts: { disclaimer: 'Not affiliated with <Northernlion>.' },
};
const base = 'https://nlquotes.com';

test('home fallback names the site and links to the server-rendered pages', () => {
    const html = renderHomeFallbackHtml(tenant, base);
    expect(html).toContain('<h1>NLQuotes - search Northernlion quotes</h1>');
    expect(html).toContain('href="https://nlquotes.com/videos"');
    expect(html).toContain('href="https://nlquotes.com/videos/games"');
});

test('home fallback escapes tenant text', () => {
    const html = renderHomeFallbackHtml(tenant, base);
    expect(html).toContain('Northernlion&#39;s videos');
    expect(html).toContain('&lt;Northernlion&gt;');
    expect(html).not.toContain('<Northernlion>');
});

test('llms.txt is Markdown with a title, summary and absolute links', () => {
    const txt = renderLlmsTxt(tenant, base);
    expect(txt.startsWith('# NLQuotes\n\n> Search quotes')).toBe(true);
    expect(txt).toContain('- [Videos](https://nlquotes.com/videos)');
    expect(txt).toContain('https://nlquotes.com/video/<youtube-video-id>');
});

test('both renderers cope with a missing tenant', () => {
    expect(renderHomeFallbackHtml(undefined, base)).toContain('<h1>Quotes</h1>');
    expect(renderLlmsTxt(undefined, base).startsWith('# Quotes')).toBe(true);
});
