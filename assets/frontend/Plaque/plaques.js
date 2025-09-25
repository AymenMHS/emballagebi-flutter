(() => {
  // ---------- Configuration ----------
  const BASE_MAIN = "/conceptions";
  const BASE_SOUSTRAIT = "/conceptions/soustraites";
  const DEFAULT_PAGE_SIZE = 15;
  const DEFAULT_SUB_PAGE_SIZE = 200;

  // Mapping data-col index -> query param for /conceptions (garder compatibilité)
  const MAIN_FILTER_MAP = {
    0: "q",            // Conception
    1: "client",       // Client enseigne
    2: "product",      // Produit
    3: "pose",         // Nombre de pose (si utile)
    4: "nb_plaques",   // Nombre de plaques
    5: "soustraitant"  // NOM du sous-traitant (nouveau)
  };

  // Debounce helper
  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function el(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  function formatDateISOToDDMMYYYY(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      return iso;
    }
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function humanStatut(st) {
    if (!st) return "";
    const s = String(st).replace(/[_-]+/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function statutClass(st) {
    if (!st) return "";
    const s = String(st).toLowerCase();
    if (s.includes("indispon") || s.includes("err") || s.includes("unavailable")) return "tred";
    if (s.includes("soustrait") || s.includes("sous") || s.includes("sub")) return "tred";
    if (s.includes("commande") || s.includes("ordered")) return "twar";
    return "";
  }

  // ---------- DOM helpers ----------
  // find active container's lignes-table
  function getActiveContainer() {
    const containers = Array.from(document.querySelectorAll('.all-onglets-container .onglet-container'));
    for (const c of containers) {
      const style = window.getComputedStyle(c);
      if (style.display !== 'none') return c;
    }
    return containers[0] || null;
  }

  function getMainTableBodyForActiveContainer() {
    const active = getActiveContainer();
    if (!active) return null;
    return active.querySelector(".lignes-table");
  }

  // Build query params from filters object and pagination
  function buildQueryParams(filters = {}, page = 1, page_size = DEFAULT_PAGE_SIZE) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(page_size));
    Object.entries(filters).forEach(([k, v]) => {
      if (v === null || v === undefined || v === "") return;
      params.set(k, v);
    });
    return params.toString();
  }

  // ---------- FETCH functions ----------
  async function fetchConceptions({ page = 1, page_size = DEFAULT_PAGE_SIZE, filters = {}, base = BASE_MAIN } = {}) {
    try {
      const qs = buildQueryParams(filters, page, page_size);
      const url = `${base}?${qs}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      return json;
    } catch (err) {
      console.error("fetchConceptions error:", err);
      throw err;
    }
  }

  async function fetchPlaques(conceptionId, { page = 1, page_size = DEFAULT_SUB_PAGE_SIZE, filters = {} } = {}) {
    try {
      const qs = buildQueryParams(filters, page, page_size);
      const url = `${BASE_MAIN}/${encodeURIComponent(conceptionId)}/plaques?${qs}`;
      // Note: GET on the same /{id}/plaques endpoint (unchanged)
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      return json;
    } catch (err) {
      console.error("fetchPlaques error:", err);
      throw err;
    }
  }

  // ---------- BUILDERS ----------
  // escape helpers
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function conservToString(consernes, key) {
    if (!Array.isArray(consernes)) return "";
    return consernes.map(c => c && c[key] ? String(c[key]).replace(/[\r\n<>]/g, " ") : "").join(" | ");
  }

  function renderLimitedHtml(consernes, key, limit = 2) {
    if (!Array.isArray(consernes) || consernes.length === 0) return "";
    const values = consernes.map(c => {
      const v = (c && c[key] !== undefined && c[key] !== null) ? String(c[key]).trim() : "";
      return v;
    }).filter(v => v !== "");
    if (values.length === 0) return "";
    const escapedValues = values.map(v => escapeHtml(v));
    if (values.length <= limit) {
      return escapedValues.join("<br>");
    }
    const firstPart = escapedValues.slice(0, limit).join("<br>");
    const remaining = values.length - limit;
    const titleAttr = escapeAttr(values.join(" | "));
    // affiche seulement le nombre (gris) — pas de texte "de plus" ni de "+"
    return `${firstPart}<br><span class="more-count" title="${titleAttr}" style="font-weight:600;color:#888;cursor:default">... +${remaining}</span>`;
  }


  // Original builder (Gestion des Plaques)
  function buildMainAndSubRows(conception) {
    const id = conception.id_conception;
    const name = conception.nom_conception || `Conception ${id}`;
    const consernes = Array.isArray(conception.consernes) ? conception.consernes : [];

    // utilisation de renderLimitedHtml pour limiter l'affichage à 2 éléments puis "+N de plus"
    const clientsHtml = renderLimitedHtml(consernes, 'enseigne', 2);
    const productsHtml = renderLimitedHtml(consernes, 'nom_produit', 2);
    const posesHtml = renderLimitedHtml(consernes, 'pose', 2);

    const mainRow = el(`
      <tr class="main-row" tabindex="0" style="border: none !important;height: auto !important;"  data-id="${escapeAttr(id)}" data-client="${escapeAttr(conservToString(consernes, 'enseigne'))}" data-product="${escapeAttr(conservToString(consernes, 'nom_produit'))}" data-nb="${escapeAttr(String(conception.nb_plaques || 0))}">
        <td style="padding:0;" class="mrp1">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px 16px;border-top-left-radius:10px;border-bottom-left-radius:10px;background-color:#e0e0e0ff;overflow:hidden;margin-top: 10px;margin-bottom: 10px;margin-left: 10px;">
            <span style="margin-right:8px;color:#666;font-size:12px;">
              <img class="arrow" src="../img/icon/arrow-right.png" alt="ouvrir">
            </span>
            ${escapeHtml(name)}
          </div>
        </td>

        <td style="padding:0;text-align:start;" class="mrp2">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;padding:10px 8px;display:flex;justify-content:center;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${clientsHtml || ""}
          </div>
        </td>

        <td style="padding:0;text-align:start;" class="mrp3">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;padding:10px 8px;display:flex;justify-content:center;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${productsHtml || ""}
          </div>
        </td>

        <td style="padding:0;text-align:center;" class="mrp4">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px;background-color:#e0e0e0ff;flex-direction:column;justify-content:center;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${posesHtml || ""}
          </div>
        </td>

        <td style="padding:0;text-align:center;" class="mrp5">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;justify-content:center;align-items:center;padding:10px;border-top-right-radius:10px;border-bottom-right-radius:10px;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            <p style="background-color:#ebebebff;border-radius:10px;width:100px;box-shadow:0 2px 4px rgba(0,0,0,0.25);margin:0;padding:8px 10px;text-align:center;">
              ${escapeHtml(String(conception.nb_plaques || 0))} Plaques
            </p>
          </div>
        </td>

        <td class="actions mrp6" style="padding:0;">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px 16px;background-color: #c8c8c8ff;overflow:hidden;border-radius:10px;margin-top: 10px;margin-bottom: 10px;margin-right: 10px;margin-left: 10px;">
            <button class="btn view"><img src="../img/icon/papeterie-papiers-empiles.png" style="filter: invert(100%);"></button>
            <button class="btn edit"><img src="../img/icon/editer.png"></button>
          </div>
        </td>
      </tr>
    `);


    const subRow = el(`
      <tr class="sub-row"  style="border: none !important;height: auto !important; width: 100% !important;"  aria-hidden="true" data-parent="${escapeAttr(id)}">
        <td colspan="6">
          <div class="sub-wrapper">
            <table class="sub" data-parent="${escapeAttr(id)}">
              <thead>
                <tr>
                  <th style="width:5%;border-top-left-radius: 10px;height: 30px;">
                    <div class="col-title">Status</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">N° de plaque</div>
                  </th>
                  <th style="width:15%;">
                    <div class="col-title">Couleurs</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">Machine (position)</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">Date de renouvrement</div>
                  </th>
                  <th style="width:15%;border-top-right-radius: 10px;">
                    <div class="col-title">Date d'ajout</div>
                  </th>
                </tr>
              </thead>
              <tbody class="sub-body"></tbody>
            </table>
          </div>
        </td>
      </tr>
    `);

    // toggle behaviour (inchangé)
    mainRow.addEventListener("click", (ev) => {
      if (ev.target.closest(".actions")) return;
      ev.stopPropagation();
      ev.preventDefault();

      if (mainRow.nextElementSibling !== subRow) {
        mainRow.insertAdjacentElement("afterend", subRow);
      }
      const currentlyOpen = subRow.getAttribute("aria-hidden") === "false";
      if (currentlyOpen) {
        subRow.setAttribute("aria-hidden", "true");
        subRow.style.display = "none";
        mainRow.classList.remove("expanded");
        mainRow.querySelector(".arrow")?.classList.remove("rotated");
      } else {
        const openSubs = document.querySelectorAll('tr.sub-row[aria-hidden="false"]');
        openSubs.forEach(s => {
          if (s === subRow) return;
          s.setAttribute("aria-hidden", "true");
          s.style.display = "none";
          const prev = s.previousElementSibling;
          if (prev && prev.classList.contains('main-row')) {
            prev.classList.remove("expanded");
            prev.querySelector(".arrow")?.classList.remove("rotated");
          }
        });

        subRow.setAttribute("aria-hidden", "false");
        subRow.style.display = "table-row";
        mainRow.classList.add("expanded");
        mainRow.querySelector(".arrow")?.classList.add("rotated");

        if (!subRow.dataset.listenersAttached) {
          const numeroInput = subRow.querySelector(".numero-plaque");
          const machineInput = subRow.querySelector(".machine");
          const dateRenovInput = subRow.querySelector(".date-renov");
          const dateCreationInput = subRow.querySelector(".date-creation");

          const loadPlaques = debounce(() => {
            const pf = {};
            if (numeroInput && numeroInput.value) pf.numero_plaque = numeroInput.value;
            if (machineInput && machineInput.value) pf.machine = machineInput.value;
            if (dateRenovInput && dateRenovInput.value) {
              pf.date_ren_from = dateRenovInput.value;
              pf.date_ren_to = dateRenovInput.value;
            }
            if (dateCreationInput && dateCreationInput.value) {
              pf.date_add_from = dateCreationInput.value;
              pf.date_add_to = dateCreationInput.value;
            }
            renderPlaquesForConception(id, subRow, pf);
          }, 350);

          [numeroInput, machineInput, dateRenovInput, dateCreationInput].forEach(inp => {
            if (!inp) return;
            inp.addEventListener("input", loadPlaques);
            inp.addEventListener("change", loadPlaques);
          });

          subRow.dataset.listenersAttached = "1";
        }

        // initial load
        renderPlaquesForConception(id, subRow, {});
      }
    });

    return { mainRow, subRow };
  }


  // New builder for soustraites (adds sous-traitant column after products)
  function buildMainAndSubRowsSousTrait(conception) {
    const id = conception.id_conception;
    const name = conception.nom_conception || `Conception ${id}`;
    const consernes = Array.isArray(conception.consernes) ? conception.consernes : [];

    // utilisation de renderLimitedHtml pour limiter l'affichage
    const clientsHtml = renderLimitedHtml(consernes, 'enseigne', 2);
    const productsHtml = renderLimitedHtml(consernes, 'nom_produit', 2);
    const posesHtml = renderLimitedHtml(consernes, 'pose', 2);
    const soustraitantHtml = escapeHtml(conception.soustraitant || "");

    const mainRow = el(`
      <tr class="main-row" tabindex="0" style="height: auto !important;" data-id="${escapeAttr(id)}" data-client="${escapeAttr(conservToString(consernes, 'enseigne'))}" data-product="${escapeAttr(conservToString(consernes, 'nom_produit'))}" data-nb="${escapeAttr(String(conception.nb_plaques || 0))}">
        <td style="padding:0;" class="mr1">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px 16px;border-top-left-radius:10px;border-bottom-left-radius:10px;background-color:#e0e0e0ff;overflow:hidden;margin-top: 10px;margin-bottom: 10px;margin-left: 10px;">
            <span style="margin-right:8px;color:#666;font-size:12px;">
              <img class="arrow" src="../img/icon/arrow-right.png" alt="ouvrir">
            </span>
            ${escapeHtml(name)}
          </div>
        </td>

        <td style="padding:0;text-align:start;" class="mr2">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;padding:10px 8px;display:flex;justify-content:center;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${clientsHtml || ""}
          </div>
        </td>

        <td style="padding:0;text-align:start;" class="mr3">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;padding:10px 8px;display:flex;justify-content:center;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${productsHtml || ""}
          </div>
        </td>
        <td style="padding:0;text-align:start;" class="mr4">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px;background-color:#e0e0e0ff;flex-direction:column;justify-content:center;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            <p style="padding:5px 5px !important;background-color: #66a4e8ff !important;border-radius: 10px !important;color: white;">${soustraitantHtml || ""}</p>
          </div>
        </td>
        <td style="padding:0;text-align:center;" class="mr5">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px;background-color:#e0e0e0ff;flex-direction:column;justify-content:center;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            ${posesHtml || ""}
          </div>
        </td>

        <td style="padding:0;text-align:center;" class="mr6">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;justify-content:center;align-items:center;padding:10px;border-top-right-radius:10px;border-bottom-right-radius:10px;background-color:#e0e0e0ff;flex-direction:column;overflow:hidden;margin-top: 10px;margin-bottom: 10px;">
            <p style="background-color:#ebebebff;border-radius:10px;width:100px;box-shadow:0 2px 4px rgba(0,0,0,0.25);margin:0;padding:8px 10px;text-align:center;">
              ${escapeHtml(String(conception.nb_plaques || 0))} Plaques
            </p>
          </div>
        </td>

        <td class="actions mr7" style="padding:0;">
          <div style="box-shadow:0 4px 8px rgba(0,0,0,0.1);height:100px;display:flex;align-items:center;padding:10px 16px;background-color: #c8c8c8ff;overflow:hidden;border-radius:10px;margin-top: 10px;margin-bottom: 10px;margin-right: 10px;margin-left: 10px;">
            <button class="btn view"><img src="../img/icon/papeterie-papiers-empiles.png" style="filter: invert(100%);"></button>
            <button class="btn edit"><img src="../img/icon/editer.png"></button>
          </div>
        </td>
      </tr>
    `);

    // subRow (identique au précédent)...
    const subRow = el(`
      <tr class="sub-row"  style="height: auto !important; width: 100% !important;"  aria-hidden="true" data-parent="${escapeAttr(id)}">
        <td colspan="7">
          <div class="sub-wrapper">
            <table class="sub" data-parent="${escapeAttr(id)}">
              <thead>
                <tr>
                  <th style="width:5%;border-top-left-radius: 10px;height: 30px;">
                    <div class="col-title">Status</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">N° de plaque</div>
                  </th>
                  <th style="width:15%;">
                    <div class="col-title">Couleurs</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">Machine (position)</div>
                  </th>
                  <th style="width:15%">
                    <div class="col-title">Date de renouvrement</div>
                  </th>
                  <th style="width:15%;border-top-right-radius: 10px;">
                    <div class="col-title">Date d'ajout</div>
                  </th>
                </tr>
              </thead>
              <tbody class="sub-body"></tbody>
            </table>
          </div>
        </td>
      </tr>
    `);

    mainRow.addEventListener("click", (ev) => {
      if (ev.target.closest(".actions")) return;
      ev.stopPropagation();
      ev.preventDefault();

      if (mainRow.nextElementSibling !== subRow) {
        mainRow.insertAdjacentElement("afterend", subRow);
      }
      const currentlyOpen = subRow.getAttribute("aria-hidden") === "false";
      if (currentlyOpen) {
        subRow.setAttribute("aria-hidden", "true");
        subRow.style.display = "none";
        mainRow.classList.remove("expanded");
        mainRow.querySelector(".arrow")?.classList.remove("rotated");
      } else {
        const openSubs = document.querySelectorAll('tr.sub-row[aria-hidden="false"]');
        openSubs.forEach(s => {
          if (s === subRow) return;
          s.setAttribute("aria-hidden", "true");
          s.style.display = "none";
          const prev = s.previousElementSibling;
          if (prev && prev.classList.contains('main-row')) {
            prev.classList.remove("expanded");
            prev.querySelector(".arrow")?.classList.remove("rotated");
          }
        });

        subRow.setAttribute("aria-hidden", "false");
        subRow.style.display = "table-row";
        mainRow.classList.add("expanded");
        mainRow.querySelector(".arrow")?.classList.add("rotated");

        if (!subRow.dataset.listenersAttached) {
          const numeroInput = subRow.querySelector(".numero-plaque");
          const machineInput = subRow.querySelector(".machine");
          const dateRenovInput = subRow.querySelector(".date-renov");
          const dateCreationInput = subRow.querySelector(".date-creation");

          const loadPlaques = debounce(() => {
            const pf = {};
            if (numeroInput && numeroInput.value) pf.numero_plaque = numeroInput.value;
            if (machineInput && machineInput.value) pf.machine = machineInput.value;
            if (dateRenovInput && dateRenovInput.value) {
              pf.date_ren_from = dateRenovInput.value;
              pf.date_ren_to = dateRenovInput.value;
            }
            if (dateCreationInput && dateCreationInput.value) {
              pf.date_add_from = dateCreationInput.value;
              pf.date_add_to = dateCreationInput.value;
            }
            renderPlaquesForConception(id, subRow, pf);
          }, 350);

          [numeroInput, machineInput, dateRenovInput, dateCreationInput].forEach(inp => {
            if (!inp) return;
            inp.addEventListener("input", loadPlaques);
            inp.addEventListener("change", loadPlaques);
          });

          subRow.dataset.listenersAttached = "1";
        }

        renderPlaquesForConception(id, subRow, {});
      }
    });

    return { mainRow, subRow };
  }


  // Render plaques into provided subRow (same as previously)
  async function renderPlaquesForConception(conceptionId, subRowElement, filters = {}) {
    const subBody = subRowElement.querySelector(".sub-body");
    if (!subBody) return;
    subBody.innerHTML = `<tr class="loading-row"><td colspan="7">Chargement...</td></tr>`;

    try {
      const resp = await fetchPlaques(conceptionId, { filters, page: 1, page_size: DEFAULT_SUB_PAGE_SIZE });
      const items = Array.isArray(resp.items) ? resp.items : [];
      if (items.length === 0) {
        subBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#666;padding:8px;">Aucune plaque trouvée</td></tr>`;
        return;
      }
      subBody.innerHTML = "";
      for (const p of items) {
        const statutTxt = humanStatut(p.statut);
        const rowClass = statutClass(p.statut);
        const dateRen = formatDateISOToDDMMYYYY(p.date_renouvellement || "");
        const dateCreate = formatDateISOToDDMMYYYY(p.date_creation || p.date_ajout || "");

        // couleur si présente
        let colorDot = "";
        if (p.couleur) {
          const colorVal = String(p.couleur).trim();
          colorDot = `<span style="display:inline-block;width:20px;height:20px;background:${escapeHtml(colorVal)};border-radius:50%;margin-right:6px;"></span>`;
        }

        // Normaliser le statut pour comparaison (minuscules + suppression accents)
        const rawStatus = String(p.statut ?? statutTxt ?? "");
        const statusKey = rawStatus.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // choisir l'icône selon le statut (plusieurs variantes prises en compte)
        let iconSrc = "";
        if (/^en[_\s-]?stock$/.test(statusKey)) {
          iconSrc = "../img/icon/pointvert.png";
        } else if (/^en[_\s-]?impression$/.test(statusKey) || statusKey.includes('impression')) {
          iconSrc = "../img/icon/pointorange.png";
        } else if (/^indisponible$/.test(statusKey) || statusKey.includes('indisponible')) {
          iconSrc = "../img/icon/pointrouge.png";
        } else if (/^en[_\s-]?sous[_\s-]?traitance$/.test(statusKey) || (statusKey.includes('sous') && statusKey.includes('trait'))) {
          iconSrc = "../img/icon/pointsous.png";
        }  else if (/^en[_\s-]?sous[_\s-]?traitance$/.test(statusKey) || (statusKey.includes('quarantaine') && statusKey.includes('quarantaine'))) {
          iconSrc = "../img/icon/pointred.png";
        } else if (/commande|comande|command|commandees|commandées/.test(statusKey) || statusKey.includes('command')) {
          iconSrc = "../img/icon/pointbleu.png";
        }

        const iconHtml = iconSrc ? `<img class="status-pin" src="${escapeAttr(iconSrc)}" alt="" />` : "";

        const tr = el(`
          <tr class="${rowClass}">
            <td style="background-color: transparent !important;"><span class="status" style="background-color: black;color:white;font-weight:bold;border-radius:5px;padding-left:8px;padding-right:8px;">${iconHtml}${escapeHtml(statutTxt)}</span></td>
            <td style="background-color: transparent !important;">${escapeHtml(p.numero_plaque ?? "")}</td>
            <td style="background-color: transparent !important;">${colorDot}</td>
            <td style="background-color: transparent !important;">${escapeHtml(p.nom_machine ?? "")}</td>
            <td style="background-color: transparent !important;" data-date="${escapeAttr(p.date_renouvellement ?? "")}">${escapeHtml(dateRen)}</td>
            <td style="background-color: transparent !important;" data-date="${escapeAttr(p.date_creation ?? "")}">${escapeHtml(dateCreate)}</td>
          </tr>
        `);
        subBody.appendChild(tr);
      }
    } catch (err) {
      console.error(err);
      subBody.innerHTML = `<tr><td colspan="7" style="color:crimson">Erreur lors du chargement des plaques</td></tr>`;
    }
  }


  // ---------- Top-level render loop ----------
  const state = {
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    filters: {}
  };

  // find the main header inputs for the active container and read filters
  function readMainHeaderFilters() {
    const active = getActiveContainer();
    if (!active) return {};
    const mainSearchInputs = Array.from(active.querySelectorAll(".col-search[data-col]"));
    const f = {};
    mainSearchInputs.forEach(inp => {
      const col = inp.dataset.col;
      if (!col) return;
      const param = MAIN_FILTER_MAP[col];
      if (!param) return;
      const v = inp.value?.trim();
      if (v) f[param] = v;
    });
    state.filters = f;
    return f;
  }

  async function renderServerPagination(json) {
    try {
        const active = getActiveContainer();
        if (!active) return;
        const pagWrap = active.querySelector('.onglet-pagination .pagination');
        const countB = active.querySelector('.onglet-pagination p b');
        if (!pagWrap || !countB) return;

        const totalItems = Number(json.total || 0);
        const totalPlaques = Number(json.total_plaques || 0);  // Get the total plaques
        const page = Number(json.page || 1);
        const page_size = Number(json.page_size || DEFAULT_PAGE_SIZE);
        const totalPages = Math.max(1, Math.ceil(totalItems / page_size));
        pagWrap.innerHTML = '';

      function makeBtn(n) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.page = String(n);
        btn.textContent = String(n);
        if (n === page) btn.classList.add('active');
        btn.addEventListener('click', () => {
          state.page = n;
          renderMainList();
        });
        pagWrap.appendChild(btn);
      }
      function makeEll() {
        const ell = document.createElement('p'); ell.textContent = '.';
        pagWrap.appendChild(ell);
      }

      if (totalPages <= 9) {
        for (let i = 1; i <= totalPages; i++) makeBtn(i);
      } else {
        if (page <= 5) {
          for (let i = 1; i <= 7; i++) makeBtn(i);
          makeEll(); makeBtn(totalPages);
        } else if (page >= totalPages - 4) {
          makeBtn(1); makeEll();
          for (let i = totalPages - 6; i <= totalPages; i++) if (i > 0) makeBtn(i);
        } else {
          makeBtn(1); makeEll();
          for (let i = page - 2; i <= page + 2; i++) makeBtn(i);
          makeEll(); makeBtn(totalPages);
        }
      }

      countB.textContent = String(totalPlaques);
    } catch (e) {
      console.error("renderServerPagination error", e);
    }
  }

  async function renderMainList() {
    try {
      const active = getActiveContainer();
      if (!active) return;
      readMainHeaderFilters();

      // determine active tab index
      const onglets = Array.from(document.querySelectorAll('.all-onglets-container .btns-onglets .onglet'));
      const activeTabIndex = onglets.findIndex(t => t.classList.contains('active'));
      const base = (activeTabIndex === 1) ? BASE_SOUSTRAIT : BASE_MAIN;

      const mainTableBody = active.querySelector(".lignes-table");
      if (!mainTableBody) return;

      // show temporary loading row
      const thCount = (active.querySelectorAll('thead th') || []).length || 6;
      mainTableBody.innerHTML = `<tr><td colspan="${thCount}" style="text-align:center;padding:12px;color:#666;">Chargement...</td></tr>`;

      // fetch
      const json = await fetchConceptions({ page: state.page, page_size: state.page_size, filters: state.filters, base });
      const items = Array.isArray(json.items) ? json.items : [];

      // if empty -> show friendly message
      if (!items || items.length === 0) {
        mainTableBody.innerHTML = `<tr><td colspan="${thCount}" style="text-align:center;padding:12px;color:#666;">Aucune conception trouvée</td></tr>`;
        // update pagination/count as well
        await renderServerPagination(json);
        return;
      }

      // otherwise build rows
      mainTableBody.innerHTML = "";
      for (const c of items) {
        let nodes;
        if (activeTabIndex === 1) {
          nodes = buildMainAndSubRowsSousTrait(c);
        } else {
          nodes = buildMainAndSubRows(c);
        }
        nodes.subRow.setAttribute("aria-hidden", "true");
        nodes.subRow.style.display = "none";

        mainTableBody.appendChild(nodes.mainRow);
        mainTableBody.appendChild(nodes.subRow);
        
      }

      await renderServerPagination(json);

      if (typeof normalizeSubTableDates === 'function') try { normalizeSubTableDates(); } catch (e) { }
      if (typeof preventSortClicksOnFilters === 'function') try { preventSortClicksOnFilters(document); } catch (e) { }

    } catch (err) {
      console.error("renderMainList error:", err);
      const active = getActiveContainer();
      if (active) {
        const mainTableBody = active.querySelector(".lignes-table");
        if (mainTableBody) mainTableBody.innerHTML = `<tr><td colspan="${(active.querySelectorAll('thead th') || []).length || 6}" style="color:crimson">Impossible de charger les conceptions</td></tr>`;
      }
    }
  }


  // Wire header inputs (for all containers) with debounce
  function wireHeaderInputs() {
    const allInputs = Array.from(document.querySelectorAll('.all-onglets-container .col-search[data-col]'));
    const deb = debounce(() => {
      state.page = 1;
      renderMainList();
    }, 400);
    allInputs.forEach(inp => inp.addEventListener("input", deb));
  }

  // Listen to onglet changes to re-render (we don't replace table.js tab activation)
  function wireTabListeners() {
    const onglets = Array.from(document.querySelectorAll('.all-onglets-container .btns-onglets .onglet'));
    onglets.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        // small timeout to let table.js activate the container (if table.js also manages activation)
        setTimeout(() => {
          state.page = 1;
          renderMainList();
        }, 50);
      });
      tab.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          setTimeout(() => {
            state.page = 1;
            renderMainList();
          }, 50);
        }
      });
    });
  }

  // Initial boot
  wireHeaderInputs();
  wireTabListeners();
  renderMainList();
  // ---------- ACTION BUTTONS: delegation for view / edit / migrate ----------
  /* Handler "Voir" -> redirige vers newplaque.html?id_conception=... (URL relative pour rester correct en sous-dossier) */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn view, button.btn.view');
    if (!btn) return;
    const mainRow = btn.closest('tr.main-row');
    if (!mainRow) return;
    // fallback: dataset.id may be missing if backend uses a different key; try attribute
    const id = mainRow.dataset.id || mainRow.getAttribute('data-id');
    if (!id) return;
    const targetUrl = new URL('newplaque.html', window.location.href); // relative -> works in subfolders
    targetUrl.searchParams.set('id_conception', id);
    window.location.href = targetUrl.toString();
  });

  // --- EDIT button: rediriger vers newconception.html?id=... ---
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn.edit, button.btn.edit');
    if (!editBtn) return;
    // si le clic est sur une icône à l'intérieur du bouton, closest() gère ça.
    const mainRow = editBtn.closest('tr.main-row');
    if (!mainRow) return;
    const id = mainRow.dataset.id;
    if (!id) return;

    // Construire URL absolue pour éviter problèmes de chemin relatif
    const url = new URL(window.location.origin + '/frontend/Conception/newconception.html');

    // mettre le param attendu par newconception.js : 'id'
    url.searchParams.set('id', id);

    // ajouter aussi id_conception par sécurité (compatibilité)
    url.searchParams.set('id_conception', id);

    // Optionnel : ajouter mode edit
    url.searchParams.set('mode', 'edit');

    // navigation
    window.location.href = url.toString();
  });

  /* Handler "Migrate / supprimer (placeholder)" -> tu peux implémenter suppression ici si tu veux */
  document.addEventListener('click', (e) => {
    const migBtn = e.target.closest('.btn.migrate, button.btn.migrate');
    if (!migBtn) return;
    const mainRow = migBtn.closest('tr.main-row');
    if (!mainRow) return;
    const id = mainRow.dataset.id || mainRow.getAttribute('data-id');
    if (!id) return;
    // Par défaut on propose une confirmation et on peut rediriger ou appeler un endpoint.
    if (!confirm(`Confirmer l'opération pour la conception ${id} ?`)) return;
    // Exemple: redirection vers une page de migration (adapter selon backend)
    // const u = new URL('migrate_plaque.html', window.location.href);
    // u.searchParams.set('id_conception', id);
    // window.location.href = u.toString();
    // ou implémenter fetch DELETE/POST ici.
  });


  // migrate/delete button (si besoin -> on peut implémenter suppression ici)
  // document.addEventListener('click', (e) => { ... });

  // Expose for debug
  window.__plaques_front = {
    fetchConceptions,
    fetchPlaques,
    renderMainList,
    renderPlaquesForConception,
  };

})();
