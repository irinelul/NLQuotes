// In-house privacy-friendly analytics client.
// No cookies, no persistent cross-site identifiers — the server derives an
// anonymous, daily-rotating visitor hash. This module only ships the event
// itself, plus an *ephemeral* per-tab session id (sessionStorage) so the server
// can stitch a visitor's journey (session_start → activity → session_end).
// Respects the privacy-page opt-out (localStorage 'analytics_opt_out'),
// Do Not Track, and Global Privacy Control.

export function isOptedOut() {
    try {
        if (localStorage.getItem('analytics_opt_out') === 'true') return true;
    } catch {
        // localStorage unavailable (private mode etc.) — fall through
    }
    if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || window.doNotTrack === '1') return true;
    if (navigator.globalPrivacyControl === true) return true;
    return false;
}

// Extra headers for API calls so server-side logging honors the opt-out too.
export function analyticsHeaders() {
    return isOptedOut() ? { 'X-NLQ-Opt-Out': '1' } : {};
}

// ---------------------------------------------------------------------------
// Session journey tracking
// ---------------------------------------------------------------------------
// A "session" is an uninterrupted run of activity in a single tab. We rotate
// when 30 minutes pass with no event. The id + start/last timestamps live in
// sessionStorage (cleared when the tab closes), and every event — including the
// session_start/session_end bookends — flows through track(), so opt-out is
// honoured automatically.

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const KEY_SID = 'nlq_sid';     // current session id (UUID)
const KEY_START = 'nlq_start'; // session start epoch ms
const KEY_LAST = 'nlq_last';   // last activity epoch ms

// Module-level guards:
//  - startedSid:    the session id we've already emitted session_start for.
//  - exitSent:      ensures at most one session_end per session.
//  - listenersRegistered: registers unload listeners at most once.
let startedSid = null;
let exitSent = false;
let listenersRegistered = false;

// Pure, browser-free helper so the rotation rule can be unit-tested directly.
// Rotates when the last activity is unknown/invalid OR older than the timeout.
export function shouldRotateSession(lastActivityMs, nowMs, timeoutMs = SESSION_TIMEOUT_MS) {
    if (typeof lastActivityMs !== 'number' || Number.isNaN(lastActivityMs)) return true;
    return nowMs - lastActivityMs > timeoutMs;
}

// sessionStorage accessors — every call is defensive. In private mode (or when
// storage is disabled) they no-op / return null, so the session layer degrades
// silently and track() keeps working with no session_id attached.
function ssGet(key) {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}
function ssGetNum(key) {
    const v = ssGet(key);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function ssSet(key, value) {
    try {
        sessionStorage.setItem(key, String(value));
    } catch {
        // sessionStorage unavailable (private mode) — degrade silently
    }
}

function makeSid() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // fall through to a compact manual fallback
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// Read (or create/rotate) the current session and refresh nlq_last. Returns
// { sid, start } for the live session, or null when storage is unavailable.
function ensureSession() {
    // If sessionStorage is unavailable (private mode / disabled), do not mint
    // a sid — track() then sends events with no session_id rather than a fresh
    // unique id per event (which would shred session stitching).
    try {
        sessionStorage.setItem('__nlq_probe', '1');
        sessionStorage.removeItem('__nlq_probe');
    } catch {
        return null;
    }
    const now = Date.now();
    const last = ssGetNum(KEY_LAST);
    let sid = ssGet(KEY_SID);

    if (shouldRotateSession(last, now, SESSION_TIMEOUT_MS) || !sid) {
        // First activity in this tab, or the previous session went stale —
        // mint a fresh id and reset both timestamps.
        sid = makeSid();
        ssSet(KEY_SID, sid);
        ssSet(KEY_START, now);
    }
    ssSet(KEY_LAST, now);

    if (!sid) return null; // storage unavailable → no session_id
    return { sid, start: ssGetNum(KEY_START) || now };
}

// Fires the single session_end beacon for the current session. Reads the stored
// id/start directly (without rotating) so the duration reflects the session
// that actually ran. Goes through track() so opt-out + sendBeacon are reused.
function sendExit() {
    if (exitSent) return;
    exitSent = true;
    try {
        const sid = ssGet(KEY_SID);
        if (!sid) return;
        const start = ssGetNum(KEY_START) || Date.now();
        track('session_end', {
            session_id: sid,
            path: window.location.pathname,
            session_duration_ms: Date.now() - start,
        }, { skipSession: true });
    } catch {
        // never break on unload
    }
}

// Register unload listeners exactly once, only when not opted out.
function registerExitListeners() {
    if (listenersRegistered) return;
    try {
        if (isOptedOut()) return;
        listenersRegistered = true;
        // pagehide covers tab close / navigation. Skip bfcache restores so
        // navigating back-and-forth does not look like the session ended.
        window.addEventListener('pagehide', (event) => {
            if (event.persisted) return;
            sendExit();
        });
        // visibilitychange→hidden covers backgrounding + mobile tab switch,
        // which is often the only reliable unload signal on mobile. Coming
        // BACK re-arms the exit beacon: without this, a session that survives
        // a backgrounding would never emit another session_end, freezing its
        // recorded duration at the first hide. Dashboards take the max
        // session_duration_ms per session_id, so re-sends only improve it.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                sendExit();
            } else if (document.visibilityState === 'visible') {
                exitSent = false;
            }
        });
    } catch {
        // analytics must never break the UI
    }
}

// Register the exit listeners on first import (guarded, opt-out aware).
registerExitListeners();

export function track(eventType, fields = {}, opts = {}) {
    if (isOptedOut()) return;
    const { skipSession = false } = opts;

    // --- session lifecycle: rotate when stale, emit session_start once ---
    let session = null;
    if (!skipSession) {
        try {
            session = ensureSession();
            if (session && startedSid !== session.sid) {
                // Mark this session as "started" BEFORE the recursive call so the
                // re-entrant track('session_start') does not loop.
                startedSid = session.sid;
                exitSent = false; // FIX #2: a fresh session may emit its own session_end
                track('session_start', { session_id: session.sid }, { skipSession: true });
            }
        } catch {
            // session logic must never block the real event
        }
    }

    const payload = {
        event_type: eventType,
        path: window.location.pathname,
        referrer: document.referrer || null,
        screen_width: window.screen?.width,
        screen_height: window.screen?.height,
        ...fields,
    };
    // Attach the live session id to every payload (activity + bookends).
    if (session) payload.session_id = session.sid;

    try {
        const body = JSON.stringify(payload);
        // sendBeacon survives page unloads (youtube_open, tweet_share, ...)
        if (navigator.sendBeacon) {
            const ok = navigator.sendBeacon('/api/ev', new Blob([body], { type: 'application/json' }));
            if (ok) return;
        }
        fetch('/api/ev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => {});
    } catch {
        // Analytics must never break the UI.
    }
}
