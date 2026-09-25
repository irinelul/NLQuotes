// Turn an API failure into a user-facing sentence that says what actually
// happened and what to do about it, instead of a generic "unable to connect".
//
// `action` is the verb phrase for what failed, e.g. 'search', 'load quotes
// for this topic', 'send your report' — it gets spliced into the message.
//
// Works with axios errors (error.response / error.request / error.code) and
// plain fetch flows (attach the HTTP status as error.status before throwing).
export function describeApiError(error, action = 'talk to the server') {
    const data = error?.response?.data;
    const serverMessage = typeof data?.message === 'string' ? data.message : null;

    switch (classifyApiError(error)) {
        // Rate limited — the one case where retrying immediately makes it worse.
        case 'rate_limited':
            return "Slow down a little — you've hit the per-minute request limit. Wait a few seconds and try again.";
        // Request rejected as invalid: the server's reason is the useful part.
        case 'bad_request':
            return serverMessage || data?.error
                || `The server rejected the request while trying to ${action}. Check your input and try again.`;
        case 'timeout':
            return serverMessage
                || `The server took too long to ${action} — it may be busy right now. Try again in a moment.`;
        case 'server_error':
            return serverMessage
                || `The server hit an internal error while trying to ${action}. Try again in a moment.`;
        case 'network':
            return `Couldn't reach the server to ${action} — check your connection and try again.`;
        default:
            return `Something went wrong while trying to ${action}. Please try again.`;
    }
}

// The same failure buckets as a short code, for analytics (search_error.kind).
export function classifyApiError(error) {
    const status = error?.response?.status ?? error?.status ?? null;
    if (status === 429) return 'rate_limited';
    if (status === 400) return 'bad_request';
    // Timed out — either the server cancelled a slow query (504) or the
    // client-side axios timeout fired before any response arrived.
    if (status === 504 || error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) return 'timeout';
    if (status >= 500) return 'server_error';
    // Request never got a response: offline, DNS, server down. Axios sets
    // error.request; fetch throws a TypeError.
    if ((error?.request && !error?.response) || error instanceof TypeError) return 'network';
    return 'other';
}
