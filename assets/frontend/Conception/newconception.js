/* --------- Système de lazy loading (du deuxième code) --------- */
let clientsData = [];
let produitsData = [];
let soustraitantsData = [];

let clientsPromise = null;
let produitsPromise = null;
let soustraitantsPromise = null;

function loadClientsOnce() {
    if (clientsPromise) return clientsPromise;
    clientsPromise = fetchClients()
        .then(list => { clientsData = Array.isArray(list) ? list : []; window.__clientsData = clientsData; return clientsData; })
        .catch(err => { clientsPromise = null; console.warn('loadClientsOnce failed', err); return []; });
    return clientsPromise;
}

function loadProduitsOnce() {
    if (produitsPromise) return produitsPromise;
    produitsPromise = fetchProduits()
        .then(list => { produitsData = Array.isArray(list) ? list : []; window.__produitsData = produitsData; return produitsData; })
        .catch(err => { produitsPromise = null; console.warn('loadProduitsOnce failed', err); return []; });
    return produitsPromise;
}

function loadSoustraitantsOnce() {
    if (soustraitantsPromise) return soustraitantsPromise;
    soustraitantsPromise = fetchSoustraitantsTop()
        .then(list => { soustraitantsData = Array.isArray(list) ? list : []; window.__soustraitantsData = soustraitantsData; populateSoustraitantsSelectTop(soustraitantsData); return soustraitantsData; })
        .catch(err => { soustraitantsPromise = null; console.warn('loadSoustraitantsOnce failed', err); return []; });
    return soustraitantsPromise;
}

window.loadClientsOnce = loadClientsOnce;
window.loadProduitsOnce = loadProduitsOnce;
window.loadSoustraitantsOnce = loadSoustraitantsOnce;

/* --------- Fetch helpers (inchangés) --------- */
async function fetchClients() {
    try {
        const res = await fetch('/api/conception/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('Erreur réseau');
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map(c => {
            const id = c.id || c.id_client || c.idClient || c.uuid || c._id || null;
            const enseigne = c.enseigne || c.nom || c.name || '';
            return { ...c, id: id, id_client: c.id_client || id, enseigne };
        });
    } catch (e) {
        console.error('fetchClients error', e);
        return [];
    }
}

async function fetchProduits() {
    try {
        const res = await fetch('/api/conception/produits', { credentials: 'include' });
        if (!res.ok) throw new Error('Erreur réseau');
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map(p => {
            const id = p.id || p.id_produit || p.idProduit || p.uuid || p._id || null;
            const nom = p.nom_produit || p.nom || p.name || '';
            return { ...p, id, id_produit: p.id_produit || id, nom, nom_produit: p.nom_produit || nom };
        });
    } catch (e) {
        console.error('fetchProduits error', e);
        return [];
    }
}

async function fetchSoustraitantsTop() {
    try {
        const resp = await fetch('/api/conception/soustraitants', { credentials: 'include' });
        if (!resp.ok) {
            console.warn('fetchSoustraitants non OK', resp.status);
            return [];
        }
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('fetchSoustraitants error', e);
        return [];
    }
}

function populateSoustraitantsSelectTop(list) {
    const select = document.getElementById('sous-traitant-select');
    if (!select) return;

    select.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— Sélectionnez un sous-traitant —';
    select.appendChild(emptyOpt);

    for (const s of list) {
        const opt = document.createElement('option');
        opt.value = s.id_soustraitant || s.id || s.id_sous_traitant || s.idSousTraitant || '';
        opt.textContent = s.nom || s.entreprise || s.raison_sociale || opt.value;
        select.appendChild(opt);
    }

    if (list && list.length) {
        const cb = document.getElementById('sous-traitant');
        if (cb && cb.checked) select.removeAttribute('disabled');
        else select.setAttribute('disabled', 'disabled');
    } else {
        select.setAttribute('disabled', 'disabled');
    }
}

window.fetchSoustraitants = fetchSoustraitantsTop;
window.populateSoustraitantsSelect = populateSoustraitantsSelectTop;


async function deleteSoustraitantFromServer(conceptionId, { token } = {}) {
    if (!conceptionId) throw new Error('conceptionId manquant');
    const url = `/api/conception/${encodeURIComponent(conceptionId)}/soustraitant`;
    const opts = {
        method: 'DELETE',
        credentials: 'include', // garde si tu utilises cookie-based auth
        headers: {}
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const resp = await fetch(url, opts);
    if (!resp.ok) {
        const txt = await resp.text().catch(() => null);
        throw new Error(txt || `HTTP ${resp.status}`);
    }
    return true;
}

/* ------------------ UI: checkbox/select soustraitants (lazy load) ------------------ */
document.addEventListener('DOMContentLoaded', () => {
    const cb = document.getElementById('sous-traitant');
    const select = document.getElementById('sous-traitant-select');
    if (!cb || !select) return;

    const onFirstOpen = (e) => {
        loadSoustraitantsOnce().catch(() => { });
        select.removeEventListener('focus', onFirstOpen);
        select.removeEventListener('mousedown', onFirstOpen);
    };
    select.addEventListener('focus', onFirstOpen);
    select.addEventListener('mousedown', onFirstOpen);

    cb.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const select = document.getElementById('sous-traitant-select');
        const wrap = document.getElementById('select-wrap');

        // UI : ouvrir/fermer le panneau et activer/désactiver le select
        if (checked) {
            // user veut un soustraitant -> lazy load si nécessaire
            loadSoustraitantsOnce().catch(() => { });
            if (select) select.removeAttribute('disabled');
            if (wrap) wrap.setAttribute('aria-hidden', 'false');

            // annule l'intention de suppression si elle existait
            window.shouldClearSoustraitant = false;
            return;
        }

        // décoché -> UI seulement : désactiver et vider le select.
        if (select) {
            // conserve la valeur si tu veux (pour rollback si annulation)
            select._prevValue = select.value || '';
            select.value = '';
            select.setAttribute('disabled', 'disabled');
        }
        if (wrap) wrap.setAttribute('aria-hidden', 'true');

        // ne touche pas le serveur maintenant : on marque l'intention
        // la suppression effective (si on veut) sera faite au click "Sauvegarder"
        window.shouldClearSoustraitant = true;
    });
});

/* ------------------ Choose client/product suggestions (avec lazy loading) ------------------ */
(function enableChoose() {
    const MAX_SUGGESTIONS = 500;

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function createChooseClientInputOnly(origChooseEl) {
        const isClient = origChooseEl.querySelector('.suggestions')?.classList.contains('suggestions-client');
        const wrapper = document.createElement('div');
        wrapper.className = 'choose-client-plaque';

        const inputChoose = document.createElement('div');
        inputChoose.className = 'input-choose';

        const btnDel = document.createElement('button');
        btnDel.className = 'delete-input';
        btnDel.innerHTML = '×';
        btnDel.style.background = '#ff4757';
        btnDel.style.color = 'white';
        btnDel.style.border = 'none';
        btnDel.style.borderRadius = '4px';
        btnDel.style.padding = '5px 10px';
        btnDel.style.cursor = 'pointer';
        btnDel.style.marginRight = '5px';

        const input = document.createElement('input');
        input.type = 'text';
        const origInput = origChooseEl.querySelector('input');
        input.placeholder = origInput ? (origInput.placeholder || '') : '';

        inputChoose.appendChild(btnDel);
        inputChoose.appendChild(input);
        wrapper.appendChild(inputChoose);

        const sugg = document.createElement('div');
        sugg.className = isClient ? 'suggestions suggestions-client' : 'suggestions suggestions-product';
        sugg.setAttribute('role', 'listbox');
        sugg.setAttribute('aria-label', isClient ? 'suggestions-client' : 'suggestions-product');
        wrapper.appendChild(sugg);

        return wrapper;
    }

    function findPlusButton(chooseEl) {
        if (!chooseEl) return null;

        const idBtn = chooseEl.querySelector('button[id^="addbtn"]');
        if (idBtn) return idBtn;

        const btnCandidate = chooseEl.querySelector('button.add-input, button.plus, button.add');
        if (btnCandidate) return btnCandidate;

        const imgs = Array.from(chooseEl.querySelectorAll('img')).filter(i => i.src);
        for (const img of imgs) {
            const s = img.src.toLowerCase();
            if (s.includes('addclient.png') || s.includes('addproduct.png') || s.includes('plus.png') || s.includes('/plus')) {
                const p = img.closest('button');
                if (p) return p;
            }
        }

        const parent = chooseEl.closest('.clientproduit-plaque') || chooseEl.parentNode;
        if (parent) {
            const grp = parent.querySelector('button[id^="addbtn"], button.add-input, button.add, button');
            if (grp) return grp;
        }

        return null;
    }

    function updateDeleteVisibilityForParent(parentEl) {
        if (!parentEl) return;
        const chooses = Array.from(parentEl.querySelectorAll('.choose-client-plaque'));
        chooses.forEach((ch, idx) => {
            const del = ch.querySelector('.input-choose .delete-input');
            if (!del) return;
            if (idx === 0) { del.style.display = 'none'; del.setAttribute('aria-hidden', 'true'); }
            else { del.style.display = ''; del.setAttribute('aria-hidden', 'false'); }
        });
    }

    function initChooseElement(chooseEl) {
        if (!chooseEl || chooseEl._initDone) return;
        chooseEl._initDone = true;
        const input = chooseEl.querySelector('input');
        const suggestionsEl = chooseEl.querySelector('.suggestions') || (() => {
            const s = document.createElement('div'); s.className = 'suggestions'; chooseEl.appendChild(s); return s;
        })();
        const isClient = suggestionsEl.classList.contains('suggestions-client');

        function safeStr(v) { return v === null || v === undefined ? '' : String(v); }
        function extractId(item) { return safeStr(item.id || item.id_client || item.id_produit || item.uuid || item._id || ''); }
        function extractLabel(item) { return safeStr(item.enseigne || item.nom || item.nom_produit || item.name || item.label || item.titre || ''); }
        function hideSuggestions() { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; activeIndex = -1; }
        function showSuggestions() { suggestionsEl.style.display = 'block'; }
        let activeIndex = -1;
        let currentList = [];

        function renderSuggestions(list, query) {
            suggestionsEl.innerHTML = '';
            currentList = Array.isArray(list) ? list : [];
            activeIndex = -1;
            if (!currentList.length) {
                const no = document.createElement('div'); no.className = 'no-result'; no.setAttribute('role', 'option');
                no.textContent = (query && query.trim()) ? `Aucun résultat pour « ${query} »` : 'Aucun résultat';
                suggestionsEl.appendChild(no);
                const create = document.createElement('div'); create.className = 'create-item';
                create.innerHTML = `
                    <img src="${isClient ? '../img/icon/addclient.png' : '../img/icon/addproduct.png'}" alt="create">
                    <div class="label">${query && query.trim() ? `Créer « ${query} »` : (isClient ? 'Créer un nouveau client' : 'Créer un nouveau produit')}</div>
                `;
                create.tabIndex = 0;
                create.addEventListener('click', () => {
                    if (query && query.trim()) input.value = query;
                    window.clickAddButtonIfExists(chooseEl);
                    hideSuggestions();
                });
                create.addEventListener('keydown', (e) => { if (e.key === 'Enter') create.click(); });
                suggestionsEl.appendChild(create);
                showSuggestions();
                return;
            }
            currentList.forEach((item, idx) => {
                const displayName = extractLabel(item) || extractId(item) || (isClient ? 'Client' : 'Produit');
                const datasetId = extractId(item);
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.setAttribute('role', 'option');
                div.dataset.id = datasetId;
                div.dataset.index = String(idx);
                div.innerHTML = `
                    <img src="${isClient ? '../img/icon/profilclient.png' : '../img/icon/produit - Copie.png'}" alt="${displayName}">
                    <div class="name">${displayName}</div>
                `;
                div.addEventListener('click', () => selectItem(idx));
                suggestionsEl.appendChild(div);
            });
            showSuggestions();
        }

        // ensure data loaded before trying to search
        function ensureDataThen(fn) {
            const loader = isClient ? loadClientsOnce() : loadProduitsOnce();
            return loader.then(() => fn()).catch(() => fn());
        }

        function limitList(list) {
            if (!Array.isArray(list)) return [];
            if (!MAX_SUGGESTIONS || MAX_SUGGESTIONS <= 0) return list.slice();
            return list.slice(0, MAX_SUGGESTIONS);
        }

        function renderForQuery(val) {
            const q = (val || '').toLowerCase();
            const source = isClient ? clientsData : produitsData;
            if (!source || !source.length) { renderSuggestions([], val); return; }
            if (val === '') { renderSuggestions(limitList(source), ''); return; }
            const starts = [], contains = [];
            for (const d of source) {
                const name = (d.enseigne || d.nom || d.nom_produit || d.name || '').toString().toLowerCase();
                if (!name) continue;
                if (name.startsWith(q)) starts.push(d); else if (name.includes(q)) contains.push(d);
            }
            renderSuggestions(limitList(starts.concat(contains)), val);
        }

        function update() {
            const source = isClient ? clientsData : produitsData;
            const val = (input.value || '').trim();
            if (!source || !source.length) {
                ensureDataThen(() => renderForQuery(val));
                return;
            }
            renderForQuery(val);
        }

        function selectItem(idx) {
            const item = currentList[idx];
            if (!item) return;
            const label = extractLabel(item) || extractId(item) || '';
            const id = extractId(item) || '';
            input.value = label;
            if (id) input.dataset.selectedId = String(id); else delete input.dataset.selectedId;
            const items = suggestionsEl.querySelectorAll('.suggestion-item'); items.forEach(it => it.classList.remove('active'));
            const cur = items[idx]; if (cur) cur.classList.add('active');
            hideSuggestions();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function clearSelectedIdIfTyping() { if (input && input.dataset && input.dataset.selectedId) delete input.dataset.selectedId; }
        function onKeyDown(e) {
            if (suggestionsEl.style.display === 'none' || !currentList.length) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') update();
                return;
            }
            const items = suggestionsEl.querySelectorAll('.suggestion-item');
            if (!items || items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); updateActive(items); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); updateActive(items); }
            else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0) selectItem(activeIndex); else selectItem(0); }
            else if (e.key === 'Escape') { hideSuggestions(); }
        }
        function updateActive(items) {
            items.forEach(it => it.classList.remove('active'));
            const cur = items[activeIndex];
            if (cur) { cur.classList.add('active'); if (typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' }); }
        }
        function onDocClick(e) { if (!chooseEl.contains(e.target)) hideSuggestions(); }

        if (input) {
            input.setAttribute('autocomplete', 'off');
            input.addEventListener('input', () => { clearSelectedIdIfTyping(); update(); });
            input.addEventListener('focus', () => { ensureDataThen(() => update()); });
            input.addEventListener('keydown', onKeyDown);
            input.addEventListener('keyup', () => { if ((input.value || '').trim() === '') delete input.dataset.selectedId; });
        }

        const inputChoose = chooseEl.querySelector('.input-choose');
        if (inputChoose) {
            const delBtn = inputChoose.querySelector('.delete-input');
            if (delBtn && !delBtn._boundDelete) {
                delBtn._boundDelete = true;
                delBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const parent = delBtn.closest('.choose-client-plaque');
                    if (!parent) return;
                    if (!confirm('Supprimer ce champ ?')) return;
                    const groupParent = parent.closest('.clientproduit-plaque') || parent.parentNode;
                    parent.remove();
                    updateDeleteVisibilityForParent(groupParent);
                    if (window.updateAllInfoPlaqueShadows) window.updateAllInfoPlaqueShadows();
                });
            }
        }

        document.addEventListener('click', onDocClick);
        chooseEl._debug = chooseEl._debug || {}; chooseEl._debug.hideSuggestions = hideSuggestions; chooseEl._debug.renderSuggestions = renderSuggestions;
    }

    // Initialize choose elements
    document.querySelectorAll('.choose-client-plaque').forEach(el => initChooseElement(el));
    document.querySelectorAll('.clientproduit-plaque').forEach(parent => updateDeleteVisibilityForParent(parent));

    window.clickAddButtonIfExists = function (chooseEl) {
        if (!chooseEl) return false;

        const addClientBtn = chooseEl.querySelector('#addbtnClient');
        const addProductBtn = chooseEl.querySelector('#addbtnProduct');
        if (addClientBtn) { addClientBtn.click(); return true; }
        if (addProductBtn) { addProductBtn.click(); return true; }

        const group = chooseEl.closest('.clientproduit-plaque') || chooseEl.parentNode;
        if (group) {
            const gClient = group.querySelector('#addbtnClient');
            const gProduct = group.querySelector('#addbtnProduct');
            if (gClient) { gClient.click(); return true; }
            if (gProduct) { gProduct.click(); return true; }
        }

        return false;
    };

    (function bindAddbtnGroup() {
        function addForId(id, isClientGroup) {
            const btn = document.getElementById(id);
            if (!btn) return;
            if (btn._boundAddBtn || btn._cloneBound) return;
            btn._boundAddBtn = true;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const group = btn.closest('.clientproduit-plaque') || document.querySelector('.clientproduit-plaque');
                if (!group) return;
                const chooses = Array.from(group.querySelectorAll('.choose-client-plaque'));
                const reference = chooses.length ? chooses[chooses.length - 1] : group.querySelector('.choose-client-plaque');
                if (!reference) return;
                const newNode = createChooseClientInputOnly(reference);
                insertAfter(newNode, reference);
                initChooseElement(newNode);
                updateDeleteVisibilityForParent(group);
                setTimeout(() => { const ni = newNode.querySelector('input'); if (ni) ni.focus(); }, 10);
            });
        }
        addForId('addbtnClient', true);
        addForId('addbtnProduct', false);

        const obs = new MutationObserver(() => {
            addForId('addbtnClient', true);
            addForId('addbtnProduct', false);
        });
        obs.observe(document.body, { childList: true, subtree: true });
    })();

    window.initChooseElement = function (el) { try { initChooseElement(el); } catch (e) { console.error(e); } };
    window.updateDeleteVisibilityForParent = updateDeleteVisibilityForParent;
})();

/* ----------------------- Upload files module (inchangé) ----------------------- */
(function simpleUploader() {
    const container = document.querySelector('.add-conception') || document;
    const fileInput = container.querySelector('.file-input') || document.getElementById('fileInput');
    const fileUpload = container.querySelector('.file-upload') || null;
    const filesList = container.querySelector('.files-conception') || null;

    window._attachedFiles = window._attachedFiles || [];
    window._existingFiles = window._existingFiles || [];
    window.filesToDelete = window.filesToDelete || [];

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);
        return (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) + ' ' + sizes[i];
    }

    function clearFilesUI() {
        if (filesList) filesList.innerHTML = '';
    }

    function renderExistingFilesUI() {
        if (!filesList) return;
        for (const meta of window._existingFiles) {
            const row = createExistingFileRow(meta);
            if (row) filesList.appendChild(row);
        }
    }

    function renderAttachedFilesUI() {
        if (!filesList) return;
        window._attachedFiles.forEach((f, idx) => {
            const row = document.createElement('div');
            row.className = 'file-conception';
            row.dataset.fileIndex = String(idx);

            const desc = document.createElement('div'); desc.className = 'file-conception-desc';
            const logo = document.createElement('div'); logo.className = 'logo-file';
            const imgIcon = document.createElement('img'); imgIcon.src = f.type && f.type.startsWith('image/') ? '../img/icon/images.png' : '../img/icon/fichier.png';
            imgIcon.alt = 'file';
            logo.appendChild(imgIcon);

            const title = document.createElement('div'); title.className = 'title-file';
            const h1 = document.createElement('h1'); h1.textContent = f.name;
            const p = document.createElement('p'); p.textContent = formatBytes(f.size);
            title.appendChild(h1); title.appendChild(p);

            desc.appendChild(logo); desc.appendChild(title);

            const btns = document.createElement('div'); btns.className = 'btns-file';
            if (f.type && f.type.startsWith('image/')) {
                const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.title = 'Voir'; viewBtn.dataset.action = 'view';
                const viewImg = document.createElement('img'); viewImg.src = '../img/icon/vue.png'; viewImg.alt = 'voir'; viewBtn.appendChild(viewImg); btns.appendChild(viewBtn);
            }
            const dlBtn = document.createElement('button'); dlBtn.type = 'button'; dlBtn.title = 'Télécharger'; dlBtn.dataset.action = 'download';
            const dlImg = document.createElement('img'); dlImg.src = '../img/icon/telechargements.png'; dlImg.alt = 'download'; dlBtn.appendChild(dlImg); btns.appendChild(dlBtn);
            const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.title = 'Supprimer'; delBtn.dataset.action = 'delete';
            const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer2.png'; delImg.alt = 'delete'; delBtn.appendChild(delImg); btns.appendChild(delBtn);

            row.appendChild(desc); row.appendChild(btns);
            filesList.appendChild(row);
        });
    }

    window.renderAllFiles = function renderAllFiles() {
        if (!filesList) return;
        clearFilesUI();
        renderExistingFilesUI();
        renderAttachedFilesUI();
    };

    function addFiles(fileList) {
        if (!fileList || !fileList.length) return;
        for (const f of Array.from(fileList)) {
            window._attachedFiles.push(f);
        }
        window.renderAllFiles();
        if (fileInput) fileInput.value = '';
        console.debug('simpleUploader: attached files count=', window._attachedFiles.length);
    }

    if (fileUpload) {
        fileUpload.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); fileUpload.classList.add('dragover'); });
        fileUpload.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); fileUpload.classList.add('dragover'); });
        fileUpload.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); fileUpload.classList.remove('dragover'); });
        fileUpload.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); fileUpload.classList.remove('dragover'); const dt = e.dataTransfer; if (dt && dt.files && dt.files.length) addFiles(dt.files); });
    }
    if (fileInput) fileInput.addEventListener('change', (e) => { const fl = e.target.files; if (fl && fl.length) addFiles(fl); });

    window.getAttachedFiles = function () { return (window._attachedFiles || []).slice(); };
    window.clearAttachedFiles = function () { window._attachedFiles = []; window.renderAllFiles && window.renderAllFiles(); };

    if (filesList) {
        filesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const row = btn.closest('.file-conception');
            if (!row) return;

            if (row.dataset.existingFile === 'true') {
                const fileId = row.dataset.fileId || row.dataset.id || null;
                const filename = row.dataset.filename || '';
                if (!fileId) return;

                if (action === 'view-existing') {
                    try {
                        const resp = await fetch(`/api/conception/fichier/${fileId}`, { method: 'GET', credentials: 'include' });
                        if (!resp.ok) { const txt = await resp.text().catch(() => null); showNotification('Impossible de charger l\'image : ' + (txt || resp.status), false); return; }
                        const blob = await resp.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        openImagePreview(blobUrl, filename || 'preview');
                    } catch (err) { console.error(err); showNotification('Erreur réseau lors de la récupération', false); }
                    return;
                }
                if (action === 'download-existing') { window.open(`/api/conception/fichier/${fileId}`, '_blank'); return; }
                if (action === 'delete-existing') {
                    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;
                    try {
                        const resp = await fetch(`/api/conception/fichier/${fileId}`, { method: 'DELETE', credentials: 'include' });
                        if (!resp.ok) { const txt = await resp.text().catch(() => null); showNotification('Erreur lors de la suppression: ' + (txt || resp.status), false); return; }
                        window._existingFiles = (window._existingFiles || []).filter(m => String(m.id_fichier || m.id || m.idFile || '') !== String(fileId));
                        window.filesToDelete = window.filesToDelete || [];
                        if (fileId && fileId.trim() !== '') {
                            window.filesToDelete.push(String(fileId));
                        }
                        window.renderAllFiles && window.renderAllFiles();
                        showNotification('Fichier supprimé avec succès !', true, { duration: 2000 });
                    } catch (err) { console.error(err); showNotification('Erreur réseau lors de la suppression', false); }
                    return;
                }
                return;
            }

            const idx = parseInt(row.dataset.fileIndex, 10);
            const f = (!Number.isNaN(idx) && window._attachedFiles && window._attachedFiles[idx]) ? window._attachedFiles[idx] : null;
            if (!f) return;
            if (action === 'view') {
                const blobUrl = URL.createObjectURL(f);
                openImagePreview(blobUrl, f.name);
                return;
            }
            if (action === 'download') {
                const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
                return;
            }
            if (action === 'delete') {
                if (Number.isNaN(idx)) return;
                window._attachedFiles.splice(idx, 1);
                window.renderAllFiles && window.renderAllFiles();
                return;
            }
        });
    }

    let lightboxEl = null;
    function openImagePreview(url, filename) {
        if (lightboxEl) lightboxEl.remove();
        const shouldRevoke = typeof url === 'string' && url.startsWith('blob:');
        lightboxEl = document.createElement('div');
        lightboxEl.style.position = 'fixed'; lightboxEl.style.left = '0'; lightboxEl.style.top = '0'; lightboxEl.style.width = '100vw'; lightboxEl.style.height = '100vh';
        lightboxEl.style.background = 'rgba(0,0,0,0.75)'; lightboxEl.style.display = 'flex'; lightboxEl.style.alignItems = 'center'; lightboxEl.style.justifyContent = 'center';
        lightboxEl.style.zIndex = '20000'; lightboxEl.style.cursor = 'zoom-out';
        const container = document.createElement('div'); container.style.maxWidth = '90%'; container.style.maxHeight = '90%'; container.style.padding = '8px'; container.style.boxSizing = 'border-box';
        const img = document.createElement('img'); img.src = url; img.alt = filename || 'preview'; img.style.maxWidth = '100%'; img.style.maxHeight = '80vh'; img.style.borderRadius = '6px'; img.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
        const caption = document.createElement('div'); caption.textContent = filename || ''; caption.style.color = 'white'; caption.style.marginTop = '8px'; caption.style.fontFamily = 'sans-serif'; caption.style.fontSize = '14px';
        container.appendChild(img); container.appendChild(caption); lightboxEl.appendChild(container);
        lightboxEl.addEventListener('click', (ev) => { if (ev.target === lightboxEl) closeLightbox(); });
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(lightboxEl);
        function onKeyDown(e) { if (e.key === 'Escape') closeLightbox(); }
        function closeLightbox() { if (!lightboxEl) return; lightboxEl.remove(); lightboxEl = null; document.removeEventListener('keydown', onKeyDown); try { if (shouldRevoke) URL.revokeObjectURL(url); } catch (e) { } }
    }

    window.renderAllFiles();
    console.debug('simpleUploader inited, fileInput=', !!fileInput, 'filesList=', !!filesList);
    window._addAttachedFiles = addFiles;

    async function uploadFileToConception(conceptionId, file) {
        const fd = new FormData();
        fd.append('fichiers', file);
        const resp = await fetch(`/api/conception/${encodeURIComponent(conceptionId)}/fichiers`, {
            method: 'POST', body: fd, credentials: 'include'
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => null);
            throw new Error(txt || `HTTP ${resp.status}`);
        }
        const data = await resp.json().catch(() => null);
        if (data && Array.isArray(data.fichiers) && data.fichiers.length) return data.fichiers[0];
        if (Array.isArray(data) && data.length) return data[0];
        return data;
    }
    window.uploadFileToConception = uploadFileToConception;
})();

/* ----------------------- Notifications utilities ----------------------- */
document.addEventListener('DOMContentLoaded', () => {
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
    window.showNotification = showNotification;
    window.alert = function (m) { showNotification(m, false); };

    /* ------------------ Utilities ------------------ */
    function getQueryParamRobust(name) {
        try {
            const p = new URLSearchParams(window.location.search || '');
            const v = p.get(name);
            if (v) return v;
        } catch (e) { }
        try {
            const href = window.location.href || '';
            let m = href.match(new RegExp('[?&]' + name + '=([0-9a-fA-F\\-]{8,})'));
            if (m && m[1]) return decodeURIComponent(m[1]);
            m = href.match(new RegExp('[?&]' + name + '=([^&\\#]+)'));
            if (m && m[1]) return decodeURIComponent(m[1]);
        } catch (e) { }
        try {
            const hash = (window.location.hash || '').replace(/^#/, '');
            if (hash) {
                const hp = new URLSearchParams(hash);
                const hv = hp.get(name);
                if (hv) return hv;
            }
        } catch (e) { }
        return null;
    }

    /* ----------------------- Helpers pour les fichiers existants ----------------------- */
    function createFileRowNew(file, id) {
        const isImg = file && file.type && file.type.startsWith('image/');
        const row = document.createElement('div');
        row.className = 'file-conception';
        row.dataset.fileId = String(id);

        const desc = document.createElement('div'); desc.className = 'file-conception-desc';
        const logo = document.createElement('div'); logo.className = 'logo-file';
        const imgIcon = document.createElement('img'); imgIcon.src = isImg ? '../img/icon/images.png' : '../img/icon/fichier.png'; imgIcon.alt = isImg ? 'image' : 'file';
        logo.appendChild(imgIcon);

        const title = document.createElement('div'); title.className = 'title-file';
        const h1 = document.createElement('h1'); h1.textContent = file.name || 'fichier';
        const p = document.createElement('p'); p.textContent = file.size ? (Math.round(file.size / 1024) + ' KB') : '';
        title.appendChild(h1); title.appendChild(p);

        desc.appendChild(logo); desc.appendChild(title);

        const btns = document.createElement('div'); btns.className = 'btns-file';
        if (isImg) {
            const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.title = 'Voir'; viewBtn.dataset.action = 'view';
            const viewImg = document.createElement('img'); viewImg.src = '../img/icon/vue.png'; viewImg.alt = 'voir'; viewBtn.appendChild(viewImg); btns.appendChild(viewBtn);
        }
        const dlBtn = document.createElement('button'); dlBtn.type = 'button'; dlBtn.title = 'Télécharger'; dlBtn.dataset.action = 'download';
        const dlImg = document.createElement('img'); dlImg.src = '../img/icon/telechargements.png'; dlImg.alt = 'download'; dlBtn.appendChild(dlImg); btns.appendChild(dlBtn);
        const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.title = 'Supprimer'; delBtn.dataset.action = 'delete';
        const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer2.png'; delImg.alt = 'delete'; delBtn.appendChild(dlImg); btns.appendChild(delBtn);

        row.appendChild(desc); row.appendChild(btns);
        return row;
    }

    function createExistingFileRow(fileMeta) {
        try {
            const isImg = (fileMeta.extension || '').toString().match(/^(jpg|jpeg|png|gif|bmp|svg|webp)$/i) !== null;
            const row = document.createElement('div');
            row.className = 'file-conception';
            row.dataset.fileId = fileMeta.id_fichier || fileMeta.id || '';
            row.dataset.existingFile = 'true';
            row.dataset.filename = fileMeta.filename || '';

            const desc = document.createElement('div'); desc.className = 'file-conception-desc';
            const logo = document.createElement('div'); logo.className = 'logo-file';
            const imgIcon = document.createElement('img'); imgIcon.src = isImg ? '../img/icon/images.png' : '../img/icon/fichier.png'; imgIcon.alt = isImg ? 'image' : 'file';
            logo.appendChild(imgIcon);

            const title = document.createElement('div'); title.className = 'title-file';
            const h1 = document.createElement('h1'); h1.textContent = fileMeta.filename || 'fichier';
            const p = document.createElement('p'); p.textContent = fileMeta.size_bytes ? (Math.round(fileMeta.size_bytes / 1024) + ' KB') : 'Taille inconnue';
            title.appendChild(h1); title.appendChild(p);

            desc.appendChild(logo); desc.appendChild(title);

            const btns = document.createElement('div'); btns.className = 'btns-file';
            if (isImg) {
                const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.title = 'Voir'; viewBtn.dataset.action = 'view-existing';
                const viewImg = document.createElement('img'); viewImg.src = '../img/icon/vue.png'; viewImg.alt = 'voir'; viewBtn.appendChild(viewImg); btns.appendChild(viewBtn);
            }
            const dlBtn = document.createElement('button'); dlBtn.type = 'button'; dlBtn.title = 'Télécharger'; dlBtn.dataset.action = 'download-existing';
            const dlImg = document.createElement('img'); dlImg.src = '../img/icon/telechargements.png'; dlImg.alt = 'download'; dlBtn.appendChild(dlImg); btns.appendChild(dlBtn);
            const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.title = 'Supprimer'; delBtn.dataset.action = 'delete-existing';
            const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer2.png'; delImg.alt = 'delete'; delBtn.appendChild(delImg); btns.appendChild(delBtn);

            row.appendChild(desc); row.appendChild(btns);
            return row;
        } catch (e) {
            console.warn('createExistingFileRow error', e);
            return null;
        }
    }

    window.createExistingFileRow = createExistingFileRow;

    /* ----------------------- Mode édition & save ----------------------- */
    let currentConceptionId = null;
    function checkEditMode() {
        // on accepte plusieurs noms de param pour compatibilité
        const possibleNames = ['id', 'id_conception', 'conceptionId', 'conception_id', 'conception'];
        let foundId = null;
        for (const name of possibleNames) {
            const v = getQueryParamRobust(name);
            if (v) { foundId = v; break; }
        }

        if (foundId) {
            currentConceptionId = foundId;
            loadConceptionData(foundId);
            const titleH1 = document.querySelector('.title-addconception h1');
            if (titleH1) titleH1.textContent = 'Modifier la conception';
            const saveBtnText = document.getElementById('save-button-text');
            if (saveBtnText) saveBtnText.textContent = 'Mettre à jour la conception';
        }
    }


    /* RENDRE les consernes reçues depuis le serveur */
    async function renderConsernesOnUI(consernesArray) {
        try {
            if (!Array.isArray(consernesArray)) return;
            const [clientsList, produitsList] = await Promise.all([loadClientsOnce().catch(() => []), loadProduitsOnce().catch(() => [])]);
            const leftColumn = document.querySelector('.left-addconception');
            if (!leftColumn) return;

            const addBtn = document.getElementById('addbtnCouple') || null;
            if (addBtn && addBtn.parentNode) addBtn.parentNode.removeChild(addBtn);

            const existingBlocks = Array.from(leftColumn.querySelectorAll('.container-addconception'));
            const nameBlock = existingBlocks.find(b => b.querySelector('.input-addconception')) || null;

            for (const b of existingBlocks) {
                if (b === nameBlock) continue;
                b.remove();
            }

            const createPairBlock = (poseVal = 1) => {
                const tpl = document.createElement('div');
                tpl.className = 'container-addconception';
                tpl.innerHTML = `
                <div class="clientproduit-plaque">
                    <span>Client :</span>
                    <div class="choose-client-plaque">
                    <div class="input-choose" style="width: 100%;">
                        <input type="text" class="client-input" placeholder="Selectionnez un client">
                    </div>
                    <div class="suggestions suggestions-client" role="listbox" aria-label="suggestions-client" style="min-width: 300px;"></div>
                    </div>
                </div>
                <div class="clientproduit-plaque">
                    <span>Produit :</span>
                    <div class="choose-client-plaque">
                    <div class="input-choose" style="width: 100%;">
                        <input type="text" class="product-input" placeholder="Selectionnez un Produit">
                    </div>
                    <div class="suggestions suggestions-product" role="listbox" aria-label="suggestions-product" style="min-width: 300px;"></div>
                    </div>
                </div>
                <div class="clientproduit-plaque">
                    <span>Poses :</span>
                    <div class="choose-poses">
                    <div class="input-choose" style="width: 100%;">
                        <input type="number" class="product-pose" value="${poseVal}" placeholder="Poses">
                    </div>
                    <button type="button" class="remove-couple-btn" title="Supprimer cette paire" style="background:transparent;border:none;margin-left:8px;">
                        <img src="../img/icon/supprimer1.png" alt="suppr" style="width:18px;height:18px;opacity:.7">
                    </button>
                    </div>
                </div>
                `;
                return tpl;
            };

            if (!consernesArray.length) {
                const tplEmpty = createPairBlock(1);
                if (nameBlock) leftColumn.insertBefore(tplEmpty, nameBlock);
                else leftColumn.appendChild(tplEmpty);

                if (addBtn) {
                    const targetChoose = tplEmpty.querySelector('.choose-poses');
                    if (targetChoose) targetChoose.appendChild(addBtn);
                }

                const chooseEls = Array.from(tplEmpty.querySelectorAll('.choose-client-plaque'));
                chooseEls.forEach(el => { try { if (window && typeof window.initChooseElement === 'function') window.initChooseElement(el); } catch (e) { console.error(e); } });
                updateDeleteVisibilityForParent(leftColumn);
                return;
            }

            let firstInserted = null;
            for (let i = 0; i < consernesArray.length; i++) {
                const entry = consernesArray[i];
                const clientId = entry.id_client || entry.idClient || entry.client_id || null;
                const produitId = entry.id_produit || entry.idProduit || entry.produit_id || null;
                const poseVal = Number(entry.pose || 1);

                const tpl = createPairBlock(poseVal);
                if (nameBlock) leftColumn.insertBefore(tpl, nameBlock);
                else leftColumn.appendChild(tpl);

                const clientInput = tpl.querySelector('.client-input');
                const productInput = tpl.querySelector('.product-input');
                if (clientId && Array.isArray(clientsList) && clientsList.length) {
                    const found = clientsList.find(x => String(x.id || x.id_client) === String(clientId));
                    if (found) { clientInput.value = found.enseigne || found.nom || ''; clientInput.dataset.selectedId = String(found.id || found.id_client); }
                }
                if (produitId && Array.isArray(produitsList) && produitsList.length) {
                    const foundp = produitsList.find(x => String(x.id || x.id_produit) === String(produitId));
                    if (foundp) { productInput.value = foundp.nom_produit || foundp.nom || ''; productInput.dataset.selectedId = String(foundp.id || foundp.id_produit); }
                }

                const chooseEls = Array.from(tpl.querySelectorAll('.choose-client-plaque'));
                chooseEls.forEach(el => { try { if (window && typeof window.initChooseElement === 'function') window.initChooseElement(el); } catch (e) { console.error(e); } });

                if (!firstInserted) {
                    firstInserted = tpl;
                    if (addBtn) {
                        const targetChoose = tpl.querySelector('.choose-poses');
                        if (targetChoose) targetChoose.appendChild(addBtn);
                    }
                }
            }

            const allPairs = leftColumn.querySelectorAll('.container-addconception');
            if (allPairs.length > 1) {
                const first = allPairs[0];
                const clientVal = (first.querySelector('.client-input')?.value || '').trim();
                const prodVal = (first.querySelector('.product-input')?.value || '').trim();
                const poseVal = (first.querySelector('.product-pose')?.value || '').trim();
                if (!clientVal && !prodVal && (poseVal === '' || poseVal === '1')) {
                    first.remove();
                }
            }
            updateDeleteVisibilityForParent(leftColumn);
        } catch (e) {
            console.error('renderConsernesOnUI err', e);
        }
    }

    async function loadConceptionData(id) {
        try {
            const res = await fetch(`/api/conception/${encodeURIComponent(id)}`, { credentials: 'include' });
            if (!res.ok) { if (res.status === 404) showNotification('Conception introuvable', false); else showNotification('Erreur chargement conception', false); return; }
            const c = await res.json();

            const nameEl = document.getElementById('conceptionName') || document.querySelector('input[placeholder*="Conception"]');
            if (nameEl) nameEl.value = c.nom_conception || c.nom || '';

            if (Array.isArray(c.consernes) && c.consernes.length) {
                await renderConsernesOnUI(c.consernes);
            } else {
                const clientInput = document.getElementById('clientInput') || document.querySelector('.choose-client-plaque input');
                if (clientInput) { clientInput.value = c.client_enseigne || ''; clientInput.dataset.selectedId = c.id_client || ''; }
                const productInput = document.getElementById('productInput') || (document.querySelectorAll('.choose-client-plaque input')[1] || null);
                if (productInput) { productInput.value = c.produit_nom || ''; productInput.dataset.selectedId = c.id_produit || ''; }
            }

            try {
                const checkbox = document.getElementById('sous-traitant');
                const select = document.getElementById('sous-traitant-select');
                if (c.id_soustraitant) {
                    if (checkbox) { checkbox.checked = true; }
                    if (select) {
                        await loadSoustraitantsOnce().catch(() => { });
                        select.removeAttribute('disabled');
                        select.value = c.id_soustraitant;
                        if (!Array.from(select.options).some(o => o.value === select.value)) {
                            const opt = document.createElement('option');
                            opt.value = c.id_soustraitant;
                            opt.textContent = c.soustraitant_nom || 'Sous-traitant sélectionné';
                            select.appendChild(opt);
                            select.value = c.id_soustraitant;
                        }
                        setTimeout(() => select.blur(), 0);
                    }
                } else {
                    if (checkbox) { checkbox.checked = false; }
                    if (select) { select.setAttribute('disabled', 'disabled'); select.value = ''; }
                }
            } catch (e) { console.debug(e); }

            try {
                if (c.qr_code) {
                    createOrSetQrCodeInput(c.qr_code);
                    const qrcodeDiv = document.getElementById('qrcode');
                    if (qrcodeDiv && typeof window.qrcode === 'function') {
                        qrcodeDiv.innerHTML = '';
                        const qrLib = window.qrcode;
                        const qrObj = qrLib(0, 'L');
                        qrObj.addData(c.qr_code);
                        qrObj.make();
                        const svgString = qrObj.createSvgTag({ scalable: true, margin: 4, color: '#2c3e50', background: '#ffffff' });
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(svgString, 'image/svg+xml');
                            const svgElem = doc.documentElement;
                            svgElem.setAttribute('width', '200'); svgElem.setAttribute('height', '200');
                            svgElem.style.width = '200px'; svgElem.style.height = '200px';
                            qrcodeDiv.appendChild(svgElem);
                            const qrResultContainer = document.getElementById('qrResultContainer');
                            if (qrResultContainer) qrResultContainer.style.display = 'flex';
                        } catch (err) {
                            qrcodeDiv.innerHTML = svgString;
                        }
                    } else {
                        const qrcodeDiv = document.getElementById('qrcode');
                        if (qrcodeDiv) qrcodeDiv.textContent = c.qr_code;
                    }
                }
            } catch (e) { console.debug('qr render fail', e); }

            window._existingFiles = Array.isArray(c.fichiers) ? c.fichiers.slice() : [];
            if (window.renderAllFiles) window.renderAllFiles();
            showNotification('Conception chargée', true, { duration: 1200 });
        } catch (e) {
            console.error('loadConceptionData err', e);
            showNotification('Erreur lors du chargement de la conception', false, { duration: 5000 });
        }
    }

    async function resolveSelectedIdFromInput(inputEl, isClient) {
        if (!inputEl) return null;
        const ds = inputEl.dataset || {};
        if (ds.selectedId) return String(ds.selectedId);
        if (ds.id) return String(ds.id);
        if (ds.value) return String(ds.value);
        const textVal = (inputEl.value || '').toString().trim();
        if (!textVal) return null;
        try {
            const chooseEl = inputEl.closest ? inputEl.closest('.choose-client-plaque') : null;
            const suggestionsEl = chooseEl ? (chooseEl.querySelector('.suggestions') || null) : null;
            if (suggestionsEl) {
                const opts = Array.from(suggestionsEl.querySelectorAll('[role="option"], .suggestion-item, .create-item, div'));
                for (const opt of opts) {
                    const optText = (opt.querySelector?.('.name') ? (opt.querySelector('.name').textContent || '') : opt.textContent || '').toString().trim();
                    const optId = opt.dataset && (opt.dataset.id || opt.dataset.value || opt.dataset['selectedId']) ? (opt.dataset.id || opt.dataset.value || opt.dataset['selectedId']) : null;
                    if (!optText) continue;
                    if ((optText === textVal || optText.toLowerCase() === textVal.toLowerCase()) && optId) return String(optId);
                }
            }
        } catch (e) { /* ignore */ }
        try {
            const list = isClient ? await loadClientsOnce() : await loadProduitsOnce();
            if (Array.isArray(list) && list.length) {
                const found = list.find(it => {
                    const label = ((it.enseigne || it.nom || it.nom_produit || it.name || it.label || it.titre) || '').toString().trim();
                    if (label && (label === textVal || label.toLowerCase() === textVal.toLowerCase())) return true;
                    const alt = (it.nom_produit || it.nom || it.name || '').toString().trim();
                    if (alt && (alt === textVal || alt.toLowerCase() === textVal.toLowerCase())) return true;
                    return false;
                });
                if (found) return String(found.id || found.id_client || found.id_produit || found._id || found.uuid || '');
            }
        } catch (e) { console.debug('resolveSelectedIdFromInput fetch fallback failed', e); }
        return null;
    }

    async function buildConsernesFromDOM() {
        const containers = Array.from(document.querySelectorAll('.container-addconception'));
        const out = [];
        for (const cont of containers) {
            const clientEl = cont.querySelector('.client-input') || cont.querySelector('input[id^="clientInput"]');
            const productEl = cont.querySelector('.product-input') || cont.querySelector('input[id^="productInput"]');

            if (!clientEl || !productEl) continue;

            const poseEl = cont.querySelector('.product-pose') || cont.querySelector('input[type="number"]');
            let client_id = clientEl?.dataset?.selectedId || null;
            let produit_id = productEl?.dataset?.selectedId || null;

            try {
                if (!client_id) {
                    const resolved = await resolveSelectedIdFromInput(clientEl, true);
                    if (resolved) client_id = String(resolved);
                }
            } catch (e) {
                console.debug('resolve client id failed', e);
            }
            try {
                if (!produit_id) {
                    const resolvedp = await resolveSelectedIdFromInput(productEl, false);
                    if (resolvedp) produit_id = String(resolvedp);
                }
            } catch (e) {
                console.debug('resolve produit id failed', e);
            }

            const pose = poseEl ? Math.max(1, parseInt(poseEl.value, 10) || 1) : 1;

            out.push({
                id_client: client_id,
                id_produit: produit_id,
                pose: pose
            });
        }
        return out;
    }

    function isUUID(v) {
        if (!v) return false;
        return /^[0-9a-fA-F\-]{8,}$/.test(String(v));
    }

    function createOrSetQrCodeInput(val) {
        let el = document.getElementById('qrCodeInput');
        if (!el) {
            el = document.createElement('input');
            el.type = 'hidden';
            el.id = 'qrCodeInput';
            document.getElementById('conceptionForm')?.appendChild(el);
        }
        el.value = val || '';
    }
    async function sendUpdateConception(formData, id_conception) {
        const resp = await fetch(`/api/conception/${encodeURIComponent(id_conception)}`, {
            method: 'PUT',
            body: formData,
            credentials: 'include'
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            throw new Error(text || `Erreur serveur: ${resp.status}`);
        }

        const data = await resp.json();

        // feedback: plaques mises à jour
        if (typeof data.plaques_updated !== 'undefined' && data.plaques_updated > 0) {
            showNotification(`Statut des plaques mis à jour: ${data.plaques_updated} plaques.`, true);
        }

        // si le backend demande une redirection vers newplaque.html
        if (data.require_redirect) {
            const targetUrl = new URL('/frontend/Plaque/newplaque.html', window.location.href);
            targetUrl.searchParams.set('id_conception', id_conception);
            window.location.href = targetUrl.toString();
            return; // on quitte, le navigateur se redirige
        }

        // sinon, on recharge la conception ou on affiche succès
        await loadConceptionData(id_conception); // ta fonction existante
        showNotification('Conception mise à jour avec succès', true);

        return data;
    }

    async function saveConception(isEditMode = false) {
        const nomInput = document.getElementById('conceptionName') || document.querySelector('input[placeholder*="Conception"]');
        const saveBtn = document.getElementById('saveConceptionBtn') || document.getElementById('save-button-text');

        // Define origText here so it's available in the finally block
        const origText = saveBtn ? saveBtn.textContent : null;

        try {
            const consernes_from_dom = await buildConsernesFromDOM();

            const missing = consernes_from_dom.findIndex(x => !x.id_client || !x.id_produit);
            if (missing !== -1) { showNotification(`La ligne ${missing + 1} doit contenir un client et un produit valides`, false); return; }
            if (!nomInput || !nomInput.value.trim()) { showNotification('Veuillez saisir un nom pour la conception', false); return; }

            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = isEditMode ? 'Mise à jour...' : 'Enregistrement...'; }

            const attachedFiles = Array.isArray(window._attachedFiles) ? window._attachedFiles.slice() : [];

            const sousCheckbox = document.getElementById('sous-traitant');
            const stSelect = document.getElementById('sous-traitant-select');
            const raw_id_soustraitant = !!(sousCheckbox && sousCheckbox.checked && stSelect && stSelect.value) ? stSelect.value : null;
            const id_soustraitant = raw_id_soustraitant && isUUID(raw_id_soustraitant) ? raw_id_soustraitant : raw_id_soustraitant || null;
            if (raw_id_soustraitant && !id_soustraitant) {
                console.warn('ID soustraitant sélectionné (non-UUID) :', raw_id_soustraitant);
            }

            const qrHidden = document.getElementById('qrCodeInput');
            const qr_code_val = qrHidden ? qrHidden.value : null;

            const payload = {
                nom_conception: nomInput.value.trim(),
                consernes: consernes_from_dom,
                id_soustraitant: id_soustraitant || null,
                qr_code: qr_code_val || null
            };

            if (!isEditMode) {
                // Create FormData for the request
                const formData = new FormData();
                formData.append('nom_conception', payload.nom_conception);
                formData.append('consernes', JSON.stringify(payload.consernes));

                if (payload.id_soustraitant) {
                    formData.append('id_soustraitant', payload.id_soustraitant);
                }
                if (payload.qr_code) {
                    formData.append('qr_code', payload.qr_code);
                }

                // Add files to FormData
                if (attachedFiles && attachedFiles.length) {
                    for (let i = 0; i < attachedFiles.length; i++) {
                        formData.append('fichiers', attachedFiles[i]);
                    }
                }

                const createResp = await fetch('/api/conception/create', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                });

                if (!createResp.ok) {
                    const txt = await createResp.text().catch(() => null);
                    throw new Error(txt || `HTTP ${createResp.status}`);
                }

                const data = await createResp.json().catch(() => null);
                const newId = data && (data.id || data.id_conception) ? (data.id || data.id_conception) : null;

                if (newId && attachedFiles && attachedFiles.length) {
                    for (const f of attachedFiles) {
                        try {
                            await window.uploadFileToConception(newId, f);
                        } catch (e) {
                            console.warn('upload file failed', e);
                        }
                    }
                }

                showNotification('Conception créée avec succès', true);
                setTimeout(() => window.location.href = `/frontend/Conception/conceptions.html`, 900);

            } else {
                if (!currentConceptionId) {
                    showNotification('ID conception manquant pour mise à jour', false);
                    return;
                }

                const fd = new FormData();

                // envoi explicite du nom de la conception et des consernes (lignes)
                if (payload && typeof payload.nom_conception !== 'undefined') {
                    fd.append('nom_conception', payload.nom_conception);
                }

                // consernes est un tableau d'objets {id_client,id_produit,pose}
                if (payload && Array.isArray(payload.consernes)) {
                    fd.append('consernes', JSON.stringify(payload.consernes));
                }

                // gestion du soustraitant (garde ta logique existante)
                if (window.shouldClearSoustraitant === true) {
                    fd.append('id_soustraitant', '');
                } else if (payload.id_soustraitant) {
                    fd.append('id_soustraitant', payload.id_soustraitant);
                }

                if (payload.qr_code) fd.append('qr_code', payload.qr_code);

                // deleted files / fichiers (gardes ton code existant pour ça)
                if (Array.isArray(window.filesToDelete) && window.filesToDelete.length) {
                    fd.append('deleted_file_ids', JSON.stringify(window.filesToDelete));
                }

                if (attachedFiles && attachedFiles.length) {
                    for (let i = 0; i < attachedFiles.length; i++) {
                        fd.append('fichiers', attachedFiles[i]);
                    }
                }

                try {
                    await sendUpdateConception(fd, currentConceptionId);
                } catch (err) {
                    showNotification('Erreur lors de la sauvegarde: ' + (err.message || err), false);
                }
            }
        } catch (err) {
            console.error('saveConception err', err);
            showNotification('Erreur lors de l\'enregistrement : ' + (err && err.message ? err.message : ''), false, { duration: 6000 });
        } finally {
            if (saveBtn) setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.textContent = origText || (currentConceptionId ? 'Mettre à jour' : 'Sauvegarder la conception');
            }, 300);
        }
    }

    window.saveConception = async function (isEdit = false) { await saveConception(isEdit); };

    const saveBtnDom = document.getElementById('saveConceptionBtn');
    if (saveBtnDom) {
        saveBtnDom.addEventListener('click', async (e) => {
            e.preventDefault();
            await saveConception(!!currentConceptionId);
        });
    }

    /* -------------------------- QR code local -------------------------- */
    const generateBtn = document.getElementById('generateQrBtn');
    const downloadBtn = document.getElementById('downloadQrBtn');
    const deleteBtn = document.getElementById('deleteQrBtn');
    const qrResultContainer = document.getElementById('qrResultContainer');
    const qrcodeDiv = document.getElementById('qrcode');
    const qrInfo = document.getElementById('qrInfo');
    const qrError = document.getElementById('qrError');
    const conceptionIdInput = document.getElementById('conceptionId');

    if (!generateBtn) return console.warn('generateQrBtn introuvable');

    function generateRandomCode(length = 80) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = new Uint8Array(length);
        window.crypto.getRandomValues(bytes);
        let out = '';
        const n = charset.length;
        for (let i = 0; i < length; i++) out += charset[bytes[i] % n];
        return out;
    }

    function generateLocalId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function showError(msg) {
        if (qrError) { qrError.textContent = msg; qrError.style.display = 'block'; }
        else alert(msg);
    }

    function hideError() { if (qrError) { qrError.textContent = ''; qrError.style.display = 'none'; } }

    function showTransientMessage(msg, timeout = 2500) {
        if (!qrInfo) return;
        qrInfo.textContent = msg;
        qrInfo.style.display = 'block';
        setTimeout(() => { qrInfo.textContent = ''; qrInfo.style.display = 'none'; }, timeout);
    }

    function saveDraftLocal(draft) {
        try {
            const key = 'conception_drafts';
            const raw = localStorage.getItem(key);
            const arr = raw ? JSON.parse(raw) : [];
            arr.push(draft);
            localStorage.setItem(key, JSON.stringify(arr));
            return true;
        } catch (e) {
            console.error('Erreur saveDraftLocal', e);
            return false;
        }
    }

    function collectLignesFromDOM() {
        const containers = Array.from(document.querySelectorAll('.container-addconception'));
        const lignes = [];
        for (const cont of containers) {
            const clientEl = cont.querySelector('.client-input') || cont.querySelector('input[id^="clientInput"]');
            const productEl = cont.querySelector('.product-input') || cont.querySelector('input[id^="productInput"]');
            const poseEl = cont.querySelector('.product-pose') || cont.querySelector('input[id^="productPose"]');
            if (!clientEl && !productEl && !poseEl) continue;

            const client_label = clientEl ? (clientEl.value || '').trim() : '';
            const product_label = productEl ? (productEl.value || '').trim() : '';
            const poseRaw = poseEl ? (poseEl.value || '').trim() : '';
            const pose = poseRaw === '' ? 1 : Math.max(1, parseInt(poseRaw, 10) || 1);

            if (!client_label && !product_label && !poseRaw) continue;

            const client_id = clientEl?.dataset?.selectedId || null;
            const produit_id = productEl?.dataset?.selectedId || null;

            lignes.push({
                client_label,
                client_id,
                produit_label: product_label,
                produit_id,
                pose
            });
        }
        return lignes;
    }

    function generateAndRenderQr(codeToEncode) {
        if (!qrcodeDiv) return;
        qrcodeDiv.innerHTML = '';
        const qrLib = (typeof qrcode === 'function') ? qrcode : window.qrcode;
        if (!qrLib) {
            console.warn('Lib qrcode absente — code:', codeToEncode);
            qrcodeDiv.textContent = codeToEncode;
            return;
        }
        const qrObj = qrLib(0, 'L');
        qrObj.addData(codeToEncode);
        qrObj.make();
        const svgString = qrObj.createSvgTag({ scalable: true, margin: 4, color: '#2c3e50', background: '#ffffff' });
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgString, 'image/svg+xml');
            const svgElem = doc.documentElement;
            svgElem.setAttribute('width', '200'); svgElem.setAttribute('height', '200');
            svgElem.style.width = '200px'; svgElem.style.height = '200px'; svgElem.style.display = 'block';
            qrcodeDiv.appendChild(svgElem);
        } catch (err) {
            qrcodeDiv.innerHTML = svgString;
        }
    }

    function generateQRCodeLocal() {
        try {
            hideError();
            const conceptionName = (document.getElementById('conceptionName').value || '').trim();
            if (!conceptionName) { showError('Veuillez renseigner le nom de la conception.'); return; }

            const sousCheckbox = document.getElementById('sous-traitant');
            const stSelect = document.getElementById('sous-traitant-select');
            const raw_id_soustraitant = !!(sousCheckbox && sousCheckbox.checked && stSelect && stSelect.value) ? stSelect.value : null;
            const id_soustraitant = raw_id_soustraitant && isUUID(raw_id_soustraitant) ? raw_id_soustraitant : null;
            if (raw_id_soustraitant && !id_soustraitant) {
                console.warn('ID soustraitant ignoré (non UUID) :', raw_id_soustraitant);
            }

            const lignes = collectLignesFromDOM();
            if (!lignes.length) { showError('Ajoutez au moins une paire client/produit.'); return; }
            for (let i = 0; i < lignes.length; i++) {
                if (!lignes[i].client_label || !lignes[i].produit_label) {
                    showError(`La ligne ${i + 1} doit contenir un client et un produit.`); return;
                }
            }

            const qr_code = generateRandomCode(80);
            const id_conception = generateLocalId();

            const draft = {
                id_conception,
                nom_conception: conceptionName,
                qr_code,
                id_soustraitant,
                lignes,
                created_at: new Date().toISOString(),
                saved_local: true
            };

            const ok = saveDraftLocal(draft);
            if (!ok) { showError('Impossible de sauvegarder localement (localStorage).'); return; }

            if (conceptionIdInput) conceptionIdInput.value = id_conception;
            createOrSetQrCodeInput(qr_code);

            const payloadToEncode = qr_code;
            generateAndRenderQr(payloadToEncode);

            if (qrInfo) { qrInfo.textContent = ''; qrInfo.style.display = 'none'; }

            if (qrResultContainer) qrResultContainer.style.display = 'flex';
            showTransientMessage('Conception générée et sauvegardée localement.');

            console.debug('Draft local saved', draft);
        } catch (err) {
            console.error('Erreur generateQRCodeLocal', err);
            showError('Erreur interne lors de la génération locale. Voir console.');
        }
    }

    function downloadQRCode() {
        const svg = qrcodeDiv && qrcodeDiv.querySelector ? qrcodeDiv.querySelector('svg') : null;
        if (!svg) return;
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 600;
            canvas.height = img.height || 600;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = 'qr-code-conception.png';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(svgUrl);
        };
        img.onerror = function (e) { console.error('Erreur conversion SVG->PNG', e); URL.revokeObjectURL(svgUrl); };
        img.src = svgUrl;
    }

    function deleteQRCodeLocal() {
        if (qrcodeDiv) qrcodeDiv.innerHTML = '';
        if (qrResultContainer) qrResultContainer.style.display = 'none';
        if (qrError) { qrError.style.display = 'none'; qrError.textContent = ''; }
        if (qrInfo) { qrInfo.textContent = ''; qrInfo.style.display = 'none'; }
        if (conceptionIdInput) conceptionIdInput.value = '';
    }

    if (generateBtn) generateBtn.addEventListener('click', generateQRCodeLocal);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadQRCode);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteQRCodeLocal);

    /* ----------------------- Ajouter / supprimer paires client-produit ----------------------- */
    const addBtn = document.getElementById('addbtnCouple');
    if (!addBtn) return;

    const leftColumn = document.querySelector('.left-addconception');
    if (!leftColumn) return;

    let index = document.querySelectorAll('.left-addconception .container-addconception').length || 1;

    function getInsertReference() {
        const containers = leftColumn.querySelectorAll('.container-addconception');
        return (containers.length >= 2) ? containers[1] : null;
    }

    addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        index++;

        const tpl = document.createElement('div');
        tpl.className = 'container-addconception';
        tpl.innerHTML = `
        <div class="clientproduit-plaque">
            <span>Client :</span>
            <div class="choose-client-plaque">
            <div class="input-choose" style="width: 100%;">
                <input type="text" id="clientInput_${index}" name="client[]" class="client-input" placeholder="Selectionnez un client">
            </div>
            <div class="suggestions suggestions-client" role="listbox" aria-label="suggestions-client-${index}"  style="min-width: 300px;"></div>
            </div>
        </div>
        <div class="clientproduit-plaque">
            <span>Produit :</span>
            <div class="choose-client-plaque">
            <div class="input-choose" style="width: 100%;">
                <input type="text" id="productInput_${index}" name="product[]" class="product-input" placeholder="Selectionnez un Produit">
            </div>
            <div class="suggestions suggestions-product" role="listbox" aria-label="suggestions-product-${index}"  style="min-width: 300px;"></div>
            </div>
        </div>
        <div class="clientproduit-plaque">
            <span>Poses :</span>
            <div class="choose-poses">
            <div class="input-choose" style="width: 100%;">
                <input type="number" id="productPose_${index}" name="poses[]"  value="1" class="product-pose" placeholder="Poses">
            </div>
            <button type="button" class="remove-couple-btn" title="Supprimer cette paire" style="background:transparent;border:none;margin-left:8px;">
                <img src="../img/icon/supprimer1.png" alt="suppr" style="width:18px;height:18px;opacity:.7">
            </button>
            </div>
        </div>
        `;

        const ref = getInsertReference();
        if (ref) leftColumn.insertBefore(tpl, ref);
        else leftColumn.appendChild(tpl);

        const newClientInput = tpl.querySelector(`#clientInput_${index}`);
        if (newClientInput) newClientInput.focus();

        const chooseEls = Array.from(tpl.querySelectorAll('.choose-client-plaque'));

        function tryInitChoose() {
            try {
                chooseEls.forEach(el => {
                    if (window && typeof window.initChooseElement === 'function') {
                        window.initChooseElement(el);
                    }
                });
                if (window && typeof window.updateDeleteVisibilityForParent === 'function') {
                    const groupParent = tpl.closest('.clientproduit-plaque') || tpl.parentNode;
                    window.updateDeleteVisibilityForParent(groupParent);
                }
            } catch (err) {
                console.error('tryInitChoose error', err);
            }
        }

        if (window && typeof window.initChooseElement === 'function') {
            tryInitChoose();
        } else {
            let attempts = 0;
            const iv = setInterval(() => {
                attempts++;
                if (window && typeof window.initChooseElement === 'function') {
                    tryInitChoose();
                    clearInterval(iv);
                } else if (attempts >= 10) {
                    clearInterval(iv);
                    console.warn('initChooseElement non disponible après 10 tentatives');
                }
            }, 100);
        }
    });

    leftColumn.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-couple-btn');
        if (!btn) return;
        const block = btn.closest('.container-addconception');
        if (!block) return;
        block.remove();
    });

    // initial checks
    setTimeout(checkEditMode, 80);
});