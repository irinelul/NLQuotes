// End-to-end session-journey tests for the real `track()` entry point.
//
// The existing analytics.session.test.js only exercises the pure
// shouldRotateSession helper. This file drives `track()` through the full
// session lifecycle (session_start → activity → session_end) to lock in the
// recent session-journey fixes:
//   FIX #1 — sendExit() uses { skipSession: true } so the exit beacon never
//            rotates the session or emits a phantom session_start.
//   FIX #2 — exitSent is reset when a new session starts, so a rotated session
//            can still emit its own session_end.
//
// The host module carries module-level state (startedSid, exitSent,
// listenersRegistered) and calls registerExitListeners() on import. To get
// pristine state per test we vi.resetModules() in beforeEach and re-import the
// module dynamically AFTER the browser globals are stubbed.
//
// No new devDependencies: everything runs in vitest's default node environment
// with the browser globals stubbed by hand.

import { test, expect, beforeEach, afterEach, vi } from 'vitest';

let captured; // parsed bodies from navigator.sendBeacon, reset per test
let cryptoCounter; // deterministic sid counter for crypto.randomUUID

// Define a global as a configurable/writable value (Node marks `navigator`
// and `crypto` as getter-only, so a plain assignment throws).
function defineGlobal(name, value) {
    Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true,
    });
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));

    captured = [];
    cryptoCounter = 0;
    const noop = () => {};

    // window is a minimal EventTarget: addEventListener records handlers so a
    // dispatched 'pagehide' reaches the registered exit listener (sendExit).
    const winListeners = {};
    defineGlobal('window', {
        location: { pathname: '/' },
        screen: { width: 1920, height: 1080 },
        addEventListener(type, fn) {
            (winListeners[type] = winListeners[type] || []).push(fn);
        },
        dispatchEvent(ev) {
            const type = ev && ev.type;
            (winListeners[type] || []).forEach((fn) => {
                try {
                    fn(ev);
                } catch {
                    /* swallow — mirror browser dispatch semantics */
                }
            });
            return true;
        },
    });

    defineGlobal('document', {
        referrer: null,
        visibilityState: 'visible',
        addEventListener: noop,
    });

    // sendBeacon receives a Blob; capture its parsed JSON so tests can assert
    // which events shipped. Returning true keeps track() off the fetch fallback.
    defineGlobal('navigator', {
        sendBeacon: (url, body) => {
            const str = body && typeof body === 'object' && '_text' in body ? body._text : body;
            captured.push(JSON.parse(str));
            return true;
        },
    });

    // Deterministic session ids: uuid-1, uuid-2, ...
    defineGlobal('crypto', {
        randomUUID: () => `uuid-${++cryptoCounter}`,
    });

    // Minimal Blob shim: store the string so sendBeacon can read it synchronously.
    defineGlobal('Blob', class {
        constructor(parts, options) {
            this._text = Array.isArray(parts) ? parts.join('') : String(parts);
            this.type = (options && options.type) || '';
        }
    });

    // Map-backed sessionStorage faithful to the browser API: setItem
    // stringifies, getItem returns the raw stored string (or null), removeItem
    // clears the key. removeItem matters now that ensureSession() probes storage
    // availability with a setItem+removeItem round-trip.
    defineGlobal('sessionStorage', (() => {
        const map = new Map();
        return {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => {
                map.set(k, String(v));
            },
            removeItem: (k) => {
                map.delete(k);
            },
        };
    })());

    // localStorage left undefined → isOptedOut()'s try/catch falls through and
    // (with no DNT/GPC signals) returns false. Individual opt-out tests
    // redefine it.
    defineGlobal('localStorage', undefined);
});

afterEach(() => {
    vi.useRealTimers();
});

// Force the session to look stale so the next ensureSession() call WOULD
// rotate (last activity > 30 min ago).
function expireSession() {
    sessionStorage.setItem('nlq_last', String(Date.now() - 31 * 60 * 1000));
}

test('emits exactly one session_start per session with no recursion', async () => {
    const { track } = await import('./analytics');

    track('page_view');

    // Fresh session: exactly one session_start bookend, then the page_view.
    expect(captured).toHaveLength(2);
    expect(captured[0].event_type).toBe('session_start');
    expect(captured[0].session_id).toBe('uuid-1');
    expect(captured[1].event_type).toBe('page_view');
    expect(captured[1].session_id).toBe('uuid-1');
    // The bookend and the triggering event share the same session id.
    expect(captured[0].session_id).toBe(captured[1].session_id);

    // A second event in the SAME session must not emit another session_start
    // (the recursive track('session_start') must not loop).
    track('page_view');
    expect(captured).toHaveLength(3);
    const starts = captured.filter((e) => e.event_type === 'session_start');
    expect(starts).toHaveLength(1);
});

test('FIX #1: exit beacon does not rotate the session or emit a phantom session_start', async () => {
    const { track } = await import('./analytics');

    track('page_view'); // establishes the live session (sid = uuid-1)
    const originalSid = captured.find((e) => e.event_type === 'session_start').session_id;
    expect(originalSid).toBe('uuid-1');

    // Make the session look stale so a *non-skipped* ensureSession() would rotate.
    expireSession();

    // Dispatch the registered pagehide listener → sendExit(). persisted is
    // falsy so sendExit proceeds.
    window.dispatchEvent({ type: 'pagehide', persisted: false });

    const last = captured[captured.length - 1];
    expect(last.event_type).toBe('session_end');
    // Attributed to the captured sid, not a rotated one.
    expect(last.session_id).toBe(originalSid);
    // session_duration_ms is present (a number).
    expect(typeof last.session_duration_ms).toBe('number');

    // No phantom session_start for a brand-new sid was emitted during exit.
    // (Pre-fix this would be length 2: the original plus a phantom uuid-2.)
    const starts = captured.filter((e) => e.event_type === 'session_start');
    expect(starts).toHaveLength(1);
    expect(starts[0].session_id).toBe(originalSid);
});

test('FIX #2: exitSent resets across rotation so a second session can emit its own session_end', async () => {
    const { track } = await import('./analytics');

    // Session A.
    track('page_view');
    const sidA = captured.find((e) => e.event_type === 'session_start').session_id;
    expect(sidA).toBe('uuid-1');

    // End session A via pagehide → its session_end is emitted.
    window.dispatchEvent({ type: 'pagehide', persisted: false });
    expect(captured.some((e) => e.event_type === 'session_end' && e.session_id === sidA)).toBe(true);

    // Force rotation and start session B.
    expireSession();
    track('page_view');

    const sidB = captured
        .filter((e) => e.event_type === 'session_start')
        .map((e) => e.session_id)
        .find((sid) => sid !== sidA);
    expect(sidB).toBe('uuid-2');

    // End session B via pagehide. exitSent MUST have been reset when session B
    // started, otherwise this second pagehide would be a no-op (pre-fix).
    window.dispatchEvent({ type: 'pagehide', persisted: false });
    expect(captured.some((e) => e.event_type === 'session_end' && e.session_id === sidB)).toBe(true);

    // Two distinct session_end bookends across the two sessions.
    const ends = captured.filter((e) => e.event_type === 'session_end');
    expect(ends).toHaveLength(2);
});

test('opt-out suppresses all tracking', async () => {
    const map = new Map([['analytics_opt_out', 'true']]);
    defineGlobal('localStorage', {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            map.set(k, String(v));
        },
    });

    const { track } = await import('./analytics');
    track('page_view');

    expect(captured).toHaveLength(0);
});

test('private-mode resilience: storage failures never break tracking', async () => {
    // sessionStorage throws on every access (private mode / storage disabled).
    defineGlobal('sessionStorage', {
        getItem: () => {
            throw new Error('private mode');
        },
        setItem: () => {
            throw new Error('private mode');
        },
    });

    const { track } = await import('./analytics');

    // The real event must ship even though sessionStorage is unavailable.
    expect(() => track('page_view')).not.toThrow();
    const pageViews = captured.filter((e) => e.event_type === 'page_view');
    expect(pageViews).toHaveLength(1);

    // With the fix, ensureSession() probes sessionStorage up front and returns
    // null when it is unavailable, so track() sends the page_view with NO
    // session_id attached and emits no session_start bookend.
    expect(pageViews[0]).not.toHaveProperty('session_id');
    const starts = captured.filter((e) => e.event_type === 'session_start');
    expect(starts).toHaveLength(0);
});
