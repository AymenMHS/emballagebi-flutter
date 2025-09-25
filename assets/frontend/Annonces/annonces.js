/* frontend/annonces.js
   Version optimisée : counts inclus côté backend, pagination et lazy comments.
   Optionally set window.API_BASE, window.CURRENT_USER_ID, window.CURRENT_USER_ROLE, window.AUTH_TOKEN
*/
(function () {
  'use strict';

  const API_BASE = (window.API_BASE && window.API_BASE.replace(/\/$/, '')) || window.location.origin;
  const API_ROOT = API_BASE + '/api/annonces';
  const AUTH_TOKEN = window.AUTH_TOKEN || null;

  let CURRENT_USER_ID = window.CURRENT_USER_ID || null;
  let CURRENT_USER_ROLE = window.CURRENT_USER_ROLE || null;

  const ROLES = [
    { key: null, uiKey: 'public', label: 'Public', description: 'Tout le monde' },
    { key: 'admin', uiKey: 'admins', label: 'Administrateurs', description: 'Seuls les administrateurs' },
    { key: 'chef_production', uiKey: 'chef_production', label: 'Chef production', description: 'Chef production' },
    { key: 'machiniste', uiKey: 'machinists', label: 'Machinistes', description: 'Machinistes' },
    { key: 'technicien', uiKey: 'technicians', label: 'Techniciens', description: 'Techniciens' },
    { key: 'commercial', uiKey: 'commercial', label: 'Commercial', description: 'Équipe commerciale' },
    { key: 'comptable', uiKey: 'comptable', label: 'Comptable', description: 'Comptabilité' }
  ];

  const BADGE_CLASS = {
    public: 'role-everyone',
    admins: 'role-admins',
    machinists: 'role-machinists',
    technicians: 'role-technicians',
    chef_production: 'role-chef',
    commercial: 'role-commercial',
    comptable: 'role-comptable'
  };

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function headersJSON() {
    const h = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) h['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    return h;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function formatDate(iso) {
    try { const d = new Date(iso); return d.toLocaleString(); } catch (e) { return iso; }
  }

  function mapVisibilityForApi(uiKey) {
    const r = ROLES.find(x => x.uiKey === uiKey);
    return r ? r.key : null;
  }

  function mapApiVisibilityToUiKey(apiVisibility) {
    if (!apiVisibility) return 'public';
    const r = ROLES.find(x => x.key === apiVisibility);
    if (r) return r.uiKey;
    const r2 = ROLES.find(x => x.uiKey === apiVisibility);
    if (r2) return r2.uiKey;
    return 'public';
  }

  function badgeHtmlForUiKey(uiKey) {
    const cls = BADGE_CLASS[uiKey] || 'role-everyone';
    const label = (ROLES.find(r => r.uiKey === uiKey) || { label: 'Tous' }).label;
    return `<span class="role-badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function canEditOrDelete(annonce) {
    if (!CURRENT_USER_ID) return false;
    if (CURRENT_USER_ROLE === 'admin') return true;
    return String(annonce.id_utilisateur) === String(CURRENT_USER_ID);
  }

  // inject small styles once
  (function injectMenuStyles() {
    if (document.getElementById('annonces-js-menu-styles')) return;
    const s = document.createElement('style');
    s.id = 'annonces-js-menu-styles';
    s.textContent = `
      .post { position: relative; }
      .post-menu { position: absolute; top: 10px; right: 10px; z-index: 250; }
      .post-menu-btn { background: transparent; border: none; cursor: pointer; font-size: 18px; padding: 6px; border-radius: 6px; display:inline-flex; align-items:center; }
      .post-menu-dropdown { position: absolute; top: 36px; right: 0; background: #fff; border: 1px solid #e4e6eb; box-shadow: 0 6px 18px rgba(0,0,0,0.12); border-radius: 8px; min-width: 140px; display:none; overflow:hidden; }
      .post-menu-dropdown.show { display:block; }
      .post-menu-dropdown button{ width:100%; text-align:left; padding:8px 12px; border:none; background:transparent; cursor:pointer; font-weight:600;}
      .post-menu-dropdown button:hover{ background:#f0f2f5; }
      .post-menu-divider{ height:1px; background:#eee; margin:6px 0; }

      .comments-area { padding-top: 10px; border-top: 1px solid #eee; margin-top: 10px; }
      .comment { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid #f1f1f1; }
      .comment .user-avatar { width:32px; height:32px; font-size:12px; }
      .comment-body { flex:1; }
      .comment-meta { font-size:12px; color:#666; margin-bottom:6px; }
      .comment-text { font-size:14px; white-space:pre-wrap; }
      .comment-input { display:flex; gap:8px; margin-top:8px; }
      .comment-input textarea{ flex:1; min-height:40px; padding:8px; border-radius:6px; border:1px solid #e4e6eb; }
      .like-btn.active { color:#1877f2; font-weight:700; }
      .load-more { padding:12px; text-align:center; background:#fff; border-radius:8px; margin:12px 0; cursor:pointer; border:1px solid #e4e6eb; font-weight:700; }
    `;
    document.head.appendChild(s);
  })();

  // DOM refs
  const openModalBtn = qs('#openModal');
  const closeModalBtn = qs('#closeModal');
  const postModal = qs('#postModal');
  const postContentEl = qs('#postContent');
  const publishButton = qs('#publishButton');
  const visibilitySelector = qs('#visibilitySelector');
  const visibilityOptionsContainer = qs('#visibilityOptions');
  const postsContainer = qs('#postsContainer');

  // pagination state
  const PAGE_LIMIT = 20;
  let currentOffset = 0;
  let loadingMore = false;
  let noMore = false;
  let loadMoreBtn = null;

  function renderVisibilityOptions() {
    if (!visibilityOptionsContainer) return;
    visibilityOptionsContainer.innerHTML = '';
    ROLES.forEach(role => {
      const node = document.createElement('div');
      node.className = 'visibility-option';
      node.setAttribute('data-visibility', role.uiKey);
      node.innerHTML = `<div><div>${escapeHtml(role.label)}</div><div style="font-size:12px;color:#65676b;">${escapeHtml(role.description)}</div></div>`;
      visibilityOptionsContainer.appendChild(node);
    });
  }

  let selectedUiVisibility = 'public';

  // API calls
  async function apiListAnnonces(limit = PAGE_LIMIT, offset = 0, role = undefined) {
    try {
      const roleToUse = (typeof role !== 'undefined') ? role : CURRENT_USER_ROLE;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (roleToUse) params.set('role', roleToUse);
      if (CURRENT_USER_ID) params.set('user_id', CURRENT_USER_ID);
      const res = await fetch(`${API_ROOT}?${params.toString()}`, { headers: headersJSON(), credentials: 'include' });
      if (!res.ok) { const txt = await res.text(); throw new Error(`Erreur ${res.status} : ${txt}`); }
      return await res.json();
    } catch (err) { console.error('apiListAnnonces error', err); throw err; }
  }

  async function apiCreateAnnonce({ contenu, visibility }) {
    if (!CURRENT_USER_ID) throw new Error('CURRENT_USER_ID non défini.');
    const payload = { contenu, visibility, id_utilisateur: CURRENT_USER_ID };
    const res = await fetch(API_ROOT, { method: 'POST', headers: headersJSON(), credentials: 'include', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur inconnue'})); throw new Error(err.detail || `Erreur ${res.status}`); }
    return await res.json();
  }

  async function apiUpdateAnnonce(id, patch) {
    const res = await fetch(`${API_ROOT}/${id}`, { method: 'PUT', headers: headersJSON(), credentials: 'include', body: JSON.stringify(patch) });
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur inconnue'})); throw new Error(err.detail || `Erreur ${res.status}`); }
    return await res.json();
  }

  async function apiDeleteAnnonce(id) {
    const res = await fetch(`${API_ROOT}/${id}`, { method: 'DELETE', headers: headersJSON(), credentials: 'include' });
    if (!res.ok && res.status !== 204) { const err = await res.text(); throw new Error(`Erreur suppression: ${res.status} ${err}`); }
    return true;
  }

  // comments & likes endpoints (used on demand)
  async function apiGetComments(annonceId) {
    const res = await fetch(`${API_ROOT}/${annonceId}/comments`, { headers: headersJSON(), credentials: 'include' });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Erreur ${res.status} : ${txt}`); }
    return await res.json();
  }
  async function apiCreateComment(annonceId, { contenu }) {
    if (!CURRENT_USER_ID) throw new Error('Utilisateur non identifié');
    const payload = { contenu, id_utilisateur: CURRENT_USER_ID };
    const res = await fetch(`${API_ROOT}/${annonceId}/comments`, { method: 'POST', headers: headersJSON(), credentials: 'include', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur inconnue'})); throw new Error(err.detail || `Erreur ${res.status}`); }
    return await res.json();
  }
  async function apiDeleteComment(annonceId, commentId) {
    if (!CURRENT_USER_ID) throw new Error('Utilisateur non identifié');
    const res = await fetch(`${API_ROOT}/${annonceId}/comments/${commentId}?user_id=${encodeURIComponent(CURRENT_USER_ID)}`, { method: 'DELETE', headers: headersJSON(), credentials: 'include' });
    if (!res.ok && res.status !== 204) { const txt = await res.text(); throw new Error(`Erreur ${res.status} : ${txt}`); }
    return true;
  }
  async function apiCreateLike(annonceId) {
    if (!CURRENT_USER_ID) throw new Error('Utilisateur non identifié');
    const payload = { id_utilisateur: CURRENT_USER_ID };
    const res = await fetch(`${API_ROOT}/${annonceId}/likes`, { method: 'POST', headers: headersJSON(), credentials: 'include', body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur inconnue'})); throw new Error(err.detail || `Erreur ${res.status}`); }
    return await res.json();
  }
  async function apiDeleteLike(annonceId) {
    if (!CURRENT_USER_ID) throw new Error('Utilisateur non identifié');
    const res = await fetch(`${API_ROOT}/${annonceId}/likes?user_id=${encodeURIComponent(CURRENT_USER_ID)}`, { method: 'DELETE', headers: headersJSON(), credentials: 'include' });
    if (!res.ok && res.status !== 204) { const txt = await res.text(); throw new Error(`Erreur ${res.status} : ${txt}`); }
    return await res.json().catch(()=>({count:0}));
  }

  // render a single post — uses counts returned by list endpoint (no extra calls)
  function createPostElement(post) {
    const uiKey = mapApiVisibilityToUiKey(post.visibility);
    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.style.position = postEl.style.position || 'relative';

    const author = escapeHtml(post.author_name || 'Utilisateur');
    const initials = escapeHtml(post.author_initials || (author.split(' ').map(n=>n[0]).slice(0,2).join('') || 'U'));
    const time = formatDate(post.date_mise_a_jour || post.date_creation);
    const badge = badgeHtmlForUiKey(uiKey);

    // counts from backend
    const likesCount = Number(post.likes_count) || 0;
    const commentsCount = Number(post.comments_count) || 0;
    const likedByMe = (post.liked_by_me === true) || (String(post.liked_by_me) === 'True') || false;

    postEl.innerHTML = `
      <div class="post-header">
        <div class="user-avatar">${initials}</div>
        <div class="post-author-info">
          <div class="post-author-name">${author}</div>
          <div class="post-details">
            <span class="post-time">${escapeHtml(time)}</span>
            <span class="post-visibility">• ${badge}</span>
          </div>
        </div>
      </div>
      <div class="post-content">${escapeHtml(post.contenu).replace(/\n/g, '<br>')}</div>

      <div class="post-stats">
        <div class="like-count">${likesCount} J'aime${likesCount>1?'s':''}</div>
        <div class="comment-count">${commentsCount} commentaire${commentsCount>1?'s':''} • 0 partages</div>
      </div>

      <div class="post-actions">
        <div class="action-button like-btn" role="button" tabindex="0"><span>J'aime</span></div>
        <div class="action-button comment-toggle-btn" role="button" tabindex="0"><span>Commenter</span></div>
      </div>

      <div class="comments-area" style="display:none;"></div>
    `;

    if (canEditOrDelete(post)) {
      const menuWrapper = document.createElement('div');
      menuWrapper.className = 'post-menu';
      menuWrapper.innerHTML = `
        <button class="post-menu-btn" type="button" aria-haspopup="true" aria-expanded="false" title="Options">⋯</button>
        <div class="post-menu-dropdown" role="menu" aria-hidden="true">
          <button class="post-menu-edit" role="menuitem">Modifier</button>
          <div class="post-menu-divider"></div>
          <button class="post-menu-delete" role="menuitem" style="color:#c32bb4;">Supprimer</button>
        </div>
      `;
      postEl.appendChild(menuWrapper);
      const btn = menuWrapper.querySelector('.post-menu-btn');
      const dropdown = menuWrapper.querySelector('.post-menu-dropdown');
      const editBtn = menuWrapper.querySelector('.post-menu-edit');
      const deleteBtn = menuWrapper.querySelector('.post-menu-delete');

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        closeAllPostMenus();
        if (!isOpen) { dropdown.classList.add('show'); dropdown.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); }
      });
      editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); closeAllPostMenus(); openEditModal(post); });
      deleteBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation(); closeAllPostMenus();
        if (!confirm('Supprimer cette annonce ?')) return;
        try { await apiDeleteAnnonce(post.id_annonce); postEl.remove(); }
        catch (err) { console.error(err); alert('Impossible de supprimer: ' + err.message); }
      });
    }

    // like button initial state from post.liked_by_me and count from post.likes_count
    const likeBtn = postEl.querySelector('.like-btn');
    const commentToggleBtn = postEl.querySelector('.comment-toggle-btn');
    const likeCountEl = postEl.querySelector('.like-count');
    const commentCountEl = postEl.querySelector('.comment-count');
    const commentsArea = postEl.querySelector('.comments-area');

    likeBtn.classList.toggle('active', likedByMe);

    likeBtn.addEventListener('click', async () => {
        if (!CURRENT_USER_ID) { alert('Connectez-vous pour aimer'); return; }
        try {
            likeBtn.setAttribute('aria-disabled','true');
            if (likeBtn.classList.contains('active')) {
            const res = await apiDeleteLike(post.id_annonce);
            likeCountEl.textContent = `${res.count} J'aime${res.count>1?'s':''}`;
            likeBtn.classList.remove('active');
            // ne pas toucher à post.date_mise_a_jour ici (likes n'altèrent pas la date de publication)
            } else {
            const res = await apiCreateLike(post.id_annonce);
            likeCountEl.textContent = `${res.count} J'aime${res.count>1?'s':''}`;
            likeBtn.classList.add('active');
            // ne pas toucher à post.date_mise_a_jour ici
            }
        } catch (err) {
            console.error(err); alert('Erreur like: ' + err.message);
        } finally { likeBtn.removeAttribute('aria-disabled'); }
    });

    // comments lazy loaded on toggle
    let commentsLoaded = false;
    commentToggleBtn.addEventListener('click', async () => {
      if (commentsArea.style.display === 'none') {
        commentsArea.style.display = 'block';
        if (!commentsLoaded) {
          await loadAndRenderComments();
          commentsLoaded = true;
        }
      } else {
        commentsArea.style.display = 'none';
      }
    });

    async function loadAndRenderComments() {
      commentsArea.innerHTML = '<div style="padding:8px;color:#666">Chargement des commentaires...</div>';
      try {
        const comments = await apiGetComments(post.id_annonce);
        renderComments(comments);
      } catch (err) {
        commentsArea.innerHTML = `<div style="padding:8px;color:#c33">Erreur: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderComments(comments) {
      commentsArea.innerHTML = '';
      const list = document.createElement('div');
      if (!comments || comments.length === 0) {
        list.innerHTML = '<div style="padding:8px;color:#666">Aucun commentaire.</div>';
      } else {
        comments.forEach(c => {
          const ce = document.createElement('div');
          ce.className = 'comment';
          const authorInitials = escapeHtml(c.author_initials || (c.author_name ? c.author_name.split(' ').map(n=>n[0]).slice(0,2).join('') : 'U'));
          ce.innerHTML = `
            <div class="user-avatar">${authorInitials}</div>
            <div class="comment-body">
              <div class="comment-meta">${escapeHtml(c.author_name || 'Utilisateur')} • ${escapeHtml(formatDate(c.date_mise_a_jour || c.date_creation))}</div>
              <div class="comment-text">${escapeHtml(c.contenu)}</div>
            </div>
          `;
          if (String(c.id_utilisateur) === String(CURRENT_USER_ID) || CURRENT_USER_ROLE === 'admin') {
            const del = document.createElement('button');
            del.textContent = 'Supprimer';
            del.style.marginLeft = '8px';
            del.style.border = 'none';
            del.style.background = 'transparent';
            del.style.color = '#c32bb4';
            del.style.cursor = 'pointer';
            del.addEventListener('click', async () => {
              if (!confirm('Supprimer ce commentaire ?')) return;
              try {
                await apiDeleteComment(post.id_annonce, c.id_comment);
                await loadAndRenderComments();
                // update comment count display (decrement)
                const newCount = Math.max(0, (typeof post.comments_count === 'number' ? post.comments_count - 1 : 0));
                post.comments_count = newCount;
                commentCountEl.textContent = `${newCount} commentaire${newCount>1?'s':''} • 0 partages`;
              } catch (er) { console.error(er); alert('Impossible de supprimer: ' + er.message); }
            });
            ce.querySelector('.comment-body').appendChild(del);
          }
          list.appendChild(ce);
        });
      }

      // input for new comment
      const inputWrap = document.createElement('div');
      inputWrap.className = 'comment-input';
      inputWrap.innerHTML = `
        <textarea placeholder="Écrire un commentaire..." aria-label="Commentaire"></textarea>
        <button class="comment-send-btn" style="padding:8px 12px;border-radius:6px;background:#1877f2;color:#fff;border:none;font-weight:700;cursor:pointer;">Envoyer</button>
      `;
      const textarea = inputWrap.querySelector('textarea');
      const sendBtn = inputWrap.querySelector('.comment-send-btn');
      sendBtn.addEventListener('click', async () => {
        const value = textarea.value.trim();
        if (!value) return;
        try {
          sendBtn.disabled = true;
          const created = await apiCreateComment(post.id_annonce, { contenu: value });
          textarea.value = '';
          // update annonce timestamp if backend returned it with created comment
          if (created && created.date_mise_a_jour) {
            post.date_mise_a_jour = created.date_mise_a_jour;
            const timeEl = postEl.querySelector('.post-time');
            if (timeEl) timeEl.textContent = escapeHtml(formatDate(created.date_mise_a_jour));
          } else {
            // fallback: set to now
            const now = (new Date()).toISOString();
            post.date_mise_a_jour = now;
            const timeEl = postEl.querySelector('.post-time');
            if (timeEl) timeEl.textContent = escapeHtml(formatDate(now));
          }
          await loadAndRenderComments();
          // update comment count visually
          post.comments_count = (typeof post.comments_count === 'number' ? post.comments_count + 1 : 1);
          commentCountEl.textContent = `${post.comments_count} commentaire${post.comments_count>1?'s':''} • 0 partages`;
        } catch (err) { console.error(err); alert('Erreur commentaire: ' + err.message); }
        finally { sendBtn.disabled = false; }
      });

      commentsArea.appendChild(list);
      commentsArea.appendChild(inputWrap);
    }

    return postEl;
  }

  function closeAllPostMenus() {
    const dropdowns = document.querySelectorAll('.post-menu-dropdown.show');
    dropdowns.forEach(dd => {
      dd.classList.remove('show');
      dd.setAttribute('aria-hidden','true');
      const btn = dd.parentElement && dd.parentElement.querySelector('.post-menu-btn');
      if (btn) btn.setAttribute('aria-expanded','false');
    });
  }
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.post-menu')) closeAllPostMenus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllPostMenus(); });

  function renderPostsListAppend(posts, append = true) {
    if (!append) postsContainer.innerHTML = '';
    if (!posts || posts.length === 0) {
      if (!append) postsContainer.innerHTML = '<div style="padding:16px;color:#666">Aucune annonce.</div>';
      noMore = true;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }
    posts.forEach(p => {
      const el = createPostElement(p);
      if (append) postsContainer.appendChild(el); else postsContainer.insertBefore(el, postsContainer.firstChild || null);
    });
  }

  // Load page of posts (append)
  async function loadMorePosts() {
    if (loadingMore || noMore) return;
    loadingMore = true;
    if (!loadMoreBtn) {
      loadMoreBtn = document.createElement('div');
      loadMoreBtn.className = 'load-more';
      loadMoreBtn.textContent = 'Charger plus';
      loadMoreBtn.addEventListener('click', loadMorePosts);
      postsContainer.parentElement.appendChild(loadMoreBtn);
    }
    loadMoreBtn.textContent = 'Chargement...';
    try {
      const list = await apiListAnnonces(PAGE_LIMIT, currentOffset);
      if (!list || list.length === 0) {
        noMore = true;
        loadMoreBtn.style.display = 'none';
      } else {
        renderPostsListAppend(list, true);
        currentOffset += list.length;
        // if fewer than page limit, no more pages
        if (list.length < PAGE_LIMIT) { noMore = true; loadMoreBtn.style.display = 'none'; }
        else { loadMoreBtn.textContent = 'Charger plus'; loadMoreBtn.style.display = 'block'; }
      }
    } catch (err) {
      console.error('loadMorePosts error', err);
      if (loadMoreBtn) loadMoreBtn.textContent = 'Erreur, réessayer';
    } finally {
      loadingMore = false;
    }
  }

  // initial reload (clears + loads first page)
  async function reloadPosts() {
    currentOffset = 0;
    noMore = false;
    if (loadMoreBtn) loadMoreBtn.remove();
    loadMoreBtn = null;
    postsContainer.innerHTML = '<div style="padding:16px;color:#666">Chargement...</div>';
    try {
      const list = await apiListAnnonces(PAGE_LIMIT, 0);
      postsContainer.innerHTML = '';
      renderPostsListAppend(list, true);
      currentOffset = list.length;
      if (list.length >= PAGE_LIMIT) {
        loadMoreBtn = document.createElement('div');
        loadMoreBtn.className = 'load-more';
        loadMoreBtn.textContent = 'Charger plus';
        loadMoreBtn.addEventListener('click', loadMorePosts);
        postsContainer.parentElement.appendChild(loadMoreBtn);
      }
      if (list.length < PAGE_LIMIT) noMore = true;
    } catch (err) {
      console.error('reloadPosts error', err);
      postsContainer.innerHTML = `<div style="padding:16px;color:#c33">Erreur de chargement des annonces : ${escapeHtml(err.message)}</div>`;
    }
  }

  // modal + create logic (unchanged)
  function openModal() { postModal.style.display = 'flex'; }
  function closeModal() {
    postModal.style.display = 'none';
    postContentEl.value = '';
    publishButton.disabled = true;
    selectedUiVisibility = 'public';
    const vb = visibilitySelector.querySelector('.visibility-button');
    if (vb) vb.innerHTML = `<span>Public</span>`;
  }

  function openEditModal(post) {
    openModal();
    postContentEl.value = post.contenu;
    publishButton.disabled = false;
    selectedUiVisibility = mapApiVisibilityToUiKey(post.visibility);
    const vb = visibilitySelector.querySelector('.visibility-button');
    if (vb) vb.innerHTML = `<span>${escapeHtml(ROLES.find(r=>r.uiKey===selectedUiVisibility).label)}</span>`;

    const originalHandler = publishButton._handler || null;
    const editHandler = async function () {
      publishButton.disabled = true;
      try {
        const patch = { contenu: postContentEl.value.trim() };
        patch.visibility = mapVisibilityForApi(selectedUiVisibility);
        await apiUpdateAnnonce(post.id_annonce, patch);
        await reloadPosts();
        closeModal();
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la modification: ' + err.message);
      } finally {
        if (originalHandler) {
          publishButton.removeEventListener('click', editHandler);
          publishButton.addEventListener('click', originalHandler);
          publishButton._handler = originalHandler;
        }
      }
    };

    if (!originalHandler) publishButton._handler = publishButton._handler || publishButton._createHandler || null;
    if (publishButton._handler) publishButton.removeEventListener('click', publishButton._handler);
    publishButton.addEventListener('click', editHandler);
  }

  function initEvents() {
    openModalBtn && openModalBtn.addEventListener('click', openModal);
    closeModalBtn && closeModalBtn.addEventListener('click', closeModal);

    visibilitySelector && visibilitySelector.addEventListener('click', function (e) {
      e.stopPropagation();
      visibilityOptionsContainer.style.display = visibilityOptionsContainer.style.display === 'block' ? 'none' : 'block';
    });

    visibilityOptionsContainer && visibilityOptionsContainer.addEventListener('click', function (e) {
      const opt = e.target.closest('.visibility-option');
      if (!opt) return;
      const uiKey = opt.getAttribute('data-visibility');
      selectedUiVisibility = uiKey;
      const visibilityButton = visibilitySelector.querySelector('.visibility-button');
      const roleObj = ROLES.find(r => r.uiKey === uiKey);
      if (visibilityButton) visibilityButton.innerHTML = `<span>${escapeHtml(roleObj ? roleObj.label : 'Public')}</span>`;
      visibilityOptionsContainer.style.display = 'none';
    });

    document.addEventListener('click', function (e) { if (!visibilitySelector.contains(e.target)) visibilityOptionsContainer.style.display = 'none'; });

    postContentEl && postContentEl.addEventListener('input', function () { publishButton.disabled = postContentEl.value.trim() === ''; });

    // create handler
    const createHandler = async function () {
      const content = postContentEl.value.trim();
      if (!content) return;
      publishButton.disabled = true;
      try {
        const vis = mapVisibilityForApi(selectedUiVisibility);
        const res = await safeApiCreateAnnonce({ contenu: content, visibility: vis });
        // backend create might not include counts; add defaults
        res.likes_count = 0;
        res.comments_count = 0;
        res.liked_by_me = false;
        const currentNodes = postsContainer.children;
        const newEl = createPostElement(res);
        postsContainer.insertBefore(newEl, currentNodes[0] || null);
        closeModal();
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la publication : ' + err.message);
      } finally {
        publishButton.disabled = false;
      }
    };
    publishButton._createHandler = createHandler;
    publishButton._handler = createHandler;
    publishButton.addEventListener('click', createHandler);
  }

  // load current user info from token or backend if missing
  async function fetchCurrentUserIfMissing() {
    if (CURRENT_USER_ID && CURRENT_USER_ROLE) return;
    const token = localStorage.getItem('AUTH_TOKEN') || window.AUTH_TOKEN || null;
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
          CURRENT_USER_ID = CURRENT_USER_ID || (payload.sub || payload.id_utilisateur || payload.user_id || payload.id);
          CURRENT_USER_ROLE = CURRENT_USER_ROLE || (payload.role || payload.role_enum || payload.role_name);
          window.CURRENT_USER_ID = window.CURRENT_USER_ID || CURRENT_USER_ID;
          window.CURRENT_USER_ROLE = window.CURRENT_USER_ROLE || CURRENT_USER_ROLE;
          return;
        }
      } catch (e) {}
    }
    const endpoints = [API_BASE + '/auth/me', API_BASE + '/api/me', API_BASE + '/api/utilisateurs/me', API_BASE + '/api/session'];
    for (const url of endpoints) {
      try {
        const r = await fetch(url, { headers: headersJSON(), credentials: 'include' });
        if (!r.ok) continue;
        const j = await r.json();
        const id = j.id || j.id_utilisateur || (j.user && j.user.id) || null;
        const role = j.role || j.role_enum || (j.user && j.user.role) || null;
        if (id) {
          CURRENT_USER_ID = id;
          CURRENT_USER_ROLE = role;
          window.CURRENT_USER_ID = window.CURRENT_USER_ID || id;
          window.CURRENT_USER_ROLE = window.CURRENT_USER_ROLE || role;
          return;
        }
      } catch (e) {}
    }
  }

  async function safeApiCreateAnnonce({ contenu, visibility }) {
    if (!CURRENT_USER_ID) {
      await fetchCurrentUserIfMissing();
      if (!CURRENT_USER_ID) throw new Error('Utilisateur non identifié — connexion requise pour publier.');
    }
    return apiCreateAnnonce({ contenu, visibility });
  }

  // init
  async function init() {
    renderVisibilityOptions();
    initEvents();
    await fetchCurrentUserIfMissing();
    await reloadPosts();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
