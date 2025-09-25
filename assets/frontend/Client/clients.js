// frontend/Client/clients.js
// Version modifiée — ajout de validations email / phone et intégration dans le flow de sauvegarde
// Basé sur la version d'origine (analyseée). Modifs : validateEmail/validatePhone + intégration dans handleSaveClient.
// Source analysée : file_search result. :contentReference[oaicite:1]{index=1}

// ----------------- Notifications (style + showNotification) -----------------
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

function showNotification(message, isSuccess = true, options = {}) {
    ensureNotificationStyle();

    const opts = {
        duration: typeof options.duration === 'number' ? options.duration : 3500,
        stack: options.stack === true,
        icon: options.icon !== false,
        onClose: typeof options.onClose === 'function' ? options.onClose : null
    };

    const slideInMs = 300;
    const fadeOutMs = 500;
    if (opts.duration < slideInMs + 100) opts.duration = slideInMs + 100 + fadeOutMs;

    let container = document.getElementById('custom-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-notification-container';
        document.body.appendChild(container);
    }

    if (!opts.stack) {
        const existing = document.querySelectorAll('.custom-notification');
        existing.forEach(n => n.remove());
    }

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
    notification.addEventListener('click', (e) => {
        if (e.target === notification) removeNow();
    });

    notification.appendChild(iconSpan);
    notification.appendChild(content);
    notification.appendChild(close);

    document.body.appendChild(notification);

    const totalMs = opts.duration;
    const fadeDelayMs = Math.max(0, totalMs - fadeOutMs);
    notification.style.animation = `cn-slideIn ${slideInMs / 1000}s forwards, cn-fadeOut ${fadeOutMs / 1000}s forwards ${fadeDelayMs / 1000}s`;

    const removeTimeout = setTimeout(() => {
        removeNow();
    }, totalMs + 50);

    function removeNow() {
        clearTimeout(removeTimeout);
        if (!notification.parentNode) return;
        notification.style.pointerEvents = 'none';
        notification.style.transition = 'opacity 160ms linear, transform 160ms linear';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
            if (opts.onClose) try { opts.onClose(); } catch (e) { /* ignore */ }
        }, 180);
    }

    return {
        close: removeNow,
        node: notification
    };
}

// ---------------------------------------------------------------------------
// Validation helpers (ajoutés)
// ---------------------------------------------------------------------------
function validateEmail(email) {
    if (!email) return { ok: true };
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return { ok: re.test(email), message: re.test(email) ? undefined : 'Adresse email invalide' };
}

function _formatAlgerian(norm) {
    if (!norm.startsWith('+213') || !/^\+213\d{9}$/.test(norm)) return norm;
    const core = norm.slice(4);
    return `+213 ${core.slice(0, 3)} ${core.slice(3, 5)} ${core.slice(5, 7)} ${core.slice(7, 9)}`;
}

function _formatGenericIntl(norm) {
    const digits = norm.slice(1);
    const cc = digits.slice(0, Math.min(3, digits.length));
    const rest = digits.slice(cc.length);
    if (!rest) return norm;
    const groups = rest.match(/.{1,2}/g) || [rest];
    return `+${cc} ${groups.join(' ')}`;
}

function validatePhone(phone) {
    if (!phone) return { ok: true };
    let p = String(phone).trim().replace(/[\s.\-()]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);

    if (p.startsWith('+')) {
        if (p.startsWith('+213')) {
            const rest = p.slice(4);
            if (/^\d{9}$/.test(rest)) {
                const normalized = '+213' + rest;
                return { ok: true, normalized, formatted: _formatAlgerian(normalized) };
            } else {
                return { ok: false, message: 'Pour +213, attendez 9 chiffres après l’indicatif (+213).' };
            }
        }
        if (/^\+\d{7,15}$/.test(p)) {
            return { ok: true, normalized: p, formatted: _formatGenericIntl(p) };
        }
        return { ok: false, message: 'Format international invalide.' };
    }

    // national (Algérie) forms
    if (/^0\d{9}$/.test(p)) {
        const normalized = '+213' + p.slice(1);
        return { ok: true, normalized, formatted: _formatAlgerian(normalized) };
    }
    if (/^\d{9}$/.test(p)) {
        const normalized = '+213' + p;
        return { ok: true, normalized, formatted: _formatAlgerian(normalized) };
    }
    if (/^\d{10}$/.test(p) && p.startsWith('0')) {
        const normalized = '+213' + p.slice(1);
        return { ok: true, normalized, formatted: _formatAlgerian(normalized) };
    }

    return { ok: false, message: 'Numéro invalide. Ex : 0555 55 55 55 ou +213555555555' };
}

// helper to display inline error near a field (uses the file's _findOrCreateErrorElement if available)
function displayFieldError(fieldEl, message) {
    if (!fieldEl) return;
    // try to find the bloc-error function from original file
    if (typeof _findOrCreateErrorElement === 'function') {
        const errEl = _findOrCreateErrorElement(fieldEl);
        if (errEl) errEl.textContent = message || '';
    } else {
        // fallback: set title + red border
        fieldEl.title = message || '';
        if (message) fieldEl.style.border = '1px solid #b00020';
        else fieldEl.style.border = '';
    }
}

function clearFieldError(fieldEl) {
    if (!fieldEl) return;
    if (typeof _findOrCreateErrorElement === 'function') {
        const errEl = _findOrCreateErrorElement(fieldEl);
        if (errEl) errEl.textContent = '';
    } else {
        fieldEl.title = '';
        fieldEl.style.border = '';
    }
}

// ---------- DOM helpers ----------
function _findOrCreateErrorElement(fieldEl) {
    if (!fieldEl) return null;
    const bloc = fieldEl.closest('.bloc-info') || fieldEl.parentElement;
    if (!bloc) return null;
    let errEl = bloc.querySelector('.field-error');
    if (!errEl) {
        errEl = document.createElement('span');
        errEl.className = 'field-error';
        Object.assign(errEl.style, {
            color: '#b00020',
            fontSize: '0.9em',
            marginLeft: '6px',
            display: 'block'
        });
        const input = bloc.querySelector('input') || fieldEl;
        if (input && input.parentNode) input.parentNode.insertBefore(errEl, input.nextSibling);
        else bloc.appendChild(errEl);
    }
    return errEl;
}

// ---------- New: required-fields validation (Option B) ----------
/**
 * Validate all inputs with the `required` attribute inside the `.modal-client` or the document.
 * - Uses HTML5 constraint API: checkValidity() / reportValidity()
 * - Ignores disabled fields.
 * - Focuses the first invalid field and displays inline message + global message.
 * Returns true if all required fields are valid, false otherwise.
 */
function validateRequiredFields() {
    try {
        const container = document.querySelector('.modal-client') || document;
        let requiredFields = Array.from(container.querySelectorAll('[required]'));

        // filter out disabled fields
        requiredFields = requiredFields.filter(el => !el.disabled);

        for (const el of requiredFields) {
            // HTML5 checkValidity will consider pattern, type, minlength, etc.
            if (!el.checkValidity()) {
                // create/attach inline error if possible
                const errEl = _findOrCreateErrorElement(el);
                if (errEl) {
                    // use browser-provided validation message when available
                    errEl.textContent = el.validationMessage || 'Champ requis';
                }
                try {
                    // show native UI hint (tooltip-like)
                    el.reportValidity();
                } catch (e) {
                    // ignore if reportValidity not supported
                }
                // focus first invalid field
                try { el.focus(); } catch (e) { /* ignore */ }
                showNotification('Corrigez les erreurs dans le formulaire avant envoi.', false);
                return false;
            } else {
                // clear any previous inline error
                const errEl = _findOrCreateErrorElement(el);
                if (errEl) errEl.textContent = '';
            }
        }
        return true;
    } catch (err) {
        // en cas d'erreur inattendue, on ne bloque pas l'envoi — log pour debug
        console.warn('validateRequiredFields erreur inattendue', err);
        return true;
    }
}

/**
 * validateAndPrepareForm
 * - Exécute validateRequiredFields()
 * - Valide l'email
 * - Valide tous les numéros de téléphone et normalise
 * - Construit et retourne la structure `localisations` prêtes à être sérialisées (avec numéros normalisés)
 * - Si erreur: affiche erreurs inline et retourne false
 */
function validateAndPrepareForm() {
    // clear previous inline errors for email and phone inputs
    const emailInput = document.getElementById('email') || document.querySelector('input[type="email"]');
    if (emailInput) clearFieldError(emailInput);
    const phoneInputs = Array.from(document.querySelectorAll('input.inputnumtel'));
    phoneInputs.forEach(pi => clearFieldError(pi));

    // 1) HTML5 required check
    if (!validateRequiredFields()) {
        return false;
    }

    // 2) Email validation
    if (emailInput) {
        const emailVal = (emailInput.value || '').trim();
        const emailRes = validateEmail(emailVal);
        if (!emailRes.ok) {
            displayFieldError(emailInput, emailRes.message || 'Email invalide');
            try { emailInput.focus(); } catch (e) { }
            showNotification('Email invalide', false);
            return false;
        } else {
            clearFieldError(emailInput);
        }
    }

    // 3) Locations + phone validation and normalization
    const locationElements = Array.from(document.querySelectorAll('.loc-form-addclient'));
    const normalizedLocations = [];
    let firstInvalid = null;

    locationElements.forEach(locationElement => {
        const wilayaEl = locationElement.querySelector('select');
        const adresseEl = locationElement.querySelector('input[placeholder^="Ex: Rue"]') || locationElement.querySelector('.localisation-form input');
        const locationData = {
            wilaya: wilayaEl ? (wilayaEl.value || '') : '',
            adresse: adresseEl ? (adresseEl.value || '') : '',
            telephones: []
        };

        const phoneElements = locationElement.querySelectorAll('.phone-form');
        phoneElements.forEach(phoneElement => {
            const phoneInputs = phoneElement.querySelectorAll('input.inputnumtel');
            const rawNumero = phoneInputs[0] ? (phoneInputs[0].value || '').trim() : '';
            const nomContact = phoneInputs[1] ? (phoneInputs[1].value || '').trim() : '';
            const estResponsable = phoneElement.querySelector('input[type="radio"]:checked') !== null;

            if (!rawNumero) {
                // ignore empty phone entries
                return;
            }

            const v = validatePhone(rawNumero);
            if (!v.ok) {
                // show inline error on the phone input
                if (phoneInputs[0]) displayFieldError(phoneInputs[0], v.message || 'Numéro invalide');
                if (!firstInvalid) firstInvalid = phoneInputs[0] || phoneInputs[1] || phoneElement;
            } else {
                // put normalized number
                const phoneData = {
                    numero: v.normalized,
                    nom_contact: nomContact || '',
                    est_responsable: !!estResponsable,
                    formatted: v.formatted || v.normalized
                };
                locationData.telephones.push(phoneData);

                // update UI to show formatted near the input (lightweight)
                if (phoneInputs[0]) {
                    // attach small hint element
                    let hint = phoneInputs[0].parentElement && phoneInputs[0].parentElement.querySelector('.phone-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'phone-hint';
                        hint.style.fontSize = '0.9em';
                        hint.style.marginTop = '4px';
                        hint.style.color = '#333';
                        if (phoneInputs[0].parentElement) phoneInputs[0].parentElement.appendChild(hint);
                    }
                    hint.textContent = v.formatted || v.normalized;
                }
                // clear any previous error
                if (phoneInputs[0]) clearFieldError(phoneInputs[0]);
            }
        });

        // push location only if it has adresse or phones
        if (locationData.adresse || locationData.telephones.length) {
            normalizedLocations.push(locationData);
        }
    });

    if (normalizedLocations.length === 0) {
        showNotification('Au moins une localisation (adresse ou téléphone) est requise.', false);
        return false;
    }

    if (firstInvalid) {
        try { firstInvalid.focus(); } catch (e) { }
        showNotification('Corrigez les numéros de téléphone invalides.', false);
        return false;
    }

    // tout est ok -> retourne localisations normalisées
    return normalizedLocations;
}

// ---------------------------------------------------------------------------
// Global variables (conserved from your original file)
// ---------------------------------------------------------------------------
let allClients = [];
let currentPage = 1;
const clientsPerPage = 10;
let clientItems = [];
let allClientsFull = null;
let searchTimeout = null;
const SEARCH_DEBOUNCE_MS = 250;
let isSearching = false;
let initialOrder = [];
let isEditMode = false;
let currentClientId = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    console.log("clients.js loaded successfully");

    // Initialize general UI components
    initializeGeneralUI();

    // Check if we're on the clients list page
    if (document.querySelector('.all-clients') || window.location.pathname.includes('clients.html')) {
        initializeClientsPage();
    }

    // Check if we're on the new client page
    if (document.getElementById('saveClientBtn') || window.location.pathname.includes('newclient.html')) {
        initializeNewClientPage();
    }
});

// ---------------------------------------------------------------------------
// Pages init
// ---------------------------------------------------------------------------
function initializeNewClientPage() {
    console.log("Initializing new client page...");

    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');

    if (clientId) {
        isEditMode = true;
        currentClientId = clientId;
        loadClientData(clientId);

        const titleElement = document.querySelector('.title-addclient-container h1');
        if (titleElement) {
            titleElement.textContent = 'Modifier le client';
        }

        const saveButton = document.getElementById('saveClientBtn');
        if (saveButton) {
            saveButton.innerHTML = '<img src="../img/icon/sauvegarder.png" alt="saveClient"> Mettre à jour le client';
        }
    }

    const saveButton = document.getElementById('saveClientBtn');
    if (saveButton) {
        saveButton.addEventListener('click', handleSaveClient);
    }
}

function initializeGeneralUI() {
    setupTabs();
    setupSidebar();
    setupNotifications();
    setupSplashScreen();
}

function initializeClientsPage() {
    console.log("Initializing clients page...");

    // Set up event listeners
    setupSearchFilter();
    setupSorting();
    setupAddClientButton();
    setupPagination();

    // Initialize client container and cache
    const clientsContainer = document.querySelector('.all-clients');
    if (clientsContainer) {
        initialOrder = Array.from(clientsContainer.querySelectorAll('.client'));
        rebuildClientCache();
    }

    // Load clients from API
    loadClients();
}

// ---------------------------------------------------------------------------
// Small UI helpers (tabs, sidebar, notifications drawer, splashscreen)
// ---------------------------------------------------------------------------
function setupTabs() {
    const onglets = document.querySelectorAll('.all-onglets-container .btns-onglets .onglet');
    const containers = document.querySelectorAll('.all-onglets-container .onglet-container');

    onglets.forEach((tab, i) => {
        tab.addEventListener('click', () => activateTab(i));
    });

    function activateTab(index) {
        // Gérer les classes active
        onglets.forEach((t, i) => t.classList.toggle('active', i === index));

        // Afficher/masquer les containers
        containers.forEach((c, i) => {
            c.style.display = (i === index) ? 'flex' : 'none';
        });

        // Charger les sous-traitants si l'onglet 1 est activé
        if (index === 1) {
            setTimeout(() => {
                if (typeof window._loadSoustraitants === 'function') {
                    window._loadSoustraitants();
                }
            }, 100);
        }
    }

    // Activer l'onglet par défaut
    activateTab(0);
}

function setupSidebar() {
    const burgerBtn = document.querySelector('.header .burger');
    const closeBtn = document.querySelector('.sidebar .close-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.filterblack');

    if (!overlay || !sidebar) return;

    overlay.style.display = 'none';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    sidebar.style.transform = 'translateX(-100%)';
    sidebar.style.transition = 'transform 0.3s ease';

    let sidebarOpen = false;

    function showOverlay() {
        overlay.style.display = 'block';
        requestAnimationFrame(() => overlay.style.opacity = '0.8');
    }

    function hideOverlayIfNeeded() {
        if (!sidebarOpen) overlay.style.opacity = '0';
    }

    overlay.addEventListener('transitionend', e => {
        if (e.propertyName === 'opacity' && overlay.style.opacity === '0') overlay.style.display = 'none';
    });

    function openSidebar() {
        sidebar.style.transform = 'translateX(0)';
        sidebarOpen = true;
        showOverlay();
    }

    function closeSidebar() {
        sidebar.style.transform = 'translateX(-100%)';
        sidebarOpen = false;
        hideOverlayIfNeeded();
    }

    if (burgerBtn) {
        burgerBtn.addEventListener('click', openSidebar);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }

    overlay.addEventListener('click', () => {
        if (sidebarOpen) closeSidebar();
    });
}

function setupNotifications() {
    const notifBtn = document.querySelector('.notif-user');
    const sidenotifEl = document.querySelector('.sidenotif');
    const overlay = document.querySelector('.filterblack');

    if (!overlay || !sidenotifEl) return;

    sidenotifEl.style.transform = 'translateX(100%)';
    sidenotifEl.style.transition = 'transform 0.3s ease';
    sidenotifEl.addEventListener('click', e => e.stopPropagation());

    let notifOpen = false;

    function showOverlay() {
        overlay.style.display = 'block';
        requestAnimationFrame(() => overlay.style.opacity = '0.8');
    }

    function hideOverlayIfNeeded() {
        if (!notifOpen) overlay.style.opacity = '0';
    }

    overlay.addEventListener('transitionend', e => {
        if (e.propertyName === 'opacity' && overlay.style.opacity === '0') overlay.style.display = 'none';
    });

    function openNotif() {
        sidenotifEl.style.transform = 'translateX(0)';
        notifOpen = true;
        showOverlay();
    }

    function closeNotif() {
        sidenotifEl.style.transform = 'translateX(100%)';
        notifOpen = false;
        hideOverlayIfNeeded();
    }

    if (notifBtn) {
        notifBtn.addEventListener('click', e => {
            e.stopPropagation();
            notifOpen ? closeNotif() : openNotif();
        });
    }

    overlay.addEventListener('click', () => {
        if (notifOpen) closeNotif();
    });
}

function setupSplashScreen() {
    const MIN_DURATION = 4000;
    const startTime = Date.now();
    const iconStart = document.querySelector('.icon-start');
    const indexStart = document.querySelector('.index-start');

    const navEntries = performance.getEntriesByType('navigation');
    const navType = navEntries.length > 0 ? navEntries[0].type
        : (performance.navigation && performance.navigation.type === performance.navigation.TYPE_BACK_FORWARD ? 'back_forward' : 'navigate');

    const shouldPlaySplash = (navType === 'navigate' || navType === 'reload');

    if (iconStart && indexStart) {
        if (shouldPlaySplash) {
            iconStart.style.display = 'flex';
            indexStart.style.display = 'none';
            window.addEventListener('load', () => {
                const elapsed = Date.now() - startTime;
                const delay = Math.max(0, MIN_DURATION - elapsed);
                setTimeout(() => {
                    iconStart.style.display = 'none';
                    indexStart.style.display = 'flex';
                }, delay);
            });
        } else {
            iconStart.style.display = 'none';
            indexStart.style.display = 'flex';
        }
    }
}

// ---------------------------------------------------------------------------
// Pagination variables & functions (conservé)
// ---------------------------------------------------------------------------
let totalClients = 0;
let totalPages = 1;
let serverSidePaginationSupported = true;
const debugLog = (...args) => console.debug('[clients.pagination]', ...args);

function setupPagination() {
    const prevButton = document.getElementById('prevPageBtn');
    const nextButton = document.getElementById('nextPageBtn');

    if (prevButton) {
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadClients();
            }
        });
    }
    if (nextButton) {
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                loadClients();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === 'ArrowLeft' && currentPage > 1) {
            currentPage--; loadClients();
        } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
            currentPage++; loadClients();
        }
    });

    updatePaginationUI();
}

function updatePaginationUI() {
    const prevButton = document.getElementById('prevPageBtn');
    const nextButton = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const paginationContainer = document.querySelector('.pagination-container');
    const paginationSummary = document.getElementById('paginationSummary');

    if (!paginationContainer || !prevButton || !nextButton || !pageInfo || !paginationSummary) {
        debugLog('Un ou plusieurs éléments de pagination introuvables');
        return;
    }

    paginationContainer.style.display = 'flex';
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    paginationSummary.textContent = totalClients > 0 ? `${totalClients} clients` : 'Clients';
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    prevButton.setAttribute('aria-disabled', String(prevButton.disabled));
    nextButton.setAttribute('aria-disabled', String(nextButton.disabled));
}

// ---------------------------------------------------------------------------
// loadClients (conservé)
// ---------------------------------------------------------------------------
async function loadClients() {
    try {
        const loadingDiv = document.querySelector('.loading-clients');
        if (loadingDiv) {
            loadingDiv.textContent = "Chargement des clients...";
            loadingDiv.style.display = 'block';
        }

        debugLog('Chargement page', currentPage, 'clientsPerPage', clientsPerPage, 'serverSide?', serverSidePaginationSupported);

        if (serverSidePaginationSupported) {
            const resp = await fetch(`/clients?skip=${(currentPage - 1) * clientsPerPage}&limit=${clientsPerPage}`, {
                method: 'GET',
                credentials: 'include'
            });

            debugLog('Server response status', resp.status);

            if (!resp.ok) {
                console.warn('[clients] requête paginée échouée, statut', resp.status);
                serverSidePaginationSupported = false;
                return await loadClients();
            }

            const clientsPage = await resp.json();

            let headerTotal = resp.headers.get('X-Total-Count') || resp.headers.get('x-total-count');
            if (!headerTotal) {
                const cr = resp.headers.get('Content-Range') || resp.headers.get('content-range');
                if (cr) {
                    const m = cr.match(/\/\s*(\d+)\s*$/);
                    if (m) headerTotal = m[1];
                }
            }

            const serverDefaultGuess = 8;
            if (!headerTotal && clientsPage && clientsPage.length === serverDefaultGuess && clientsPerPage !== serverDefaultGuess) {
                console.warn(`[clients] Détection: le serveur renvoie ${serverDefaultGuess} items (ignore 'limit'). Basculage en pagination client-side.`);
                serverSidePaginationSupported = false;
                return await loadClients();
            }

            if (headerTotal) {
                totalClients = parseInt(headerTotal, 10);
                totalPages = Math.max(1, Math.ceil(totalClients / clientsPerPage));
                debugLog('Total depuis header détecté', totalClients, 'pages', totalPages);
            } else {
                try {
                    const cResp = await fetch('/clients/count', { method: 'GET', credentials: 'include' });
                    if (cResp.ok) {
                        const cJson = await cResp.json();
                        totalClients = Number(cJson.count) || clientsPage.length;
                        totalPages = Math.max(1, Math.ceil(totalClients / clientsPerPage));
                        debugLog('/clients/count renvoyé', totalClients);
                    } else {
                        totalClients = (currentPage - 1) * clientsPerPage + clientsPage.length;
                        totalPages = Math.max(1, Math.ceil(totalClients / clientsPerPage));
                        debugLog('Aucun total header & /clients/count KO -> estimation depuis page courante', totalClients, totalPages);
                    }
                } catch (eCount) {
                    console.warn('[clients] erreur lors de /clients/count', eCount);
                    totalClients = (currentPage - 1) * clientsPerPage + clientsPage.length;
                    totalPages = Math.max(1, Math.ceil(totalClients / clientsPerPage));
                }
            }

            allClients = clientsPage;
            renderClients(allClients);
            updatePaginationUI();

            if (loadingDiv) loadingDiv.style.display = 'none';
            return;
        }

        const respAll = await fetch('/clients', { method: 'GET', credentials: 'include' });
        if (!respAll.ok) {
            throw new Error('Impossible de récupérer la liste complète des clients (fallback)');
        }
        const clientsAll = await respAll.json();

        totalClients = Array.isArray(clientsAll) ? clientsAll.length : 0;
        totalPages = Math.max(1, Math.ceil(totalClients / clientsPerPage));

        const start = (currentPage - 1) * clientsPerPage;
        const end = start + clientsPerPage;
        const clientsSlice = clientsAll.slice(start, end);

        allClients = clientsSlice;
        renderClients(allClients);
        updatePaginationUI();

        if (loadingDiv) loadingDiv.style.display = 'none';
    } catch (error) {
        console.error('Error loading clients (pagination):', error);
        const loadingDiv = document.querySelector('.loading-clients');
        if (loadingDiv) loadingDiv.textContent = 'Impossible de charger les clients';
        showNotification('Impossible de charger les clients (voir console pour détails)', false);
        const paginationContainer = document.querySelector('.pagination-container');
        if (paginationContainer) paginationContainer.style.display = 'flex';
    }
}

// ---------------------------------------------------------------------------
// Render clients in the UI
// ---------------------------------------------------------------------------
function renderClients(clients) {
    let clientsContainer = document.querySelector('.all-clients');

    if (!clientsContainer) {
        console.warn("Primary clients container not found, trying alternative selectors");
        clientsContainer = document.querySelector('[class*=\"client\"]');

        if (!clientsContainer) {
            console.error("No clients container found on this page!");
            return;
        }
    }

    clientsContainer.innerHTML = '';

    if (!clients || clients.length === 0) {
        clientsContainer.innerHTML = `
            <div class="empty-state">
                <img src="/frontend/img/icon/client.png" alt="Aucun client">
                <h3>Aucun client enregistré</h3>
                <p>Commencez par ajouter votre premier client</p>
            </div>
        `;
        return;
    }

    clients.forEach(client => {
        const clientElement = createClientElement(client);
        clientsContainer.appendChild(clientElement);
    });

    rebuildClientCache();
}

// createClientElement (identique)
function createClientElement(client) {
    const clientDiv = document.createElement('div');
    clientDiv.className = 'client';
    clientDiv.dataset.clientId = client.id_client;

    const firstLocation = client.localisations && client.localisations.length > 0
        ? client.localisations[0]
        : null;

    const createdDate = new Date().toLocaleDateString('fr-FR');

    let logoSrc = '/frontend/img/logoblanc.png';
    if (client.logo) {
        const rel = client.logo.startsWith('/') ? client.logo : `/storage/${client.logo}`;
        // buildApiUrl() est exposé par api.js (window.buildApiUrl)
        if (typeof window.buildApiUrl === 'function') {
            try {
                logoSrc = window.buildApiUrl(rel);
            } catch (e) {
                console.warn('buildApiUrl failed, fallback to relative:', e);
                logoSrc = rel;
            }
        } else {
            // fallback si api.js non chargé
            logoSrc = rel;
        }
    }


    clientDiv.innerHTML = `
        ${client.enseigne === 'Terminal' ? `
            <div class="pin-client">
                <img src="/frontend/img/icon/top-10.png" alt="topClient">
            </div>
        ` : ''}
        <div class="round-circular">
            <img class="client-logo" src="${logoSrc}" alt="ProfilClient">
        </div>
        <div class="title-client">
            <h1 title="${client.enseigne}">${client.enseigne}</h1>
            <h3>${firstLocation ? firstLocation.wilaya : 'N/A'}</h3>
            <p>Rajouté le : ${createdDate}</p>
        </div>
        <div class="btn-client">
            <button style="background-color: rgb(0, 83, 142);" onclick="editClient('${client.id_client}')">
                <img src="/frontend/img/icon/editer.png" alt="modifyClient">
            </button>
            <button style="background-color: rgb(137, 0, 0);" onclick="deleteClient('${client.id_client}')">
                <img src="/frontend/img/icon/supprimer1.png" alt="deleteClient">
            </button>
        </div>
    `;

    const imgEl = clientDiv.querySelector('img.client-logo');
    if (imgEl) {
        imgEl.addEventListener('error', () => {
            imgEl.onerror = null;
            imgEl.src = '/frontend/img/logoblanc.png';
        });
    }

    return clientDiv;
}

// ---------------------------------------------------------------------------
// Search, sort, cache (conservé)
// ---------------------------------------------------------------------------
function rebuildClientCache() {
    const clientsContainer = document.querySelector('.all-clients');
    if (!clientsContainer) return;

    clientItems = Array.from(clientsContainer.querySelectorAll('.client')).map(el => {
        const nameEl = el.querySelector('.title-client h1');
        const name = nameEl ? nameEl.textContent : '';
        return { el, nameNormalized: normalizeForSearch(name) };
    });
}

function normalizeForSearch(str) {
    if (!str) return '';
    try {
        return str.toString()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim();
    } catch (e) {
        return str.toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }
}

function setupSearchFilter() {
    const searchInput = document.querySelector('.search-plaques input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim();
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => handleSearchInput(q), SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
            handleSearchInput((e.target.value || '').trim());
        }
    });
}

function setupSorting() {
    const sortSelect = document.querySelector('.trie-clients select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function (e) {
            sortClients(e.target.value);
        });
    }
}

function setupAddClientButton() {
    const addButton = document.querySelector('.btn-add-plaque');
    if (addButton) {
        addButton.addEventListener('click', function () {
            window.location.href = 'newclient.html';
        });
    }
}

async function handleSearchInput(query) {
    const paginationContainer = document.querySelector('.pagination-container');
    const loadingDiv = document.querySelector('.loading-clients');

    if (!query) {
        isSearching = false;
        if (paginationContainer) paginationContainer.style.display = 'flex';
        await loadClients();
        return;
    }

    isSearching = true;
    if (paginationContainer) paginationContainer.style.display = 'none';

    if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.textContent = 'Recherche...';
    }

    try {
        const qEncoded = encodeURIComponent(query);
        const resp = await fetch(`/clients?q=${qEncoded}&skip=0&limit=1000`, { method: 'GET', credentials: 'include' });
        if (!resp.ok) {
            throw new Error('Erreur serveur lors de la recherche');
        }
        const results = await resp.json();

        renderClients(results);

        const total = resp.headers.get('X-Total-Count');
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) pageInfo.textContent = total ? `${total} résultat(s)` : `${results.length} résultat(s)`;

        if (loadingDiv) loadingDiv.style.display = 'none';
    } catch (err) {
        console.error('Erreur recherche serveur:', err);
        if (loadingDiv) loadingDiv.textContent = 'Erreur lors de la recherche';
        showNotification('Erreur lors de la recherche des clients', false);
    }
}

// fetchAllClients() (conservé)
async function fetchAllClients() {
    if (allClientsFull && Array.isArray(allClientsFull)) return allClientsFull;

    const CHUNK_MIN = Math.max(10, clientsPerPage);
    const CHUNK_MAX = 1000;
    const MAX_ITER = 500;

    try {
        let totalCount = null;
        try {
            const cResp = await fetch('/clients/count', { method: 'GET', credentials: 'include' });
            if (cResp.ok) {
                const cJson = await cResp.json();
                if (cJson && typeof cJson.count !== 'undefined') {
                    totalCount = Number(cJson.count);
                }
            }
        } catch (e) {
            console.debug('[clients.search] /clients/count non disponible ou erreur', e);
        }

        const all = [];
        const seenIds = new Set();
        let skip = 0;
        let chunk = CHUNK_MIN;
        if (totalCount) chunk = Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, totalCount));

        let iter = 0;
        while (iter < MAX_ITER) {
            iter++;
            const url = `/clients?skip=${skip}&limit=${chunk}`;
            const resp = await fetch(url, { method: 'GET', credentials: 'include' });
            if (!resp.ok) {
                console.warn('[clients.search] requête paginée échouée', resp.status, '-> fallback');
                break;
            }

            const batch = await resp.json();
            if (!Array.isArray(batch) || batch.length === 0) {
                break;
            }

            let newAdded = 0;
            for (const item of batch) {
                const id = (item && (item.id_client ?? item.id)) ?? JSON.stringify(item);
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    all.push(item);
                    newAdded++;
                }
            }

            if (totalCount && all.length >= totalCount) {
                break;
            }

            if (newAdded === 0) {
                console.warn('[clients.search] aucun nouvel élément dans ce lot -> arrêt (pour éviter duplications)');
                break;
            }

            skip += batch.length;

            if (batch.length < chunk) break;

            if (all.length > 200000) {
                console.warn('[clients.search] arrêt safety: trop d\'éléments récupérés');
                break;
            }
        }

        if (all.length === 0) {
            const r = await fetch('/clients', { method: 'GET', credentials: 'include' });
            if (!r.ok) throw new Error('Impossible de récupérer tous les clients (fallback). Statut: ' + r.status);
            const data = await r.json();
            allClientsFull = Array.isArray(data) ? data : [];
            return allClientsFull;
        }

        allClientsFull = all;
        return allClientsFull;
    } catch (err) {
        console.error('[clients.search] fetchAllClients error:', err);
        throw err;
    }
}

function sortClients(sortBy) {
    let sortedClients = [...allClients];

    switch (sortBy) {
        case 'Date d\'ajout':
            sortedClients.sort((a, b) => {
                const dateA = a.date_creation ? new Date(a.date_creation) : new Date(0);
                const dateB = b.date_creation ? new Date(b.date_creation) : new Date(0);
                return dateB - dateA;
            });
            break;
        case 'TOP Clients':
            sortedClients.sort((a, b) => {
                if (a.enseigne === 'Terminal' && b.enseigne !== 'Terminal') return -1;
                if (a.enseigne !== 'Terminal' && b.enseigne === 'Terminal') return 1;
                return 0;
            });
            break;
        default:
            sortedClients.sort((a, b) => a.enseigne.localeCompare(b.enseigne));
    }

    renderClients(sortedClients);
}

// ---------------------------------------------------------------------------
// Edit & Delete client (conservé)
// ---------------------------------------------------------------------------
window.editClient = function (clientId) {
    console.log('Edit client:', clientId);
    window.location.href = `newclient.html?id=${clientId}`;
};

window.deleteClient = function (clientId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
        fetch(`/clients/${clientId}`, {
            method: 'DELETE',
            credentials: 'include'
        })
            .then(response => {
                if (response.ok) {
                    allClientsFull = null;
                    showNotification('Client supprimé avec succès', true);
                    const clientElement = document.querySelector(`.client[data-client-id="${clientId}"]`);
                    if (clientElement) clientElement.remove();
                    loadClients();
                } else {
                    showNotification('Erreur lors de la suppression du client', false);
                }
            })
            .catch(error => {
                console.error('Error deleting client:', error);
                showNotification('Erreur lors de la suppression du client', false);
            });
    }
};

// ---------------------------------------------------------------------------
// Load single client for edit (conservé)
// ---------------------------------------------------------------------------
async function loadClientData(clientId) {
    try {
        const response = await fetch(`/clients/${clientId}`, {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const client = await response.json();
            populateForm(client);
        } else {
            console.error('Failed to fetch client data:', response.status);
            showNotification('Erreur lors du chargement des données du client', false);
        }
    } catch (error) {
        console.error('Error loading client data:', error);
        showNotification('Impossible de charger les données du client', false);
    }
}

// ---------------------------------------------------------------------------
// Save (create/update) client (modifié pour utiliser validateAndPrepareForm)
// ---------------------------------------------------------------------------
async function handleSaveClient(event) {
    event && event.preventDefault && event.preventDefault();

    console.group('[handleSaveClient]');
    console.trace('handleSaveClient called');

    const saveButton = document.getElementById('saveClientBtn');
    const originalHtml = saveButton ? saveButton.innerHTML : null;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = isEditMode ? 'Mise à jour en cours...' : 'Création en cours...';
    }

    try {
        // Tentative de lecture des champs via plusieurs sélecteurs (fallbacks)
        const enseigneEl = document.getElementById('enseigne') || document.querySelector('input[name="enseigne"]') || document.querySelector('input[placeholder^="Ex : Chicken"]');
        const emailEl = document.getElementById('email') || document.querySelector('input[name="email"]');
        const articleEl = document.getElementById('article_imposition') || document.querySelector('input[name="article_imposition"]');
        const registreEl = document.getElementById('num_registre') || document.querySelector('input[name="num_registre"]');
        const nifEl = document.getElementById('nif') || document.querySelectorAll('.input12-first input')[0] || null;
        const nisEl = document.getElementById('nis') || document.querySelectorAll('.input12-first input')[1] || null;

        if (!enseigneEl) {
            console.error('Champ "enseigne" introuvable. Vérifie que l\'input a bien id="enseigne" ou name="enseigne".');
            showNotification('Erreur: champ "Nom du client" introuvable dans le formulaire.', false);
            return;
        }
        const enseigne = (enseigneEl.value || '').trim();
        const email = emailEl ? (emailEl.value || '').trim() : null;
        const article_imposition = articleEl ? (articleEl.value || '').trim() || null : null;
        const num_registre = registreEl ? (registreEl.value || '').trim() || null : null;
        const nif = nifEl ? (nifEl.value || '').trim() || null : null;
        const nis = nisEl ? (nisEl.value || '').trim() || null : null;

        if (!enseigne || enseigne.length < 2) {
            showNotification('Le nom du client est requis (min. 2 caractères)', false);
            return;
        }

        // validate and prepare localisations (this also validates phones and email)
        const normalizedLocalisations = validateAndPrepareForm();
        if (!normalizedLocalisations) {
            // validateAndPrepareForm already showed notifications/errors
            return;
        }

        // FormData
        const fd = new FormData();
        fd.append('enseigne', enseigne);
        if (email) fd.append('email', email);
        if (article_imposition) fd.append('article_imposition', article_imposition);
        if (num_registre) fd.append('num_registre', num_registre);
        if (nif) fd.append('nif', nif);
        if (nis) fd.append('nis', nis);
        fd.append('localisations', JSON.stringify(normalizedLocalisations));

        const fileInput = document.querySelector('.second-right-form-addclient .file-input') || document.getElementById('fileInput');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            fd.append('logo', fileInput.files[0], fileInput.files[0].name);
        }

        const url = isEditMode ? `/clients/${currentClientId}` : '/clients';
        const method = isEditMode ? 'PUT' : 'POST';

        const resp = await fetch(url, {
            method,
            credentials: 'include',
            body: fd
        });

        if (resp.ok) {
            allClientsFull = null;
            showNotification(isEditMode ? 'Client mis à jour avec succès' : 'Client créé avec succès', true);
            setTimeout(() => window.location.href = 'clients.html', 1200);
            return;
        } else {
            let err = {};
            try { err = await resp.json(); } catch (e) { err = { detail: await resp.text() }; }
            throw new Error(err.detail || ('Erreur serveur ' + resp.status));
        }

    } catch (e) {
        console.error('Error saving client (multipart):', e);
        showNotification('Erreur: ' + (e.message || e), false);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalHtml;
        }
        console.groupEnd && console.groupEnd();
    }
}

// ---------------------------------------------------------------------------
// Phone-handling (conservé)
// ---------------------------------------------------------------------------
function addPhoneToLocation(locEl, focus = true) {
    if (!locEl) {
        console.error("addPhoneToLocation: locEl is falsy");
        return null;
    }

    const wilBlocks = Array.from(locEl.querySelectorAll('.locwil-form-addclient'));
    const phonesContainer = wilBlocks.length ? wilBlocks[wilBlocks.length - 1] : null;
    if (!phonesContainer) {
        console.error("addPhoneToLocation: Phones container not found in location element", locEl);
        return null;
    }

    const firstPhoneForm = locEl.querySelector('.phone-form');
    let newPhoneForm;
    if (firstPhoneForm) {
        newPhoneForm = firstPhoneForm.cloneNode(true);
        newPhoneForm.querySelectorAll('input').forEach(inp => {
            if (inp.type === 'radio') inp.checked = false;
            else inp.value = '';
        });
    } else {
        newPhoneForm = document.createElement('div');
        newPhoneForm.className = 'phone-form';
        newPhoneForm.innerHTML = `
            <span>Numero de téléphone :</span>
            <div class="inputs-phone-form">
                <input type="text" placeholder="Ex: 0555 55 55 55" class="inputnumtel">
                <input type="text" placeholder="Nom..." class="inputnumtel">
                <p>Responsable : </p>
                <input type="radio">
            </div>
            <button type="button" class="delete-phone">
                <img src="../img/icon/supprimer1.png" alt=".delete-phone">
            </button>
        `;
    }

    if (!locEl.dataset.locId) {
        locEl.dataset.locId = (Date.now().toString(36) + Math.floor(Math.random() * 1000));
    }
    const radioName = `responsable-${locEl.dataset.locId}`;
    newPhoneForm.querySelectorAll('input[type="radio"]').forEach(r => r.name = radioName);

    const deleteBtn = newPhoneForm.querySelector('.delete-phone');
    if (deleteBtn) deleteBtn.style.display = '';

    const addButton = phonesContainer.querySelector('.add-phone');
    if (addButton) {
        phonesContainer.insertBefore(newPhoneForm, addButton);
    } else {
        phonesContainer.appendChild(newPhoneForm);
    }

    const phoneFormsAfter = phonesContainer.querySelectorAll('.phone-form');
    if (phoneFormsAfter.length === 1) {
        const dp = phoneFormsAfter[0].querySelector('.delete-phone');
        if (dp) dp.style.display = 'none';
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            newPhoneForm.remove();
            const remaining = phonesContainer.querySelectorAll('.phone-form');
            if (remaining.length === 1) {
                const dp2 = remaining[0].querySelector('.delete-phone');
                if (dp2) dp2.style.display = 'none';
            }
        });
    }

    if (focus) {
        const firstInput = newPhoneForm.querySelector('input.inputnumtel');
        if (firstInput) firstInput.focus();
    }

    return newPhoneForm;
}
window.addPhoneToLocation = addPhoneToLocation;

// -----------------------------
// populateForm (conservée et légèrement robustifiée)
// -----------------------------
function populateForm(client) {
    console.log("populateForm: client", client);
    if (!client) {
        console.error("populateForm: client is falsy");
        return;
    }

    const enseigneInput = document.querySelector('input[placeholder="Ex : Chicken street..."]') || document.getElementById('enseigne');
    const emailInput = document.querySelector('input[type="email"]') || document.getElementById('email');
    const articleInput = document.querySelector('input[placeholder="Article d\\\'imposition..."]') || document.getElementById('article_imposition');
    const registreInput = document.querySelector('input[placeholder="Numero de registre..."]') || document.getElementById('num_registre');

    if (enseigneInput) enseigneInput.value = client.enseigne || '';
    if (emailInput) emailInput.value = client.email || '';
    if (articleInput) articleInput.value = client.article_imposition || '';
    if (registreInput) registreInput.value = client.num_registre || '';

    const nifInput = document.getElementById('nif') || (document.querySelectorAll('.input12-first input')[0] || null);
    const nisInput = document.getElementById('nis') || (document.querySelectorAll('.input12-first input')[1] || null);
    if (nifInput) nifInput.value = client.nif || '';
    if (nisInput) nisInput.value = client.nis || '';

    try {
        const logoRelative = client.logo || null;
        if (logoRelative) {
            let logoUrl = logoRelative.startsWith('/') ? logoRelative : `/storage/${logoRelative}`;
            if (typeof window.buildApiUrl === 'function') {
                try {
                    logoUrl = window.buildApiUrl(logoUrl);
                } catch (e) {
                    console.warn('buildApiUrl failed for logo preview, fallback to relative:', e);
                }
            }

            const fileUploadContainer = document.querySelector('.second-right-form-addclient .file-upload') || document.querySelector('.second-right-form-addclient .file-upload-container');
            let previewContainer = fileUploadContainer ? fileUploadContainer.parentElement.querySelector('.logo-preview') : null;
            if (!previewContainer) {
                const parent = document.querySelector('.second-right-form-addclient') || document.body;
                previewContainer = parent.querySelector('.logo-preview');
                if (!previewContainer) {
                    previewContainer = document.createElement('div');
                    previewContainer.className = 'logo-preview';
                    previewContainer.style.display = 'flex';
                    previewContainer.style.flexWrap = 'wrap';
                    previewContainer.style.gap = '8px';
                    previewContainer.style.marginTop = '8px';
                    if (fileUploadContainer && fileUploadContainer.parentElement) {
                        fileUploadContainer.parentElement.appendChild(previewContainer);
                    } else {
                        parent.appendChild(previewContainer);
                    }
                }
            }

            previewContainer.innerHTML = '';

            const thumb = document.createElement('div');
            thumb.className = 'logo-thumb';
            thumb.style.display = 'flex';
            thumb.style.flexDirection = 'column';
            thumb.style.alignItems = 'center';
            thumb.style.width = '70px';

            const imgWrap = document.createElement('div');
            imgWrap.style.width = '60px';
            imgWrap.style.height = '60px';
            imgWrap.style.borderRadius = '6px';
            imgWrap.style.overflow = 'hidden';
            imgWrap.style.display = 'flex';
            imgWrap.style.alignItems = 'center';
            imgWrap.style.justifyContent = 'center';
            imgWrap.style.background = '#ffffff';
            imgWrap.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';

            const img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.alt = client.enseigne || 'logo';

            img.src = logoUrl;
            img.addEventListener('error', () => {
                img.onerror = null;
                img.src = '/frontend/img/logoblanc.png';
            });

            imgWrap.appendChild(img);
            thumb.appendChild(imgWrap);

            const label = document.createElement('div');
            label.style.fontSize = '11px';
            label.style.marginTop = '4px';
            label.style.textAlign = 'center';
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.width = '70px';
            label.textContent = 'Logo actuel';
            thumb.appendChild(label);

            previewContainer.appendChild(thumb);
        }
    } catch (err) {
        console.warn('populateForm: logo preview failed', err);
    }

    const firstLocElement = document.querySelector('.loc-form-addclient');
    if (!firstLocElement) {
        console.error("populateForm: template location .loc-form-addclient not found");
        return;
    }

    const existingLocs = Array.from(document.querySelectorAll('.loc-form-addclient'));
    existingLocs.forEach((el, idx) => {
        if (idx === 0) {
            const select = el.querySelector('select');
            if (select) select.selectedIndex = 0;
            const addrInput = el.querySelector('.localisation-form input');
            if (addrInput) addrInput.value = '';

            const phoneForms = Array.from(el.querySelectorAll('.phone-form'));
            phoneForms.forEach((pf, iPf) => { if (iPf > 0) pf.remove(); });

            const firstPhone = el.querySelector('.phone-form');
            if (firstPhone) {
                const phoneInputs = firstPhone.querySelectorAll('input.inputnumtel');
                if (phoneInputs[0]) phoneInputs[0].value = '';
                if (phoneInputs[1]) phoneInputs[1].value = '';
                const radioBtn = firstPhone.querySelector('input[type="radio"]');
                if (radioBtn) radioBtn.checked = false;
                const delBtn = firstPhone.querySelector('.delete-phone');
                if (delBtn) delBtn.style.display = 'none';
            }
        } else {
            el.remove();
        }
    });

    if (!firstLocElement.dataset.locId) {
        firstLocElement.dataset.locId = (Date.now().toString(36) + Math.floor(Math.random() * 1000));
    }

    if (!client.localisations || client.localisations.length === 0) {
        console.log("populateForm: client has no localisations");
        return;
    }

    const firstLocation = client.localisations[0];
    try {
        const select = firstLocElement.querySelector('select');
        if (select) select.value = firstLocation.wilaya || select.options[0].value;
    } catch (e) {
        console.warn("populateForm: unable to set wilaya on first location", e);
    }
    const addr = firstLocElement.querySelector('.localisation-form input');
    if (addr) addr.value = firstLocation.adresse || '';

    const firstLocRadioName = `responsable-${firstLocElement.dataset.locId}`;
    firstLocElement.querySelectorAll('.phone-form input[type="radio"]').forEach(r => r.name = firstLocRadioName);

    if (Array.isArray(firstLocation.telephones) && firstLocation.telephones.length > 0) {
        firstLocation.telephones.forEach((phone, phoneIndex) => {
            if (phoneIndex === 0) {
                const phoneInputs = firstLocElement.querySelectorAll('.phone-form input.inputnumtel');
                if (phoneInputs[0]) phoneInputs[0].value = phone.numero || '';
                if (phoneInputs[1]) phoneInputs[1].value = phone.nom_contact || '';
                if (phone.est_responsable) {
                    const radioBtn = firstLocElement.querySelector('.phone-form input[type="radio"]');
                    if (radioBtn) radioBtn.checked = true;
                }
                // show formatted hint if available
                if (phoneInputs[0] && phone.formatted) {
                    let hint = phoneInputs[0].parentElement && phoneInputs[0].parentElement.querySelector('.phone-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'phone-hint';
                        hint.style.fontSize = '0.9em';
                        hint.style.marginTop = '4px';
                        hint.style.color = '#333';
                        if (phoneInputs[0].parentElement) phoneInputs[0].parentElement.appendChild(hint);
                    }
                    hint.textContent = phone.formatted;
                }
            } else {
                const newPhoneForm = addPhoneToLocation(firstLocElement, false);
                if (!newPhoneForm) {
                    console.error("populateForm: addPhoneToLocation failed for first location");
                    return;
                }
                const newInputs = newPhoneForm.querySelectorAll('input.inputnumtel');
                if (newInputs[0]) newInputs[0].value = phone.numero || '';
                if (newInputs[1]) newInputs[1].value = phone.nom_contact || '';
                if (phone.est_responsable) {
                    const rb = newPhoneForm.querySelector('input[type="radio"]');
                    if (rb) rb.checked = true;
                }
                if (newInputs[0] && phone.formatted) {
                    let hint = newInputs[0].parentElement && newInputs[0].parentElement.querySelector('.phone-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'phone-hint';
                        hint.style.fontSize = '0.9em';
                        hint.style.marginTop = '4px';
                        hint.style.color = '#333';
                        if (newInputs[0].parentElement) newInputs[0].parentElement.appendChild(hint);
                    }
                    hint.textContent = phone.formatted;
                }
            }
        });
    }

    const locsParent = firstLocElement.parentElement || document.body;
    for (let i = 1; i < client.localisations.length; i++) {
        const location = client.localisations[i];
        const newLocElement = firstLocElement.cloneNode(true);
        newLocElement.dataset.locId = (Date.now().toString(36) + Math.floor(Math.random() * 1000) + '-' + i);

        newLocElement.querySelectorAll('input').forEach(inp => { if (inp.type === 'radio') inp.checked = false; else inp.value = ''; });
        newLocElement.querySelectorAll('select').forEach(s => s.selectedIndex = 0);

        const phonesZones = Array.from(newLocElement.querySelectorAll('.locwil-form-addclient'));
        const phonesZone = phonesZones.length ? phonesZones[phonesZones.length - 1] : null;
        if (phonesZone) {
            const phoneForms = Array.from(phonesZone.querySelectorAll('.phone-form'));
            if (phoneForms.length === 0) {
                const pf = document.createElement('div');
                pf.className = 'phone-form';
                pf.innerHTML = `
                    <span>Numero de téléphone :</span>
                    <div class="inputs-phone-form">
                        <input type="text" placeholder="Ex: 0555 55 55 55" class="inputnumtel">
                        <input type="text" placeholder="Nom..." class="inputnumtel">
                        <p>Responsable : </p>
                        <input type="radio" name="responsable-${newLocElement.dataset.locId}">
                    </div>
                    <button type="button" class="delete-phone" style="display:none;">
                        <img src="../img/icon/supprimer1.png" alt=".delete-phone">
                    </button>
                `;
                const addBtn = phonesZone.querySelector('.add-phone');
                if (addBtn) phonesZone.insertBefore(pf, addBtn);
                else phonesZone.appendChild(pf);
            } else {
                phoneForms.forEach((pf, idxpf) => { if (idxpf > 0) pf.remove(); });
            }
        }

        try {
            const sel = newLocElement.querySelector('select');
            if (sel) sel.value = location.wilaya || sel.options[0].value;
        } catch (e) {
            console.warn("populateForm: unable to set wilaya on cloned location", e);
        }
        const addrInputClone = newLocElement.querySelector('.localisation-form input');
        if (addrInputClone) addrInputClone.value = location.adresse || '';

        if (!newLocElement.querySelector('.deleteanotherloc')) {
            const deleteLocBtn = document.createElement('button');
            deleteLocBtn.type = 'button';
            deleteLocBtn.className = 'deleteanotherloc';
            deleteLocBtn.innerHTML = `<img src="../img/icon/supprimer1.png" alt="delete-loc">`;
            newLocElement.style.position = newLocElement.style.position || 'relative';
            newLocElement.appendChild(deleteLocBtn);
            deleteLocBtn.addEventListener('click', () => newLocElement.remove());
        }

        const allLocsNow = Array.from(document.querySelectorAll('.loc-form-addclient'));
        const lastLoc = allLocsNow.length ? allLocsNow[allLocsNow.length - 1] : null;
        if (lastLoc && lastLoc.parentNode) {
            lastLoc.parentNode.insertBefore(newLocElement, lastLoc.nextSibling);
        } else {
            locsParent.appendChild(newLocElement);
        }

        newLocElement.querySelectorAll('.phone-form input[type="radio"]').forEach(r => r.name = `responsable-${newLocElement.dataset.locId}`);

        if (Array.isArray(location.telephones) && location.telephones.length > 0) {
            location.telephones.forEach((phone, phoneIndex) => {
                if (phoneIndex === 0) {
                    const phoneInputs = newLocElement.querySelectorAll('.phone-form input.inputnumtel');
                    if (phoneInputs[0]) phoneInputs[0].value = phone.numero || '';
                    if (phoneInputs[1]) phoneInputs[1].value = phone.nom_contact || '';
                    if (phone.est_responsable) {
                        const r = newLocElement.querySelector('.phone-form input[type="radio"]');
                        if (r) r.checked = true;
                    }
                    if (phoneInputs[0] && phone.formatted) {
                        let hint = phoneInputs[0].parentElement && phoneInputs[0].parentElement.querySelector('.phone-hint');
                        if (!hint) {
                            hint = document.createElement('div');
                            hint.className = 'phone-hint';
                            hint.style.fontSize = '0.9em';
                            hint.style.marginTop = '4px';
                            hint.style.color = '#333';
                            if (phoneInputs[0].parentElement) phoneInputs[0].parentElement.appendChild(hint);
                        }
                        hint.textContent = phone.formatted;
                    }
                } else {
                    const added = addPhoneToLocation(newLocElement, false);
                    if (!added) {
                        console.error("populateForm: addPhoneToLocation failed for cloned location index", i);
                        return;
                    }
                    const newPhoneInputs = added.querySelectorAll('input.inputnumtel');
                    if (newPhoneInputs[0]) newPhoneInputs[0].value = phone.numero || '';
                    if (newPhoneInputs[1]) newPhoneInputs[1].value = phone.nom_contact || '';
                    if (phone.est_responsable) {
                        const rb = added.querySelector('input[type="radio"]');
                        if (rb) rb.checked = true;
                    }
                    if (newPhoneInputs[0] && phone.formatted) {
                        let hint = newPhoneInputs[0].parentElement && newPhoneInputs[0].parentElement.querySelector('.phone-hint');
                        if (!hint) {
                            hint = document.createElement('div');
                            hint.className = 'phone-hint';
                            hint.style.fontSize = '0.9em';
                            hint.style.marginTop = '4px';
                            hint.style.color = '#333';
                            if (newPhoneInputs[0].parentElement) newPhoneInputs[0].parentElement.appendChild(hint);
                        }
                        hint.textContent = phone.formatted;
                    }
                }
            });
        }

        const pfList = newLocElement.querySelectorAll('.phone-form');
        pfList.forEach((pf, idxpf) => {
            const del = pf.querySelector('.delete-phone');
            if (del) del.style.display = (idxpf === 0 ? 'none' : '');
        });
    }

    const allLocsAfter = Array.from(document.querySelectorAll('.loc-form-addclient'));
    allLocsAfter.forEach(loc => {
        if (!loc.dataset.locId) loc.dataset.locId = (Date.now().toString(36) + Math.floor(Math.random() * 1000));
        const rn = `responsable-${loc.dataset.locId}`;
        loc.querySelectorAll('.phone-form input[type="radio"]').forEach(r => r.name = rn);
        const pfList = loc.querySelectorAll('.phone-form');
        if (pfList.length) {
            const del = pfList[0].querySelector('.delete-phone');
            if (del) del.style.display = 'none';
        }
    });

    console.log("populateForm: finished populating locations & phones");
}
