// frontend/list_conceptions.optimized.js
// VERSION MODIFIÉE — ouverture / téléchargement via navigateur externe si possible
// Corrigé pour structure de stockage : storage/conception/{client}/{produit}/{fichiers}

document.addEventListener('DOMContentLoaded', () => {
  const API_PREFIX = '/api/conception';

  function _buildApiUrlFallback(path) {
    // path attendu avec un slash initial, ex: '/api/conception/...'
    try {
      if (typeof window.buildApiUrl === 'function') {
        // buildApiUrl simule api.buildUrl fourni par api.js
        return window.buildApiUrl(path);
      }
    } catch (e) {
      // ignore et fallback
    }

    // fallback sur window.API_BASE ou location origin
    const base = (window.API_BASE || (window.location.origin + '/emballage_bi')).replace(/\/+$/, '');
    return base + (path.startsWith('/') ? path : ('/' + path));
  }
  const container = document.querySelector('.container-new-plaque');
  if (!container) return console.error('container .container-new-plaque introuvable');

  // --- UI refs (cached once) ---
  const searchInput = container.querySelector('#searchInput');
  const tbody = container.querySelector('.table .tbody');
  const headerCountP = container.querySelector('.title-table p');
  const headerTitleH1 = container.querySelector('.title-table h1');
  const paginationContainer = container.querySelector('.pagination-products .pages-pagination');
  const sortSelect = container.querySelector('.triage-table select');

  // selects natifs (restent en DB, hidden by CSS)
  const nativeClientSelect = container.querySelector('#select-client');
  const nativeProductSelect = container.querySelector('#select-produit');

  // fallback anciens selects si présents
  const filterSelects = Array.from(container.querySelectorAll('.filter-all-product select')).filter(s => s);
  const clientSelect = nativeClientSelect || filterSelects[0] || null;
  const productSelect = nativeProductSelect || filterSelects[1] || filterSelects[0] || null;

  // ---- état central ----
  const state = {
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 1,
    search: '',
    client: clientSelect ? clientSelect.value : '',
    produit: productSelect ? productSelect.value : '',
    sort: 'date_desc', // default: Plus récent -> Plus ancien
    rows: [] // objets bruts renvoyés par l'API (ne pas mettre DOM dedans)
  };

  // map id -> metadata (cache DOM nodes & flags) pour éviter querySelector répétés
  const rowMap = new Map();

  // caches pour selects
  let clientsLoaded = false;
  let produitsLoaded = false;
  let clientsCache = [];
  let produitsCache = [];

  const defaultThumb = '../img/icon/personnalisation.png';

  function ensureNotificationStyle() {
    if (document.getElementById('custom-notification-styles')) return;
    const css = `
      .custom-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 22px;
        border-radius: 6px;
        color: #fff;
        z-index: 10000;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        min-width: 260px;
        max-width: calc(100vw - 40px);
        word-break: break-word;
      }
      .custom-notification.success { background-color: #4CAF50; border-left: 6px solid #2E7D32; }
      .custom-notification.error   { background-color: #F44336; border-left: 6px solid #C62828; }
      .custom-notification .notification-icon { font-size: 20px; line-height: 1; }
      .custom-notification .notification-content { flex: 1; font-size: 14px; }
      .custom-notification .notification-close {
        cursor: pointer;
        opacity: 0.9;
        font-weight: 700;
        padding-left: 8px;
      }

      @keyframes cn-slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }
      @keyframes cn-fadeOut {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'custom-notification-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Main function
  function showNotification(message, isSuccess = true, options = {}) {
    ensureNotificationStyle();

    const opts = {
      duration: typeof options.duration === 'number' ? options.duration : 3500, // ms
      stack: options.stack === true, // allow stacking if true
      icon: options.icon !== false, // show icon by default
      onClose: typeof options.onClose === 'function' ? options.onClose : null
    };

    // Clamp minimum duration to allow animations
    const slideInMs = 300;
    const fadeOutMs = 500;
    if (opts.duration < slideInMs + 100) opts.duration = slideInMs + 100 + fadeOutMs;

    // Container for stacking notifications (created on demand)
    let container = document.getElementById('custom-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'custom-notification-container';
      // container uses no special CSS; notifications position themselves fixed
      document.body.appendChild(container);
    }

    // If stacking disabled, remove existing notifications
    if (!opts.stack) {
      const existing = document.querySelectorAll('.custom-notification');
      existing.forEach(n => n.remove());
    }

    const notification = document.createElement('div');
    notification.className = 'custom-notification ' + (isSuccess ? 'success' : 'error');
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');

    // Icon + content + close
    const iconSpan = document.createElement('span');
    iconSpan.className = 'notification-icon';
    iconSpan.textContent = opts.icon ? (isSuccess ? '✓' : '✕') : '';

    const content = document.createElement('div');
    content.className = 'notification-content';
    // allow HTML in message if string contains tags; be careful with user input in real apps
    content.innerHTML = String(message);

    const close = document.createElement('span');
    close.className = 'notification-close';
    close.setAttribute('title', 'Fermer');
    close.textContent = '×';

    // click to close
    close.addEventListener('click', removeNow);
    notification.addEventListener('click', (e) => {
      // clicking content won't close unless user clicked the close button
      if (e.target === notification) removeNow();
    });

    notification.appendChild(iconSpan);
    notification.appendChild(content);
    notification.appendChild(close);

    // Append to body (keeps same behaviour as original: fixed top-right)
    document.body.appendChild(notification);

    // Set animation timings via inline style (so duration can be dynamic)
    const totalMs = opts.duration;
    const fadeDelayMs = Math.max(0, totalMs - fadeOutMs);
    notification.style.animation = `cn-slideIn ${slideInMs / 1000}s forwards, cn-fadeOut ${fadeOutMs / 1000}s forwards ${fadeDelayMs / 1000}s`;

    // Auto remove after total duration plus a small buffer
    const removeTimeout = setTimeout(() => {
      removeNow();
    }, totalMs + 50);

    // Dismiss function
    function removeNow() {
      clearTimeout(removeTimeout);
      // If already removed, nothing to do
      if (!notification.parentNode) return;
      // Fade out quickly if needed, then remove
      notification.style.pointerEvents = 'none';
      // apply short fade to avoid abrupt disappearance if user closes early
      notification.style.transition = 'opacity 160ms linear, transform 160ms linear';
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(20px)';
      setTimeout(() => {
        if (notification.parentNode) notification.parentNode.removeChild(notification);
        if (opts.onClose) try { opts.onClose(); } catch (e) { /* ignore */ }
      }, 180);
    }

    // Return an object to allow manual closing
    return {
      close: removeNow,
      node: notification
    };
  }

  // Keep old editClient function available
  window.editClient = function (clientId) {
    console.log('Edit client:', clientId);
    // Implémente ici ta logique d'édition si besoin
    // Exemple : window.location.href = `editclient.html?id=${clientId}`;
  };

  // Remplace tout les alert par un appel a showNotification
  window.alert = function (message) {
    showNotification(message, false);
  };

  // expose showNotification globally
  window.showNotification = showNotification;

  // --- tri client (fallback si l'API ne trie pas) ---
  function applyClientSort(rows) {
    if (!Array.isArray(rows)) return rows || [];
    const copy = rows.slice();
    if (state.sort === 'date_desc') {
      copy.sort((a, b) => (Date.parse(b.date_creation) || 0) - (Date.parse(a.date_creation) || 0));
    } else if (state.sort === 'date_asc') {
      copy.sort((a, b) => (Date.parse(a.date_creation) || 0) - (Date.parse(b.date_creation) || 0));
    }
    return copy;
  }

  // --- small helpers ---
  const escapeHtml = s => {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const debounce = (fn, wait = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };

  // ---- robust helpers pour extraire id/nom et filtrage côté client ----
  function getFirstString(item, keys = []) {
    if (!item) return '';
    for (let k of keys) {
      if (!k) continue;
      // support nested like 'client.id' if needed
      if (k.includes('.')) {
        const parts = k.split('.');
        let val = item;
        for (let p of parts) {
          if (val == null) break;
          val = val[p];
        }
        if (val !== undefined && val !== null && String(val) !== '') return String(val);
      } else {
        const v = item[k];
        if (v !== undefined && v !== null && String(v) !== '') return String(v);
      }
    }
    return '';
  }

  // NEW: resolve consernes -> names using caches (clientsCache / produitsCache)
  function resolveConsernesNames(item) {
    // returns { clientNames: [], produitNames: [] }
    const clientNames = [];
    const produitNames = [];
    if (Array.isArray(item.consernes) && item.consernes.length > 0) {
      for (const e of item.consernes) {
        const cid = String(e.id_client || e.client || e.id || e.idClient || '');
        const pid = String(e.id_produit || e.produit || e.id || e.idProduit || '');
        // resolve client name
        let cname = '';
        if (clientsCache && clientsCache.length > 0) {
          const found = clientsCache.find(c => String(c.id_client || c.id || c._id || c.uuid || '') === cid);
          if (found) cname = found.enseigne || found.name || found.nom || String(found.id_client || found.id || cid);
        }
        if (!cname) {
          // fallback to any enseigne present in item (rare)
          cname = (e.enseigne || e.client_enseigne || '') || cid;
        }
        if (cname && !clientNames.includes(cname)) clientNames.push(cname);

        // resolve produit name
        let pname = '';
        if (produitsCache && produitsCache.length > 0) {
          const foundp = produitsCache.find(p => String(p.id_produit || p.id || p._id || p.uuid || '') === pid);
          if (foundp) pname = foundp.nom_produit || foundp.nom || foundp.name || String(foundp.id_produit || foundp.id || pid);
        }
        if (!pname) {
          pname = (e.produit_nom || e.nom_produit || '') || pid;
        }
        if (pname && !produitNames.includes(pname)) produitNames.push(pname);
      }
    } else {
      // fallback: try direct fields on item
      const c = item.client_enseigne || item.enseigne || getFirstString(item, ['client_enseigne', 'client', 'client.name', 'client.nom']);
      const p = item.produit_nom || item.nom_produit || getFirstString(item, ['produit_nom', 'produit', 'produit.name', 'produit.nom']);
      if (c) clientNames.push(c);
      if (p) produitNames.push(p);
    }
    return { clientNames, produitNames };
  }

  // helper to render compact list with +N and title tooltip
  function compactListHtml(names = [], maxVisible = 2) {
    if (!Array.isArray(names) || names.length === 0) return '—';
    if (names.length <= maxVisible) {
      return escapeHtml(names.join(', '));
    }
    const visible = names.slice(0, maxVisible).map(escapeHtml).join(', ');
    const more = names.length - maxVisible;
    const title = escapeHtml(names.join(', '));
    return `${visible} <span class="more-badge" title="${title}">+${more}</span>`;
  }

  function matchesFilters(item, clientFilter, produitFilter, nomFilter) {
    // normalisation
    const cf = (clientFilter || '').toString().trim();
    const pf = (produitFilter || '').toString().trim();
    const nf = (nomFilter || '').toString().trim().toLowerCase();

    // get resolved names arrays (cached on item if available)
    let clientNames = item._client_names || [];
    let produitNames = item._produit_names || [];

    // if not present, compute quickly without waiting for caches (best-effort)
    if ((!clientNames || clientNames.length === 0) && Array.isArray(item.consernes) && item.consernes.length > 0) {
      const r = resolveConsernesNames(item);
      clientNames = r.clientNames || [];
      produitNames = r.produitNames || [];
      // store for subsequent calls
      item._client_names = clientNames;
      item._produit_names = produitNames;
    }

    // also include primary strings as fallback
    const primaryClient = (item.client_enseigne || item.enseigne || '').toString();
    if (primaryClient && !clientNames.includes(primaryClient)) clientNames.push(primaryClient);
    const primaryProd = (item.produit_nom || item.nom_produit || '').toString();
    if (primaryProd && !produitNames.includes(primaryProd)) produitNames.push(primaryProd);

    // check client filter (si présent)
    if (cf) {
      const matchIdOrLabel = clientNames.some(c => {
        if (!c) return false;
        return (c === cf) || (c.toLowerCase().includes(cf.toLowerCase()));
      });
      if (!matchIdOrLabel) {
        // also try matching against possible id fields inside consernes
        if (Array.isArray(item.consernes) && item.consernes.length > 0) {
          const matchById = item.consernes.some(e => {
            const cid = String(e.id_client || e.client || '');
            return cid === cf;
          });
          if (!matchById) return false;
        } else {
          return false;
        }
      }
    }

    // check produit filter (si présent)
    if (pf) {
      const matchIdOrLabel = produitNames.some(p => {
        if (!p) return false;
        return (p === pf) || (p.toLowerCase().includes(pf.toLowerCase()));
      });
      if (!matchIdOrLabel) {
        if (Array.isArray(item.consernes) && item.consernes.length > 0) {
          const matchById = item.consernes.some(e => {
            const pid = String(e.id_produit || e.produit || '');
            return pid === pf;
          });
          if (!matchById) return false;
        } else {
          return false;
        }
      }
    }

    // check nom (recherche texte sur nom conception / produit)
    if (nf) {
      const noms = [
        (item.nom_conception || item.nom || item.name || '').toString().toLowerCase(),
        (primaryProd || '').toString().toLowerCase(),
        (clientNames || []).join(' ').toLowerCase(),
        (produitNames || []).join(' ').toLowerCase()
      ].join(' ');
      if (!noms.includes(nf)) return false;
    }

    return true;
  }

  let currentListAbortController = null;

  async function apiGet(path, opts = {}) {
    // path ici est attendu comme '/...' (ex: '/clients' ou '/?skip=0...')
    const normalized = (path && path.startsWith('/')) ? path : ('/' + String(path || '').replace(/^\/+/, ''));

    // Si window.apiFetch existe, on l'utilise mais on gère plusieurs retours possibles
    try {
      if (typeof window.apiFetch === 'function') {
        try {
          const callArg = API_PREFIX + normalized;
          console.debug('[apiGet] using window.apiFetch ->', callArg, opts);
          const maybeRes = await window.apiFetch(callArg, opts);

          // if apiFetch returned a Fetch Response-like object, parse JSON
          if (maybeRes && typeof maybeRes === 'object' && typeof maybeRes.json === 'function') {
            const parsed = await maybeRes.json().catch(() => null);
            console.debug('[apiGet] apiFetch returned Response -> parsed JSON:', parsed);
            return parsed;
          }

          // if apiFetch returned already parsed JSON (common), just return it
          console.debug('[apiGet] apiFetch returned object:', maybeRes);
          return maybeRes;
        } catch (err) {
          console.warn('[apiGet] window.apiFetch threw, falling back to fetch():', err);
          // fallthrough to native fetch branch below
        }
      }

      // fallback: use build url + fetch
      const url = _buildApiUrlFallback(API_PREFIX + normalized);
      console.debug('[apiGet] using fetch() ->', url, opts);
      const finalOpts = Object.assign({ credentials: 'include' }, opts);
      const res = await fetch(url, finalOpts);

      // si la réponse n'est pas ok -> essayer de lire le body et throw
      if (!res.ok) {
        const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        let txt = '';
        if (ct && ct.includes('application/json')) {
          const j = await res.json().catch(() => null);
          txt = j && j.detail ? j.detail : JSON.stringify(j || {});
        } else {
          txt = await res.text().catch(() => '');
        }
        const err = new Error(`${res.status} ${res.statusText} ${txt}`);
        err.status = res.status;
        throw err;
      }

      // si content-type JSON -> parse et renvoyer, sinon renvoyer null
      const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (ct.includes('application/json')) {
        const j = await res.json().catch(() => null);
        console.debug('[apiGet] fetch() parsed JSON ->', j);
        return j;
      } else {
        console.debug('[apiGet] fetch() returned non-json, returning null');
        return null;
      }
    } catch (err) {
      console.error('API GET error', API_PREFIX + normalized, err);
      throw err;
    }
  }

  async function apiDelete(path) {
    const normalized = (path && path.startsWith('/')) ? path : ('/' + String(path || '').replace(/^\/+/, ''));
    try {
      if (typeof window.apiFetch === 'function') {
        // use apiFetch with DELETE
        return await window.apiFetch(API_PREFIX + normalized, { method: 'DELETE' });
      }
      const url = _buildApiUrlFallback(API_PREFIX + normalized);
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText} ${txt}`);
      }
      return true;
    } catch (err) {
      console.error('API DELETE error', API_PREFIX + normalized, err);
      throw err;
    }
  }

  /**
   * Convertit un storage_path (tel que renvoyé par le backend) en URL utilisable par le navigateur.
   * Gestion robuste :
   *  - accepte des URLs complètes (http(s)://...)
   *  - accepte chemins Windows ou Linux (remplace backslash par slash)
   *  - recherche "storage/conception/..." ou "conception/..." dans le chemin et retourne "/storage/..."
   *  - encode correctement les composants pour permettre l'ouverture/download
   *  - renvoie null si impossible de dériver une URL
   */
  function filePathToUrl(storage_path) {
    if (!storage_path) return null;
    // si c'est déjà une URL absolue, retourne tel quel
    if (/^https?:\/\//i.test(storage_path)) return storage_path;

    // normalise séparateurs
    let p = String(storage_path).replace(/\\/g, '/').trim();

    // cas déjà stocké en "storage/..." ou "/storage/..."
    if (p.startsWith('storage/')) return encodeURI('/' + p);
    if (p.startsWith('/storage/')) return encodeURI(p);

    // cas attendu: "conception/..." ou "/conception/..."
    if (p.startsWith('conception/')) return encodeURI('/storage/' + p);
    if (p.startsWith('/conception/')) return encodeURI('/storage' + p);

    // ancien fallback pour SOURCE (si tu as encore certains chemins legacy)
    const idx = p.indexOf('/SOURCE/');
    if (idx !== -1) return encodeURI(p.substring(idx));
    const idx2 = p.indexOf('SOURCE/');
    if (idx2 !== -1) return encodeURI('/' + p.substring(idx2));
    if (p.startsWith('SOURCE/')) return encodeURI('/' + p);

    // dernier fallback : préfixe storage si rien d'autre convenable
    return encodeURI('/storage/' + p.replace(/^\//, ''));
  }

  // --- OUVRIR DANS LE NAVIGATEUR EXTERNE (tentatives multiples) ---
  async function openInExternalBrowser(url, suggestedFilename) {
    try {
      // 1) Electron (si present)
      try {
        if (window.require) {
          const electron = window.require('electron');
          if (electron && electron.shell && typeof electron.shell.openExternal === 'function') {
            electron.shell.openExternal(url);
            return true;
          }
        }
      } catch (e) {
        // ignore
      }

      // 2) pywebview common patterns
      if (window.pywebview) {
        try {
          if (typeof window.pywebview.open === 'function') {
            window.pywebview.open(url);
            return true;
          }
          if (window.pywebview.api && typeof window.pywebview.api.open_url === 'function') {
            window.pywebview.api.open_url(url);
            return true;
          }
        } catch (e) {
          // ignore
        }
      }

      // 3) window.external.invoke (certaines versions webview)
      if (window.external && typeof window.external.invoke === 'function') {
        try {
          window.external.invoke(url);
          return true;
        } catch (e) { }
      }

      // 4) window.open (ouvre un nouvel onglet/fenêtre)
      try {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (win) {
          try { win.opener = null; } catch (e) { }
          return true;
        }
      } catch (e) {
        // ignore
      }

      // 5) fallback créant un <a target="_blank"> cliquable
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (suggestedFilename) a.download = suggestedFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      } catch (e) {
        console.error('fallback anchor open failed', e);
      }

      return false;
    } catch (err) {
      console.error('openInExternalBrowser error', err);
      return false;
    }
  }

  // ---- pagination compatible (ancienne route /list?skip=...&limit=...) ----
  async function fetchPage(page = 1, per_page = 10, filters = {}) {
    // cancel previous
    if (currentListAbortController) {
      try { currentListAbortController.abort(); } catch (e) { /* ignore */ }
    }
    currentListAbortController = new AbortController();
    const signal = currentListAbortController.signal;

    const skip = (Math.max(1, page) - 1) * per_page;
    const params = new URLSearchParams();
    params.append('skip', String(skip));
    params.append('limit', String(per_page));
    if (filters.client) params.append('client', filters.client);
    if (filters.produit) params.append('produit', filters.produit);
    if (filters.nom) params.append('nom', filters.nom);
    if (filters.sort) params.append('sort', filters.sort);

    const path = `/?${params.toString()}`;
    try {
      const data = await apiGet(path, { signal });
      let rows = [], total = 0, total_pages = 1;

      if (!data) {
        rows = [];
      } else if (Array.isArray(data)) {
        rows = data;
        total = data.length;
        total_pages = Math.max(1, Math.ceil(total / per_page));
      } else if (typeof data === 'object') {
        // accept either items or conceptions
        rows = Array.isArray(data.items) ? data.items : (Array.isArray(data.conceptions) ? data.conceptions : []);
        // server returns total number after applying filters
        total = (typeof data.total === 'number') ? data.total : rows.length;
        total_pages = Math.max(1, Math.ceil(total / per_page));
      }

      // Ensure we clean abort controller only if it's the current one (avoid race)
      if (currentListAbortController && currentListAbortController.signal === signal) {
        currentListAbortController = null;
      }

      return { rows, total, total_pages };
    } catch (err) {
      if (err.name === 'AbortError') {
        // request cancelled — propagate a controlled error so caller can ignore
        const e = new Error('Request aborted');
        e.name = 'AbortError';
        throw e;
      }
      console.error('fetchPage error', err);
      throw err;
    }
  }

  async function fetchDetails(id) {
    try {
      return await apiGet(`/${encodeURIComponent(id)}`);
    } catch (err) {
      console.error('fetchDetails error', err);
      return null;
    }
  }

  async function deleteConception(id) {
    try {
      await apiDelete(`/${encodeURIComponent(id)}`);
      return true;
    } catch (err) {
      console.error('deleteConception error', err);
      return false;
    }
  }

  // ---- lazy load des options (clients / produits) ----
  async function loadClients() {
    if (clientsLoaded) return clientsCache;
    try {
      const clients = await apiGet('/clients').catch(() => []);
      clientsCache = Array.isArray(clients) ? clients : [];
      clientsLoaded = true;
      if (clientSelect) {
        const frag = document.createDocumentFragment();
        const first = document.createElement('option'); first.value = ''; first.textContent = '--Selectionnez un Client--';
        frag.appendChild(first);
        clientsCache.forEach(c => {
          const opt = document.createElement('option');
          opt.value = (c && (c.id_client || c.id || c._id || c.uuid || c.idClient)) ? String(c.id_client || c.id || c._id || c.uuid || c.idClient) : '';
          opt.textContent = c.enseigne || c.name || c.nom || c.enseigne_commerciale || '';
          frag.appendChild(opt);
        });
        clientSelect.innerHTML = '';
        clientSelect.appendChild(frag);
        if (state.client) clientSelect.value = state.client;
      }
      return clientsCache;
    } catch (err) {
      console.warn('loadClients warning', err);
      return [];
    }
  }
  async function loadProduits() {
    if (produitsLoaded) return produitsCache;
    try {
      const produits = await apiGet('/produits').catch(() => []);
      produitsCache = Array.isArray(produits) ? produits : [];
      produitsLoaded = true;
      if (productSelect) {
        const frag = document.createDocumentFragment();
        const first = document.createElement('option'); first.value = ''; first.textContent = '--Selectionnez un Produit--';
        frag.appendChild(first);
        produitsCache.forEach(p => {
          const opt = document.createElement('option');
          opt.value = (p && (p.id_produit || p.id || p._id || p.uuid || p.idProduit)) ? String(p.id_produit || p.id || p._id || p.uuid || p.idProduit) : '';
          opt.textContent = p.nom_produit || p.nom || p.name || '';
          frag.appendChild(opt);
        });
        productSelect.innerHTML = '';
        productSelect.appendChild(frag);
        if (state.produit) productSelect.value = state.produit;
      }
      return produitsCache;
    } catch (err) {
      console.warn('loadProduits warning', err);
      return [];
    }
  }

  // ---- Fancy Select creation (inchangé fonctionnellement, mais on évite reflows inutiles) ----
  const fancyInstances = new WeakMap();
  let currentlyOpen = null;

  function createFancySelect(containerEl, type) {
    if (!containerEl) return null;
    // --- build DOM nodes once (documentFragment usage) ---
    const root = document.createElement('div'); root.className = 'fs-root';
    const btn = document.createElement('div'); btn.className = 'fs-button'; btn.tabIndex = 0;
    const labelWrap = document.createElement('div'); labelWrap.className = 'fs-label';
    const labelText = document.createElement('span'); labelText.style.opacity = 0.8;
    labelWrap.appendChild(labelText);
    const caret = document.createElement('img'); caret.className = 'fs-caret'; caret.src = '../img/icon/arrow-down.png'; caret.alt = 'v';
    btn.appendChild(labelWrap); btn.appendChild(caret); root.appendChild(btn);

    const panel = document.createElement('div'); panel.className = 'fs-panel'; panel.style.display = 'none';

    const phead = document.createElement('div'); phead.className = 'fs-panel-header';
    const tabClient = document.createElement('button'); tabClient.className = 'fs-tab'; tabClient.textContent = 'Clients';
    const tabProd = document.createElement('button'); tabProd.className = 'fs-tab'; tabProd.textContent = 'Produits';
    const clearPanelBtn = document.createElement('button'); clearPanelBtn.className = 'fs-clear-btn'; clearPanelBtn.type = 'button'; clearPanelBtn.title = 'Réinitialiser le filtre'; clearPanelBtn.textContent = 'Réinit';
    const searchWrap = document.createElement('div'); searchWrap.className = 'fs-search'; const searchInputEl = document.createElement('input'); searchInputEl.type = 'search'; searchInputEl.placeholder = 'Rechercher...'; searchWrap.appendChild(searchInputEl);
    phead.appendChild(tabClient); phead.appendChild(tabProd); phead.appendChild(clearPanelBtn); phead.appendChild(searchWrap);
    panel.appendChild(phead);
    const list = document.createElement('div'); list.className = 'fs-list'; panel.appendChild(list);
    root.appendChild(panel);
    containerEl.appendChild(root);

    // default settings
    const iconClient = '../img/icon/profilclient.png';
    const iconProd = '../img/icon/produitblack.png';
    const placeholder = containerEl.dataset.placeholder || (type === 'client' ? 'Sélectionner un client' : 'Sélectionner un produit');
    labelText.textContent = placeholder;

    // IMPORTANT: si le container définit explicitement un type, on "verrouille" le panneau sur ce type
    const fixedType = (containerEl.dataset.type || type || '').toLowerCase();
    let open = false;
    let active = (fixedType === 'client' || fixedType === 'produit') ? fixedType : ((type === 'client') ? 'client' : 'produit');
    let itemsCache = [];

    if (fixedType === 'client') {
      tabProd.style.display = 'none';
      tabClient.classList.add('active');
    } else if (fixedType === 'produit') {
      tabClient.style.display = 'none';
      tabProd.classList.add('active');
    } else {
      if (active === 'client') tabClient.classList.add('active'); else tabProd.classList.add('active');
    }

    async function renderList(filter = '') {
      list.innerHTML = '<div class="fs-loading">Chargement...</div>';
      const q = (filter || '').trim().toLowerCase();
      itemsCache = (active === 'client') ? await loadClients() : await loadProduits();
      if (!open) return;
      const filtered = (itemsCache || []).filter(it => {
        const name = (it.enseigne || it.nom || it.nom_produit || it.name || '').toLowerCase();
        if (!q) return true;
        return name.includes(q);
      });
      if (filtered.length === 0) { list.innerHTML = '<div class="fs-empty">Aucun résultat</div>'; return; }

      const frag = document.createDocumentFragment();
      filtered.forEach(it => {
        const row = document.createElement('div'); row.className = 'fs-item'; row.tabIndex = 0;
        const img = document.createElement('img'); img.className = 'icon'; img.src = active === 'client' ? iconClient : iconProd; img.alt = '';
        const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = (it.enseigne || it.nom || it.nom_produit || it.name || '').toString();
        row.appendChild(img); row.appendChild(lab);
        row.addEventListener('click', (e) => { e.stopPropagation(); chooseItem(it); });
        row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') chooseItem(it); });
        frag.appendChild(row);
      });
      list.innerHTML = '';
      list.appendChild(frag);
    }

    function openPanel() {
      if (open) return;
      if (currentlyOpen && currentlyOpen !== instance) currentlyOpen.closePanel();
      currentlyOpen = instance;
      open = true;
      panel.style.display = 'flex';
      root.classList.add('fs-open');
      renderList(searchInputEl.value || '');
      setTimeout(() => searchInputEl.focus(), 70);
      document.addEventListener('click', onDocClick);
    }
    function closePanel() {
      if (!open) return;
      open = false;
      panel.style.display = 'none';
      root.classList.remove('fs-open');
      document.removeEventListener('click', onDocClick);
      if (currentlyOpen === instance) currentlyOpen = null;
    }
    function onDocClick(e) { if (!root.contains(e.target)) closePanel(); }

    function chooseItem(it) {
      const label = (it.enseigne || it.nom || it.nom_produit || it.name || '').toString();
      labelText.textContent = label; labelText.style.opacity = 1;

      const pickId = (obj) => {
        if (!obj) return '';
        return String(obj.id_client || obj.id_produit || obj.id || obj._id || obj.uuid || obj.idClient || obj.idProduit || '') || '';
      };

      if (active === 'client') {
        if (clientSelect) {
          clientSelect.value = pickId(it) || '';
          clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        if (productSelect) {
          productSelect.value = pickId(it) || '';
          productSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      closePanel();
    }

    tabClient.addEventListener('click', () => {
      if (fixedType) return;
      active = 'client';
      tabClient.classList.add('active'); tabProd.classList.remove('active');
      renderList(searchInputEl.value || '');
    });
    tabProd.addEventListener('click', () => {
      if (fixedType) return;
      active = 'produit';
      tabProd.classList.add('active'); tabClient.classList.remove('active');
      renderList(searchInputEl.value || '');
    });

    searchInputEl.addEventListener('input', debounce((e) => renderList(e.target.value || ''), 180));
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (open) closePanel(); else openPanel(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) closePanel(); else openPanel(); } });

    clearPanelBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      labelText.textContent = placeholder; labelText.style.opacity = 0.8;
      if (active === 'client') {
        if (clientSelect) { clientSelect.value = ''; clientSelect.dispatchEvent(new Event('change', { bubbles: true })); }
      } else {
        if (productSelect) { productSelect.value = ''; productSelect.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      searchInputEl.value = '';
      renderList('');
    });

    function clear() {
      labelText.textContent = placeholder; labelText.style.opacity = 0.8;
      if (type === 'client' || fixedType === 'client') { if (clientSelect) { clientSelect.value = ''; clientSelect.dispatchEvent(new Event('change', { bubbles: true })); } }
      else { if (productSelect) { productSelect.value = ''; productSelect.dispatchEvent(new Event('change', { bubbles: true })); } }
    }

    const instance = { root, openPanel, closePanel, renderList, clear };
    fancyInstances.set(containerEl, instance);
    return instance;
  }

  // instantiate fancy-selects for the deux placeholders
  const fancyPlaceholders = Array.from(container.querySelectorAll('.fancy-select'));
  fancyPlaceholders.forEach(el => {
    const type = el.dataset.type || (el.closest('.bloc-filter-product')?.querySelector('img')?.alt?.toLowerCase()?.includes('produit') ? 'produit' : 'client');
    createFancySelect(el, type);
  });

  // ---- header title helpers ----
  function getSelectLabel(select) {
    if (!select) return '';
    const opt = select.options[select.selectedIndex] || {};
    const label = (opt.text || '').trim();
    if (!label) return '';
    const lower = label.toLowerCase();
    if (label.startsWith('--') || lower.includes('selection') || select.value === '') return '';
    return label;
  }
  function updateHeaderTitle() {
    if (!headerTitleH1) return;
    const clientLabel = getSelectLabel(clientSelect);
    const produitLabel = getSelectLabel(productSelect);
    if (clientLabel && produitLabel) headerTitleH1.textContent = `${clientLabel} - ${produitLabel}`;
    else if (clientLabel) headerTitleH1.textContent = clientLabel;
    else if (produitLabel) headerTitleH1.textContent = produitLabel;
    else headerTitleH1.textContent = 'Toutes les conceptions';
  }

  // ---- buildRow: crée DOM minimal et stocke références dans rowMap pour event delegation ----
  // ---- buildRow: crée DOM minimal et stocke références dans rowMap pour event delegation ----
  function buildRow(item) {
    // safer id fallback (id_conception || id || _id)
    const id = item.id_conception || item.id || item._id || '';
    const tr = document.createElement('div'); tr.className = 'tr'; tr.dataset.id = id;
    tr.dataset.client = item.client_enseigne || '';
    tr.dataset.produit = item.produit_nom || '';

    // compute consernes resolved names and attach to item for filtering
    const resolved = resolveConsernesNames(item);
    item._client_names = resolved.clientNames;
    item._produit_names = resolved.produitNames;

    // col1
    const c1 = document.createElement('div'); c1.className = 'col col1';
    const arrowBtn = document.createElement('button'); arrowBtn.className = 'btn-arrow';
    const arrowImg = document.createElement('img'); arrowImg.src = '../img/icon/arrow-down.png'; arrowImg.alt = 'v';
    arrowBtn.appendChild(arrowImg);

    const imgWrap = document.createElement('div'); imgWrap.className = 'image-product';
    const thumb = document.createElement('img');
    const initialThumb = item.thumb || defaultThumb;
    // set initial src (will be replaced by data-src for lazy load)
    thumb.src = initialThumb;
    thumb.alt = item.nom_conception || 'thumb';
    thumb.onerror = () => { if (thumb.src !== defaultThumb) thumb.src = defaultThumb; };

    imgWrap.appendChild(thumb);

    const titleWrap = document.createElement('div'); titleWrap.className = 'title-product';
    const pTitle = document.createElement('p'); pTitle.className = 'text-title-product'; pTitle.textContent = item.nom_conception || 'Conception';
    const pDetails = document.createElement('p'); pDetails.className = 'details-title-product';

    // show clients compactly in the title details
    const clientsHtml = compactListHtml(item._client_names || []);
    pDetails.innerHTML = `Clients : <b>${clientsHtml}</b>`;

    titleWrap.appendChild(pTitle); titleWrap.appendChild(pDetails);

    c1.appendChild(arrowBtn); c1.appendChild(imgWrap); c1.appendChild(titleWrap);

    // col2 client
    const c2 = document.createElement('div'); c2.className = 'col col2';
    const pClient = document.createElement('p');
    pClient.innerHTML = compactListHtml(item._client_names || []);
    c2.appendChild(pClient);

    // col3 produit
    const c3 = document.createElement('div'); c3.className = 'col col3';
    const pProd = document.createElement('p');
    pProd.innerHTML = compactListHtml(item._produit_names || []);
    c3.appendChild(pProd);

    // col4 date
    const c4 = document.createElement('div'); c4.className = 'col col4';
    const pDate = document.createElement('p'); pDate.textContent = item.date_creation ? (new Date(item.date_creation)).toLocaleDateString() : '—';
    c4.appendChild(pDate);

    // col5 actions (note: no listeners ici — delegation will handle)
    const c5 = document.createElement('div'); c5.className = 'col col5';
    const editBtn = document.createElement('button'); editBtn.className = 'btn-edit'; editBtn.title = 'Editer'; editBtn.dataset.action = 'edit';
    const editImg = document.createElement('img'); editImg.src = '../img/icon/editer.png'; editImg.alt = 'edit'; editBtn.appendChild(editImg);
    const delBtn = document.createElement('button'); delBtn.className = 'btn-delete'; delBtn.title = 'Supprimer'; delBtn.dataset.action = 'delete';
    const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer1.png'; delImg.alt = 'del'; delBtn.appendChild(delImg);
    c5.appendChild(editBtn); c5.appendChild(delBtn);

    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5);

    // expanded panel (hidden by default)
    const trOpen = document.createElement('div'); trOpen.className = 'tr-open'; trOpen.style.display = 'none';
    const filesDiv = document.createElement('div'); filesDiv.className = 'files-conception';
    const hFiles = document.createElement('h1'); hFiles.textContent = 'Fichiers :'; hFiles.style.margin = '8px';
    filesDiv.appendChild(hFiles); trOpen.appendChild(filesDiv);

    // store DOM refs & flags in rowMap to avoid later querySelector
    rowMap.set(id, {
      id,
      data: item,
      tr,
      trOpen,
      arrowImg,
      thumbImg: thumb,
      filesDiv,
      loaded: false, // indicates if details were fetched and files rendered
    });

    return { tr, trOpen };
  }


  // ---- renderRows: build fragment off-DOM then swap in une seule append (minimise reflows) ----
  function renderRows() {
    rowMap.clear();
    tbody.innerHTML = '';
    if (!state.rows || state.rows.length === 0) {
      const no = document.createElement('div'); no.className = 'no-products'; no.style.padding = '30px'; no.style.textAlign = 'center';
      no.textContent = 'Aucune conception trouvée'; tbody.appendChild(no); return;
    }
    const frag = document.createDocumentFragment();
    state.rows.forEach(item => {
      const { tr, trOpen } = buildRow(item);
      frag.appendChild(tr);
      frag.appendChild(trOpen);
    });
    tbody.appendChild(frag);
  }

  // Lazy load thumbnails with IntersectionObserver (fast, progressive).
  function setupLazyThumbObserver() {
    if (!('IntersectionObserver' in window)) {
      // fallback: force immediate load
      document.querySelectorAll('.image-product img[data-src]').forEach(img => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      });
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
        }
        obs.unobserve(img);
      });
    }, { root: null, rootMargin: '200px', threshold: 0.01 });

    // observe any img with data-src
    document.querySelectorAll('.image-product img[data-src]').forEach(img => io.observe(img));
  }

  // call after rows appended
  function renderRows() {
    rowMap.clear();
    tbody.innerHTML = '';
    if (!state.rows || state.rows.length === 0) {
      const no = document.createElement('div'); no.className = 'no-products'; no.style.padding = '30px'; no.style.textAlign = 'center';
      no.textContent = 'Aucune conception trouvée'; tbody.appendChild(no); return;
    }
    const frag = document.createDocumentFragment();
    state.rows.forEach(item => {
      const { tr, trOpen } = buildRow(item);
      frag.appendChild(tr);
      frag.appendChild(trOpen);
    });
    tbody.appendChild(frag);

    // AFTER DOM inserted: set data-src for images (instead of src) to let IntersectionObserver do the load
    state.rows.forEach(item => {
      // lookup key robust (accepte id_conception, id ou _id venant du serveur)
      const key = item.id_conception || item.id || item._id || '';
      const meta = rowMap.get(key);
      if (!meta) {
        // log utile pour debug si rowMap ne contient pas l'item
        console.debug('[renderRows] meta not found for item key:', key, 'item:', item);
        return;
      }
      const img = meta.thumbImg;
      if (!img) return;
      // compute url from item.thumb (already set from thumb_storage_path earlier)
      const url = item.thumb || defaultThumb;
      // prefer using data-src for lazy loading
      img.removeAttribute('src'); // ensure not loaded immediately
      img.setAttribute('data-src', url);
      img.alt = item.nom_conception || 'thumb';
    });


    // start observer
    setupLazyThumbObserver();
  }

  // ---- pagination rendering (gentle DOM ops) ----
  function renderPagination() {
    paginationContainer.innerHTML = '';
    const total = state.total || 0;
    const per = state.per_page;
    const totalPages = Math.max(1, Math.ceil(total / per));
    state.total_pages = totalPages;
    const cur = Math.min(Math.max(1, state.page), totalPages);

    const makeActionBtn = (text, imgSrc, disabled) => {
      const b = document.createElement('button');
      b.textContent = text;
      const img = document.createElement('img'); img.src = imgSrc; img.width = 15; img.height = 15;
      img.style.filter = 'invert(100%)';
      img.style.marginRight = '4px';
      b.style.display = 'flex'; b.style.alignItems = 'center'; b.style.justifyContent = 'center';
      b.style.margin = '4px';
      b.insertBefore(img, b.firstChild);
      b.disabled = !!disabled;
      return b;
    };

    const prev = makeActionBtn('Précédent', '../img/icon/precedent.png', cur <= 1);
    prev.addEventListener('click', () => { if (state.page > 1) { state.page--; loadAndRender(); } });
    paginationContainer.appendChild(prev);

    const makeBtn = (n, active = false) => {
      const b = document.createElement('button'); b.textContent = String(n); b.style.margin = '2px';
      if (active) { b.classList.add('active-page'); }
      b.addEventListener('click', () => { state.page = n; loadAndRender(); });
      return b;
    };

    if (totalPages <= 9) {
      for (let i = 1; i <= totalPages; i++) paginationContainer.appendChild(makeBtn(i, i === cur));
    } else {
      paginationContainer.appendChild(makeBtn(1, cur === 1));
      paginationContainer.appendChild(makeBtn(2, cur === 2));
      if (cur > 5) { const s = document.createElement('span'); s.textContent = '...'; s.style.margin = '4px'; paginationContainer.appendChild(s); }
      const start = Math.max(3, cur - 1); const end = Math.min(totalPages - 2, cur + 1);
      for (let i = start; i <= end; i++) paginationContainer.appendChild(makeBtn(i, i === cur));
      if (cur < totalPages - 4) { const s2 = document.createElement('span'); s2.textContent = '...'; s2.style.margin = '4px'; paginationContainer.appendChild(s2); }
      paginationContainer.appendChild(makeBtn(totalPages - 1, cur === totalPages - 1));
      paginationContainer.appendChild(makeBtn(totalPages, cur === totalPages));
    }

    const next = makeActionBtn('Suivant', '../img/icon/suivant.png', cur >= totalPages);
    next.addEventListener('click', () => { if (state.page < state.total_pages) { state.page++; loadAndRender(); } });
    paginationContainer.appendChild(next);
  }

  // ---- thumbnails fetching with concurrency limit + RAF batching for DOM updates ----
  const thumbUpdateQueue = new Map(); // id -> url
  let thumbRafScheduled = false;
  function scheduleThumbApply() {
    if (thumbRafScheduled) return;
    thumbRafScheduled = true;
    requestAnimationFrame(() => {
      thumbRafScheduled = false;
      thumbUpdateQueue.forEach((url, id) => {
        const meta = rowMap.get(id);
        if (!meta) return;
        const img = meta.thumbImg;
        if (!img) return;
        img.src = url || defaultThumb;
        img.alt = 'thumb';
        img.onerror = () => { if (img.src !== defaultThumb) img.src = defaultThumb; };
      });
      thumbUpdateQueue.clear();
    });
  }


  // ---- details rendering (files) ----
  function createFileRow(file) {
    const row = document.createElement('div'); row.className = 'file-conception';
    const desc = document.createElement('div'); desc.className = 'file-conception-desc';
    const logo = document.createElement('div'); logo.className = 'logo-file';
    const img = document.createElement('img');
    const ext = (file.extension || '').toLowerCase();
    const isImg = (file.mime_type && file.mime_type.startsWith('image/')) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
    img.src = isImg ? '../img/icon/images.png' : '../img/icon/fichier.png';
    img.alt = '';
    logo.appendChild(img);

    const title = document.createElement('div'); title.className = 'title-file';
    const h1 = document.createElement('h1'); h1.textContent = file.filename || '—';
    const p = document.createElement('p'); p.textContent = file.size_bytes ? `${Math.round(file.size_bytes / 1024)} KB` : '';
    title.appendChild(h1); title.appendChild(p);

    const btns = document.createElement('div'); btns.className = 'btns-file';
    const dl = document.createElement('button'); dl.title = 'Télécharger'; dl.dataset.action = 'file-download';
    const dlimg = document.createElement('img'); dlimg.src = '../img/icon/telechargements.png'; dl.appendChild(dlimg);
    btns.appendChild(dl);

    if (isImg) {
      const view = document.createElement('button'); view.title = 'Voir'; view.dataset.action = 'file-view';
      const vimg = document.createElement('img'); vimg.src = '../img/icon/vue.png'; view.appendChild(vimg);
      btns.appendChild(view);
    }
    desc.appendChild(logo); desc.appendChild(title);
    row.appendChild(desc); row.appendChild(btns);
    row.dataset.storagePath = file.storage_path || '';
    row.dataset.filename = file.filename || '';
    row.dataset.mime = file.mime_type || '';
    row.dataset.ext = ext || '';
    return row;
  }

  // ---- delegated event handling for tbody (this replaces many per-row listeners) ----
  tbody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    const tr = ev.target.closest('.tr');
    if (!tr && !btn) return;

    if (btn && btn.dataset.action) {
      const action = btn.dataset.action;
      const trParent = btn.closest('.tr');
      if (!trParent) return;
      const id = trParent.dataset.id;
      if (action === 'edit') {
        ev.stopPropagation();
        window.location.href = `newconception.html?id=${encodeURIComponent(id)}`;
        return;
      }
      if (action === 'delete') {
        ev.stopPropagation();
        const item = state.rows.find(r => r.id_conception === id) || {};
        const ok = confirm(`Voulez-vous supprimer la conception "${item.nom_conception || ''}" ? Cette action est irréversible.`);
        if (!ok) return;
        try {
          await deleteConception(id);
          showNotification('Conception supprimée avec succès !', true, { duration: 3000 });
          await loadAndRender();
        } catch (err) {
          alert('Erreur lors de la suppression (voir console).');
        }
        return;
      }
    }

    if (tr) {
      const clickedActionCol = ev.target.closest('.col.col5');
      if (clickedActionCol) return;
      ev.stopPropagation();

      const id = tr.dataset.id;
      const meta = rowMap.get(id);
      if (!meta) return;

      const isExpanded = meta.tr.classList.contains('expanded');
      if (isExpanded) {
        meta.arrowImg.style.transform = 'rotate(0deg)';
        meta.tr.classList.remove('expanded');
        meta.trOpen.style.display = 'none';
        return;
      } else {
        meta.arrowImg.style.transform = 'rotate(180deg)';
        meta.tr.classList.add('expanded');
        meta.trOpen.style.display = 'block';
        if (!meta.loaded) {
          meta.loaded = true;
          meta.filesDiv.innerHTML = '<div style="padding:8px">Chargement...</div>';
          try {
            const details = await fetchDetails(id);
            const files = (details && Array.isArray(details.fichiers)) ? details.fichiers : [];
            // If details.consernes present, attempt to resolve names and update row columns
            if (Array.isArray(details?.consernes) && details.consernes.length > 0) {
              if (!clientsLoaded || !produitsLoaded) {
                await Promise.all([loadClients(), loadProduits()]).catch(() => { });
              }
              const rv = resolveConsernesNames(details);
              // update state.rows item if exists
              const stateItem = state.rows.find(r => r.id_conception === id);
              if (stateItem) {
                stateItem._client_names = rv.clientNames;
                stateItem._produit_names = rv.produitNames;
              }
              // update DOM
              const titleDetails = meta.tr.querySelector('.details-title-product');
              const clientCol = meta.tr.querySelector('.col.col2 p');
              const prodCol = meta.tr.querySelector('.col.col3 p');
              if (titleDetails) titleDetails.innerHTML = `Clients : <b>${compactListHtml(rv.clientNames || [])}</b>`;
              if (clientCol) clientCol.innerHTML = compactListHtml(rv.clientNames || []);
              if (prodCol) prodCol.innerHTML = compactListHtml(rv.produitNames || []);
            }

            if (files.length === 0) {
              meta.filesDiv.innerHTML = '<div class="no-files" style="padding:8px">Aucun fichier attaché</div>';
            } else {
              const frag = document.createDocumentFragment();
              files.forEach(f => {
                const fr = createFileRow(f);
                const dlBtn = fr.querySelector('button[title="Télécharger"]');
                if (dlBtn) {
                  dlBtn.dataset.storagePath = f.storage_path || '';
                  dlBtn.dataset.filename = f.filename || '';
                }
                const viewBtn = fr.querySelector('button[title="Voir"]');
                if (viewBtn) {
                  viewBtn.dataset.storagePath = f.storage_path || '';
                  viewBtn.dataset.filename = f.filename || '';
                  viewBtn.dataset.mime = f.mime_type || '';
                }
                frag.appendChild(fr);
              });
              meta.filesDiv.innerHTML = '';
              meta.filesDiv.appendChild(frag);
            }
          } catch (err) {
            meta.filesDiv.innerHTML = '<div style="padding:8px;color:crimson">Erreur lors du chargement des fichiers</div>';
            console.warn('error loading files for', id, err);
          }
        }
      }
    }
  });

  // delegated handling for file buttons (view / download) inside the files-conception area
  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[title]');
    if (!btn) return;
    ev.stopPropagation();

    const storagePath = btn.dataset.storagePath || btn.dataset.storagepath || '';
    const fileUrl = filePathToUrl(storagePath);

    if (!fileUrl) {
      alert('URL de fichier introuvable. Vérifie que le backend renvoie un storage_path valide (chemin commençant par storage/conception/...) ou une URL complète.');
      return;
    }

    if (btn.title === 'Télécharger') {
      // Essaye d'ouvrir dans navigateur externe (si possible). Sinon fallback : téléchargement via <a download>.
      const suggested = btn.dataset.filename || '';
      const ok = await openInExternalBrowser(fileUrl, suggested);
      if (ok) {
        // tout va bien : le conteneur devrait gérer l'ouverture externe
        return;
      }
      // fallback local : forcer téléchargement dans la webview
      const a = document.createElement('a');
      a.href = fileUrl;
      if (suggested) a.download = suggested;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    if (btn.title === 'Voir') {
      // For image preview, try opening image URL directly in an overlay.
      // If the server blocks direct access, the browser console will show the error.
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed'; overlay.style.left = 0; overlay.style.top = 0;
      overlay.style.width = '100vw'; overlay.style.height = '100vh';
      overlay.style.background = 'rgba(0,0,0,0.8)'; overlay.style.display = 'flex';
      overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.zIndex = 30000;
      overlay.addEventListener('click', () => overlay.remove());

      const im = document.createElement('img');
      im.src = fileUrl;
      im.style.maxWidth = '90%'; im.style.maxHeight = '90%';
      im.style.borderRadius = '6px';
      im.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
      im.alt = btn.dataset.filename || 'preview';
      im.addEventListener('error', () => {
        overlay.remove();
        alert('Impossible de charger image — vérifier que le chemin public commence bien par /storage/conception/... et que le serveur sert ce dossier en statique.');
      });

      overlay.appendChild(im); document.body.appendChild(overlay);
      return;
    }
  });


  // ---- load + render ----
  async function loadAndRender() {
    try {
      updateHeaderTitle();
      tbody.innerHTML = '<div style="padding:16px; text-align:center; margin-left:10px;">Chargement...</div>';
      const filters = {
        client: state.client,
        produit: state.produit,
        nom: state.search || undefined,
        sort: state.sort
      };

      // fetch page from API
      const { rows: fetchedRows, total, total_pages } = await fetchPage(state.page, state.per_page, filters);

      console.debug('API fetch result:', { fetchedRows, total, total_pages });

      // make a local copy (avoid mutating original objects returned by API)
      let effectiveRows = Array.isArray(fetchedRows) ? fetchedRows.slice() : [];

      // decide if server-side filtering is supported (prefer server-provided total)
      const serverSupportsFiltering = (typeof total === 'number');

      // If server didn't handle filters, apply client-side fallback
      if (!serverSupportsFiltering && (state.client || state.produit || state.search)) {
        if (!clientsLoaded || !produitsLoaded) {
          await Promise.all([loadClients(), loadProduits()]).catch(() => { });
        }
        effectiveRows = effectiveRows.filter(r => matchesFilters(r, state.client, state.produit, state.search));
      }

      // compute thumb URLs preferring thumb_url from API
      effectiveRows.forEach(it => {
        if (it.thumb_url) {
          it.thumb = it.thumb_url;
        } else if (it.thumb_storage_path && !it.thumb) {
          try {
            it.thumb = filePathToUrl(it.thumb_storage_path) || null;
          } catch (e) {
            it.thumb = null;
          }
        } else {
          it.thumb = it.thumb || null;
        }
      });

      state.rows = applyClientSort(effectiveRows || []);
      state.total = (typeof total === 'number' && total >= 0) ? total : state.rows.length;
      state.total_pages = Math.max(1, Math.ceil(state.total / state.per_page));
      if (headerCountP) headerCountP.textContent = `${state.total} conceptions`;

      console.debug('Rendering rows count:', state.rows.length);

      renderRows();
      renderPagination();
      // lancer la collecte des thumbs asynchrone (avec limite de concurrence)
    } catch (err) {
      if (err.name === 'AbortError') {
        // ignore — new request likely in flight
        return;
      }
      console.error('Erreur lors du chargement des conceptions:', err);
      const msg = (err && err.message) ? err.message : 'Erreur lors du chargement des conceptions. Voir console.';
      tbody.innerHTML = `<div style="padding:16px;color:crimson">${escapeHtml(msg)}</div>`;
      showNotification(msg, false, { duration: 6000 });
      if (headerCountP) headerCountP.textContent = 'Erreur';
    }
  }

  // ---- events binding (debounced search, selects, tri) ----
  function attachEvents() {
    if (searchInput) searchInput.addEventListener('input', debounce(e => { state.search = (e.target.value || '').trim(); state.page = 1; loadAndRender(); }, 300));

    if (clientSelect) {
      clientSelect.addEventListener('change', e => { state.client = e.target.value || ''; state.page = 1; updateHeaderTitle(); loadAndRender(); });
    }
    if (productSelect) {
      productSelect.addEventListener('change', e => { state.produit = e.target.value || ''; state.page = 1; updateHeaderTitle(); loadAndRender(); });
    }

    if (sortSelect) {
      // ensure UI reflects default state.sort
      sortSelect.value = state.sort || 'date_desc';
      // keep state coherent with the select (user may have a different saved value)
      state.sort = sortSelect.value || state.sort;
      sortSelect.addEventListener('change', e => {
        state.sort = e.target.value || 'date_desc';
        state.page = 1;
        loadAndRender();
      });
    }
  }

  (async function init() {
    try {
      attachEvents();
      updateHeaderTitle();
      // pre-load clients & produits caches to allow name resolution for consernes
      await Promise.all([loadClients(), loadProduits()]).catch(() => { });
      await loadAndRender();
    } catch (err) {
      console.error('init error', err);
    }
  })();
});
