import { expect, test } from 'vitest';
import { normalizeSearchTerm } from './searchTerm';

test('curly double quotes become straight quotes so phrase search works', () => {
    expect(normalizeSearchTerm('“the strokes”')).toBe('"the strokes"');
    expect(normalizeSearchTerm('„the strokes“')).toBe('"the strokes"');
});

test('curly apostrophes become straight apostrophes', () => {
    expect(normalizeSearchTerm('it’s the strokes’ reptilia')).toBe("it's the strokes' reptilia");
});

test('plain and straight-quoted input is untouched', () => {
    expect(normalizeSearchTerm('the strokes')).toBe('the strokes');
    expect(normalizeSearchTerm('"the strokes"')).toBe('"the strokes"');
    expect(normalizeSearchTerm('')).toBe('');
});

test('non-string input passes through', () => {
    expect(normalizeSearchTerm(undefined)).toBe(undefined);
    expect(normalizeSearchTerm(null)).toBe(null);
});
