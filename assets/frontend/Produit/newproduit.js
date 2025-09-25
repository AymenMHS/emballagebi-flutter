// newproduit.js (version corrigée et complète — fix : robust selectTypeCarton lookup)
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('unhandledrejection', (ev) => {
        try {
            const r = ev.reason;
            if (r && r.message && typeof r.message === 'string' &&
                r.message.includes('A listener indicated an asynchronous response by returning true')) {
                // extension issue : ignorer / logguer proprement
                console.warn('Ignored extension messaging error:', r.message);
                ev.preventDefault();
            }
        } catch (e) { /* ignore */ }
    });
    /* ---------------- notifications ---------------- */
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

    /* ---------------- images UI: ajout / preview / suppression ---------------- */
    const imagesContainer = document.querySelector('.images-container');
    if (!imagesContainer) { console.error('images-container introuvable'); return; }
    const addBtn = imagesContainer.querySelector('.addimage-product');

    // invisible input file (multi)
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.style.display = 'none';
    imagesContainer.appendChild(fileInput);
    addBtn && addBtn.addEventListener('click', () => fileInput.click());

    // store IDs of server images the user removed (to tell backend)
    const removedServerImageIds = new Set();

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                const newBlock = createImageProductElement(dataUrl, file);
                imagesContainer.insertBefore(newBlock, addBtn);
            };
            reader.readAsDataURL(file);
        });
        fileInput.value = '';
    });

    // click delete on any image-product wrapper
    imagesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.classList.contains('addimage-product')) return;
        const wrapper = btn.closest('.image-product');
        if (!wrapper) return;
        const sid = wrapper.dataset.imageId || wrapper.dataset.idImage || null;
        if (sid) removedServerImageIds.add(sid);
        wrapper.remove();
    });

    function createImageProductElement(src, file = null, serverMeta = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-product';
        wrapper.style.display = 'inline-block';
        wrapper.style.margin = '8px';
        wrapper.style.textAlign = 'center';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.title = 'Supprimer';
        delBtn.style.display = 'block';
        delBtn.style.marginBottom = '6px';

        const delIcon = document.createElement('img');
        delIcon.src = '../img/icon/supprimer1.png';
        delIcon.alt = 'deleteProduct';
        delIcon.style.width = '20px';
        delIcon.style.height = '20px';
        delBtn.appendChild(delIcon);

        const img = document.createElement('img');
        img.src = src;
        img.alt = 'imageProduct';
        img.style.maxWidth = '120px';
        img.style.maxHeight = '120px';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        img.style.borderRadius = '6px';

        if (file) wrapper._file = file;
        if (serverMeta && (serverMeta.id_image || serverMeta.id)) {
            wrapper.dataset.imageId = serverMeta.id_image || serverMeta.id || '';
            wrapper.dataset.storagePath = serverMeta.storage_path || serverMeta.storagePath || '';
        }

        wrapper.appendChild(delBtn);
        wrapper.appendChild(img);
        return wrapper;
    }

    /* ---------------- récupère les éléments du formulaire ---------------- */
    const formContainer = document.querySelector('.form-addproduct');
    if (!formContainer) { console.error('form-addproduct introuvable'); return; }
    const leftContainer = formContainer.querySelector('.left-addproduct-container');
    if (!leftContainer) { console.error('left-addproduct-container introuvable'); return; }

    // === robust lookup: don't rely on positions ===
    let inputNom = leftContainer.querySelector('input[type="text"], input[name="nom_produit"]') || document.querySelector('input[name="nom_produit"]') || null;
    // Prefer direct selectors (name or id), fall back to searching label text
    let selectTypeCarton = document.querySelector('select[name="type_carton"], #select-type-carton') || null;

    if (!selectTypeCarton) {
        // try to find by surrounding label text (heuristic)
        document.querySelectorAll('.input-form-product').forEach(div => {
            if (selectTypeCarton) return;
            const label = div.querySelector('span');
            const sel = div.querySelector('select');
            if (label && sel && label.textContent && label.textContent.toLowerCase().includes('type de carton')) {
                selectTypeCarton = sel;
            }
        });
    }

    // fallback: last resort - any select that contains the expected options
    if (!selectTypeCarton) {
        const maybe = document.querySelectorAll('select');
        maybe.forEach(s => {
            if (selectTypeCarton) return;
            const opts = Array.from(s.options).map(o => (o.value || '').trim().toLowerCase());
            if (opts.includes('cartons offset') || opts.includes('sacs') || opts.includes('papier') || opts.includes('ondule')) {
                selectTypeCarton = s;
            }
        });
    }

    // optional category select (UUID ids); front may have a category list
    const selectCategorie = document.getElementById('categorySelect') || document.querySelector('select[name="categorie_id"]') || null;

    const divise = leftContainer.querySelector('.divise-input-form-product');
    let inputQuantiteMin = null, selectTaille = null;
    if (divise) {
        const minis = divise.querySelectorAll('.miniinput-form-product');
        if (minis.length >= 2) {
            inputQuantiteMin = minis[0].querySelector('input[type="number"]');
            selectTaille = minis[1].querySelector('select');
        }
    }
    // fallback by name
    if (!inputQuantiteMin) inputQuantiteMin = document.querySelector('input[name="quantite_min"]');
    if (!selectTaille) selectTaille = document.querySelector('select[name="taille"]');

    // find price input (other than quantite_min)
    let inputPrix = null;
    const allNumberInputs = leftContainer.querySelectorAll('input[type="number"], input[name="prix_unitaire"]');
    if (allNumberInputs.length) {
        for (const n of allNumberInputs) { if (n !== inputQuantiteMin) { inputPrix = n; break; } }
    }
    if (!inputPrix) inputPrix = document.querySelector('input[name="prix_unitaire"]');

    const descTextarea = leftContainer.querySelector('.infosupp-form-product .desc-form-product textarea') || document.querySelector('textarea[name="description"]');

    const btnsForm = formContainer.querySelector('.btns-form');
    let saveBtn = null;
    if (btnsForm) {
        const buttons = btnsForm.querySelectorAll('button');
        if (buttons.length >= 2) saveBtn = buttons[1];
        else saveBtn = buttons[buttons.length - 1];
    }
    if (!saveBtn) { console.error('Bouton sauvegarder introuvable'); return; }

    /* ---------------- canonical client map (synonymes) ---------------- */
    const CLIENT_CANONICAL_MAP = {
        "sacs kraft": "Sacs",
        "papier kraft": "Papier",
        "cartons offset": "Cartons Offset",
        "ondulé": "Ondule",
        "ondule": "Ondule",
        "sacs": "Sacs",
        "papier": "Papier",
        "cartons": "Cartons Offset"
    };
    function normalizeKey(s) { if (!s) return ""; return s.trim().toLowerCase().replace(/\s+/g, ' '); }

    /* ---------------- supported types (populated from backend) ---------------- */
    let ALLOWED_TYPE_CARTON = null; // array of labels fetched from backend
    const DEFAULT_TYPES = ["Cartons Offset", "Sacs", "Papier", "Ondule"];

    async function loadTypeCartonOptions() {
        if (!selectTypeCarton) return;
        try {
            const r = await fetch('/api/produit/types_carton', { credentials: 'same-origin' });
            if (r.ok) {
                const j = await r.json();
                const types = Array.isArray(j.types) ? j.types : (j && j.types) || [];
                ALLOWED_TYPE_CARTON = (types && types.length) ? types : DEFAULT_TYPES;
            } else {
                ALLOWED_TYPE_CARTON = DEFAULT_TYPES;
            }
        } catch (e) {
            ALLOWED_TYPE_CARTON = DEFAULT_TYPES;
        }
        try {
            const currentLabel = (selectTypeCarton.value && selectTypeCarton.value.trim()) ? selectTypeCarton.value : (selectTypeCarton.options[selectTypeCarton.selectedIndex]?.textContent || '');
            selectTypeCarton.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '-- Choisir un type de carton --';
            selectTypeCarton.appendChild(placeholder);
            ALLOWED_TYPE_CARTON.forEach(t => {
                const o = document.createElement('option');
                o.value = t;
                o.textContent = t;
                selectTypeCarton.appendChild(o);
            });
            if (currentLabel) {
                let found = false;
                Array.from(selectTypeCarton.options).forEach(opt => {
                    if ((opt.value || '').trim().toLowerCase() === currentLabel.trim().toLowerCase() ||
                        (opt.textContent || '').trim().toLowerCase() === currentLabel.trim().toLowerCase()) {
                        opt.selected = true; found = true;
                    }
                });
                if (!found) selectTypeCarton.selectedIndex = 0;
            }
        } catch (e) {
            console.warn('Erreur peuplement select type_carton', e);
        }
    }


    // -------------------- categories loader --------------------
    async function fetchAndPopulateCategories() {
        if (!selectCategorie) return;
        const tried = ['/api/categorie', '/api/categorie/list', '/api/categories', '/api/categories/list'];
        let list = null;
        for (const url of tried) {
            try {
                const res = await fetch(url, { credentials: 'same-origin' });
                if (!res.ok) continue;
                const body = await res.json().catch(() => null);
                if (!body) continue;
                if (Array.isArray(body)) list = body;
                else if (body && Array.isArray(body.items)) list = body.items;
                else if (body && Array.isArray(body.data)) list = body.data;
                if (list) break;
            } catch (e) {
                // ignore, essaye url suivante
                continue;
            }
        }
        // si pas de liste, on garde ce qu'il y a (ne pas vider)
        if (!list || !Array.isArray(list)) return;

        // préserve sélection actuelle
        const currentVal = (selectCategorie.value || '').toString();

        // reconstruit options : placeholder conservé si présent
        const placeholderText = selectCategorie.options[0] ? selectCategorie.options[0].text : '--Selectionnez une Categorie--';
        selectCategorie.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholderText;
        selectCategorie.appendChild(opt0);

        list.forEach(it => {
            const id = it.id_categorie || it.id || it.idCategorie || it.idCategorie || '';
            const name = it.nom_categorie || it.nom || it.name || it.nomCategorie || ('' + it) || '';
            if (!name) return;
            const opt = document.createElement('option');
            opt.value = id || name;
            opt.text = name;
            selectCategorie.appendChild(opt);
        });

        // si on avait une valeur initiale, essayer de la re-sélectionner
        if (currentVal) {
            try {
                const opt = selectCategorie.querySelector(`option[value="${currentVal}"]`);
                if (opt) opt.selected = true;
                else {
                    // peut être que currentVal est un label, essayer par texte
                    const found = Array.from(selectCategorie.options).find(o => (o.textContent || '').trim().toLowerCase() === currentVal.trim().toLowerCase());
                    if (found) found.selected = true;
                }
            } catch (e) { /* ignore */ }
        }
    }

    /* ---------------- detecter edition (id present) ---------------- */
    function getQueryParamRobust(name) {
        try {
            const p = new URLSearchParams(window.location.search || '');
            const v = p.get(name);
            if (v) return v;
        } catch (e) { /* ignore */ }

        try {
            const href = window.location.href || '';
            let m = href.match(new RegExp('[?&]' + name + '=([0-9a-fA-F\\-]{8,})'));
            if (m && m[1]) return decodeURIComponent(m[1]);
            m = href.match(new RegExp('[?&]' + name + '=([^&\\#]+)'));
            if (m && m[1]) return decodeURIComponent(m[1]);
        } catch (e) { /* ignore */ }

        try {
            const hash = (window.location.hash || '').replace(/^#/, '');
            if (hash) {
                const hp = new URLSearchParams(hash);
                const hv = hp.get(name);
                if (hv) return hv;
            }
        } catch (e) { /* ignore */ }

        return null;
    }

    const productId = getQueryParamRobust('id');
    console.log('DEBUG: detected productId =', productId);

    const IMAGE_PREFIX = '/storage/';

    // Load types first so we can populate select before possibly loading product to edit
    // Load types first, then categories, then (si édition) charger le produit.
    (async () => {
        try {
            await loadTypeCartonOptions();
            // populate categories before editing the product (avoid race condition)
            await fetchAndPopulateCategories().catch((e) => { console.warn('fetchAndPopulateCategories failed', e); });
            if (productId) {
                const titleH1 = document.querySelector('.title-addproduct h1');
                if (titleH1) titleH1.textContent = 'Modifier le produit';
                await loadProductToEdit(productId);
            } else {
                console.warn('newproduit: pas d\'id détecté dans l\'URL — création nouvelle entrée');
            }
        } catch (e) {
            console.warn('Init types/categories failed', e);
            // tenter quand même de charger produit si possible
            if (productId) loadProductToEdit(productId);
        }
    })();

    async function loadProductToEdit(id) {
        try {
            const res = await fetch(`/api/produit/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
            if (!res.ok) {
                if (res.status === 404) {
                    showNotification('Produit introuvable (id invalide).', false);
                } else {
                    showNotification('Impossible de charger le produit: ' + res.status, false);
                }
                return;
            }
            const p = await res.json();
            // après avoir obtenu `p` (le produit) :
            if (selectCategorie) {
                const remoteCatId = p.id_categorie || p.categorie_id || null;
                const remoteCatName = p.nom_categorie || p.categorie || null;

                // essaye de sélectionner par value
                if (remoteCatId) {
                    try {
                        const opt = selectCategorie.querySelector(`option[value="${remoteCatId}"]`);
                        if (opt) {
                            opt.selected = true;
                        } else {
                            // si l'option n'existe pas encore, créer une option temporaire
                            const newOpt = document.createElement('option');
                            newOpt.value = remoteCatId;
                            newOpt.textContent = remoteCatName || remoteCatId;
                            newOpt.dataset.id = remoteCatId;
                            newOpt.selected = true;
                            // insérer avant le placeholder ou à la fin
                            selectCategorie.appendChild(newOpt);
                        }
                    } catch (e) {
                        console.warn('Erreur sélection catégorie:', e);
                    }
                } else if (remoteCatName) {
                    // selection par texte (fallback)
                    const found = Array.from(selectCategorie.options).find(o => (o.textContent || '').trim().toLowerCase() === remoteCatName.trim().toLowerCase());
                    if (found) found.selected = true;
                    else {
                        const newOpt = document.createElement('option');
                        newOpt.value = remoteCatName;
                        newOpt.textContent = remoteCatName;
                        newOpt.selected = true;
                        selectCategorie.appendChild(newOpt);
                    }
                }
            }

            inputNom && (inputNom.value = p.nom_produit || '');
            if (selectTypeCarton) {
                const val = p.type_carton || '';
                let found = false;
                Array.from(selectTypeCarton.options).forEach(opt => {
                    if ((opt.value && (opt.value + '').trim().toLowerCase() === (val + '').trim().toLowerCase()) ||
                        (opt.textContent && opt.textContent.trim().toLowerCase() === (val + '').trim().toLowerCase())
                    ) {
                        opt.selected = true; found = true;
                    }
                });
                if (!found && val) {
                    const opt = document.createElement('option'); opt.text = val || ''; opt.value = val || '';
                    opt.selected = true; selectTypeCarton.appendChild(opt);
                }
            }

            if (selectCategorie) {
                const remoteCatId = p.id_categorie || p.categorie_id || null;
                const remoteCatName = p.nom_categorie || p.categorie || null;

                // essaye de sélectionner par value
                if (remoteCatId) {
                    try {
                        const opt = selectCategorie.querySelector(`option[value="${remoteCatId}"]`);
                        if (opt) {
                            opt.selected = true;
                        } else {
                            // si l'option n'existe pas encore, créer une option temporaire
                            const newOpt = document.createElement('option');
                            newOpt.value = remoteCatId;
                            newOpt.textContent = remoteCatName || remoteCatId;
                            newOpt.dataset.id = remoteCatId;
                            newOpt.selected = true;
                            // insérer avant le placeholder ou à la fin
                            selectCategorie.appendChild(newOpt);
                        }
                    } catch (e) {
                        console.warn('Erreur sélection catégorie:', e);
                    }
                } else if (remoteCatName) {
                    // selection par texte (fallback)
                    const found = Array.from(selectCategorie.options).find(o => (o.textContent || '').trim().toLowerCase() === remoteCatName.trim().toLowerCase());
                    if (found) found.selected = true;
                    else {
                        const newOpt = document.createElement('option');
                        newOpt.value = remoteCatName;
                        newOpt.textContent = remoteCatName;
                        newOpt.selected = true;
                        selectCategorie.appendChild(newOpt);
                    }
                }
            }

            if (selectCategorie && p.categorie_id) {
                try {
                    const opt = selectCategorie.querySelector(`option[value="${p.categorie_id}"]`);
                    if (opt) opt.selected = true;
                } catch (e) { }
            }

            if (inputQuantiteMin) inputQuantiteMin.value = (typeof p.quantite_min !== 'undefined' && p.quantite_min !== null) ? Number(p.quantite_min) : (inputQuantiteMin.value || 0);

            if (selectTaille && p.taille) {
                let found = false;
                Array.from(selectTaille.options).forEach(opt => {
                    if ((opt.value && opt.value === p.taille) || (opt.textContent && opt.textContent.trim() === p.taille)) {
                        opt.selected = true; found = true;
                    }
                });
                if (!found) {
                    const o = document.createElement('option'); o.value = p.taille; o.text = p.taille; o.selected = true; selectTaille.appendChild(o);
                }
            }

            if (inputPrix) inputPrix.value = (typeof p.prix_unitaire !== 'undefined' && p.prix_unitaire !== null) ? p.prix_unitaire : inputPrix.value;
            if (descTextarea) descTextarea.value = (p.description === null || typeof p.description === 'undefined') ? '' : p.description;

            if (Array.isArray(p.images)) {
                p.images.forEach(imgMeta => {
                    const storage = imgMeta.storage_path || imgMeta.storagePath || imgMeta.path || '';
                    const url = storage ? (IMAGE_PREFIX + storage) : (imgMeta.url || imgMeta.filename || '');
                    const el = createImageProductElement(url, null, { id_image: imgMeta.id_image || imgMeta.id || '', storage_path: storage });
                    imagesContainer.insertBefore(el, addBtn);
                });
            }

        } catch (err) {
            console.error('Erreur chargement produit:', err);
            showNotification('Erreur lors du chargement du produit.', false);
        }
    }

    /* ---------------- save handler (create OR update selon productId) ---------------- */
    saveBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        saveBtn.disabled = true;
        const origText = saveBtn.textContent;
        saveBtn.textContent = productId ? 'Mise à jour...' : 'Enregistrement...';

        try {
            const nom = (inputNom && inputNom.value) ? inputNom.value.trim() : '';

            // validations initiales
            if (!nom) { showNotification('Le nom du produit est requis.', false, { duration: 4000 }); restore(); return; }

            // Build FormData BEFORE any append (fix TDZ error)
            const formData = new FormData();

            // type_carton: prefer selectTypeCarton.value (we populated it with labels)
            let type_carton_raw = '';
            if (selectTypeCarton) {
                const opt = selectTypeCarton.options[selectTypeCarton.selectedIndex];
                if (opt) {
                    let val = (opt.value || '').trim();
                    const text = (opt.textContent || '').trim();
                    const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
                    if (uuidRe.test(val) && text) {
                        type_carton_raw = text; // use label if value is an id
                    } else {
                        type_carton_raw = val || text;
                    }
                }
            }

            const categorie_id = selectCategorie ? (selectCategorie.value || '') : '';
            // IMPORTANT: backend expects "id_categorie" (not "categorie_id")
            if (categorie_id) formData.append('id_categorie', categorie_id);

            const quantite_min = (inputQuantiteMin && inputQuantiteMin.value !== undefined) ? inputQuantiteMin.value : '';
            const taille = (selectTaille && selectTaille.value) ? selectTaille.value : '';
            const prix_unitaire = (inputPrix && inputPrix.value) ? inputPrix.value : '';
            const description = descTextarea ? descTextarea.value.trim() : '';

            // more validation
            if (!type_carton_raw) { showNotification('Le type de carton est requis.', false, { duration: 4000 }); restore(); return; }
            if (!prix_unitaire) { showNotification('Le prix unitaire est requis.', false, { duration: 4000 }); restore(); return; }

            // map synonyms (client-side)
            const key = normalizeKey(type_carton_raw);
            const mapped = CLIENT_CANONICAL_MAP[key] || type_carton_raw;

            // validate allowed list (if loaded)
            const allowed = Array.isArray(ALLOWED_TYPE_CARTON) && ALLOWED_TYPE_CARTON.length ? ALLOWED_TYPE_CARTON : DEFAULT_TYPES;
            const foundAllowed = allowed.some(a => (a || '').trim().toLowerCase() === (mapped || '').trim().toLowerCase());
            if (!foundAllowed) {
                showNotification('Type de carton invalide — choisissez parmi : ' + allowed.join(', '), false, { duration: 6000 });
                restore();
                return;
            }

            const type_carton_mapped = (() => {
                for (const a of allowed) {
                    if ((a || '').trim().toLowerCase() === (mapped || '').trim().toLowerCase()) return a;
                }
                return mapped;
            })();

            // Append main fields to FormData
            formData.append('nom_produit', nom);
            formData.append('type_carton', type_carton_mapped);
            formData.append('prix_unitaire', prix_unitaire);

            // categorie already appended as id_categorie above if present
            formData.append('quantite_min', quantite_min);
            formData.append('taille', taille);
            formData.append('description', description);

            // append files
            const imageBlocks = imagesContainer.querySelectorAll('.image-product');
            imageBlocks.forEach((blk) => {
                if (blk._file) {
                    formData.append('files', blk._file, blk._file.name);
                }
            });

            // If update, include deleted image ids
            if (productId) {
                const delIds = Array.from(removedServerImageIds);
                formData.append('deleted_image_ids', JSON.stringify(delIds));
            }

            // DEBUG log (optional)
            try {
                console.log('FormData entries:');
                for (const pair of formData.entries()) {
                    if (pair[1] instanceof File) {
                        console.log(pair[0], '=> File:', pair[1].name, pair[1].type, pair[1].size);
                    } else {
                        console.log(pair[0], '=>', pair[1]);
                    }
                }
            } catch (e) {
                console.warn('Impossible de lister FormData entries', e);
            }

            // select endpoint & method
            let url, method;
            if (productId) { url = `/api/produit/${encodeURIComponent(productId)}`; method = 'PUT'; }
            else { url = '/api/produit/create'; method = 'POST'; }

            const response = await fetch(url, {
                method,
                body: formData,
                credentials: 'same-origin'
            });

            if (response.ok) {
                const successMsg = productId ? 'Produit mis à jour avec succès. Redirection...' : 'Produit créé avec succès. Redirection...';
                showNotification(successMsg, true, { duration: 1000, onClose: () => { window.location.href = 'produits.html'; } });
                return;
            } else {
                let parsed = null;
                try { parsed = await response.json(); } catch (e) { parsed = { detail: await response.text().catch(() => `Erreur serveur (${response.status})`) }; }
                const msg = (parsed && (parsed.detail || parsed.message)) ? (parsed.detail || parsed.message) : `Erreur serveur (${response.status})`;
                showNotification((productId ? 'Erreur mise à jour produit: ' : 'Erreur création produit: ') + msg, false, { duration: 7000 });
                console.warn('Server error on create/update product:', response.status, parsed);
                restore();
            }

        } catch (error) {
            console.error('Erreur submit produit:', error);
            showNotification('Erreur lors de l\'envoi : ' + (error.message || error), false, { duration: 6000 });
            restore();
        }

        function restore() { saveBtn.disabled = false; saveBtn.textContent = origText; }
    });


    /* ---------------- small UI toggles (unchanged) ---------------- */
    document.querySelectorAll('.infosupp-form-product').forEach(section => {
        const header = section.querySelector('span');
        const arrow = header ? header.querySelector('img') : null;
        header && header.setAttribute('role', 'button');
        header && header.setAttribute('tabindex', '0');
        header && header.setAttribute('aria-expanded', 'false');
        const toggle = () => {
            section.classList.toggle('show');
            const opened = section.classList.contains('show');
            header.setAttribute('aria-expanded', opened ? 'true' : 'false');
            if (arrow) arrow.style.transform = opened ? 'rotate(180deg)' : 'rotate(0deg)';
        };
        header && header.addEventListener('click', (e) => { if (e.target.closest('.desc-form-product')) return; toggle(); });
        header && header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // sidebar / overlay behavior (unchanged)
    (function () {
        const burgerBtn = document.querySelector('.header .burger');
        const closeBtn = document.querySelector('.sidebar .close-sidebar');
        const sidebar = document.querySelector('.sidebar');
        const notifBtn = document.querySelector('.notif-user');
        const sidenotifEl = document.querySelector('.sidenotif');
        const overlay = document.querySelector('.filterblack');
        if (!overlay || !sidebar || !sidenotifEl) return;
        overlay.style.display = 'none'; overlay.style.opacity = '0'; overlay.style.transition = 'opacity 0.3s ease';
        sidebar.style.transform = 'translateX(-100%)'; sidebar.style.transition = 'transform 0.3s ease';
        sidenotifEl.style.transform = 'translateX(100%)'; sidenotifEl.style.transition = 'transform 0.3s ease';
        sidenotifEl.addEventListener('click', e => e.stopPropagation());
        let sidebarOpen = false; let notifOpen = false;
        function showOverlay() { overlay.style.display = 'block'; requestAnimationFrame(() => overlay.style.opacity = '0.8'); }
        function hideOverlayIfNeeded() { if (!sidebarOpen && !notifOpen) overlay.style.opacity = '0'; }
        overlay.addEventListener('transitionend', e => { if (e.propertyName === 'opacity' && overlay.style.opacity === '0') overlay.style.display = 'none'; });
        function openSidebar() { sidebar.style.transform = 'translateX(0)'; sidebarOpen = true; showOverlay(); }
        function closeSidebar() { sidebar.style.transform = 'translateX(-100%)'; sidebarOpen = false; hideOverlayIfNeeded(); }
        burgerBtn?.addEventListener('click', openSidebar); closeBtn?.addEventListener('click', closeSidebar);
        function openNotif() { sidenotifEl.style.transform = 'translateX(0)'; notifOpen = true; showOverlay(); }
        function closeNotif() { sidenotifEl.style.transform = 'translateX(100%)'; notifOpen = false; hideOverlayIfNeeded(); }
        notifBtn?.addEventListener('click', e => { e.stopPropagation(); notifOpen ? closeNotif() : openNotif(); });
        overlay.addEventListener('click', () => { if (sidebarOpen) closeSidebar(); if (notifOpen) closeNotif(); });
    })();

});
