import { expect, test } from 'vitest';
import { inlineJson } from './inlineJson';

test('cannot close the surrounding script tag', () => {
    const out = inlineJson({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
});

test('round-trips to the same value', () => {
    const value = { name: 'a <b> & "c" \u2028 \u2029 <!-- d', n: [1, null, true] };
    expect(JSON.parse(inlineJson(value))).toEqual(value);
});

test('video page JSON-LD cannot be broken out of by a title', async () => {
    const { renderVideoHtml } = await import('./renderVideoHtml.js');
    const html = renderVideoHtml({
        videoId: 'abcdefghijk',
        title: '</script><script>alert(1)</script>',
        quotes: [],
        siteBaseUrl: 'https://nlquotes.com',
    });
    expect(html).not.toContain('<script>alert(1)');
});
