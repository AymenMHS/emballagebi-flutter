(() => {
  // ---------- Helpers ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const debounce = (fn, wait = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
  const parseFrenchDateTime = str => {
    if (!str) return null;
    const iso = Date.parse(str);
    if (!isNaN(iso)) return new Date(iso);
    const m = (str || '').trim().match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})?/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, ii] = m;
    return new Date(+yyyy, +mm - 1, +dd, +(hh || 0), +(ii || 0));
  };
  const formatDateToFrench = dt => {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const ii = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${ii}`;
  };
  const extractNumber = s => {
    if (!s) return NaN;
    const match = s.replace(',', '.').match(/-?[\d]+(?:\.[\d]+)?/);
    return match ? parseFloat(match[0]) : NaN;
  };
  const randId = () => Math.random().toString(36).slice(2, 9);

  // Petit wrapper pour notif (utilise votre showNotification si présent)
  const notify = (msg, success = true, opts = {}) => {
    if (typeof window.showNotification === 'function') {
      return window.showNotification(msg, success, opts);
    }
    if (!success) console.error(msg);
    else console.log(msg);
    // léger fallback non intrusif
  };

  // canonical types used in the "Types" filter
  const CANONICAL_TYPES = ['Cartons Offset', 'Sacs', 'Papier', 'Ondulé'];

  const inferCanonicalType = (freeType) => {
    if (!freeType) return null;
    const s = ('' + freeType).toLowerCase();
    if (s.includes('carton') || s.includes('bol') || s.includes('boite') || s.includes('box') || s.includes('gaufre') || s.includes('pizza')) return 'Cartons Offset';
    if (s.includes('sac') || s.includes('sachet') || s.includes('pop')) return 'Sacs';
    if (s.includes('papier') || s.includes('assiette') || s.includes('gauffre') || s.includes('gaufre')) return 'Papier';
    if (s.includes('ondul') || s.includes('ondulé') || s.includes('ondule')) return 'Ondulé';
    return null;
  };

  const inferCategoryFromTypeOrTitle = (type, title, desc = '') => {
    const s = `${type || ''} ${title || ''} ${desc || ''}`.toLowerCase();
    if (s.includes('burger')) return 'Boite Burger';
    if (s.includes('sandwich')) return 'Boite Sandwich';
    if (s.includes('pizza')) return 'Boite Pizza';
    if (s.includes('frite') || s.includes('frites')) return 'Boite Frite';
    if (s.includes('taco')) return 'Boite Tacos';
    if (s.includes('assiette')) return 'Assiettes';
    if (s.includes('bol')) return 'Bol';
    if (s.includes('bubble') || s.includes('waffle')) return 'Bubble waffle';
    if (s.includes('pop') && s.includes('corn')) return 'Pop Corn';
    if (s.includes('crepe') || s.includes('crêpe')) return 'Creperie';
    if (s.includes('gaufre') || s.includes('gauffre')) return 'Gauffrerie';
    const can = inferCanonicalType(type);
    if (can === 'Papier') return 'Assiettes';
    if (can === 'Sacs') return 'Pop Corn';
    if (can === 'Cartons Offset') return 'Variétés';
    return 'Variétés';
  };

  // ---------- DOM references ----------
  const container = document.querySelector('.container-new-plaque');
  if (!container) return console.warn('Container .container-new-plaque introuvable.');
  const categorySelect = container.querySelector('#categorySelect') || container.querySelector('.filter-all-product .bloc-filter-product select');
  const sortSelect = container.querySelector('.triage-table select');
  const searchInput = container.querySelector('#searchInput');
  const tagBloc = Array.from(container.querySelectorAll('.bloc-filter-product'))
    .find(b => (b.querySelector('span') || {}).textContent.includes('Emballages'));
  const tagCheckboxes = tagBloc ? Array.from(tagBloc.querySelectorAll('input[type=checkbox]')) : [];
  const typeBloc = Array.from(container.querySelectorAll('.bloc-filter-product'))
    .find(b => (b.querySelector('span') || {}).textContent.includes('Types'));
  const typeCheckboxes = typeBloc ? Array.from(typeBloc.querySelectorAll('input[type=checkbox]')) : [];
  const tbody = container.querySelector('.table .tbody');
  const headerCountP = container.querySelector('.title-table p');
  const headerTitleH1 = container.querySelector('.title-table h1');
  const paginationContainer = container.querySelector('.pagination-products .pages-pagination');
  const addCategoryBtn = document.getElementById('addCategory');

  // ---------- createProductRowElems (copié depuis ton code, inchangé) ----------
  const createProductRowElems = (data) => {
    const canonicalType = CANONICAL_TYPES.includes(data.type) ? data.type : (inferCanonicalType(data.type) || data.type);

    const tr = document.createElement('div'); tr.className = 'tr'; tr.dataset.id = data.id || randId();
    if (data.tags && data.tags.length) tr.dataset.tags = data.tags.join(',');
    tr.dataset.type = canonicalType;
    const categoryLabel = data.category || inferCategoryFromTypeOrTitle(data.type, data.title, data.desc);
    tr.dataset.category = categoryLabel;

    const col1 = document.createElement('div'); col1.className = 'col col1';
    const btn = document.createElement('button');
    const btnImg = document.createElement('img'); btnImg.src = '../img/icon/arrow-down.png';
    btn.appendChild(btnImg);
    const imgWrap = document.createElement('div'); imgWrap.className = 'image-product';
    const img = document.createElement('img'); img.src = data.images && data.images[0] ? data.images[0] : '../img/logo3d.png';
    imgWrap.appendChild(img);
    const titleWrap = document.createElement('div'); titleWrap.className = 'title-product';
    const pTitle = document.createElement('p'); pTitle.className = 'text-title-product'; pTitle.textContent = data.title;
    const pDetails = document.createElement('p'); pDetails.className = 'details-title-product';
    pDetails.innerHTML = `Taille : <b>${data.size || 'M'}</b> - Min : <b>${data.min || 0}</b>`;
    titleWrap.appendChild(pTitle); titleWrap.appendChild(pDetails);
    col1.appendChild(btn); col1.appendChild(imgWrap); col1.appendChild(titleWrap);

    const col2 = document.createElement('div'); col2.className = 'col col2';
    const tp = document.createElement('div'); tp.className = 'type-product';
    const pType = document.createElement('p'); pType.textContent = canonicalType;
    tp.appendChild(pType); col2.appendChild(tp);

    const col3 = document.createElement('div'); col3.className = 'col col3';
    const pPrice = document.createElement('p'); pPrice.textContent = (typeof data.price !== 'undefined' && !isNaN(data.price)) ? `${data.price} Da` : '—';
    col3.appendChild(pPrice);

    const col4 = document.createElement('div'); col4.className = 'col col4';
    const pDate = document.createElement('p'); pDate.textContent = data.dateStr || '';
    col4.appendChild(pDate);

    const col5 = document.createElement('div'); col5.className = 'col col5';
    const editBtn = document.createElement('button'); editBtn.style.backgroundColor = 'rgb(0, 91, 0)';
    const editImg = document.createElement('img'); editImg.src = '../img/icon/editer.png'; editImg.alt = 'modify';
    editBtn.appendChild(editImg);
    const delBtn = document.createElement('button');
    const delImg = document.createElement('img'); delImg.src = '../img/icon/supprimer1.png'; delImg.alt = 'delete';
    delBtn.appendChild(delImg);
    col5.appendChild(editBtn); col5.appendChild(delBtn);

    tr.appendChild(col1); tr.appendChild(col2); tr.appendChild(col3); tr.appendChild(col4); tr.appendChild(col5);

    const trOpen = document.createElement('div'); trOpen.className = 'tr-open';
    const imgsDiv = document.createElement('div'); imgsDiv.className = 'images-product';
    const hImgs = document.createElement('h1'); hImgs.textContent = 'Images :';
    imgsDiv.appendChild(hImgs);
    (data.images || []).slice(0, 5).forEach(src => {
      const im = document.createElement('div'); im.className = 'image-product';
      const iimg = document.createElement('img'); iimg.src = src;
      im.appendChild(iimg); imgsDiv.appendChild(im);
    });
    const descDiv = document.createElement('div'); descDiv.className = 'desc-product';
    const hDesc = document.createElement('h1'); hDesc.textContent = 'Description :';
    const pDesc = document.createElement('p'); pDesc.className = 'desc'; pDesc.textContent = data.desc || '';
    descDiv.appendChild(hDesc); descDiv.appendChild(pDesc);

    trOpen.appendChild(imgsDiv); trOpen.appendChild(descDiv);

    return { tr, trOpen, canonicalType, categoryLabel };
  };

  // helper: accepte plusieurs formats renvoyés par le serveur et retourne un Date ou null
  // helper robuste pour parser les dates renvoyées par le serveur
  const parseServerDate = (value) => {
    if (value === null || value === undefined) return null;

    // si c'est déjà une Date
    if (value instanceof Date) return value;

    // si object style Mongo-like { $date: 1234567890000 } ou { date: { $date: ... } }
    if (typeof value === 'object') {
      try {
        // recherche récursive d'un champ contenant un timestamp
        const findTimestamp = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          if (typeof obj.$date === 'number') return obj.$date;
          if (typeof obj.$date === 'string' && /^\d+$/.test(obj.$date)) return Number(obj.$date);
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === 'number') {
              // heuristique : nombre > 1e9 => millisecondes/secondes
              return v;
            }
            if (typeof v === 'object') {
              const found = findTimestamp(v);
              if (found) return found;
            }
          }
          return null;
        };
        const ts = findTimestamp(value);
        if (ts != null) {
          const ms = ts < 1e12 ? ts * 1000 : ts;
          const d = new Date(ms);
          return isNaN(d.getTime()) ? null : d;
        }
      } catch (e) {
        // continue to other parsing
      }
    }

    // number (timestamp) : secondes ou millisecondes
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    // string
    if (typeof value === 'string') {
      const s = value.trim();
      if (s === '') return null;

      // ISO / RFC3339 / "2025-07-05T10:30:00", with or without timezone
      const iso = Date.parse(s);
      if (!isNaN(iso)) return new Date(iso);

      // numeric string (maybe seconds or ms, maybe with decimals)
      if (/^-?\d+(\.\d+)?$/.test(s)) {
        // remove decimals
        const num = Number(s.split('.')[0]);
        if (!isNaN(num)) {
          const ms = num < 1e12 ? num * 1000 : num;
          const d = new Date(ms);
          return isNaN(d.getTime()) ? null : d;
        }
      }

      // Microsoft JSON date /Date(1234567890000)/ or /Date(1234567890)/
      const m = s.match(/\/Date\((-?\d+)\)\/?/);
      if (m) {
        const num = Number(m[1]);
        const ms = num < 1e12 ? num * 1000 : num;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }

      // French format dd/mm/yyyy [HH:MM]
      const fr = s.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):?(\d{2})?)?\s*$/);
      if (fr) {
        const [, dd, mm, yyyy, hh = "0", ii = "0"] = fr;
        const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(ii));
        return isNaN(d.getTime()) ? null : d;
      }

      // fallback : try Date constructor again
      try {
        const d2 = new Date(s);
        return isNaN(d2.getTime()) ? null : d2;
      } catch (e) {
        return null;
      }
    }

    return null;
  };

  // ---------- Image URL builder ---------- 
  // Construit une URL ABSOLUE vers les assets /storage/ en respectant window.API_BASE si défini.
  const buildImageUrl = (p) => {
    if (!p) return null;
    p = String(p).trim();
    // Si déjà URL absolue ou protocole-relative, renvoyer tel quel
    if (/^https?:\/\//i.test(p) || p.startsWith('//')) return p;

    // Normalise l'entrée pour avoir un chemin relatif propre (sans slash double)
    // si p commence par "storage/" ou "/storage/" ou "produits/..." -> gérer tous les cas
    const cleaned = p.replace(/^\/+/, ''); // retire slash(s) initiaux

    // desiredPath doit commencer par /storage/...
    const desiredPath = '/storage/' + cleaned;

    // Si une API_BASE est disponible, l'utiliser pour construire une URL absolue
    if (typeof window !== 'undefined' && window.API_BASE) {
      // retire slash final de API_BASE puis concatène
      const base = String(window.API_BASE).replace(/\/+$/, '');
      return (base + desiredPath).replace(/\/{2,}/g, '/');
    }

    // fallback : retourne chemin absolu (sera résolu par l'origin courant)
    return desiredPath;
  };

  const normalizeServerType = (raw) => {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      return raw.value || raw.name || raw.label || String(raw) || '';
    }
    return String(raw);
  };


  const convertServerProductToRowData = (srv) => {
    const id = srv.id_produit || srv.id || randId();
    const title = srv.nom_produit || srv.nom || srv.name || 'Produit';
    const rawType = srv.type_carton || srv.type || srv.titre_type || '';
    const type = normalizeServerType(rawType);
    const price = (typeof srv.prix_unitaire !== 'undefined') ? Number(srv.prix_unitaire) : (srv.price ? Number(srv.price) : undefined);
    const min = (typeof srv.quantite_min !== 'undefined') ? Number(srv.quantite_min) : (srv.min ? Number(srv.min) : NaN);
    const dateVal = srv.date_creation || srv.date || srv.created_at || null;
    console.debug('[Product] raw date value from server ->', dateVal);
    const parsedDate = parseServerDate(dateVal);
    const dateStr = parsedDate ? formatDateToFrench(parsedDate) : (srv.dateStr || '');
    console.debug('[Product] parsedDate ->', parsedDate, 'dateStr ->', dateStr);
    const desc = srv.description || srv.desc || '';
    const size = srv.taille || srv.size || '';
    let images = [];
    if (Array.isArray(srv.images)) {
      images = srv.images.map(im => {
        if (typeof im === 'string') return buildImageUrl(im);
        if (im && (im.storage_path || im.path)) return buildImageUrl(im.storage_path || im.path);
        if (im && im.url) return im.url;
        return null;
      }).filter(Boolean);
    } else if (srv.image) {
      images = [buildImageUrl(srv.image)];
    } else if (srv.image_url) {
      images = [srv.image_url];
    }
    const category = srv.nom_categorie || srv.categorie || srv.category || (srv.id_categorie ? null : null);
    const tags = Array.isArray(srv.tags) ? srv.tags : (srv.labels || []);
    return { id, title, type, category, price, dateStr, min, tags, images, desc, size, raw: srv };
  };

  // ---------- restore missing helpers: fetchCategoriesAndPopulate, ensureSampleProducts, buildProductsArray, attachRowListeners ----------

  // fetch categories and populate the category <select>
  async function fetchCategoriesAndPopulate() {
    if (!categorySelect) return;
    const tried = ['/api/categorie', '/api/categorie/list', '/api/categories', '/api/categories/list'];
    for (const url of tried) {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) continue;
        const body = await res.json().catch(() => null);
        if (!body) continue;
        let list = null;
        if (Array.isArray(body)) list = body;
        else if (body && Array.isArray(body.items)) list = body.items;
        else if (body && Array.isArray(body.data)) list = body.data;
        if (!list) continue;
        const placeholderText = categorySelect.options[0] ? categorySelect.options[0].text : '--Selectionnez une Categorie--';
        categorySelect.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholderText;
        categorySelect.appendChild(opt0);
        list.forEach(it => {
          const id = it.id_categorie || it.id || it.idCategorie || it.idCategorie;
          const name = it.nom_categorie || it.nom || it.name || it.nomCategorie || ('' + it).toString();
          if (!name) return;
          const opt = document.createElement('option');
          opt.value = id || name;
          opt.text = name;
          categorySelect.appendChild(opt);
        });
        return;
      } catch (e) {
        continue;
      }
    }
  }

  // build products array from existing DOM rows (fallback)
  const buildProductsArray = () => {
    const products = [];
    const trNodes = Array.from(tbody.querySelectorAll('.tr'));
    trNodes.forEach(tr => {
      let next = tr.nextElementSibling;
      let trOpen = (next && next.classList.contains('tr-open')) ? next : null;
      const titleEl = tr.querySelector('.text-title-product');
      const typeEl = tr.querySelector('.type-product p');
      const priceEl = tr.querySelector('.col.col3 p');
      const dateEl = tr.querySelector('.col.col4 p');
      const detailsEl = tr.querySelector('.details-title-product');

      const title = titleEl ? titleEl.textContent.trim() : 'Produit';
      const rawType = typeEl ? typeEl.textContent.trim() : '';
      const canonicalType = CANONICAL_TYPES.includes(rawType) ? rawType : (inferCanonicalType(rawType) || rawType);
      const price = priceEl ? extractNumber(priceEl.textContent) : NaN;
      const date = dateEl ? parseFrenchDateTime(dateEl.textContent) : null;
      let min = NaN;
      if (detailsEl) {
        const m = detailsEl.innerHTML.match(/Min\s*:\s*<\/?b>?(\d+)/i) || detailsEl.textContent.match(/Min\s*:\s*(\d+)/i);
        if (m) min = parseInt(m[1], 10);
      }
      const dataAttrs = tr.dataset || {};
      const tags = dataAttrs.tags ? dataAttrs.tags.split(',').map(s => s.trim()) : [];

      const explicitCategory = (dataAttrs.category && dataAttrs.category.trim()) ? dataAttrs.category.trim() : null;
      const inferred = inferCategoryFromTypeOrTitle(rawType, title, (trOpen && trOpen.querySelector('.desc')) ? trOpen.querySelector('.desc').textContent : '');
      const category = explicitCategory || inferred;

      products.push({
        id: tr.dataset.id || randId(),
        title,
        type: canonicalType,
        category,
        price, date, min,
        tags,
        tr, trOpen
      });
    });
    return products;
  };

  // inject sample products (fallback if no API and no DOM rows)
  const ensureSampleProducts = () => {
    const existing = tbody.querySelectorAll('.tr').length;
    if (existing >= 6) return; // already enough items
    const samples = [
      { title: 'Emballage Gaufre', type: 'Cartons Offset', category: 'Gauffrerie', price: 2.8, dateStr: '22/06/2025 11:45', min: 120, tags: ['Nouveautés'], images: ['../img/product/tacos1.png', '../img/product/sandwitch2.png'], desc: 'Emballage gaufre pratique', size: 'PM' },
      { title: 'Assiette Jetable Ø22', type: 'Papier', category: 'Assiettes', price: 4.2, dateStr: '12/05/2025 10:20', min: 200, tags: ['Nouveautés'], images: ['../img/product/sandwitch2.png'], desc: 'Assiette biodégradable', size: 'Ø22' },
      { title: 'Bol Carton 500ml', type: 'Cartons Offset', category: 'Bol', price: 6.0, dateStr: '01/07/2025 09:15', min: 100, tags: [], images: ['../img/product/kintaki1.png'], desc: 'Bol standard', size: 'M' },
      { title: 'Boîte Pizza 30cm', type: 'Ondulé', category: 'Boite Pizza', price: 25, dateStr: '20/04/2025 08:00', min: 30, tags: ['Les plus demandés'], images: ['../img/product/burger.png'], desc: 'Boîte pizza ondulée', size: '30cm' },
      { title: 'Sachet Pop Corn', type: 'Sacs', category: 'Pop Corn', price: 1.2, dateStr: '09/03/2025 12:00', min: 500, tags: [], images: ['../img/logo3d.png'], desc: 'Sachet kraft', size: 'S' },
      { title: 'Emballage Gaufre (PM)', type: 'Cartons Offset', category: 'Gauffrerie', price: 2.5, dateStr: '05/07/2025 10:30', min: 80, tags: [], images: ['../img/logo3d.png'], desc: 'Variante PM', size: 'PM' }
    ];
    samples.forEach(s => {
      const id = randId();
      const { tr, trOpen, canonicalType } = createProductRowElems({ id, ...s });
      const typeP = tr.querySelector('.type-product p');
      if (typeP) typeP.textContent = canonicalType;
      tbody.appendChild(tr);
      tbody.appendChild(trOpen);
    });
  };

  // attach row listeners (expand, edit, delete)
  const attachRowListeners = (product) => {
    const { tr, trOpen } = product;
    if (!tr) return;

    const arrowBtn = tr.querySelector('.col.col1 button');
    if (arrowBtn) {
      arrowBtn.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = tr.classList.toggle('expanded');
        if (trOpen) trOpen.style.display = isOpen ? 'flex' : 'none';
        const img = arrowBtn.querySelector('img');
        if (img) img.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      };
    }

    tr.addEventListener('click', e => {
      if (e.target.closest('.col.col5')) return;
      if (e.target.closest('a') || e.target.closest('input')) return;
      const isOpen = tr.classList.toggle('expanded');
      if (trOpen) trOpen.style.display = isOpen ? 'flex' : 'none';
      const arrowImg = tr.querySelector('.col.col1 button img');
      if (arrowImg) arrowImg.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    const actionButtons = Array.from(tr.querySelectorAll('.col.col5 button'));
    const editBtn = actionButtons[0] || null;
    const deleteBtn = actionButtons[1] || null;

    if (editBtn) {
      editBtn.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        const id = encodeURIComponent(product.id || product.title);
        window.location.href = `newproduit.html?id=${id}`;
      };
    }

    if (deleteBtn) {
      deleteBtn.setAttribute('aria-label', 'Supprimer le produit');
      deleteBtn.onclick = async e => {
        e.stopPropagation();
        e.preventDefault();
        const ok = confirm(`Supprimer le produit "${product.title}" ? Cette action est irréversible.`);
        if (!ok) return;
        const id = product.id;
        if (!id) { notify("Impossible de supprimer: identifiant produit manquant.", false, { stack: true }); return; }

        // try delete on server (simple single-endpoint)
        try {
          const res = await fetch(`/api/produit/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            notify(`Erreur suppression: ${res.status} ${txt}`, false);
            return;
          }
          // remove DOM
          products = products.filter(p => p.id !== product.id);
          if (product.tr && product.tr.parentNode) product.tr.parentNode.removeChild(product.tr);
          if (product.trOpen && product.trOpen.parentNode) product.trOpen.parentNode.removeChild(product.trOpen);
          // reload current page to be safe
          loadAndRenderPage(state.page || 1);
          notify(`Produit « ${product.title} » supprimé.`, true);
        } catch (err) {
          console.error('Erreur suppression', err);
          notify("Impossible de contacter le serveur. La suppression n'a pas été effectuée.", false);
        }
      };
    }
  };


  // ---------- state ----------
  let products = []; // current page items (server-driven)
  let server_total = 0;
  let server_total_pages = 1;

  let state = {
    search: '',
    category: categorySelect ? categorySelect.value : '',
    selectedTags: new Set(),
    selectedTypes: new Set(),
    sort: sortSelect ? sortSelect.value : '',
    page: 1,
    perPage: 6
  };

  const updateHeaderCount = (n, total) => {
    if (headerCountP) headerCountP.textContent = `${n} / ${total} produits`;
  };
  const updateHeaderTitle = () => {
    if (!headerTitleH1) return;
    if (!categorySelect) { headerTitleH1.textContent = 'Tout les produits'; return; }
    const selText = categorySelect.options[categorySelect.selectedIndex]?.text?.trim() || '';
    const isDefault = !selText || selText.toLowerCase().includes('selection') || selText.startsWith('--');
    headerTitleH1.textContent = isDefault ? 'Tout les produits' : selText;
  };

  // ---------- Server fetch function ----------
  async function fetchProductsPage(page = 1, per_page = 6) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(per_page));

    if (state.search && state.search.trim()) params.set('q', state.search.trim());
    if (state.sort) params.set('sort', state.sort);
    if (categorySelect && categorySelect.value) params.set('id_categorie', categorySelect.value);

    // allow multiple selected types -> append multiple params
    if (state.selectedTypes && state.selectedTypes.size > 0) {
      Array.from(state.selectedTypes).forEach(t => params.append('type_carton', t));
    }

    // tags: not yet supported server-side unless backend implements -> send as q fallback
    if (state.selectedTags && state.selectedTags.size > 0) {
      // include tags text into q as a loose search
      const tagsText = Array.from(state.selectedTags).join(' ');
      if (!params.get('q')) params.set('q', tagsText);
      else params.set('q', params.get('q') + ' ' + tagsText);
    }

    const url = `/api/produit?${params.toString()}`; // backend endpoint
    console.log('[Product] fetch url ->', url);
    try {
      const res = await fetch(url, { credentials: 'same-origin' });

      console.log('[Product] fetch status', res.status);
      if (!res.ok) {
        const txt = await res.text().catch(() => `status ${res.status}`);
        notify(`Erreur serveur lors de la recherche: ${res.status} ${txt}`, false);
        return { items: [], page, per_page, total: 0, total_pages: 0 };
      }
      const body = await res.json().catch(() => null);
      console.log('[Product] response body ->', body);
      if (!body) return { items: [], page, per_page, total: 0, total_pages: 0 };
      server_total = Number(body.total || 0);
      server_total_pages = Number(body.total_pages || 0) || (body.per_page ? Math.max(1, Math.ceil(server_total / body.per_page)) : 1);
      const items = Array.isArray(body.items) ? body.items.map(convertServerProductToRowData) : [];
      return { items, page: Number(body.page || page), per_page: Number(body.per_page || per_page), total: server_total, total_pages: server_total_pages };
    } catch (err) {
      console.error('fetchProductsPage error', err);
      return { items: [], page, per_page, total: 0, total_pages: 0 };
    }
  }

  // ---------- Render page results (no client pagination/filtering) ----------
  function clearTbody() {
    if (tbody) tbody.innerHTML = '';
  }

  function renderServerProducts() {
    updateHeaderCount(products.length, server_total);
    if (!products || products.length === 0) {
      clearTbody();
      if (tbody) {
        const msg = document.createElement('div');
        msg.className = 'no-products';
        msg.setAttribute('role', 'status');
        msg.style.padding = '30px';
        msg.style.textAlign = 'center';
        msg.style.width = '100%';
        msg.style.boxSizing = 'border-box';
        msg.textContent = 'Aucun produit';
        tbody.appendChild(msg);
      }
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    // append rows
    clearTbody();
    products.forEach(p => {
      if (p.trOpen) p.trOpen.style.display = 'none';
      const typeP = p.tr.querySelector('.type-product p');
      if (typeP) typeP.textContent = p.type;
      tbody.appendChild(p.tr);
      if (p.trOpen) tbody.appendChild(p.trOpen);
      attachRowListeners(p);
    });
  }

  // ---------- Server-side pagination renderer ----------
  function renderPaginationServerSide(currentPage, perPage, total, totalPages) {
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';
    const makeBtn = (text, cb, disabled = false, active = false) => {
      const p = document.createElement('p');
      p.textContent = text;
      p.style.cursor = disabled ? 'default' : 'pointer';
      if (active) p.style.backgroundColor = 'rgb(236, 236, 236)';
      if (!disabled) p.addEventListener('click', cb);
      return p;
    };
    const totalP = Math.max(1, totalPages || Math.ceil((total || 0) / perPage));
    paginationContainer.appendChild(makeBtn('<<', () => { state.page = 1; loadAndRenderPage(1); }, currentPage <= 1));
    paginationContainer.appendChild(makeBtn('<', () => { const p = Math.max(1, currentPage - 1); state.page = p; loadAndRenderPage(p); }, currentPage <= 1));

    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalP, start + windowSize - 1);
    if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i++) {
      paginationContainer.appendChild(makeBtn(String(i), () => { state.page = i; loadAndRenderPage(i); }, false, i === currentPage));
    }
    paginationContainer.appendChild(makeBtn('>', () => { const p = Math.min(totalP, currentPage + 1); state.page = p; loadAndRenderPage(p); }, currentPage >= totalP));
    paginationContainer.appendChild(makeBtn('>>', () => { state.page = totalP; loadAndRenderPage(totalP); }, currentPage >= totalP));
  }

  // ---------- Load & render page ----------
  async function loadAndRenderPage(page = 1) {
    const per = state.perPage || 6;
    const result = await fetchProductsPage(page, per);
    // build DOM elements for each item
    products = [];
    if (tbody) tbody.innerHTML = '';
    result.items.forEach(rowData => {
      const { tr, trOpen } = createProductRowElems(rowData);
      tbody.appendChild(tr);
      if (trOpen) tbody.appendChild(trOpen);
      products.push({
        id: rowData.id,
        title: rowData.title,
        type: inferCanonicalType(rowData.type) || rowData.type,
        category: rowData.category || inferCategoryFromTypeOrTitle(rowData.type, rowData.title, rowData.desc),
        price: rowData.price,
        date: parseFrenchDateTime(rowData.dateStr),
        dateStr: rowData.dateStr,
        min: rowData.min,
        tags: rowData.tags || [],
        tr, trOpen,
        desc: rowData.desc
      });
    });

    // hide open sections and ensure type text
    products.forEach(p => { if (p.trOpen) p.trOpen.style.display = 'none'; const typeP = p.tr.querySelector('.type-product p'); if (typeP) typeP.textContent = p.type; });

    updateHeaderTitle();
    renderServerProducts();

    // pagination UI
    renderPaginationServerSide(result.page, result.per_page, result.total, result.total_pages);
  }

  // ---------- Initial load ----------
  (async () => {
    try {
      // populate categories (async)
      fetchCategoriesAndPopulate().catch(() => { });

      // load first page from server
      await loadAndRenderPage(state.page || 1);
    } catch (e) {
      console.warn('Impossible de charger produits via API paginé, fallback DOM', e);
      // fallback: if server not available, keep existing DOM behavior
      ensureSampleProducts();
      products = buildProductsArray();
      products.forEach(p => { if (p.trOpen) p.trOpen.style.display = 'none'; const typeP = p.tr.querySelector('.type-product p'); if (typeP) typeP.textContent = p.type; });
      updateHeaderTitle();
      // reuse local render (client-side)
      // render(); // not required when fallback
    }
  })();

  // ---------- Listeners: replace client-side filtering by server fetch ----------
  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      const v = (e.target.value || '').trim();
      state.search = v;
      state.page = 1;
      // only search for empty string (reset) or 2+ chars
      if (v === '' || v.length >= 2) {
        loadAndRenderPage(1);
      } else {
        // if 1 char only, do not query server yet — optional: show original page
        // we can simply clear table or keep current page: we'll keep current page to avoid flicker
        // optional: renderServerProducts(); // do nothing
      }
    }, 300));
  }
  if (categorySelect) {
    categorySelect.addEventListener('change', e => {
      state.category = e.target.value;
      state.page = 1;
      updateHeaderTitle();
      loadAndRenderPage(1);
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', e => {
      state.sort = e.target.value;
      state.page = 1;
      loadAndRenderPage(1);
    });
  }
  if (tagCheckboxes.length) {
    tagCheckboxes.forEach(cb => {
      cb.addEventListener('change', e => {
        const label = (cb.parentNode.textContent || '').trim();
        if (cb.checked) state.selectedTags.add(label);
        else state.selectedTags.delete(label);
        state.page = 1;
        loadAndRenderPage(1);
      });
    });
  }
  if (typeCheckboxes.length) {
    typeCheckboxes.forEach(cb => {
      cb.addEventListener('change', e => {
        const label = (cb.parentNode.textContent || '').trim();
        if (cb.checked) state.selectedTypes.add(label);
        else state.selectedTypes.delete(label);
        state.page = 1;
        loadAndRenderPage(1);
      });
    });
  }

  // expose for debug
  window._ProductManager = {
    products,
    state,
    loadAndRenderPage,
    updateHeaderTitle,
    CANONICAL_TYPES,
    fetchCategoriesAndPopulate
  };

  fetchCategoriesAndPopulate().catch(() => { });

})();
