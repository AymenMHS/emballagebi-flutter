/* newplaque.js - version améliorée pour intégration backend
   - remplit le select via /conceptions/select
   - charge plaques via /conceptions/{id}/plaques
   - injecte clients/produits (locked) et plaques existantes dans le DOM
   - expose window._injectPlaquesArray pour interaction interne
*/

const EXAMPLE_CONCEPTIONS = {
    "conceptions": [
        {
            "conceptionId": "C-1001",
            "title": "Boîte burger personnalisée - Été 2025",
            "createdAt": "2025-05-12T09:24:00Z",
            "updatedAt": "2025-06-01T14:10:00Z",
            "clients": [
                {
                    "clientId": "CL-2001",
                    "name": "Chicken Street",
                    "logo": "../uploads/client1.png",
                }
            ],
            "products": [
                {
                    "productId": "P-3001",
                    "name": "Boîte Burger Taille M",
                    "image": "../uploads/prod1.png",
                },
            ],
            "plaques": [
                { "plaqueId": "PL-1001", "numero_plaque": "12345", "couleur": "#FF0000", "statut": "en_stock", "machine": "Kors", "date_renouvellement": "2025-06-01T14:10:00Z", "date_ajout": "2025-06-01T14:10:00Z" },
                { "plaqueId": "PL-1002", "numero_plaque": "67890", "couleur": "#00FF00", "statut": "indisponible", "machine": "Heidelberg", "date_renouvellement": "2025-06-01T14:10:00Z", "date_ajout": "2025-06-01T14:10:00Z" }
            ],
        },
    ]
};

(function () {
    'use strict';

    /* ---------- utilitaires ---------- */
    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const DEFAULTS = {
        clientThumb: '../img/icon/client.png',
        productThumb: '../img/icon/plaque.png'
    };

    // store global
    window.conceptionSelection = {
        clients: [], // { id, name, locked:Boolean, thumb }
        products: []
    };

    document.addEventListener('DOMContentLoaded', () => {
        /* ----------------- modals & overlay ----------------- */
        const overlay = document.querySelector('.filterblack');
        const modalConception = document.querySelector('.add-conception');
        const modalClient = document.querySelector('.add-client');
        const modalProduct = document.querySelector('.add-product');
        const btnOpenConception = document.getElementById('addConceptionBtn');
        const btnOpenClient = document.getElementById('addClientNew');
        const btnOpenProduct = document.getElementById('addProductNew');
        // si la page est ouverte via redirection, on peut recevoir un param id_conception
        const urlParams = new URLSearchParams(window.location.search);
        const PRESELECT_CONCEPTION_ID = urlParams.get('id_conception') || urlParams.get('conceptionId') || urlParams.get('id') || null;


        function forceHideModal(m) {
            if (!m) return;
            try { m.style.setProperty('display', 'none', 'important'); } catch (e) { m.style.display = 'none'; }
            m.setAttribute('aria-hidden', 'true');
            m.classList.remove('animate__animated', 'animate__fadeInUp');
        }
        function showModal(m) {
            if (!m) return;
            if (overlay) {
                overlay.style.display = 'block';
                requestAnimationFrame(() => overlay.style.opacity = '0.8');
            }
            try { m.style.setProperty('display', 'block', 'important'); } catch (e) { m.style.display = 'block'; }
            m.setAttribute('aria-hidden', 'false');
            m.classList.remove('animate__animated', 'animate__fadeInUp');
            requestAnimationFrame(() => m.classList.add('animate__animated', 'animate__fadeInUp'));
            document.body.style.overflow = 'hidden';
        }
        function hideAllModals() {
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.addEventListener('transitionend', function t(e) {
                    if (e.propertyName === 'opacity') {
                        overlay.style.display = 'none';
                        overlay.removeEventListener('transitionend', t);
                    }
                });
            }
            [modalConception, modalClient, modalProduct].forEach(m => {
                if (!m) return;
                try { m.style.setProperty('display', 'none', 'important'); } catch (e) { m.style.display = 'none'; }
                m.setAttribute('aria-hidden', 'true');
                m.classList.remove('animate__animated', 'animate__fadeInUp');
            });
            document.body.style.overflow = '';
        }

        if (overlay) { overlay.style.display = 'none'; overlay.style.opacity = '0'; overlay.style.transition = 'opacity .25s ease'; }
        forceHideModal(modalConception);
        forceHideModal(modalClient);
        forceHideModal(modalProduct);

        btnOpenConception?.addEventListener('click', (e) => { e.preventDefault(); showModal(modalConception); });
        btnOpenClient?.addEventListener('click', (e) => { e.preventDefault(); showModal(modalClient); });
        btnOpenProduct?.addEventListener('click', (e) => { e.preventDefault(); showModal(modalProduct); });
        overlay?.addEventListener('click', () => hideAllModals());
        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-addconception') || e.target.closest('.close-addclient') || e.target.closest('.close-addproduct') || e.target.closest('[data-close]')) {
                hideAllModals();
            }
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideAllModals(); });
        window.addEventListener('message', (ev) => {
            const d = ev.data;
            if (d === 'close-modal' || (d && d.type === 'close-modal')) hideAllModals();
        });

        /* ----------------- sélection clients/produits (chips) ----------------- */
        const cpBlocks = Array.from(document.querySelectorAll('.clientproduit-plaque'));

        function findBlockByType(type) {
            const keyword = (type === 'clients') ? 'client' : 'produit';
            return cpBlocks.find(b => (b.querySelector('span')?.textContent || '').toLowerCase().includes(keyword));
        }

        function createChip(item, type) {
            const chip = document.createElement('div');
            chip.className = 'cp-chip';
            chip.setAttribute('data-id', item.id || item.name);
            chip.style.display = 'inline-flex';
            chip.style.alignItems = 'center';
            chip.style.padding = '6px 8px';
            chip.style.margin = '4px';
            chip.style.borderRadius = '18px';
            chip.style.background = '#fff';
            chip.style.boxShadow = '0 1px 2px rgba(0,0,0,.08)';
            chip.style.cursor = item.locked ? 'default' : 'pointer';
            chip.title = item.locked ? "Élément fourni par la conception (verrouillé)" : item.name;

            const img = document.createElement('img');
            img.alt = '';
            img.src = item.thumb || (type === 'clients' ? DEFAULTS.clientThumb : DEFAULTS.productThumb);
            img.style.width = '28px';
            img.style.height = '28px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            img.style.marginRight = '8px';
            chip.appendChild(img);

            const span = document.createElement('span');
            span.style.marginRight = '8px';
            span.style.fontSize = '13px';
            span.textContent = item.name || '';
            chip.appendChild(span);

            if (!item.locked) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.title = 'Supprimer';
                btn.style.border = 'none';
                btn.style.background = 'transparent';
                btn.style.cursor = 'pointer';
                btn.innerHTML = '<img src="../img/icon/supprimer1.png" alt="x" style="width:14px;height:14px;">';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromSelection(type, item.id || item.name);
                });
                chip.appendChild(btn);
            }

            return chip;
        }

        function renderList(type) {
            const block = findBlockByType(type);
            if (!block) return;
            const chooseEl = block.querySelector('.choose-client-plaque');
            if (!chooseEl) return;

            let list = chooseEl.querySelector('.selected-list');
            if (!list) {
                list = document.createElement('div');
                list.className = 'selected-list';
                list.style.minHeight = '38px';
                list.style.display = 'flex';
                list.style.flexWrap = 'wrap';
                list.style.alignItems = 'center';
                list.style.padding = '4px';
                list.style.gap = '6px';
                const addBtns = chooseEl.querySelectorAll('button');
                if (addBtns && addBtns.length) chooseEl.insertBefore(list, addBtns[0]); else chooseEl.appendChild(list);
            }

            list.innerHTML = '';
            const items = window.conceptionSelection[type] || [];
            if (items.length === 0) {
                const placeholder = document.createElement('span');
                placeholder.className = 'cp-placeholder';
                placeholder.textContent = (type === 'clients') ? 'Aucun client sélectionné' : 'Aucun produit sélectionné';
                placeholder.style.opacity = '0.65';
                placeholder.style.fontSize = '13px';
                list.appendChild(placeholder);
                return;
            }

            const frag = document.createDocumentFragment();
            items.forEach(it => frag.appendChild(createChip(it, type)));
            list.appendChild(frag);
        }

        function addToSelection(type, name, id, opts = {}) {
            if (!type || !name) return;
            const arr = window.conceptionSelection[type];
            const key = id || name;
            if (arr.some(i => i.id === key || i.name === name)) return;
            const item = {
                id: key,
                name: name,
                locked: Boolean(opts.locked),
                thumb: opts.thumb || null
            };
            arr.push(item);
            renderList(type);
        }

        function removeFromSelection(type, idOrName) {
            const arr = window.conceptionSelection[type];
            const idx = arr.findIndex(i => i.id === idOrName || i.name === idOrName);
            if (idx === -1) return;
            if (arr[idx].locked) {
                alert("Cet élément provient de la conception et ne peut pas être supprimé.");
                return;
            }
            arr.splice(idx, 1);
            renderList(type);
        }

        // API publique
        window.addClientToConception = function (name, id, opts = {}) { addToSelection('clients', name, id, opts); };
        window.addProductToConception = function (name, id, opts = {}) { addToSelection('products', name, id, opts); };
        window._removeSelectionItem = removeFromSelection;

        // nettoyage initial DOM (remplace inputs / suggestions par chips)
        cpBlocks.forEach(block => {
            const inputChoose = block.querySelector('.input-choose');
            if (inputChoose) {
                const inputEl = inputChoose.querySelector('input');
                const delBtn = inputChoose.querySelector('.delete-input');
                if (inputEl) inputEl.remove();
                if (delBtn) delBtn.remove();
                if (!inputChoose.querySelector('*')) inputChoose.remove();
            }
            const suggestions = block.querySelector('.suggestions');
            if (suggestions) suggestions.remove();
            Array.from(block.querySelectorAll('button')).forEach(btn => {
                const style = btn.getAttribute('style') || '';
                if (style.includes('background-color: black') || btn.classList.contains('duplicate')) btn.remove();
            });
            // ensure placeholder selected-list exists (renderList will populate)
            const chooseEl = block.querySelector('.choose-client-plaque');
            if (chooseEl && !chooseEl.querySelector('.selected-list')) {
                const list = document.createElement('div');
                list.className = 'selected-list';
                list.style.minHeight = '38px';
                list.style.display = 'flex';
                list.style.flexWrap = 'wrap';
                list.style.alignItems = 'center';
                list.style.padding = '4px';
                list.style.gap = '6px';
                const addBtns = chooseEl.querySelectorAll('button');
                if (addBtns && addBtns.length) chooseEl.insertBefore(list, addBtns[0]); else chooseEl.appendChild(list);
            }
        });

        renderList('clients');
        renderList('products');

        // double-click dev helper
        document.querySelectorAll('#addClientNew, #addProductNew').forEach(btn => {
            btn.addEventListener('dblclick', (e) => {
                e.preventDefault();
                const isClient = btn.id === 'addClientNew';
                const sampleName = isClient ? 'Client Exemple' : 'Produit Exemple';
                const sampleThumb = isClient ? DEFAULTS.clientThumb : DEFAULTS.productThumb;
                if (isClient) window.addClientToConception(sampleName, null, { locked: false, thumb: sampleThumb });
                else window.addProductToConception(sampleName, null, { locked: false, thumb: sampleThumb });
            });
        });

        async function fetchAndPopulateMachines() {
            try {
                const resp = await fetch('/conceptions/machines'); // si tu préfères /api/machines adapte l'URL
                if (!resp.ok) throw new Error('Erreur fetch machines: ' + resp.status);
                const data = await resp.json(); // [{ id_machine, nom_machine }, ...]
                const machineSelect = document.querySelector('.machine-select');
                if (!machineSelect) return;
                // reset options but keep placeholder (value === '')
                const placeholder = machineSelect.querySelector('option[value=""]') ? machineSelect.querySelector('option[value=""]').outerHTML : '<option value="">--Selectionnez une machine--</option>';
                machineSelect.innerHTML = placeholder;
                data.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = String(m.id_machine);
                    opt.textContent = m.nom_machine;
                    machineSelect.appendChild(opt);
                });
            } catch (err) {
                console.error('fetchAndPopulateMachines error', err);
            }
        }

        /* === PATCH: helpers pour create/update plaque via API === */
        async function createPlaqueOnServer(conceptionId, body) {
            try {
                const resp = await fetch(`/conceptions/${conceptionId}/plaques`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!resp.ok) {
                    const text = await resp.text().catch(() => null);
                    throw new Error('Erreur create plaque: ' + resp.status + ' ' + (text || ''));
                }
                return await resp.json();
            } catch (err) {
                console.error('createPlaqueOnServer error', err);
                throw err;
            }
        }

        async function updatePlaqueOnServer(plaqueId, body) {
            try {
                const resp = await fetch(`/conceptions/plaques/${plaqueId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!resp.ok) {
                    const text = await resp.text().catch(() => null);
                    throw new Error('Erreur update plaque: ' + resp.status + ' ' + (text || ''));
                }
                return await resp.json();
            } catch (err) {
                console.error('updatePlaqueOnServer error', err);
                throw err;
            }
        }

        async function deletePlaqueOnServer(plaqueId) {
            try {
                const resp = await fetch(`/conceptions/plaques/${plaqueId}`, {
                    method: 'DELETE'
                });
                if (!resp.ok) {
                    const text = await resp.text().catch(() => null);
                    throw new Error('Erreur delete plaque: ' + resp.status + ' ' + (text || ''));
                }
                // certains serveurs renvoient 204 No Content -> essayer de lire json sans casser
                try {
                    return await resp.json();
                } catch (e) {
                    return { id_plaque: plaqueId };
                }
            } catch (err) {
                console.error('deletePlaqueOnServer error', err);
                throw err;
            }
        }

        /* === END PATCH === */

        // --- Fetcher les conceptions pour le select (utilise endpoint /conceptions/select) ---
        async function fetchConceptionsForSelect() {
            try {
                const resp = await fetch('/conceptions/select'); // ajuste si base diffèrent
                if (!resp.ok) throw new Error('Erreur fetch conceptions: ' + resp.status);
                const data = await resp.json(); // data = array of ConceptionForSelect

                // mapper vers la structure EXAMPLE_CONCEPTIONS.conceptions
                const mapped = data.map(c => {
                    const clientsMap = {};
                    const productsMap = {};
                    (c.consernes || []).forEach(cs => {
                        if (cs.id_client) clientsMap[cs.id_client] = { clientId: String(cs.id_client), name: cs.enseigne || 'Client', logo: null };
                        if (cs.id_produit) productsMap[cs.id_produit] = { productId: String(cs.id_produit), name: cs.nom_produit || 'Produit', image: null };
                    });
                    return {
                        conceptionId: String(c.id_conception),
                        title: c.nom_conception || ('Conception ' + c.id_conception),
                        createdAt: c.date_creation || null,
                        updatedAt: null,
                        clients: Object.values(clientsMap),
                        products: Object.values(productsMap),
                        plaques: [] // vide pour l'instant; on fetchera plaques à la sélection
                    };
                });

                EXAMPLE_CONCEPTIONS.conceptions = mapped;
                insertConceptionOptions(); // recrée les options à partir d'EXAMPLE_CONCEPTIONS
            } catch (err) {
                console.error('fetchConceptionsForSelect error', err);
                // fallback: garde le contenu statique d'EXAMPLE_CONCEPTIONS (dev env)
                insertConceptionOptions();
            }
        }

        // fetch une conception unique (si endpoint dispo)
        async function fetchConceptionById(id) {
            if (!id) return null;
            try {
                const resp = await fetch(`/conceptions/${encodeURIComponent(id)}`);
                if (!resp.ok) {
                    // 404 prob -> retourne null
                    if (resp.status === 404) return null;
                    throw new Error('Erreur fetch conception: ' + resp.status);
                }
                return await resp.json(); // renvoie un objet Conception complet
            } catch (err) {
                console.error('fetchConceptionById error', err);
                return null;
            }
        }


        // --- Fetcher toutes les plaques d'une conception (utilise endpoint /conceptions/:id/plaques) ---
        async function fetchPlaquesForConception(conceptionId) {
            if (!conceptionId) return [];
            try {
                const resp = await fetch(`/conceptions/${conceptionId}/plaques`);
                if (!resp.ok) {
                    if (resp.status === 404) return [];
                    throw new Error('Erreur fetch plaques: ' + resp.status);
                }
                const payload = await resp.json(); // payload: { total, page, page_size, items }
                const plaquesArray = Array.isArray(payload) ? payload : (payload.items || []);
                const mapped = plaquesArray.map(p => ({
                    plaqueId: String(p.id_plaque || p.id),
                    numero_plaque: (p.numero_plaque !== undefined && p.numero_plaque !== null) ? String(p.numero_plaque) : String(p.numero || ''),
                    couleur: p.couleur || '#000000',
                    statut: p.statut || p.status || '',
                    machineId: p.id_machine ? String(p.id_machine) : (p.id_machine || ''),
                    machineName: p.nom_machine || p.machine || '',
                    date_renouvellement: p.date_renouvellement || p.date_ren || null,
                    date_ajout: p.date_creation || p.date_ajout || null
                }));
                // inject into EXAMPLE_CONCEPTIONS
                const c = EXAMPLE_CONCEPTIONS.conceptions.find(x => String(x.conceptionId) === String(conceptionId));
                if (c) c.plaques = mapped;
                return mapped;
            } catch (err) {
                console.error('fetchPlaquesForConception error', err);
                return [];
            }
        }

        /* ----------------- custom-select conceptions ----------------- */
        function insertConceptionOptions() {
            const select = document.getElementById('conceptionSelect');
            if (!select) return;
            const dropdown = select.querySelector('#selectDropdown') || select.querySelector('.dropdown');
            if (!dropdown) return;
            const allOptions = dropdown.querySelector('#allOptions') || dropdown.querySelector('.options');
            const recentOptions = dropdown.querySelector('#recentOptions');

            if (!allOptions) return;

            // clear previous
            allOptions.innerHTML = '';
            if (recentOptions) recentOptions.innerHTML = '';

            // build options sorted by createdAt desc for recents
            const all = (EXAMPLE_CONCEPTIONS.conceptions || []).slice();
            // safe sort if createdAt exists
            all.sort((a, b) => {
                const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bd - ad;
            });

            all.forEach(c => {
                if (allOptions.querySelector(`.option[data-value="${c.conceptionId}"]`)) return;
                const node = document.createElement('div');
                node.className = 'option';
                node.setAttribute('data-value', c.conceptionId);
                node.setAttribute('role', 'option');
                node.style.display = 'flex';
                node.style.alignItems = 'center';
                node.style.gap = '8px';
                node.innerHTML = `<img src="../img/icon/plaque.png" alt="" style="width:28px;height:28px;"><div class="option-text">${escapeHtml(c.title)}</div>`;
                // dans insertConceptionOptions() : node.addEventListener('click', async () => { ... })
                node.addEventListener('click', async () => {
                    // set current conception (global)
                    window.currentConceptionId = c.conceptionId;

                    // récupère plaques depuis backend
                    const plaques = await fetchPlaquesForConception(c.conceptionId);
                    // ensuite charge la conception
                    const thumb = select.querySelector('.selected-thumb');
                    const label = select.querySelector('.selected-label');
                    if (label) label.textContent = c.title;
                    if (thumb) thumb.src = '../img/icon/papeterie-papiers-empiles.png';
                    loadConceptionById(c.conceptionId);
                    // injecte plaques dans DOM
                    if (window._injectPlaquesArray) window._injectPlaquesArray(plaques || []);

                    // fermer le dropdown après selection
                    const dropdownEl = select.querySelector('#selectDropdown') || select.querySelector('.dropdown');
                    if (dropdownEl) {
                        dropdownEl.style.display = 'none';
                        select.querySelector('#selectToggle')?.setAttribute('aria-expanded', 'false');
                        dropdownEl.setAttribute('aria-hidden', 'true');
                    }
                });



                allOptions.appendChild(node);
            });

            // populate recentOptions (top 6 most recent)
            if (recentOptions) {
                const recents = all.slice(0, 6);
                if (recents.length === 0) {
                    recentOptions.innerHTML = '<div style="opacity:.7;font-size:13px">Aucune conception récente</div>';
                } else {
                    recents.forEach(c => {
                        const n = document.createElement('div');
                        n.className = 'option';
                        n.setAttribute('data-value', c.conceptionId);
                        n.style.display = 'flex';
                        n.style.alignItems = 'center';
                        n.style.gap = '8px';
                        n.innerHTML = `<img src="../img/icon/plaque.png" alt="" style="width:24px;height:24px;"><div class="option-text">${escapeHtml(c.title)}</div>`;
                        // Remplace le contenu du listener dans recentOptions.forEach(...)
                        n.addEventListener('click', async () => {
                            // set global current conception id
                            window.currentConceptionId = c.conceptionId;

                            // récupère plaques depuis backend
                            const plaques = await fetchPlaquesForConception(c.conceptionId);

                            // update UI label + thumb
                            const thumb = select.querySelector('.selected-thumb');
                            const label = select.querySelector('.selected-label');
                            if (label) label.textContent = c.title;
                            if (thumb) thumb.src = '../img/icon/papeterie-papiers-empiles.png';

                            // charge sélection + inject plaques
                            loadConceptionById(c.conceptionId);
                            if (window._injectPlaquesArray) window._injectPlaquesArray(plaques || []);

                            // fermer le dropdown après selection (comme pour les options principales)
                            const dropdownEl = select.querySelector('#selectDropdown') || select.querySelector('.dropdown');
                            if (dropdownEl) {
                                dropdownEl.style.display = 'none';
                                select.querySelector('#selectToggle')?.setAttribute('aria-expanded', 'false');
                                dropdownEl.setAttribute('aria-hidden', 'true');
                            }
                        });

                        recentOptions.appendChild(n);
                    });
                }
            }
        }

        window.loadConceptionById = function (id) {
            const found = EXAMPLE_CONCEPTIONS.conceptions.find(x => String(x.conceptionId) === String(id));
            if (!found) {
                console.warn('Conception non trouvée:', id);
                // clear current conception global
                window.currentConceptionId = null;

                // clear selection UI
                window.conceptionSelection.clients = [];
                window.conceptionSelection.products = [];
                renderList('clients');
                renderList('products');
                // clear plaques if manager present
                if (window._injectPlaquesArray) window._injectPlaquesArray([]);
                return;
            }

            // set current conception global
            window.currentConceptionId = String(found.conceptionId);

            // reset selections
            window.conceptionSelection.clients = [];
            window.conceptionSelection.products = [];

            // add clients/products as LOCKED (non supprimables)
            (found.clients || []).forEach(cl => {
                const thumb = cl.logo || DEFAULTS.clientThumb;
                window.addClientToConception(cl.name, cl.clientId, { locked: true, thumb });
            });
            (found.products || []).forEach(pr => {
                const thumb = pr.image || pr.thumb || DEFAULTS.productThumb;
                window.addProductToConception(pr.name, pr.productId, { locked: true, thumb });
            });

            // update select label/thumb
            const select = document.getElementById('conceptionSelect');
            if (select) {
                const label = select.querySelector('.selected-label');
                if (label) label.textContent = found.title || ('Conception ' + id);
                const thumb = select.querySelector('.selected-thumb');
                if (thumb) thumb.src = '../img/icon/papeterie-papiers-empiles.png';
            }

            console.info('Conception chargée:', found.conceptionId, '-', found.title);
            renderList('clients');
            renderList('products');

            // inject plaques if present (if fetchPlaquesForConception already populated them)
            if (window._injectPlaquesArray) window._injectPlaquesArray(found.plaques || []);
        };

        insertConceptionOptions();

        (function initConceptionSelectBehaviour() {
            const select = document.getElementById('conceptionSelect');
            if (!select) return;
            const toggle = select.querySelector('#selectToggle') || select.querySelector('.select-toggle');
            const dropdown = select.querySelector('#selectDropdown') || select.querySelector('.dropdown');
            const search = select.querySelector('#selectSearch') || select.querySelector('.select-search');
            if (!toggle || !dropdown || !search) return;
            dropdown.style.display = 'none';
            function open() { dropdown.style.display = 'block'; toggle.setAttribute('aria-expanded', 'true'); dropdown.setAttribute('aria-hidden', 'false'); try { search.focus(); } catch (e) { } }
            function close() { dropdown.style.display = 'none'; toggle.setAttribute('aria-expanded', 'false'); dropdown.setAttribute('aria-hidden', 'true'); toggle.focus(); }
            toggle.addEventListener('click', (e) => { e.stopPropagation(); if (dropdown.style.display === 'block') close(); else open(); });
            // debounce search
            let searchTimer = null;
            search.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    const q = (search.value || '').toLowerCase().trim();
                    const nodes = dropdown.querySelectorAll('.option');
                    nodes.forEach(o => {
                        const txt = (o.querySelector('.option-text')?.textContent || '').toLowerCase();
                        o.style.display = txt.includes(q) ? 'flex' : 'none';
                    });
                }, 180);
            });
            document.addEventListener('click', (e) => { if (!select.contains(e.target)) close(); });
            select.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
                if (e.key === 'Escape') close();
            });
        })();

        fetchAndPopulateMachines().catch(err => console.warn('fetchAndPopulateMachines failed', err));

        /* ----------------- plaques manager (logique conservée + pulse) ----------------- */
        (function initPlaquesManager() {
            const plaqueAdded = document.querySelector('.plaque-added');
            const addBtn = document.querySelector('.btnadd-plaque button');
            const numInput = document.querySelector('.ecrit-num-plaque input[type="number"]');
            const colorInput = document.querySelector('.container-couleur-pose-plaque input[type="color"]');
            const machineSelect = document.querySelector('.machine-select');
            const statutSelect = document.querySelector('.statut-select');
            const posesInput = document.querySelector('.inputnombre');
            const typeBlocks = document.querySelectorAll('.choose-type-plaque');

            if (!plaqueAdded || !addBtn) return;

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn-save-plaque';
            saveBtn.textContent = 'Enregistrer la modification';
            saveBtn.style.display = 'none';
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.5';
            document.querySelector('.btnadd-plaque')?.appendChild(saveBtn);

            let editingContainer = null;

            function colorForStatus(status) {
                if (!status) return 'gray';
                const s = status.toLowerCase();
                if (s.includes('indis')) return 'red';
                if (s.includes('en cours') || s.includes('encours') || s.includes('en_impression') || s.includes('en_impression')) return 'orange';
                if (s.includes('dispon') || s.includes('en_stock')) return 'green';
                return 'gray';
            }

            function updateEmptyMessage() {
                const existing = plaqueAdded.querySelectorAll('.plaque-added-container').length;
                const msg = plaqueAdded.querySelector('.empty-message');
                if (existing === 0 && !msg) {
                    const m = document.createElement('div'); m.className = 'empty-message'; m.textContent = 'Aucune plaque ajouter';
                    plaqueAdded.appendChild(m);
                } else if (existing > 0 && msg) msg.remove();
            }

            function buildLeftContent(container) {
                const num = container.dataset.num || '';
                const status = container.dataset.status || 'En stock';
                const machine = container.dataset.machine || '';
                const left = container.querySelector('.left-plaque-added');
                if (!left) return;
                left.innerHTML = '';
                const p = document.createElement('p'); p.style.margin = '0';
                const pin = document.createElement('span'); pin.className = 'status-pin'; pin.style.backgroundColor = colorForStatus(status);
                pin.style.display = 'inline-block'; pin.style.width = '10px'; pin.style.height = '10px'; pin.style.borderRadius = '50%'; pin.style.marginRight = '8px';
                const lab = document.createElement('span'); lab.className = 'status-label'; lab.textContent = status; lab.style.marginRight = '12px'; lab.style.fontWeight = '600';
                const sNum = document.createElement('span'); sNum.className = 'meta-num'; sNum.textContent = num; sNum.style.marginRight = '8px';
                const sMach = document.createElement('span'); sMach.className = 'meta-machine'; sMach.textContent = machine;
                p.appendChild(pin); p.appendChild(lab); p.appendChild(sNum); p.appendChild(sMach);
                left.appendChild(p);
            }

            // function qui déclenche le pulse sur .right-info
            function pulseRightInfo() {
                const rightInfo = document.querySelector('.right-info');
                if (!rightInfo) return;
                rightInfo.classList.remove('animate__animated', 'animate__pulse');
                rightInfo.style.removeProperty('--animate-duration');
                void rightInfo.offsetWidth;
                rightInfo.style.setProperty('--animate-duration', '0.2s');
                rightInfo.classList.add('animate__animated', 'animate__pulse');
                rightInfo.addEventListener('animationend', function handler() {
                    rightInfo.classList.remove('animate__animated', 'animate__pulse');
                    rightInfo.style.removeProperty('--animate-duration');
                }, { once: true });
            }

            function makePlacaElement({ num, type, poses, machine, statut, color }) {
                const container = document.createElement('div');
                container.className = 'plaque-added-container';
                container.style.position = 'relative';
                if (num) container.dataset.num = num;
                if (type) container.dataset.type = type;
                if (poses) container.dataset.poses = poses;
                if (machine) container.dataset.machine = machine;
                if (statut) container.dataset.status = statut;
                if (color) container.dataset.color = color;

                const delBtn = document.createElement('button'); delBtn.className = 'delete-plaque-added'; delBtn.type = 'button';
                Object.assign(delBtn.style, { position: 'absolute', top: '-5px', right: '-5px', width: '20px', height: '20px', borderRadius: '20px', border: 'none', cursor: 'pointer', background: 'rgb(119,2,2)' });
                const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer1.png'; delImg.alt = ''; delImg.style.width = '10px'; delImg.style.height = '10px'; delBtn.appendChild(delImg);
                container.appendChild(delBtn);


                const left = document.createElement('div'); left.className = 'left-plaque-added'; left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.flexWrap = 'wrap';
                left.appendChild(document.createElement('p'));
                container.appendChild(left);

                const right = document.createElement('div'); right.className = 'right-plaque-added';
                if (color) right.style.backgroundColor = color;
                const rightImg = document.createElement('img'); rightImg.src = '../img/icon/papeterie-papiers-empiles.png'; rightImg.alt = 'Plaque'; rightImg.style.width = '30px'; rightImg.style.height = '30px';
                right.appendChild(rightImg);
                container.appendChild(right);

                buildLeftContent(container);

                delBtn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    if (!confirm('Confirmer la suppression de cette plaque ?')) return;

                    // si on est en train d'éditer cette plaque, annule l'édition proprement
                    if (editingContainer === container) {
                        editingContainer = null;
                        saveBtn.style.display = 'none';
                        saveBtn.disabled = true;
                        saveBtn.style.opacity = '0.5';
                    }

                    const plaqueId = container.dataset.id_plaque;
                    if (!plaqueId) {
                        // plaque non persistée côté serveur -> suppression locale simple
                        container.remove();
                        updateEmptyMessage();
                        alert('Plaque supprimée (locale).');
                        return;
                    }

                    // Désactiver le bouton pour éviter double clic
                    delBtn.disabled = true;
                    delBtn.style.opacity = '0.6';

                    try {
                        await deletePlaqueOnServer(plaqueId);
                        // suppression réussie -> retirer du DOM
                        container.remove();
                        updateEmptyMessage();
                        alert('Plaque supprimée avec succès.');
                    } catch (err) {
                        console.error('Erreur suppression plaque', err);
                        alert('Erreur lors de la suppression : ' + (err.message || 'Erreur serveur'));
                    } finally {
                        try { delBtn.disabled = false; delBtn.style.opacity = '1'; } catch (e) { }
                    }
                });




                container.addEventListener('click', (ev) => {
                    if (ev.target.closest('.delete-plaque-added') || ev.target.closest('.edit-plaque-added')) return;
                    pulseRightInfo();
                    openForEdit(container);
                });

                return container;
            }

            function resetForm() {
                if (numInput) numInput.value = '';
                if (posesInput) posesInput.value = '';
                if (colorInput) try { colorInput.value = '#000000'; } catch (e) { }
                if (machineSelect) machineSelect.value = '';
                if (statutSelect) statutSelect.value = 'en_stock';

                typeBlocks.forEach(b => { const r = b.querySelector('input[type="radio"]'); if (r) r.checked = false; });
                editingContainer = null;
                saveBtn.style.display = 'none'; saveBtn.disabled = true; saveBtn.style.opacity = '0.5';
                addBtn.innerHTML = '';
                const img = document.createElement('img'); img.src = '../img/icon/addfleche.png'; img.alt = ''; img.style.width = '16px'; img.style.height = '16px'; img.style.marginRight = '8px';
                addBtn.appendChild(img); addBtn.appendChild(document.createTextNode('Ajouter la plaque'));
            }

            function openForEdit(container) {
                if (!container) return;
                editingContainer = container;
                numInput.value = container.dataset.num || '';
                posesInput && (posesInput.value = container.dataset.poses || '');
                if (colorInput && container.dataset.color) try { colorInput.value = container.dataset.color; } catch (e) { }
                // set machine by id first (populated by fetchMachines)
                if (machineSelect) {
                    if (container.dataset.machineId && machineSelect.querySelector(`option[value="${container.dataset.machineId}"]`)) {
                        machineSelect.value = container.dataset.machineId;
                    } else {
                        // fallback to name if id option not present
                        machineSelect.value = container.dataset.machine || '';
                        // (option may not exist; you can optionally create an option here)
                    }
                }
                if (statutSelect) {
                    // ensure we match exactly the option value
                    if (container.dataset.status && Array.from(statutSelect.options).some(o => o.value === container.dataset.status)) {
                        statutSelect.value = container.dataset.status;
                    } else {
                        // fallback: try normalized value (lowercase)
                        const normalized = (container.dataset.status || '').toLowerCase();
                        if (Array.from(statutSelect.options).some(o => o.value === normalized)) statutSelect.value = normalized;
                        else statutSelect.value = 'en_stock'; // fallback par défaut
                    }
                }
                typeBlocks.forEach(b => {
                    const label = b.querySelector('p')?.textContent?.trim();
                    const r = b.querySelector('input[type="radio"]');
                    if (r && label) r.checked = (label === (container.dataset.type || ''));
                });
                saveBtn.style.display = 'inline-flex'; saveBtn.disabled = true; saveBtn.style.opacity = '0.5';

            }

            function formChanged() { if (!editingContainer) return; saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
            [numInput, colorInput, posesInput, machineSelect, statutSelect].forEach(inp => { if (inp) { inp.addEventListener('input', formChanged); inp.addEventListener('change', formChanged); } });
            typeBlocks.forEach(b => { const r = b.querySelector('input[type="radio"]'); if (r) r.addEventListener('change', formChanged); });

            addBtn.addEventListener('click', async () => {
                console.log('DEBUG currentConceptionId =', window.currentConceptionId);

                const clients = (window.conceptionSelection && window.conceptionSelection.clients) || [];
                const products = (window.conceptionSelection && window.conceptionSelection.products) || [];
                if (!clients.length || !products.length) {
                    alert('La conception doit appartenir à au moins 1 client et 1 produit.');
                    return;
                }

                if (!window.currentConceptionId) {
                    alert('Veuillez sélectionner une conception avant d\'ajouter une plaque.');
                    return;
                }

                const num = (numInput?.value || '').trim();
                const poses = (posesInput?.value || '').trim();
                const color = (colorInput?.value || '').trim() || '#000000';
                const machineId = (machineSelect?.value || '').trim();
                const machineName = machineSelect?.selectedOptions?.[0]?.textContent || '';
                const statut = (statutSelect?.value || 'en_stock').trim();
                let type = '';
                typeBlocks.forEach(b => { const r = b.querySelector('input[type="radio"]'); const p = b.querySelector('p'); if (r && r.checked) type = p?.textContent?.trim() || ''; });

                if (!num || !machineId) { alert('Veuillez remplir au minimum le numéro et la machine.'); return; }
                for (const c of plaqueAdded.querySelectorAll('.plaque-added-container')) {
                    if ((c.dataset.num || '').trim() === num.trim()) { alert('Une plaque avec ce numéro existe déjà.'); return; }
                }

                // build server payload
                const payload = {
                    numero_plaque: Number(num),
                    couleur: color,
                    statut: statut,
                    id_machine: machineId
                    // date_renouvellement/prix peuvent être ajoutés si disponibles
                };

                // create on server first
                try {
                    const created = await createPlaqueOnServer(window.currentConceptionId, payload);
                    // server returns plaque object (PlaqueOut)
                    const returnedId = created.id_plaque || created.id || null;
                    const returnedMachineName = created.nom_machine || machineName || '';
                    const el = makePlacaElement({ num, type, poses, machine: returnedMachineName, statut, color });
                    if (returnedId) el.dataset.id_plaque = returnedId;
                    if (machineId) el.dataset.machineId = machineId;
                    if (returnedMachineName) el.dataset.machine = returnedMachineName;
                    if (statut) el.dataset.status = statut;
                    plaqueAdded.appendChild(el);
                    updateEmptyMessage();
                    resetForm();
                    alert('Plaque ajoutée avec succès.');
                } catch (err) {
                    // si erreur (ex: duplicate numero), on la propage à l'utilisateur
                    alert('Erreur lors de la création de la plaque : ' + (err.message || 'Erreur serveur'));
                    console.error(err);
                }

            });


            saveBtn.addEventListener('click', async () => {
                if (!editingContainer) return;
                if (saveBtn.disabled) return;

                const clients = (window.conceptionSelection && window.conceptionSelection.clients) || [];
                const products = (window.conceptionSelection && window.conceptionSelection.products) || [];
                if (!clients.length || !products.length) {
                    alert('La conception doit appartenir à au moins 1 client et 1 produit.');
                    return;
                }

                const num = (numInput?.value || '').trim();
                const poses = (posesInput?.value || '').trim();
                const color = (colorInput?.value || '').trim() || '#000000';
                const machineId = (machineSelect?.value || '').trim();
                const machineName = machineSelect?.selectedOptions?.[0]?.textContent || '';
                const statut = (statutSelect?.value || 'en_stock').trim();
                let type = '';
                typeBlocks.forEach(b => { const r = b.querySelector('input[type="radio"]'); const p = b.querySelector('p'); if (r && r.checked) type = p?.textContent?.trim() || ''; });

                if (!num || !machineId) { alert('Veuillez remplir au minimum le numéro et la machine.'); return; }
                for (const c of plaqueAdded.querySelectorAll('.plaque-added-container')) {
                    if (c === editingContainer) continue;
                    if ((c.dataset.num || '').trim() === num.trim()) { alert('Numéro déjà utilisé par une autre plaque.'); return; }
                }

                // Update dataset/UI first
                editingContainer.dataset.num = num;
                editingContainer.dataset.type = type;
                editingContainer.dataset.poses = poses;
                editingContainer.dataset.machineId = machineId;
                editingContainer.dataset.machine = machineName;
                editingContainer.dataset.status = statut;
                if (color) editingContainer.dataset.color = color;
                const right = editingContainer.querySelector('.right-plaque-added');
                if (right && color) right.style.backgroundColor = color;

                buildLeftContent(editingContainer);

                // If plaque has an id_plaque -> update server
                const plaqueId = editingContainer.dataset.id_plaque;
                if (plaqueId) {
                    const payload = {
                        numero_plaque: Number(num),
                        couleur: color,
                        statut: statut,
                        id_machine: machineId
                    };
                    try {
                        const updated = await updatePlaqueOnServer(plaqueId, payload);
                        // update returned values (machine name / id)
                        if (updated && updated.id_machine) editingContainer.dataset.machineId = updated.id_machine;
                        if (updated && updated.nom_machine) editingContainer.dataset.machine = updated.nom_machine;
                        editingContainer.dataset.status = updated.statut || statut;
                        // refresh left content
                        buildLeftContent(editingContainer);
                        // finalise
                        editingContainer = null;
                        resetForm();
                        updateEmptyMessage();
                        alert('Plaque modifiée avec succès.');
                    } catch (err) {
                        alert('Erreur lors de la mise à jour : ' + (err.message || 'Erreur serveur'));
                        console.error(err);
                    }
                } else {
                    // No plaque id -> it was a new front-only element; best practice: call createPlaqueOnServer now
                    if (!window.currentConceptionId) {
                        alert('Impossible d\'enregistrer: aucune conception sélectionnée');
                        return;
                    }
                    const payload = {
                        numero_plaque: Number(num),
                        couleur: color,
                        statut: statut,
                        id_machine: machineId
                    };
                    try {
                        const created = await createPlaqueOnServer(window.currentConceptionId, payload);
                        if (created && created.id_plaque) editingContainer.dataset.id_plaque = created.id_plaque;
                        if (created && created.id_machine) editingContainer.dataset.machineId = created.id_machine;
                        if (created && created.nom_machine) editingContainer.dataset.machine = created.nom_machine;
                        editingContainer = null;
                        resetForm();
                        updateEmptyMessage();
                    } catch (err) {
                        alert('Erreur lors de la création sur serveur : ' + (err.message || 'Erreur serveur'));
                        console.error(err);
                    }
                }
            });


            // expose helper to inject plaques in the DOM from fetched data
            window._injectPlaquesArray = function (plaquesArray) {
                Array.from(plaqueAdded.querySelectorAll('.plaque-added-container')).forEach(n => n.remove());
                if (!plaquesArray || !plaquesArray.length) {
                    updateEmptyMessage();
                    return;
                }
                for (const p of plaquesArray) {
                    const num = p.numero_plaque || p.naumero_plaque || '';
                    const color = p.couleur || '#000000';
                    const statut = p.statut || p.status || 'Disponible';
                    const machineId = p.machineId || p.id_machine || '';
                    const machineName = p.machineName || p.nom_machine || p.machine || '';
                    const el = makePlacaElement({ num: String(num), type: '', poses: '', machine: machineName, statut, color });
                    if (p.plaqueId) el.dataset.id_plaque = p.plaqueId;
                    if (machineId) el.dataset.machineId = machineId;
                    if (machineName) el.dataset.machine = machineName;
                    if (statut) el.dataset.status = statut;
                    plaqueAdded.appendChild(el);
                }
                updateEmptyMessage();

            };
            try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* ignore */ }


            updateEmptyMessage();
            resetForm();
        })(); // end plaques manager

        // --- IMPORTANT : lancer le fetch initial des conceptions ---
        // (ne pas appeler insertConceptionOptions directement : on veut la liste serveur)
        // --- IMPORTANT : lancer le fetch initial des conceptions ---
        // (ne pas appeler insertConceptionOptions directement : on veut la liste serveur)
        fetchConceptionsForSelect()
            .then(async () => {
                if (PRESELECT_CONCEPTION_ID) {
                    // Définit l'ID courant global (pour la logique d'ajout/plaque etc.)
                    window.currentConceptionId = String(PRESELECT_CONCEPTION_ID);

                    // tente de trouver la conception dans la liste reçue
                    const found = EXAMPLE_CONCEPTIONS.conceptions.find(x => String(x.conceptionId) === String(PRESELECT_CONCEPTION_ID));
                    if (found) {
                        // charge la conception (met à jour chips + select label)
                        loadConceptionById(found.conceptionId);

                        // fetch et injecte les plaques depuis le backend (comme si on avait cliqué)
                        try {
                            const plaques = await fetchPlaquesForConception(found.conceptionId);
                            if (window._injectPlaquesArray) window._injectPlaquesArray(plaques || []);
                        } catch (e) {
                            console.warn('Échec fetch plaques pour la conception pré-sélectionnée', e);
                        }
                    } else {
                        // si la conception n'est pas présente dans la liste (par ex: filtre serveur),
                        // on garde currentConceptionId défini pour autoriser les opérations côté front
                        console.warn('Conception pré-sélectionnée introuvable dans la liste reçue :', PRESELECT_CONCEPTION_ID);
                    }

                    // fermer le dropdown (UX similaire au clic)
                    const select = document.getElementById('conceptionSelect');
                    if (select) {
                        const dropdownEl = select.querySelector('#selectDropdown') || select.querySelector('.dropdown');
                        if (dropdownEl) {
                            dropdownEl.style.display = 'none';
                            select.querySelector('#selectToggle')?.setAttribute('aria-expanded', 'false');
                            dropdownEl.setAttribute('aria-hidden', 'true');
                        }
                    }
                }
            })
            .catch(err => console.warn('fetchConceptionsForSelect failed', err));


    }); // DOMContentLoaded end
})(); // IIFE end
