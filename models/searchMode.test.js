import { expect, test } from 'vitest';
import { classifySearch } from './searchMode';

test('no quotes is flexible', () => {
    expect(classifySearch('hello chat').mode).toBe('flexible');
    expect(classifySearch('  isaac  ').mode).toBe('flexible');
});

test('only quoted phrases is exact', () => {
    expect(classifySearch('"hello chat"').mode).toBe('exact');
    expect(classifySearch('"hello chat" "good morning"').mode).toBe('exact');
});

test('quoted phrase plus loose words is mixed', () => {
    expect(classifySearch('"hello chat" isaac').mode).toBe('mixed');
});

test('an unclosed quote is not a phrase', () => {
    expect(classifySearch('"hello chat').mode).toBe('flexible');
});

test('counts words and detects operators outside phrases', () => {
    expect(classifySearch('"a b" c').props.words).toBe(3);
    expect(classifySearch('cats or dogs').props.has_or).toBe(true);
    expect(classifySearch('"cats or dogs"').props.has_or).toBe(false);
    expect(classifySearch('cats -dogs').props.has_exclude).toBe(true);
    expect(classifySearch('spider-man').props.has_exclude).toBe(false);
});
