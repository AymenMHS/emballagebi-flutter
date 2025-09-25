/* verify-connected.js - version corrigée */
(async function checkAuthAndBindLogout() {
  function safeText(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
  }

  const LOGIN_PATH = (window.FRONTEND_LOGIN && String(window.FRONTEND_LOGIN).trim()) ||
    (window.location.origin + '/frontend/login.html');

  const BACKEND_BASE = (window.API_BASE && String(window.API_BASE).replace(/\/+$/, '')) ||
    'https://emballage-b-impression.dz/emballage_bi';

  async function doTopLevelLogout() {
    const logoutUrl = BACKEND_BASE + '/auth/logout';
    // try POST top-level to let server clear cookie and redirect
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

  function ensureLocalHttp(base) {
    if (!base) return base;
    try {
      base = String(base).replace(/\/+$/, '');
      if (/^https:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(base)) {
        return base.replace(/^https:\/\//i, 'http://');
      }
    } catch (e) { }
    return base;
  }

  // Remplace la fonction fetchWithCsrf existante par celle-ci dans verify-connected.js
  async function fetchWithCsrf(pathOrUrl, opts = {}) {
    opts = Object.assign({}, opts);
    opts.credentials = opts.credentials || 'include';
    opts.headers = Object.assign({}, opts.headers || {});
    if (!opts.headers['Accept'] && !opts.headers['accept']) opts.headers['Accept'] = 'application/json';

    // CSRF (meta or cookie)
    const token = getCsrfTokenFromMetaOrCookie();
    if (token && !opts.headers['X-CSRF-Token']) opts.headers['X-CSRF-Token'] = token;

    // --- ATTACH SESSION TOKEN IF AVAILABLE (important fix) ---
    // prefer in-memory window var, fallback to localStorage
    let sessionId = (window.API_SESSION_ID || (typeof localStorage !== 'undefined' && localStorage.getItem('API_SESSION_ID')));
    if (!sessionId) {
      // also tolerate older storage key API_BEARER_TOKEN for compatibility (jwt or session)
      try {
        sessionId = sessionId || (typeof localStorage !== 'undefined' && localStorage.getItem('API_BEARER_TOKEN'));
      } catch (e) { /* ignore */ }
    }
    if (sessionId && !opts.headers['Authorization'] && !opts.headers['authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + sessionId;
    }

    // build URL (absolute or with BACKEND_BASE)
    let url = String(pathOrUrl || '');
    if (!/^https?:\/\//i.test(url)) {
      if (BACKEND_BASE) {
        url = ensureLocalHttp(BACKEND_BASE) + '/' + url.replace(/^\/+/, '');
      } else {
        url = url.startsWith('/') ? url : ('/' + url.replace(/^\/+/, ''));
      }
    }

    // Use central apiFetch when available (keeps behaviour consistent)
    if (typeof window.apiFetch === 'function') {
      return window.apiFetch(url, opts);
    }
    return fetch(url, opts);
  }


  // ---------- auth check ----------
  try {
    const res = await fetchWithCsrf('/auth/me', { method: 'GET' });
    if (!res || !res.ok) {
      window.location.replace(LOGIN_PATH);
      return;
    }

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    const userSpace = document.querySelector('.user-info');
    if (userSpace) {
      const uname = safeText(data.username || data.nom || '');
      const urole = safeText(data.role || '');
      userSpace.title = `${uname}${urole ? ' (' + urole + ')' : ''}`;
    }

    // ---------- bind logout ----------
    document.addEventListener('DOMContentLoaded', () => {
      const logoutBtn = document.getElementById('logoutBtn');

      if (logoutBtn) {
        // Eviter d'ajouter plusieurs handlers si script est exécuté plusieurs fois
        logoutBtn.removeEventListener('click', logoutBtn._logoutHandler);
        logoutBtn._logoutHandler = function (ev) {
          ev.preventDefault();
          // Option : tu peux forcer 'GET' ou 'POST' en passant un param
          doTopLevelLogout('POST');
        };
        logoutBtn.addEventListener('click', logoutBtn._logoutHandler);
      } else {
        // Option tolérante : rechercher un lien textuel "se deconnecter"
        const alt = Array.from(document.querySelectorAll('a')).find(a => {
          const t = (a.textContent || '').trim().toLowerCase();
          return t.includes('se deconnecter') || t.includes('se déconnecter') || t.includes('déconnexion');
        });
        if (alt) {
          alt.addEventListener('click', (ev) => { ev.preventDefault(); doTopLevelLogout('POST'); });
        } else {
          console.warn('logoutBtn introuvable — ajoute id="logoutBtn" à ton <a> ou <button>');
        }
      }
    });


  } catch (err) {
    console.error('auth check error', err);
    window.location.replace(LOGIN_PATH);
  }
})();
