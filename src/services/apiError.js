// Turn an API failure into a user-facing sentence that says what actually
// happened and what to do about it, instead of a generic "unable to connect".
//
// `action` is the verb phrase for what failed, e.g. 'search', 'load quotes
// for this topic', 'send your report' — it gets spliced into the message.
//
// Works with axios errors (error.response / error.request / error.code) and
// plain fetch flows (attach the HTTP status as error.status before throwing).
export function describeApiError(error, action = 'talk to the server') {
    const status = error?.response?.status ?? error?.status ?? null;
    const data = error?.response?.data;
    const serverMessage = typeof data?.message === 'string' ? data.message : null;

    // Rate limited — the one case where retrying immediately makes it worse.
    if (status === 429) {
        return "Slow down a little — you've hit the per-minute request limit. Wait a few seconds and try again.";
    }

    // Request rejected as invalid: the server's reason is the useful part.
    if (status === 400) {
        return serverMessage || data?.error
            || `The server rejected the request while trying to ${action}. Check your input and try again.`;
    }

    // Timed out — either the server cancelled a slow query (504) or the
    // client-side axios timeout fired before any response arrived.
    if (status === 504 || error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
        return serverMessage
            || `The server took too long to ${action} — it may be busy right now. Try again in a moment.`;
    }

    if (status >= 500) {
        return serverMessage
            || `The server hit an internal error while trying to ${action}. Try again in a moment.`;
    }

    // Request never got a response: offline, DNS, server down. Axios sets
    // error.request; fetch throws a TypeError.
    if ((error?.request && !error?.response) || error instanceof TypeError) {
        return `Couldn't reach the server to ${action} — check your connection and try again.`;
    }

    return `Something went wrong while trying to ${action}. Please try again.`;
}
