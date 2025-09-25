// notification.js (remplacement complet - compatible apiFetch + chemins absolus)
document.addEventListener('DOMContentLoaded', function () {
  const notifContainer = document.querySelector('.sidenotif .notif-elements');
  const notifCountEl = document.querySelector('.notif-count');
  const notifBtn = document.querySelector('.notif-user');
  const sidenotifEl = document.querySelector('.sidenotif');
  const POLL_INTERVAL = 15000; // 15s

  // Helper: use apiFetch if available, otherwise fallback to native fetch but keep relative paths
  const _apiFetch = (typeof window.apiFetch === 'function')
    ? window.apiFetch.bind(window)
    : async function (path, opts = {}) {
      // If a full url provided, use native fetch; otherwise prefix with '/' to be relative to origin
      const url = (typeof path === 'string' && path.match(/^https?:\/\//i)) ? path : (path && path.startsWith('/') ? path : ('/' + path.replace(/^\/+/, '')));
      return fetch(url, opts);
    };

  // ---------------- Asset helpers ----------------
  function getFrontendBase() {
    try { return location.origin.replace(/\/+$/, ''); } catch (e) { return ''; }
  }

  function getApiBase() {
    if (typeof window !== 'undefined' && window.API_BASE) {
      return String(window.API_BASE).replace(/\/+$/, '');
    }
    return ''; // fallback empty
  }

  // Build absolute URL to frontend asset (ex: 'frontend/img/icon/client.png' => 'http://host/frontend/img/icon/client.png')
  function buildFrontendAsset(pathFromFrontendRoot) {
    if (!pathFromFrontendRoot) return '';
    if (/^https?:\/\//i.test(pathFromFrontendRoot)) return pathFromFrontendRoot;
    const cleaned = String(pathFromFrontendRoot).replace(/^\/+/, '');
    return `${getFrontendBase()}/${cleaned}`;
  }

  // Build absolute URL to backend storage (ex: 'clients/.../file.png' => 'https://api/storage/clients/.../file.png')
  function buildStorageUrl(storageRelativePath) {
    if (!storageRelativePath) return null;
    if (/^https?:\/\//i.test(storageRelativePath)) return storageRelativePath;
    const cleaned = String(storageRelativePath).replace(/^\/+/, '');
    const api = getApiBase();
    if (api) return `${api}/storage/${cleaned}`;
    // fallback: try origin + /storage/
    return `${getFrontendBase()}/storage/${cleaned}`;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    const cookie = document.cookie.split('; ').find(c => c.trim().startsWith('XSRF-TOKEN='));
    if (cookie) return decodeURIComponent(cookie.split('=')[1]);
    return '';
  }

  // ---------------- Notifications API ----------------
  async function getUserInfo() {
    try {
      if (sidenotifEl && sidenotifEl.dataset && (sidenotifEl.dataset.userId || sidenotifEl.dataset.role)) {
        return { id: sidenotifEl.dataset.userId || null, role: sidenotifEl.dataset.role || null };
      }
      const res = await _apiFetch('/auth/me', { method: 'GET', credentials: 'include' });
      if (!res || !res.ok) {
        console.warn('/auth/me not OK', res && res.status);
        return { id: null, role: null };
      }
      const data = await res.json();
      const id = data.id || data.user_id || data.id_utilisateur || null;
      const role = data.role || (data.employe && data.employe.role) || null;
      return { id, role };
    } catch (e) {
      console.error('getUserInfo error', e);
      return { id: null, role: null };
    }
  }

  // Build query string and return a path that starts with '/'
  function buildNotificationsPath(paramsObj = {}, extra = {}) {
    const params = Object.assign({}, paramsObj, extra);
    const keys = Object.keys(params).filter(k => params[k] !== null && params[k] !== undefined && params[k] !== '');
    if (!keys.length) return '/notifications?limit=500';
    const qs = keys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const finalQs = qs.includes('limit=') ? qs : (qs + '&limit=500');
    return '/notifications/?' + finalQs;
  }

  async function fetchNotificationsFor(user) {
    if (!user) user = await getUserInfo();
    if (!user) user = { id: null, role: null };
    const paramsObj = {};
    if (user.id) paramsObj.user_id = user.id;
    if (user.role) paramsObj.role = user.role;
    const path = buildNotificationsPath(paramsObj);
    try {
      const res = await _apiFetch(path, { method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json' } });
      if (!res || !res.ok) {
        console.warn('fetchNotifications non OK', res && res.status);
        return [];
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      return items;
    } catch (e) {
      console.error('Erreur fetchNotifications', e);
      return [];
    }
  }

  function formatNotificationDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return "Hier";
    if (days < 7) return `Il y a ${days} jours`;
    return date.toLocaleDateString('fr-FR');
  }

  // createNotificationHTML uses absolute asset URLs so it works from any directory
  function createNotificationHTML(notification) {
    const isRead = !!(notification.lue || notification.read);
    const defaultIcon = buildFrontendAsset('frontend/img/icon/client.png');
    const papeterieIcon = buildFrontendAsset('frontend/img/icon/papeterie-papiers-empiles.png');
    const refreshIcon = buildFrontendAsset('frontend/img/icon/refresh.png');
    const fallbackImg = buildFrontendAsset('frontend/img/logoblanc.png');

    let iconSrc = defaultIcon;
    const type = notification.type_notif || notification.type;
    if (type === 'ajout_plaque') iconSrc = papeterieIcon;
    if (type === 'renouvellement_plaque') iconSrc = refreshIcon;

    // If notification contains a custom icon path (maybe storage path), prefer it:
    if (notification.icon || notification.icon_path) {
      const candidate = notification.icon || notification.icon_path;
      // if looks like storage relative path (no protocol), build storage url
      if (!/^https?:\/\//i.test(candidate)) {
        const st = buildStorageUrl(candidate);
        if (st) iconSrc = st;
      } else {
        iconSrc = candidate;
      }
    }

    const id = notification.id_notification || notification.id || '';
    const msg = (notification.message || notification.text || notification.title || 'Nouvelle notification')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // include onerror fallback (browser will use placeholder if remote fails)
    const imgOnError = `this.onerror=null;this.src='${fallbackImg.replace(/'/g, "\\'")}'`;

    return `
      <div class="notif-card ${isRead ? 'notif-read' : 'notif-unread'}" data-id="${id}"
           data-target-conception="${notification.id_conception || ''}"
           data-type="${type}">
        <div class="notif-card-icon"><img src="${iconSrc}" alt="icon" onerror="${imgOnError}"></div>
        <div class="notif-card-text">
          <p>${msg}</p>
          <small>${formatNotificationDate(notification.date_creation || notification.created_at)}</small>
        </div>
      </div>
    `;
  }

  function renderNotifications(notifications) {
    if (!notifContainer) return;
    if (!notifications || notifications.length === 0) {
      notifContainer.innerHTML = `<div class="notif-empty"><p>Aucune notification</p></div>`;
      if (notifCountEl) { notifCountEl.textContent = '0'; notifCountEl.style.display = 'none'; }
      return;
    }
    const byDate = {};
    notifications.forEach(n => {
      const key = formatNotificationDate(n.date_creation || n.created_at || n.date) || 'Autre';
      (byDate[key] = byDate[key] || []).push(n);
    });
    let html = '';
    Object.keys(byDate).forEach(date => {
      html += `<div class="notif-day"><h3>${date}</h3></div>`;
      byDate[date].forEach(n => html += createNotificationHTML(n));
    });
    notifContainer.innerHTML = html;

    const unread = notifications.filter(n => !(n.lue || n.read)).length;
    if (notifCountEl) {
      notifCountEl.textContent = String(unread);
      notifCountEl.style.display = unread > 0 ? 'inline-block' : 'none';
    }
  }

  async function markAsReadLocal(notificationId, user) {
    if (!notificationId) return false;
    user = user || await getUserInfo();
    const params = {};
    if (user.id) params.user_id = user.id;
    if (user.role) params.role = user.role;
    const qs = Object.keys(params).length ? ('?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')) : '';
    const path = `/notifications/mark_read${qs}`;
    try {
      const res = await _apiFetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() || '' },
        body: JSON.stringify({ id_notification: notificationId })
      });
      if (!res || !res.ok) {
        console.warn('mark_read failed', res && res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.error('markAsReadLocal error', e);
      return false;
    }
  }

  async function markAllRead(user) {
    user = user || await getUserInfo();
    if (!user) { console.warn('markAllRead: no user'); return false; }
    const params = {};
    if (user.id) params.user_id = user.id;
    if (user.role) params.role = user.role;
    const qs = Object.keys(params).length ? ('?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&')) : '';
    const path = `/notifications/mark_all_read${qs}`;
    try {
      const res = await _apiFetch(path, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfToken() || '' } });
      if (!res || !res.ok) {
        console.warn('markAllRead non OK', res && res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Erreur markAllRead', e);
      return false;
    }
  }

  // Delegation click on card
  if (notifContainer) {
    notifContainer.addEventListener('click', async function (e) {
      const card = e.target.closest('.notif-card');
      if (!card) return;
      const id = card.dataset.id;
      // optimistic UI
      card.classList.add('notif-read');
      card.classList.remove('notif-unread');
      if (notifCountEl) {
        const current = parseInt(notifCountEl.textContent || '0', 10);
        const newVal = Math.max(0, current - 1);
        notifCountEl.textContent = String(newVal);
        notifCountEl.style.display = newVal > 0 ? 'inline-block' : 'none';
      }
      const user = await getUserInfo();
      await markAsReadLocal(id, user);
      const idConception = card.dataset.targetConception;
      if (idConception) {
        window.location.href = `/Conception/conception.html?id=${encodeURIComponent(idConception)}`;
        return;
      }
      window.dispatchEvent(new Event('closeNotificationsPanel'));
    });
  }

  if (notifBtn) {
    notifBtn.addEventListener('click', async function (e) {
      const user = await getUserInfo();
      const ok = await markAllRead(user);
      if (ok) {
        document.querySelectorAll('.sidenotif .notif-card').forEach(c => { c.classList.add('notif-read'); c.classList.remove('notif-unread'); });
        if (notifCountEl) { notifCountEl.textContent = '0'; notifCountEl.style.display = 'none'; }
      }
      setTimeout(loadNotifications, 300);
    });
  }

  async function loadNotifications() {
    const user = await getUserInfo();
    const arr = await fetchNotificationsFor(user);
    renderNotifications(arr);
  }

  // initial + polling
  loadNotifications();
  setInterval(loadNotifications, POLL_INTERVAL);

  // Expose for debug
  window.__notif_debug = {
    loadNotifications,
    fetchNotificationsFor,
    markAllRead,
    markAsReadLocal,
    getUserInfo
  };
  console.log('notification debug helper available at window.__notif_debug');
});
