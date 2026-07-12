// Unit tests for the pure session-rotation helper in src/services/analytics.js.
//
// We import ONLY the pure, browser-free `shouldRotateSession` export. The host
// module's only top-level side effect (registerExitListeners) is fully wrapped
// in try/catch and degrades to a no-op under a node test environment, so the
// import never touches a DB, the network, or any DOM global. shouldRotateSession
// itself does not reference window/document/sessionStorage at all.
import { expect, test } from 'vitest';
import { shouldRotateSession } from './analytics';

const TIMEOUT = 30 * 60 * 1000; // 1800000 — matches SESSION_TIMEOUT_MS default

test('rotates when there is no prior activity (fresh session)', () => {
    // null / undefined lastActivityMs must always trigger a rotation.
    expect(shouldRotateSession(null, 1000)).toBe(true);
    expect(shouldRotateSession(undefined, 1000)).toBe(true);
    // A non-numeric / NaN timestamp is treated as "unknown" → rotate.
    expect(shouldRotateSession(NaN, 1000)).toBe(true);
    expect(shouldRotateSession('1000', 1000)).toBe(true);
});

test('does not rotate while activity is within the timeout window', () => {
    // Activity 1s ago, 30min window — well within.
    expect(shouldRotateSession(1000, 2000, TIMEOUT)).toBe(false);
    // Even activity from 29:59 ago stays inside the window.
    expect(shouldRotateSession(1000, 1000 + (TIMEOUT - 1000), TIMEOUT)).toBe(false);
});

test('does not rotate exactly at the timeout boundary (strictly greater-than)', () => {
    // now - last === timeout → boundary is inclusive (not stale yet).
    expect(shouldRotateSession(1000, 1000 + TIMEOUT, TIMEOUT)).toBe(false);
});

test('rotates once activity is older than the timeout', () => {
    // 1ms past the boundary is enough to rotate.
    expect(shouldRotateSession(1000, 1000 + TIMEOUT + 1, TIMEOUT)).toBe(true);
    // Long-expired session (2h ago) rotates.
    expect(shouldRotateSession(1000, 1000 + TIMEOUT * 4, TIMEOUT)).toBe(true);
});

test('uses the 30-minute default timeout when timeoutMs is omitted', () => {
    // Exactly at default boundary → not stale.
    expect(shouldRotateSession(0, TIMEOUT)).toBe(false);
    // Just past default boundary → stale.
    expect(shouldRotateSession(0, TIMEOUT + 1)).toBe(true);
    // Well within default.
    expect(shouldRotateSession(TIMEOUT - 1, TIMEOUT)).toBe(false);
});
