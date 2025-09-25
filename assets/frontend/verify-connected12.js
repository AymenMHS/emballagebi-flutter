/* verify-connected.js - diagnostic + restore fallback */
(async function checkAuthAndBindLogout() {
  function safeText(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
  }

  const LOGIN_PATH = (window.FRONTEND_LOGIN && String(window.FRONTEND_LOGIN).trim()) || ((window.FRONTEND_BASE && (window.FRONTEND_BASE + '/login.html')) || (window.location.origin + '/frontend/login.html'));


  const BACKEND_BASE = (window.API_BASE && String(window.API_BASE).replace(/\/+$/, '')) ||
    'https://emballage-b-impression.dz/emballage_bi';

  // helper: build absolute backend url from a relative path
  function backendUrl(p) {
    const path = String(p || '').replace(/^\/+/, '');
    return (BACKEND_BASE.replace(/\/+$/, '') + '/' + path);
  }

  async function doTopLevelLogout() {
    const logoutUrl = backendUrl('auth/logout');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = logoutUrl;
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
  }

  function getCsrfTokenFromMetaOrCookie() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content') || null;
    const name = 'XSRF-TOKEN=';
    const cookie = document.cookie.split('; ').find(c => c.trim().startsWith(name));
    if (cookie) return decodeURIComponent(cookie.split('=')[1] || '');
    return null;
  }

  // fetch helper used by the app (adds Authorization header if possible)
  async function fetchWithCsrf(pathOrUrl, opts = {}) {
    opts = Object.assign({}, opts);
    opts.credentials = opts.credentials || 'include';
    opts.headers = Object.assign({}, opts.headers || {});
    if (!opts.headers['Accept'] && !opts.headers['accept']) opts.headers['Accept'] = 'application/json';

    const token = getCsrfTokenFromMetaOrCookie();
    if (token && !opts.headers['X-CSRF-Token']) opts.headers['X-CSRF-Token'] = token;

    let sessionId = (window.API_SESSION_ID || (typeof localStorage !== 'undefined' && localStorage.getItem('API_SESSION_ID')));
    if (!sessionId) {
      try { sessionId = sessionId || (typeof localStorage !== 'undefined' && localStorage.getItem('API_BEARER_TOKEN')); } catch(e){/*ignore*/}
    }
    if (sessionId && !opts.headers['Authorization'] && !opts.headers['authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + sessionId;
    }

    // build absolute URL using BACKEND_BASE when relative path is provided
    try {
      const p = String(pathOrUrl || '');
      const url = (/^https?:\/\//i.test(p))
        ? p
        : (backendUrl(p));
      if (typeof window.apiFetch === 'function') return window.apiFetch(url, opts);
      return fetch(url, opts);
    } catch (e) {
      return fetch(pathOrUrl, opts);
    }
  }

  // Read persisted token from local static server (absolute base)
  async function readPersistedToken() {
    try {
      const base = (window.FRONTEND_ORIGIN || window.location.origin || 'http://127.0.0.1:5000').replace(/\/+$/, '');
      const url = base + '/__persist_read';
      console.debug('[persist] reading from', url);
      const resp = await fetch(url, { method: 'GET', credentials: 'include' });
      console.debug('[persist] read status', resp.status);
      if (resp && resp.status === 200) {
        const tok = (await resp.text()).trim();
        console.debug('[persist] token length', tok ? tok.length : 0);
        return tok || null;
      }
      return null;
    } catch (e) {
      console.debug('[persist] read error', e);
      return null;
    }
  }

  // Try restore token server-side using /auth/restore?token=... (no navigation)
  async function tryServerRestore(token) {
    try {
      if (!token) return false;
      const url = backendUrl('auth/restore') + '?token=' + encodeURIComponent(token);
      console.debug('[restore] calling', url);
      const r = await fetch(url, { method: 'GET', credentials: 'include' });
      console.debug('[restore] status', r.status);
      // try to read any informative body
      let body = null;
      try { body = await r.text(); } catch (e) { body = null; }
      console.debug('[restore] body (truncated)', typeof body === 'string' ? body.slice(0, 400) : body);
      return r.ok;
    } catch (e) {
      console.debug('[restore] error', e);
      return false;
    }
  }

  // Primary auth check flow
  try {
    // 1) try to load persisted token (file)
    const persisted = await readPersistedToken();
    if (persisted) {
      window.API_SESSION_ID = persisted;
      try { localStorage.setItem('API_SESSION_ID', persisted); } catch (e) { /* ignore */ }
      console.debug('[auth] loaded persisted token into window.API_SESSION_ID');
    } else {
      console.debug('[auth] no persisted token found');
    }

    // 2) call /auth/me using fetchWithCsrf (this will attach Authorization header if token present)
    console.debug('[auth] calling /auth/me');
    let res = await fetchWithCsrf('/auth/me', { method: 'GET' });
    console.debug('[auth] /auth/me status', res && res.status);

    // 3) if 401 and we have a persisted token, try server-side restore then retry /auth/me
    if (res && res.status === 401 && persisted) {
      console.debug('[auth] /auth/me returned 401 — trying server restore with persisted token');
      const okRestore = await tryServerRestore(persisted);
      console.debug('[auth] server restore ok?', okRestore);
      if (okRestore) {
        // after restore, retry /auth/me
        res = await fetchWithCsrf('/auth/me', { method: 'GET' });
        console.debug('[auth] retry /auth/me status', res && res.status);
      }
    }

    // 4) final decision
    if (!res || !res.ok) {
      console.debug('[auth] not authenticated — redirect to login (LOGIN_PATH):', LOGIN_PATH);
      window.location.replace(LOGIN_PATH);
      return;
    }

    // parse user data
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    // set small UI bits (optional)
    const userSpace = document.querySelector('.user-info');
    if (userSpace) {
      const uname = safeText(data.username || data.nom || '');
      const urole = safeText(data.role || '');
      userSpace.title = `${uname}${urole ? ' (' + urole + ')' : ''}`;
    }

    // bind logout handler
    document.addEventListener('DOMContentLoaded', () => {
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.removeEventListener('click', logoutBtn._logoutHandler);
        logoutBtn._logoutHandler = function (ev) {
          ev.preventDefault();
          doTopLevelLogout('POST');
        };
        logoutBtn.addEventListener('click', logoutBtn._logoutHandler);
      } else {
        const alt = Array.from(document.querySelectorAll('a')).find(a => {
          const t = (a.textContent || '').trim().toLowerCase();
          return t.includes('se deconnecter') || t.includes('se déconnecter') || t.includes('déconnexion');
        });
        if (alt) alt.addEventListener('click', (ev) => { ev.preventDefault(); doTopLevelLogout('POST'); });
      }
    });

    console.debug('[auth] authenticated OK — user:', data.username || data.nom || data.id || '(unknown)');
  } catch (err) {
    console.error('[auth] unexpected error', err);
    window.location.replace(LOGIN_PATH);
  }
})();
