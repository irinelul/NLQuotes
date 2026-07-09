// In-house privacy-friendly analytics client.
// No cookies, no localStorage identifiers — the server derives an anonymous,
// daily-rotating visitor hash. This module only ships the event itself.
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

export function track(eventType, fields = {}) {
    if (isOptedOut()) return;

    const payload = {
        event_type: eventType,
        path: window.location.pathname,
        referrer: document.referrer || null,
        screen_width: window.screen?.width,
        screen_height: window.screen?.height,
        ...fields,
    };

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
