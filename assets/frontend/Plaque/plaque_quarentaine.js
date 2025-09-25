// plaque_quarentaine.js
// Script pour Fetch les plaques en quarantaine, et changements de statut
// Assure-toi d'inclure ce script après le DOM (ou utiliser DOMContentLoaded)

(() => {
  // ------------------------
  // Notifications (fourni)
  // ------------------------
  function ensureNotificationStyle() {
    if (document.getElementById('custom-notification-styles')) return;
    const css = `
      .custom-notification { position: fixed; top: 20px; right: 20px; padding: 15px 22px; border-radius: 6px; color: #fff; z-index: 10000; box-shadow: 0 6px 18px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 12px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; min-width: 260px; max-width: calc(100vw - 40px); word-break: break-word; }
      .custom-notification.success { background-color: #4CAF50; border-left: 6px solid #2E7D32; }
      .custom-notification.error   { background-color: #F44336; border-left: 6px solid #C62828; }
      .custom-notification .notification-icon { font-size: 20px; line-height: 1; }
      .custom-notification .notification-content { flex: 1; font-size: 14px; }
      .custom-notification .notification-close { cursor: pointer; opacity: 0.9; font-weight: 700; padding-left: 8px; }
      @keyframes cn-slideIn { from { transform: translateX(100px); opacity: 0; } to   { transform: translateX(0); opacity: 1; } }
      @keyframes cn-fadeOut { from { opacity: 1; } to   { opacity: 0; } }
    `;
    const style = document.createElement('style');
    style.id = 'custom-notification-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function showNotification(message, isSuccess = true, options = {}) {
    ensureNotificationStyle();
    const opts = { duration: typeof options.duration === 'number' ? options.duration : 3500, stack: options.stack === true, icon: options.icon !== false, onClose: typeof options.onClose === 'function' ? options.onClose : null };
    const slideInMs = 300, fadeOutMs = 500;
    if (opts.duration < slideInMs + 100) opts.duration = slideInMs + 100 + fadeOutMs;
    let container = document.getElementById('custom-notification-container');
    if (!container) { container = document.createElement('div'); container.id = 'custom-notification-container'; document.body.appendChild(container); }
    if (!opts.stack) { document.querySelectorAll('.custom-notification').forEach(n => n.remove()); }
    const notification = document.createElement('div');
    notification.className = 'custom-notification ' + (isSuccess ? 'success' : 'error');
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    const iconSpan = document.createElement('span'); iconSpan.className = 'notification-icon'; iconSpan.textContent = opts.icon ? (isSuccess ? '✓' : '⚠') : '';
    const content = document.createElement('div'); content.className = 'notification-content'; content.innerHTML = String(message);
    const close = document.createElement('span'); close.className = 'notification-close'; close.setAttribute('title', 'Fermer'); close.textContent = '×';
    close.addEventListener('click', removeNow);
    notification.addEventListener('click', (e) => { if (e.target === notification) removeNow(); });
    notification.appendChild(iconSpan); notification.appendChild(content); notification.appendChild(close);
    document.body.appendChild(notification);
    const totalMs = opts.duration;
    const fadeDelayMs = Math.max(0, totalMs - fadeOutMs);
    notification.style.animation = `cn-slideIn ${slideInMs / 1000}s forwards, cn-fadeOut ${fadeOutMs / 1000}s forwards ${fadeDelayMs / 1000}s`;
    const removeTimeout = setTimeout(() => { removeNow(); }, totalMs + 50);
    function removeNow() { clearTimeout(removeTimeout); if (!notification.parentNode) return; notification.style.pointerEvents = 'none'; notification.style.transition = 'opacity 160ms linear, transform 160ms linear'; notification.style.opacity = '0'; notification.style.transform = 'translateX(20px)'; setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); if (opts.onClose) try { opts.onClose(); } catch (e) { } }, 180); }
    return { close: removeNow, node: notification };
  }

  // expose global (comme fourni)
  window.showNotification = showNotification;
  // redéfinir alert pour utiliser la notification d'erreur (comme dans ton snippet)
  window.alert = function (m) { showNotification(m, false); };

  // ------------------------
  // Configuration API
  // ------------------------
  // Si ton backend est servi sous /api (ou autre), modifie ici.
  const API_BASE = ""; // ex: "/api" ou "" si même origine et pas de préfixe

  // ------------------------
  // DOM références
  // ------------------------
  const root = document.getElementById("ongletQuarantaine");
  if (!root) return;

  const allPlaquesEl = root.querySelector(".all-plaques");
  const searchInput = root.querySelector(".inputSearchPlaque input");

  let plaques = []; // cache côté client
  let renderTimer = null;
  let searchTimer = null;

  /* ---------- Utils ---------- */
  function el(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      // format simple dd/mm/yyyy
      return d.toLocaleDateString();
    } catch (e) { return iso; }
  }

  function showLoadingPlaceholder() {
    allPlaquesEl.innerHTML = '<div style="padding:20px;color:#666">Chargement...</div>';
  }

  function showEmpty() {
    allPlaquesEl.innerHTML = '<div style="padding:20px;color:#666">Aucune plaque en quarantaine.</div>';
  }

  function handleError(err, userMessage) {
    console.error(err);
    const msg = userMessage || "Une erreur est survenue. Consulte la console pour plus de détails.";
    showNotification(msg, false);
  }

  /* ---------- Fetch / API ---------- */
  async function fetchPlaques() {
    showLoadingPlaceholder();
    try {
      const res = await fetch(`${API_BASE}/quarantaine/plaques`, {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Erreur chargement plaques: ${res.status} ${text}`);
      }
      const data = await res.json();
      plaques = Array.isArray(data) ? data : [];
      renderPlaques();
    } catch (err) {
      handleError(err, "Impossible de charger les plaques en quarantaine.");
      allPlaquesEl.innerHTML = '<div style="padding:20px;color:#c33">Impossible de charger les plaques.</div>';
    }
  }

  async function patchStatut(id_plaque, statut, btnEl) {
    // désactive bouton pendant la requête
    btnEl.disabled = true;
    const originalText = btnEl.innerText;
    btnEl.innerText = "Traitement...";
    try {
      const res = await fetch(`${API_BASE}/quarantaine/plaques/${id_plaque}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          // si tu veux préciser l'utilisateur pour l'audit (optionnel):
          // "X-User-Id": "<UUID>",
        },
        body: JSON.stringify({ statut })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur update: ${res.status} ${txt}`);
      }
      const result = await res.json();

      // message de succès : utiliser le numéro de plaque si dispo
      const numero = result && result.numero_plaque ? result.numero_plaque : null;
      const msg = numero ? `Plaque N°${numero} : statut mis à jour (${statut}).` : `Statut mis à jour (${statut}).`;
      showNotification(msg, true);

      // retirer la carte locale (car elle ne doit plus être en quarantaine)
      const node = allPlaquesEl.querySelector(`.plaque-container[data-id="${id_plaque}"]`);
      if (node) node.remove();

      // aussi retirer du cache
      plaques = plaques.filter(p => p.id_plaque !== id_plaque);

      // si plus d'éléments, afficher vide
      if (plaques.length === 0) showEmpty();

    } catch (err) {
      handleError(err, "Impossible de mettre à jour le statut.");
      btnEl.disabled = false;
      btnEl.innerText = originalText;
    }
  }

  /* ---------- Render ---------- */
  function buildPlaqueNode(p) {
    // Prépare textes clients/produits (tronqués si trop long)
    const clientsText = p.clients && p.clients.length ? p.clients.join(", ") : "—";
    const produitsText = p.produits && p.produits.length ? p.produits.join(", ") : "—";
    const dateText = formatDate(p.date_mise_a_jour);

    const html = `
      <div class="plaque-container" tabindex="0" data-id="${p.id_plaque}">
        <img class="thumbPlaque" src="${p.thumbnail ? p.thumbnail : '../img/icon/papeterie-papiers-empiles.png'}" alt="Aperçu plaque">
        <div class="clientProduitCouple">
          <h1>N° ${p.numero_plaque}</h1>
          <p><img src="../img/icon/profilclient.png" alt="clients">${escapeHtml(clientsText)}</p>
          <p><img src="../img/icon/produit - Copie.png" alt="produits">${escapeHtml(produitsText)}</p>
        </div>
        <div class="statut-plaque">
          <p>
            <img src="../img/icon/pointrouge.png" alt="">
            En quarantaine
          </p>
        </div>
        <div class="dateMiseAjour">
          <p>${escapeHtml(dateText)}</p>  
        </div>
        <div class="actionPlaque">
          <button type="button" class="btn1" data-action="set-indisponible">
            <img src="../img/icon/arret.png" alt="">
            Indisponible
          </button>
          <button type="button" class="btn2" data-action="set-utilisable">
            <img src="../img/icon/verifie.png" alt="">
            Utilisable
          </button>
        </div>
      </div>
    `;

    const node = el(html);

    // Attache listeners boutons
    const btnIndispo = node.querySelector('button[data-action="set-indisponible"]');
    const btnOk = node.querySelector('button[data-action="set-utilisable"]');

    btnIndispo.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Confirmer : rendre cette plaque définitivement indisponible ?")) return;
      patchStatut(p.id_plaque, "indisponible", btnIndispo);
    });

    btnOk.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Confirmer : remettre la plaque en stock (utilisable) ?")) return;
      patchStatut(p.id_plaque, "en_stock", btnOk);
    });

    // clic sur toute la carte (optionnel)
    node.addEventListener("click", (e) => {
      // ex: ouvrir la page newplaque.html?id_conception=...
      // if (p.nom_conception) window.location.href = `newplaque.html?id_conception=${p.nom_conception}`;
    });

    return node;
  }

  function renderPlaques(filtered = null) {
    // annule rendu planifié
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const list = Array.isArray(filtered) ? filtered : plaques;
      allPlaquesEl.innerHTML = "";
      if (!list.length) {
        showEmpty();
        return;
      }

      const frag = document.createDocumentFragment();
      list.forEach(p => {
        const node = buildPlaqueNode(p);
        frag.appendChild(node);
      });

      allPlaquesEl.appendChild(frag);
    }, 10);
  }

  /* ---------- Search ---------- */
  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function filterByQuery(q) {
    if (!q) return plaques;
    const qq = q.trim().toLowerCase();
    return plaques.filter(p => {
      const fields = [
        String(p.numero_plaque),
        p.nom_conception || "",
        (p.clients || []).join(" "),
        (p.produits || []).join(" ")
      ].join(" ").toLowerCase();
      return fields.indexOf(qq) !== -1;
    });
  }

  function setupSearch() {
    if (!searchInput) return;
    searchInput.addEventListener("input", (e) => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = e.target.value;
        const filtered = filterByQuery(q);
        renderPlaques(filtered);
      }, 180); // debounce
    });
  }

  /* ---------- Public init ---------- */
  function init() {
    setupSearch();
    fetchPlaques();

    // recharger quand l'onglet s'affiche : observer display
    const observer = new MutationObserver((mut) => {
      mut.forEach(m => {
        if (m.attributeName === "style" || m.attributeName === "class") {
          const isShown = window.getComputedStyle(root).display !== "none";
          if (isShown && plaques.length === 0) {
            fetchPlaques();
          }
        }
      });
    });
    observer.observe(root, { attributes: true, attributeFilter: ["style", "class"] });
  }

  // Exécution
  document.addEventListener("DOMContentLoaded", init);
})();
