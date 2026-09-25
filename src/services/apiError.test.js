import { test, expect } from 'vitest';
import { describeApiError, classifyApiError } from './apiError';

const axiosError = (status, data = {}) => ({ response: { status, data }, request: {} });

test('429 explains the rate limit and says to wait', () => {
    const msg = describeApiError(axiosError(429), 'search');
    expect(msg).toMatch(/request limit/i);
    expect(msg).toMatch(/wait/i);
});

test('400 surfaces the server-provided reason', () => {
    expect(describeApiError(axiosError(400, { error: 'Potential spam detected' }), 'send your report'))
        .toBe('Potential spam detected');
    expect(describeApiError(axiosError(400, { message: 'Search term must be at least 2 characters' }), 'search'))
        .toBe('Search term must be at least 2 characters');
});

test('504 prefers the server message, falls back to a timeout sentence', () => {
    expect(describeApiError(axiosError(504, { message: 'The search took too long and was cancelled.' }), 'search'))
        .toBe('The search took too long and was cancelled.');
    expect(describeApiError(axiosError(504), 'search')).toMatch(/took too long to search/);
});

test('client-side axios timeout maps to the timeout sentence', () => {
    const err = { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' };
    expect(describeApiError(err, 'search')).toMatch(/took too long to search/);
});

test('500 names the action', () => {
    expect(describeApiError(axiosError(500), 'fetch random quotes')).toMatch(/internal error while trying to fetch random quotes/);
});

test('network failure (no response) says the server was unreachable', () => {
    expect(describeApiError({ request: {}, message: 'Network Error' }, 'search')).toMatch(/couldn't reach the server/i);
    expect(describeApiError(new TypeError('Failed to fetch'), 'load quotes for this topic')).toMatch(/couldn't reach the server/i);
});

test('unknown errors get the generic fallback with the action named', () => {
    expect(describeApiError(new Error('boom'), 'search')).toMatch(/something went wrong while trying to search/i);
});

test('classifyApiError buckets failures for analytics', () => {
    expect(classifyApiError(axiosError(429))).toBe('rate_limited');
    expect(classifyApiError(axiosError(400))).toBe('bad_request');
    expect(classifyApiError(axiosError(504))).toBe('timeout');
    expect(classifyApiError({ code: 'ECONNABORTED', request: {} })).toBe('timeout');
    expect(classifyApiError(axiosError(500))).toBe('server_error');
    expect(classifyApiError({ request: {} })).toBe('network');
    expect(classifyApiError(new Error('boom'))).toBe('other');
});
