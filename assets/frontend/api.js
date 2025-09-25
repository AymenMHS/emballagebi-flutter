// api.js - robustifié pour utiliser backup fetch
(function (global) {
    const TOKEN_KEY = "API_BEARER_TOKEN";

    // --- small fetch backup selection: use explicit backup if present
    const NATIVE_FETCH = (function () {
        if (typeof window !== 'undefined' && window.__API_NATIVE_FETCH_BACKUP) {
            console.debug('[api.js] Using __API_NATIVE_FETCH_BACKUP');
            return window.__API_NATIVE_FETCH_BACKUP;
        }
        // fallback to original global.fetch (bind to global to keep context)
        try {
            return global.fetch.bind(global);
        } catch (e) {
            return function () { return Promise.reject(new Error('no fetch available')); };
        }
    })();

    function setLocalBearer(token) {
        try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); }
        catch (e) { /* storage may be blocked */ }
        global.__API__LOCAL_BEARER = token || null;
    }

    function getLocalBearer() {
        if (global.__API__LOCAL_BEARER !== undefined) return global.__API__LOCAL_BEARER;
        try {
            const t = localStorage.getItem(TOKEN_KEY);
            global.__API__LOCAL_BEARER = t;
            return t;
        } catch (e) { return null; }
    }

    function clearLocalBearer() {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { }
        global.__API__LOCAL_BEARER = null;
    }

    function buildUrl(path) {
        let base = (window.API_BASE && String(window.API_BASE).replace(/\/+$/, '')) || '';

        // meta tag fallback
        if (!base) {
            const m = document.querySelector('meta[name="api-base"]');
            if (m && m.content) base = String(m.content).replace(/\/+$/, '');
        }

        if (!base) {
            try { base = window.location.origin + '/emballage_bi'; } catch (e) { base = ''; }
        }

        // debug: show the base BEFORE any override
        // (useful to inspect if some other code mutated window.API_BASE earlier)
        try {
            const tmp = new URL(base, window.location.origin);
            const host = tmp.hostname;
            if ((host === '127.0.0.1' || host === 'localhost') && window.location.hostname !== host) {
                base = window.location.origin + '/emballage_bi';
                console.warn('[api.buildUrl] runtime base pointed to localhost while page host differs. Forcing base ->', base);
            }
        } catch (e) {
            // ignore
        }

        if (!path) return base || path;
        const p = String(path || '');
        if (p.match(/^https?:\/\//i)) return p;
        const rel = p.startsWith('/') ? p : ('/' + p.replace(/^\/+/, ''));
        const finalUrl = (base ? (base + rel) : rel);

        console.debug('[api.buildUrl] base=', base, ' path=', path, ' ->', finalUrl);
        return finalUrl;
    }

    async function apiFetch(path, opts = {}) {
        opts = Object.assign({}, opts);
        opts.headers = Object.assign({}, opts.headers || {});
        if (!opts.headers['Accept'] && !opts.headers['accept']) opts.headers['Accept'] = 'application/json';
        if (!opts.credentials) opts.credentials = 'include';

        const token = getLocalBearer();
        const url = buildUrl(path);

        console.debug('[api.apiFetch] method=', opts.method || 'GET', ' path=', path, ' ->', url, ' token?', !!token);

        if (token && !opts.headers['Authorization'] && !opts.headers['authorization']) {
            opts.headers['Authorization'] = 'Bearer ' + token;
        }

        // Use the captured native fetch reference to avoid external overrides
        return NATIVE_FETCH(url, opts);
    }

    // monkeypatch global.fetch so relative calls still route through apiFetch
    if (!global._native_fetch) global._native_fetch = NATIVE_FETCH;
    // expose helper to build asset URLs (e.g. storage files)
    global.buildAssetUrl = function (path) {
        if (!path) return '';
        // ensure no leading slash duplication
        const p = String(path).replace(/^\/+/, '');
        // use buildUrl to join with API_BASE: buildUrl('/storage/...') => API_BASE + '/storage/...'
        try {
            return buildUrl('/storage/' + p);
        } catch (e) {
            // fallback similar to earlier
            const base = (window.API_BASE || window.location.origin + '/emballage_bi').replace(/\/+$/, '');
            return (base + '/storage/' + p).replace(/\/{2,}/g, '/');
        }
    };

    global.fetch = function (input, opts) {
        try {
            let url = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
            if (typeof url === 'string' && url.startsWith('/')) {
                return apiFetch(url, opts || {});
            }
            return NATIVE_FETCH(input, opts);
        } catch (e) {
            return Promise.reject(e);
        }
    };

    global.apiFetch = apiFetch;
    global.setLocalBearer = setLocalBearer;
    global.getLocalBearer = getLocalBearer;
    global.clearLocalBearer = clearLocalBearer;
    global.buildApiUrl = buildUrl;

})(window);
