(() => {
  /* ===========================
     Helpers : dates / texte
     =========================== */

  function pad(n){ return String(n).padStart(2,'0'); }
  function toISO(y,m,d){ return `${y}-${pad(m)}-${pad(d)}`; }

  // parse string to timestamp (ms) - utilisé pour détection de type
  function parseDateString(s){
    if(!s) return NaN;
    s = String(s).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const t = Date.parse(s);
      return isNaN(t) ? NaN : t;
    }
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
      const [d,m,y] = s.split('/');
      return Date.UTC(Number(y), Number(m)-1, Number(d));
    }
    const t = Date.parse(s);
    return isNaN(t) ? NaN : t;
  }

  // renvoie {y,m,d} ou null ; gère ISO (yyyy-mm-dd), FR (dd/mm/yyyy) et fallback Date.parse()
  function parseToYMD(s){
    if(!s) return null;
    s = String(s).trim();
    if(!s) return null;
    const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/;
    const fr  = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/;
    let m;
    if((m = iso.exec(s))) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    if((m = fr.exec(s)))  return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
    const t = Date.parse(s);
    if(isNaN(t)) return null;
    const dt = new Date(t);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function isNumericText(t){
    if(!t) return false;
    return !isNaN(parseFloat(String(t).replace(/[^\d\.\-]/g,'')));
  }

  function getRowCellText(row, colIndex){
    if(!row || typeof colIndex !== 'number') return '';
    const cell = row.cells && row.cells[colIndex];
    if(!cell) return '';
    return cell.innerText.trim();
  }

  /* ===========================
     Color helpers (sub-table special sorts)
     =========================== */

  function findColorElement(cell){
    if(!cell) return null;
    const dot = cell.querySelector('.dot, span[style*="background"], div[style*="background"]');
    if(dot) return dot;
    const firstSpan = cell.querySelector('span');
    if(firstSpan && window.getComputedStyle(firstSpan).backgroundColor !== 'rgba(0, 0, 0, 0)') return firstSpan;
    return null;
  }
  function parseRGBString(rgb){
    if(!rgb) return null;
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if(!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  function classifyColorFromElement(el){
    if(!el) return 'other';
    const cls = (el.className || '').toString();
    if(/\bok\b/.test(cls)) return 'green';
    if(/\bwarn\b/.test(cls)) return 'orange';
    if(/\berr\b/.test(cls)) return 'red';
    const comp = window.getComputedStyle(el).backgroundColor;
    const rgb = parseRGBString(comp);
    if(!rgb) return 'other';
    const [r,g,b] = rgb;
    const avg = (r+g+b)/3;
    if(avg < 30) return 'black';
    if(g >= r && g >= b && g > 40) return 'green';
    if(r > g && g > b && r > 120 && g > 80) return 'orange';
    if(r >= g && r >= b && r > 80 && g < r) return 'red';
    if(b > r && b > g) return 'blue';
    if(r > 100 && g > 60) return 'orange';
    return 'other';
  }
  function extractColorCategoryFromCell(cell){
    const el = findColorElement(cell);
    return classifyColorFromElement(el);
  }

  /* ===========================
     Sort icons helpers
     =========================== */

  function clearMainSortIcons(){ document.querySelectorAll('thead.main-head .sort-btn').forEach(b => b.classList.remove('asc','desc')); }
  function setMainSortIcon(colIndex, dir){
    clearMainSortIcons();
    const ths = Array.from(document.querySelectorAll('thead.main-head th'));
    const th = ths[colIndex];
    if(!th) return;
    const sb = th.querySelector('.sort-btn');
    if(sb) sb.classList.add(dir === 'asc' ? 'asc' : 'desc');
  }
  function clearSubSortIcons(table){ table.querySelectorAll('thead th .sort-btn').forEach(b => b.classList.remove('asc','desc')); }

  /* ===========================
     No-results helpers
     =========================== */

  function ensureMainNoResults(tbody){
    if(!tbody) return;
    let existing = tbody.querySelector('.no-results-row');
    if(existing){ existing.style.display = ''; return; }
    const tr = document.createElement('tr');
    tr.className = 'no-results-row';
    const td = document.createElement('td');
    td.colSpan = 4;
    td.innerText = "Aucun élément trouvé";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  function removeMainNoResults(tbody){ if(!tbody) return; const el = tbody.querySelector('.no-results-row'); if(el) el.remove(); }

  function ensureSubNoResults(table){
    if(!table) return;
    const tbody = table.tBodies[0];
    if(!tbody) return;
    let existing = tbody.querySelector('.sub-no-results-row');
    if(existing){ existing.style.display = ''; return; }
    const cols = table.querySelectorAll('thead th').length || 1;
    const tr = document.createElement('tr');
    tr.className = 'sub-no-results-row';
    const td = document.createElement('td');
    td.colSpan = cols;
    td.innerText = "Aucun élément trouvé";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  function removeSubNoResults(table){ if(!table) return; const tbody = table.tBodies[0]; if(!tbody) return; const el = tbody.querySelector('.sub-no-results-row'); if(el) el.remove(); }

  /* ===========================
     Main filters (inchangés)
     =========================== */

  function applyMainFilters(){
    const filters = Array.from(document.querySelectorAll('.col-search')).map(i => (i.value || '').trim().toLowerCase());
    const rows = Array.from(document.querySelectorAll('table.main tbody tr.main-row'));
    const tbody = document.querySelector('table.main tbody');
    let visibleCount = 0;
    rows.forEach(r=>{
      const c0 = (r.dataset.client || r.cells[0]?.innerText || '').toLowerCase();
      const c1 = (r.dataset.product || r.cells[1]?.innerText || '').toLowerCase();
      const c2 = (r.dataset.nb || r.cells[2]?.innerText || '').toLowerCase();
      const match = (filters[0] === '' || c0.includes(filters[0]))
                 && (filters[1] === '' || c1.includes(filters[1]))
                 && (filters[2] === '' || c2.includes(filters[2]));
      r.style.display = match ? '' : 'none';
      const sub = r.nextElementSibling;
      if(sub && sub.classList.contains('sub-row')) sub.style.display = match ? '' : 'none';
      if(match) visibleCount++;
    });

    if(visibleCount === 0) ensureMainNoResults(tbody); else removeMainNoResults(tbody);
  }

  /* ===========================
     Sub-table date normalization
     - remplit data-date="YYYY-MM-DD" sur les cellules des colonnes-date si possible
     - on l'appelle au chargement et quand des rows sont ajoutées
     =========================== */

  function normalizeSubTableDates(root = document){
    // pour chaque table.sub, chercher les inputs[type=date] pour connaître les colonnes-qui-sont-des-dates
    const tables = Array.from(root.querySelectorAll('table.sub'));
    tables.forEach(table => {
      const tbody = table.tBodies[0];
      if(!tbody) return;
      const dateInputs = Array.from(table.querySelectorAll('input[type="date"].sub-search'));
      if(dateInputs.length === 0) return;
      dateInputs.forEach(inp => {
        // si data-col présent, on le privilégie, sinon on calcule depuis le th parent
        const col = (inp.dataset && inp.dataset.col) ? Number(inp.dataset.col) : (inp.closest('th') ? inp.closest('th').cellIndex : null);
        if(col === null || isNaN(col)) return;
        Array.from(tbody.rows).forEach(row => {
          if(!row.cells || row.classList.contains('sub-no-results-row')) return;
          const cell = row.cells[col];
          if(!cell) return;
          // skip si déjà
          if(cell.dataset && cell.dataset.date) return;
          const raw = (cell.textContent || '').trim();
          const ymd = parseToYMD(raw);
          if(ymd){
            cell.dataset.date = toISO(ymd.y, ymd.m, ymd.d);
          } else {
            // si raw est déjà ISO
            if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) cell.dataset.date = raw;
          }
        });
      });
    });
  }

  /* ===========================
     Sub-table filtering (robuste date + text)
     - conserve tous les autres comportements
     =========================== */

  function applySubFiltersForTable(table){
    if(!table) return;
    const tbody = table.tBodies[0];
    if(!tbody) return;

    // tableau des inputs et valeurs
    const inputs = Array.from(table.querySelectorAll('.sub-search')).map(inp => ({
      elem: inp,
      value: (inp.value || '').trim()
    }));

    // lignes de données (exclure sub-no-results-row)
    const rows = Array.from(tbody.rows).filter(r => r.cells && !r.classList.contains('sub-no-results-row'));

    let visible = 0;
    rows.forEach(row => {
      let match = true;
      for(let i = 0; i < inputs.length; i++){
        const { elem, value } = inputs[i];
        if(!value) continue;
        // déterminer index de colonne (préférer data-col de l'input), sinon utiliser la <th> parente
        const colIndex = (elem.dataset && typeof elem.dataset.col !== 'undefined' && elem.dataset.col !== '') 
                         ? Number(elem.dataset.col) 
                         : (elem.closest('th') ? elem.closest('th').cellIndex : i);
        const cell = row.cells[colIndex];
        const cellText = cell ? (cell.textContent || '').trim() : '';

        // date input: strict match d'ISO
        if(elem.type === 'date'){
          const inputVal = value; // format YYYY-MM-DD si sélectionné par datepicker
          // récupérer dataset.date si défini, sinon tenter parseToYMD(cellText)
          let cellISO = cell && cell.dataset && cell.dataset.date ? cell.dataset.date : '';
          if(!cellISO){
            const c = parseToYMD(cellText);
            if(c) cellISO = toISO(c.y, c.m, c.d);
          }
          if(!cellISO || cellISO !== inputVal){ match = false; break; }
        } else {
          // si utilisateur a tapé ISO dans un champ texte -> comparer comme date
          if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
            const f = parseToYMD(value);
            const c = parseToYMD(cellText);
            if(!f || !c || f.y !== c.y || f.m !== c.m || f.d !== c.d){ match = false; break; }
          } else {
            // texte simple insensible à la casse
            if(!cellText.toLowerCase().includes(value.toLowerCase())){ match = false; break; }
          }
        }
      }
      row.style.display = match ? '' : 'none';
      if(match) visible++;
    });

    if(visible === 0) ensureSubNoResults(table); else removeSubNoResults(table);
  }

  /* ===========================
     Event delegation pour inputs (main & sub)
     - on conserve les filtres existants
     - on stoppe la propagation sur les inputs pour éviter le tri accidentel
     =========================== */

  // stopPropagation sur les inputs/éléments de filtre (pratique & sureté)
  function preventSortClicksOnFilters(root = document){
    const els = root.querySelectorAll('.col-filter input, .col-filter button, .col-filter img, .col-filter * , .sub-search');
    els.forEach(el => {
      el.addEventListener('click', (ev) => ev.stopPropagation());
      el.addEventListener('mousedown', (ev) => ev.stopPropagation());
      el.addEventListener('keydown', (ev) => ev.stopPropagation());
    });
  }


  document.addEventListener('input', (e) => {
    // main filters
    if(e.target.matches('.col-search')) {
      applyMainFilters();
    }

    // sub table
    if(e.target.matches('.sub-search')){
      // ensure dates normalisées (au cas où on a ajouté rows dynamiquement)
      normalizeSubTableDates();
      const table = e.target.closest('table.sub');
      if(table) applySubFiltersForTable(table);
    }
  });

  // change pour assurer le cas where browser sets the date on "change"
  document.addEventListener('change', (e) => {
    if(e.target.matches('.sub-search[type="date"]')){
      normalizeSubTableDates();
      const table = e.target.closest('table.sub');
      if(table) applySubFiltersForTable(table);
    }
  });

  /* ---------------------------
     Observer si lignes ajoutées dynamiquement
     --------------------------- */
  const mo = new MutationObserver((mutList) => {
    let need = false;
    for(const m of mutList){
      if(m.addedNodes && m.addedNodes.length) { need = true; break; }
    }
    if(need) normalizeSubTableDates();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* ===========================
     Expand / collapse rows (inchangé)
     =========================== */
  document.querySelectorAll('.actions, .actions *').forEach(el => el.addEventListener('click', e => e.stopPropagation()));

  function toggleRow(row){
    const expanded = row.classList.toggle('expanded');
    const subRow = row.nextElementSibling;
    if(subRow && subRow.classList.contains('sub-row')){
      subRow.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    }
  }

  document.querySelectorAll('tr.main-row').forEach(row=>{
    row.addEventListener('click', ()=> toggleRow(row));
    row.addEventListener('keydown', (e)=> {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        toggleRow(row);
      }
    });
  });

  /* ===========================
     Sorting : main table
     - ajout d'un guard pour ignorer les clics provenant des filtres
     =========================== */
  function detectColumnType(rows, colIndex){
    let total = 0, num = 0, date = 0;
    rows.forEach(r => {
      const txt = getRowCellText(r, colIndex);
      if(!txt) return;
      total++;
      if(isNumericText(txt)) num++;
      if(!isNaN(parseDateString(txt))) date++;
    });
    if(total === 0) return 'string';
    if(date / total >= 0.6) return 'date';
    if(num / total >= 0.6) return 'number';
    return 'string';
  }

  const mainTable = document.querySelector('table.main');
  if(mainTable){
    const mainThs = Array.from(document.querySelectorAll('thead.main-head th'));
    mainThs.forEach((th, colIndex) => {
      const colTitle = th.querySelector('.col-title');
      if(!colTitle) return;
      colTitle.style.cursor = 'pointer';
      colTitle.addEventListener('click', (e) => {
        // IGNORER les clics qui proviennent des inputs / zone de filtre
        if (e.target.closest('.col-filter') || e.target.closest('input, select, textarea, button, img')) {
          return;
        }
        e.stopPropagation();
        const tbody = mainTable.tBodies[0];
        const rows = Array.from(tbody.querySelectorAll('tr.main-row')).filter(r => r.style.display !== 'none');
        if(rows.length === 0) return;
        const type = detectColumnType(rows, colIndex);
        const curCol = mainTable.dataset.sortCol ? Number(mainTable.dataset.sortCol) : null;
        const curDir = mainTable.dataset.sortDir || null;
        let dir;
        if(curCol === colIndex) dir = curDir === 'asc' ? 'desc' : 'asc';
        else dir = (type === 'string') ? 'asc' : 'desc';
        mainTable.dataset.sortCol = colIndex; mainTable.dataset.sortDir = dir;

        rows.sort((a,b) => {
          const ta = ((a.dataset[['client','product','nb'][colIndex]] || a.cells[colIndex]?.innerText) || '').trim();
          const tb = ((b.dataset[['client','product','nb'][colIndex]] || b.cells[colIndex]?.innerText) || '').trim();
          if(type === 'number'){
            const na = parseFloat(String(ta).replace(/[^\d\.\-]/g,'')) || 0;
            const nb = parseFloat(String(tb).replace(/[^\d\.\-]/g,'')) || 0;
            return dir === 'asc' ? na - nb : nb - na;
          }
          if(type === 'date'){
            const da = parseDateString(ta) || 0;
            const db = parseDateString(tb) || 0;
            return dir === 'asc' ? da - db : db - da;
          }
          const sa = String(ta).toLowerCase();
          const sb = String(tb).toLowerCase();
          if(sa < sb) return dir === 'asc' ? -1 : 1;
          if(sa > sb) return dir === 'asc' ? 1 : -1;
          return 0;
        });

        const tbodyEl = mainTable.tBodies[0];
        rows.forEach(r => {
          const sub = r.nextElementSibling;
          tbodyEl.appendChild(r);
          if(sub && sub.classList.contains('sub-row')) tbodyEl.appendChild(sub);
        });

        setMainSortIcon(colIndex, dir);
      });
    });

    document.querySelectorAll('thead.main-head .sort-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const th = btn.closest('th');
        const thsList = Array.from(document.querySelectorAll('thead.main-head th'));
        const idx = thsList.indexOf(th);
        if(idx >= 0){
          const colTitle = th.querySelector('.col-title');
          if(colTitle) colTitle.click();
        }
      });
    });
  }

  /* ===========================
     Sub-tables sorting (special color cases)
     - guard pour ignorer clics venant des inputs/filtres
     =========================== */

  const availabilityOrderAsc = ['green','orange','red'];
  function availabilityIndex(category){
    const idx = availabilityOrderAsc.indexOf(category);
    return idx === -1 ? 999 : idx;
  }

  document.querySelectorAll('table.sub').forEach(table => {
    const ths = Array.from(table.querySelectorAll('thead th'));
    ths.forEach((th, colIndex) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e) => {
        // IGNORER les clics qui proviennent des inputs / zone de filtre
        if (e.target.closest('.col-filter') || e.target.matches('input, select, textarea, button, img')) {
          return;
        }
        e.stopPropagation();
        const tbody = table.tBodies[0];
        if(!tbody) return;

        // exclude possible sub-no-results-row and hidden rows
        const rows = Array.from(tbody.rows).filter(r => r.style.display !== 'none' && r.cells[colIndex] && !r.classList.contains('sub-no-results-row'));
        if(rows.length === 0){ ensureSubNoResults(table); return; }

        // disponibilité (col 0)
        if(colIndex === 0){
          const cur = table.dataset.sortCol ? Number(table.dataset.sortCol) : null;
          const curDir = table.dataset.sortDir || null;
          let dir = (cur === colIndex) ? (curDir === 'asc' ? 'desc' : 'asc') : 'asc';
          table.dataset.sortCol = colIndex; table.dataset.sortDir = dir;
          rows.sort((a,b) => {
            const ca = extractColorCategoryFromCell(a.cells[colIndex]);
            const cb = extractColorCategoryFromCell(b.cells[colIndex]);
            const ia = availabilityIndex(ca), ib = availabilityIndex(cb);
            return dir === 'asc' ? ia - ib : ib - ia;
          });
          rows.forEach(r => tbody.appendChild(r));
          clearSubSortIcons(table);
          const sb = th.querySelector('.sort-btn'); if(sb) sb.classList.add(dir === 'asc' ? 'asc' : 'desc');
          removeSubNoResults(table);
          return;
        }

        // "Couleurs" (index 3) => frequency sort
        if(colIndex === 3){
          const freq = {}; const colorOfRow = new Map();
          rows.forEach(r => {
            const cat = extractColorCategoryFromCell(r.cells[colIndex]);
            colorOfRow.set(r, cat);
            freq[cat] = (freq[cat]||0) + 1;
          });
          const cur = table.dataset.sortCol ? Number(table.dataset.sortCol) : null;
          const curDir = table.dataset.sortDir || null;
          let dir = (cur === colIndex) ? (curDir === 'asc' ? 'desc' : 'asc') : 'desc';
          table.dataset.sortCol = colIndex; table.dataset.sortDir = dir;
          rows.sort((a,b) => {
            const ca = colorOfRow.get(a), cb = colorOfRow.get(b);
            const fa = freq[ca] || 0, fb = freq[cb] || 0;
            if(fa !== fb) return dir === 'asc' ? fa - fb : fb - fa;
            if(ca < cb) return -1; if(ca > cb) return 1; return 0;
          });
          rows.forEach(r => tbody.appendChild(r));
          clearSubSortIcons(table);
          const sb = th.querySelector('.sort-btn'); if(sb) sb.classList.add(dir === 'asc' ? 'asc' : 'desc');
          removeSubNoResults(table);
          return;
        }

        // default sort (detecte type)
        const type = detectColumnType(rows, colIndex);
        const cur = table.dataset.sortCol ? Number(table.dataset.sortCol) : null;
        const curDir = table.dataset.sortDir || null;
        let dir = (cur === colIndex) ? (curDir === 'asc' ? 'desc' : 'asc') : (type === 'string' ? 'asc' : 'desc');
        table.dataset.sortCol = colIndex; table.dataset.sortDir = dir;

        rows.sort((a,b) => {
          const ta = getRowCellText(a, colIndex), tb = getRowCellText(b, colIndex);
          if(type === 'number'){
            const na = parseFloat(String(ta).replace(/[^\d\.\-]/g,'')) || 0;
            const nb = parseFloat(String(tb).replace(/[^\d\.\-]/g,'')) || 0;
            return dir === 'asc' ? na - nb : nb - na;
          }
          if(type === 'date'){
            // utilise parseDateString pour tolérance
            const da = parseDateString(ta) || 0;
            const db = parseDateString(tb) || 0;
            return dir === 'asc' ? da - db : db - da;
          }
          const sa = String(ta).toLowerCase(), sb = String(tb).toLowerCase();
          if(sa < sb) return dir === 'asc' ? -1 : 1;
          if(sa > sb) return dir === 'asc' ? 1 : -1;
          return 0;
        });

        rows.forEach(r => tbody.appendChild(r));
        clearSubSortIcons(table);
        const sb = th.querySelector('.sort-btn'); if(sb) sb.classList.add(dir === 'asc' ? 'asc' : 'desc');
        removeSubNoResults(table);
      });

      // délégation clic sur .col-title et .sort-btn
      const colTitle = th.querySelector('.col-title');
      if(colTitle) colTitle.addEventListener('click', (e)=>{ e.stopPropagation(); th.click(); });
      const localBtn = th.querySelector('.sort-btn');
      if(localBtn) localBtn.addEventListener('click', (e)=>{ e.stopPropagation(); th.click(); });
    });
  });

  /* ===========================
     Keyboard accessibilité
     =========================== */
  document.querySelectorAll('thead .col-title').forEach(el=>{
    el.setAttribute('tabindex','0');
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  /* ===========================
     Init
     =========================== */
  document.addEventListener('DOMContentLoaded', () => {
    // Normaliser les dates initiales
    normalizeSubTableDates();
    // stopper la propagation sur inputs/éléments de filtre (sécurité)
    preventSortClicksOnFilters(document);
    // Optionnel: appliquer les filtres courants sur les sub-tables (utile si inputs sont préremplis)
    document.querySelectorAll('table.sub').forEach(t => applySubFiltersForTable(t));
  });

})();