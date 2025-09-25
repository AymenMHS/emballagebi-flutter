/* ========= Fichier JS fusionné : notifications + listing + create/edit soustraitant ========= */
/* ---------- tiny notification utils (unique) ---------- */
(function () {
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
        const opts = {
            duration: typeof options.duration === 'number' ? options.duration : 3500,
            stack: options.stack === true,
            icon: options.icon !== false,
            onClose: typeof options.onClose === 'function' ? options.onClose : null
        };
        const slideInMs = 300, fadeOutMs = 500;
        if (opts.duration < slideInMs + 100) opts.duration = slideInMs + 100 + fadeOutMs;

        // container optional (not strictly used, kept for future stacked layout)
        let container = document.getElementById('custom-notification-container');
        if (!container) { container = document.createElement('div'); container.id = 'custom-notification-container'; document.body.appendChild(container); }

        if (!opts.stack) { document.querySelectorAll('.custom-notification').forEach(n => n.remove()); }

        const notification = document.createElement('div');
        notification.className = 'custom-notification ' + (isSuccess ? 'success' : 'error');
        notification.setAttribute('role', 'status');
        notification.setAttribute('aria-live', 'polite');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'notification-icon';
        iconSpan.textContent = opts.icon ? (isSuccess ? '✓' : '⚠') : '';

        const content = document.createElement('div');
        content.className = 'notification-content';
        content.innerHTML = String(message);

        const close = document.createElement('span');
        close.className = 'notification-close';
        close.setAttribute('title', 'Fermer');
        close.textContent = '×';
        close.addEventListener('click', removeNow);

        notification.addEventListener('click', (e) => { if (e.target === notification) removeNow(); });
        notification.appendChild(iconSpan);
        notification.appendChild(content);
        notification.appendChild(close);
        document.body.appendChild(notification);

        const totalMs = opts.duration;
        const fadeDelayMs = Math.max(0, totalMs - fadeOutMs);
        notification.style.animation = `cn-slideIn ${slideInMs/1000}s forwards, cn-fadeOut ${fadeOutMs/1000}s forwards ${fadeDelayMs/1000}s`;

        const removeTimeout = setTimeout(() => { removeNow(); }, totalMs + 50);

        function removeNow() {
            clearTimeout(removeTimeout);
            if (!notification.parentNode) return;
            notification.style.pointerEvents = 'none';
            notification.style.transition = 'opacity 160ms linear, transform 160ms linear';
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            setTimeout(() => {
                if (notification.parentNode) notification.parentNode.removeChild(notification);
                if (opts.onClose) try { opts.onClose(); } catch (e) {}
            }, 180);
        }

        return { close: removeNow, node: notification };
    }

    // expose global helpers
    window.showNotification = showNotification;
    window.alert = function (m) { showNotification(m, false); };
})();

/* ---------- script principal fusionné (listing onglets + create/edit) ---------- */
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = ''; // si ton API est préfixée (ex: '/api'), mettre ici
    const LIMIT = 500;

    /* ------------------ PARTIE 1 : Listing / Onglets (clients.html) ------------------ */
    (function setupOngletsAndListing() {
        const containerAllOnglets = document.querySelector('.all-onglets-container');
        if (!containerAllOnglets) return; // page n'a pas l'UI onglets -> skip listing

        const ongletButtons = containerAllOnglets.querySelectorAll('.btns-onglets .onglet');
        const ongletContainers = containerAllOnglets.querySelectorAll('.onglet-container');

        // helper find .all-clients in second onglet (soustraitants)
        const soustraitantsContainer = document.querySelector('#soustraitants-container .all-clients');
        if (!soustraitantsContainer) return;
        let loaded = false;
        let loading = false;

        function formatDateIso(iso) {
            try {
                if (!iso) return '';
                const d = new Date(iso);
                if (isNaN(d)) return iso;
                return d.toLocaleDateString('fr-FR');
            } catch (e) { return iso; }
        }

        function makeCard(s) {
            const wrapper = document.createElement('div');
            wrapper.className = 'client';

            const round = document.createElement('div');
            round.className = 'round-circular';
            const img = document.createElement('img');
            img.src = '../img/icon/client.png';
            img.alt = 'ProfilClient';
            round.appendChild(img);

            const title = document.createElement('div');
            title.className = 'title-client';
            const h1 = document.createElement('h1');
            h1.textContent = s.nom || '—';
            const h3 = document.createElement('h3');
            h3.textContent = s.entreprise || s.telephone || '';
            const p = document.createElement('p');
            p.textContent = s.date_creation ? `Rajouté le : ${formatDateIso(s.date_creation)}` : '';

            title.appendChild(h1);
            title.appendChild(h3);
            title.appendChild(p);

            const btns = document.createElement('div');
            btns.className = 'btn-client';

            const editBtn = document.createElement('button');
            editBtn.style.backgroundColor = 'rgb(0, 83, 142)';
            editBtn.title = 'Éditer';
            editBtn.addEventListener('click', () => {
                window.location.href = `soustraitant.html?id=${encodeURIComponent(s.id_soustraitant)}`;
            });
            const editImg = document.createElement('img');
            editImg.src = '../img/icon/editer.png';
            editImg.alt = 'edit';
            editBtn.appendChild(editImg);

            const deleteBtn = document.createElement('button');
            deleteBtn.style.backgroundColor = 'rgb(137, 0, 0)';
            deleteBtn.title = 'Supprimer';
            deleteBtn.addEventListener('click', async () => {
                if (!confirm(`Supprimer "${s.nom}" ?`)) return;
                try {
                    const res = await fetch(`${API_BASE}/soustraitants/${encodeURIComponent(s.id_soustraitant)}`, { method: 'DELETE' });
                    if (res.status === 204) {
                        wrapper.remove();
                        window.showNotification('Sous-traitant supprimé', true);
                        if (!soustraitantsContainer.querySelector('.client')) showEmptyState();
                    } else {
                        let body = {};
                        try { body = await res.json(); } catch (e) {}
                        const err = (body && body.detail) ? body.detail : `Erreur (${res.status})`;
                        window.showNotification(err, false);
                    }
                } catch (e) {
                    console.error(e);
                    window.showNotification('Erreur réseau lors de la suppression', false);
                }
            });
            const delImg = document.createElement('img');
            delImg.src = '../img/icon/supprimer1.png';
            delImg.alt = 'delete';
            deleteBtn.appendChild(delImg);

            btns.appendChild(editBtn);
            btns.appendChild(deleteBtn);

            wrapper.appendChild(round);
            wrapper.appendChild(title);
            wrapper.appendChild(btns);

            return wrapper;
        }

        function clearContainer() {
            if (!soustraitantsContainer) return;
            while (soustraitantsContainer.firstChild) soustraitantsContainer.removeChild(soustraitantsContainer.firstChild);
        }

        function showEmptyState() {
            clearContainer();
            if (!soustraitantsContainer) return;
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <img src="../img/icon/client.png" alt="vide">
                <h3>Aucun sous-traitant</h3>
                <p>Ajoute un nouveau sous-traitant pour le voir ici.</p>
            `;
            soustraitantsContainer.appendChild(empty);
        }

        async function loadSoustraitants() {
            if (!soustraitantsContainer) {
                console.warn("Zone .all-clients (soustraitants) introuvable.");
                return;
            }
            if (loaded || loading) return;
            loading = true;
            clearContainer();

            const note = document.createElement('p');
            note.style.color = '#fff';
            note.style.opacity = '0.8';
            note.textContent = 'Chargement des sous-traitants...';
            soustraitantsContainer.appendChild(note);

            try {
                const res = await fetch(`${API_BASE}/soustraitants?limit=${LIMIT}`);
                if (!res.ok) {
                    window.showNotification(`Erreur chargement: ${res.status}`, false);
                    showEmptyState();
                    loading = false;
                    return;
                }
                const data = await res.json();
                clearContainer();
                if (!Array.isArray(data) || data.length === 0) {
                    showEmptyState();
                    loaded = true;
                    loading = false;
                    return;
                }

                for (const s of data) {
                    const card = makeCard({
                        id_soustraitant: s.id_soustraitant || s.id || s.id_client || null,
                        nom: s.nom || s.enseigne || '',
                        entreprise: s.entreprise || '',
                        telephone: s.telephone || '',
                        date_creation: s.date_creation || s.date_creation
                    });
                    soustraitantsContainer.appendChild(card);
                }
                loaded = true;
            } catch (e) {
                console.error('loadSoustraitants error', e);
                window.showNotification('Erreur réseau lors du chargement', false);
                showEmptyState();
            } finally {
                loading = false;
            }
        }

        // onglet click handling (if any)
        if (ongletButtons && ongletButtons.length && ongletContainers && ongletContainers.length) {
            ongletButtons.forEach((btn, idx) => {
                btn.addEventListener('click', () => {
                    ongletButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ongletContainers.forEach((c, i) => c.style.display = (i === idx) ? '' : 'none');
                    if (idx === 1) loadSoustraitants();
                });
            });
        }

        // si l'onglet sous-traitants est actif on charge
        const activeIndex = Array.from(ongletButtons).findIndex(b => b.classList.contains('active'));
        if (activeIndex === 1) loadSoustraitants();

        // debug hook
        window._loadSoustraitants = loadSoustraitants; // Exposer la fonction globalement

    // Charger automatiquement si l'onglet est actif au départ
        if (document.querySelector('#soustraitants-container').style.display !== 'none') {
            loadSoustraitants();
        }
    })();

    /* ------------------ PARTIE 2 : Create / Edit de soustraitant (soustraitant.html) ------------------ */
    (function setupCreateEditForm() {
        const saveBtn = document.getElementById('saveClientBtn');
        const inputsContainer = document.querySelector('.inputs-form-addclient');
        if (!saveBtn || !inputsContainer) return; // pas la page de formulaire -> skip

        // labels + inputs (robuste contre réordonnancement)
        const labelSpans = Array.from(inputsContainer.querySelectorAll('span'));
        const inputs = Array.from(inputsContainer.querySelectorAll('input'));

        function findInputByLabelKeyword(keywords) {
            const keys = Array.isArray(keywords) ? keywords : [keywords];
            for (const span of labelSpans) {
                const text = (span.textContent || '').toLowerCase();
                for (const k of keys) {
                    if (text.includes(k)) {
                        let candidate = span.nextElementSibling;
                        if (candidate && candidate.tagName && candidate.tagName.toLowerCase() === 'input') return candidate;
                        const inputsAfter = Array.from(span.parentElement.querySelectorAll('input'));
                        if (inputsAfter.length) return inputsAfter[0];
                    }
                }
            }
            for (const inp of inputs) {
                const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
                for (const k of keys) if (ph.includes(k)) return inp;
            }
            return null;
        }

        const nomInput = findInputByLabelKeyword(['nom', 'nom du sous-traitant']) || inputs[0] || null;
        const telephoneInput = findInputByLabelKeyword(['telephone', 'téléphone', 'numero', 'numéro', 'numero de telephone']) || inputs[1] || null;
        const entrepriseInput = findInputByLabelKeyword(['entreprise', 'societe']) || inputs[2] || null;

        if (!nomInput || !telephoneInput) {
            console.error('Impossible de localiser nomInput ou telephoneInput', { nomInput, telephoneInput, entrepriseInput, labelSpans, inputs });
            window.showNotification('Erreur interne: champs non trouvés (vérifie la structure HTML)', false);
            return;
        }

        const titleH1 = document.querySelector('.title-addclient-container h1');
        const breadcrumb = document.querySelector('.linkpages');

        const params = new URLSearchParams(window.location.search);
        const editingId = params.get('id');

        let mode = 'create';
        if (editingId) mode = 'edit';

        function setModeUI(m) {
            if (m === 'edit') {
                if (titleH1) titleH1.textContent = 'Modifier le Sous-traitant';
                if (breadcrumb && breadcrumb.innerHTML) breadcrumb.innerHTML = breadcrumb.innerHTML.replace('Nouveau Sous-traitant', 'Modifier le Sous-traitant');
                if (saveBtn) {
                    const icon = saveBtn.querySelector('img');
                    saveBtn.innerHTML = '';
                    if (icon) saveBtn.appendChild(icon);
                    saveBtn.insertAdjacentText('beforeend', 'Modifier le sous-traitant');
                }
            } else {
                if (titleH1) titleH1.textContent = 'Ajouter un nouveau Sous-traitant';
                if (breadcrumb && breadcrumb.innerHTML) breadcrumb.innerHTML = breadcrumb.innerHTML.replace('Modifier le Sous-traitant', 'Nouveau Sous-traitant');
                if (saveBtn) {
                    const icon = saveBtn.querySelector('img');
                    saveBtn.innerHTML = '';
                    if (icon) saveBtn.appendChild(icon);
                    saveBtn.insertAdjacentText('beforeend', 'Sauvegarder le sous-traitant');
                }
            }
        }
        setModeUI(mode);

        async function loadAndFill(id) {
            try {
                window.showNotification('Chargement des données...', true, { duration: 1200, stack: true });
                const res = await fetch(`${API_BASE}/soustraitants/${encodeURIComponent(id)}`);
                if (res.status === 200) {
                    const obj = await res.json();
                    if (nomInput) nomInput.value = obj.nom || '';
                    if (telephoneInput) telephoneInput.value = obj.telephone || '';
                    if (entrepriseInput) entrepriseInput.value = obj.entreprise || '';
                } else if (res.status === 404) {
                    window.showNotification('Sous-traitant introuvable (id invalide)', false);
                } else {
                    let body = {};
                    try { body = await res.json(); } catch(e){ }
                    const msg = (body && body.detail) ? body.detail : `Erreur (${res.status})`;
                    window.showNotification(`Échec chargement: ${msg}`, false);
                }
            } catch (e) {
                console.error('Erreur loadAndFill:', e);
                window.showNotification('Erreur réseau lors du chargement', false);
            }
        }

        async function saveSoustraitant() {
            try {
                const nom = (nomInput.value || '').trim();
                const entrepriseRaw = (entrepriseInput && entrepriseInput.value !== undefined) ? entrepriseInput.value : '';
                const entreprise = entrepriseRaw === '' ? null : entrepriseRaw.trim();
                const telephone = (telephoneInput.value || '').trim();

                if (!nom) { window.showNotification('Le nom du sous-traitant est requis', false); return; }
                if (!telephone) { window.showNotification('Le numéro de téléphone est requis', false); return; }

                // build payload and ensure entreprise key is present (even null) when editing
                const payload = { nom: nom, entreprise: entreprise, telephone: telephone };

                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.6';

                let res;
                if (mode === 'edit' && editingId) {
                    res = await fetch(`${API_BASE}/soustraitants/${encodeURIComponent(editingId)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    res = await fetch(`${API_BASE}/soustraitants`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                if (mode === 'edit') {
                    if (res.status === 200) {
                        window.showNotification('Sous-traitant modifié avec succès', true);
                        setTimeout(() => { window.location.href = 'clients.html'; }, 800);
                    } else {
                        let body = {};
                        try { body = await res.json(); } catch(e){ }
                        const errMsg = body && body.detail ? body.detail : `Erreur serveur (${res.status})`;
                        window.showNotification(errMsg, false);
                    }
                } else {
                    if (res.status === 201) {
                        window.showNotification('Sous-traitant sauvegardé avec succès', true);
                        setTimeout(() => { window.location.href = 'clients.html'; }, 800);
                    } else {
                        let body = {};
                        try { body = await res.json(); } catch(e){ }
                        const errMsg = body && body.detail ? body.detail : `Erreur serveur (${res.status})`;
                        window.showNotification(errMsg, false);
                    }
                }
            } catch (err) {
                console.error('Erreur inattendue dans saveSoustraitant:', err);
                window.showNotification('Erreur inattendue', false);
            } finally {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
            }
        }

        saveBtn.addEventListener('click', saveSoustraitant);

        if (mode === 'edit' && editingId) {
            loadAndFill(editingId);
        }
    })();

}); // end DOMContentLoaded

