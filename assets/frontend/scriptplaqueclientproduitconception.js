    (function () {
        // éléments clés
        const modal = document.querySelector('.add-conception');
        if (!modal) return;
        const fileInput = modal.querySelector('.file-input');
        const fileUpload = modal.querySelector('.file-upload');
        const filesList = modal.querySelector('.files-conception');

        // icônes utilisées (conserve ton arborescence d'images)
        const ICON_IMAGE = 'img/icon/images.png';
        const ICON_FILE = 'img/icon/fichier.png';
        const ICON_VIEW = 'img/icon/vue.png';
        const ICON_DOWNLOAD = 'img/icon/telechargements.png';
        const ICON_DELETE = 'img/icon/supprimer2.png';

        // stockage interne des fichiers ajoutés (id -> { file, url })
        const filesStore = new Map();
        let nextFileId = 1;

        // utilitaires
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            const value = bytes / Math.pow(k, i);
            // 1 decimal for KB+ else integer for bytes
            return (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10) + ' ' + sizes[i];
        }

        function isImageFile(file) {
            return file && typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/');
        }

        // création d'une ligne dans l'UI pour un fichier
        function createFileRow(file, id) {
            const isImg = isImageFile(file);
            const row = document.createElement('div');
            row.className = 'file-conception';
            row.dataset.fileId = String(id);

            // description (left)
            const desc = document.createElement('div');
            desc.className = 'file-conception-desc';

            const logo = document.createElement('div');
            logo.className = 'logo-file';
            const imgIcon = document.createElement('img');
            imgIcon.src = isImg ? ICON_IMAGE : ICON_FILE;
            imgIcon.alt = isImg ? 'image' : 'file';
            logo.appendChild(imgIcon);

            const title = document.createElement('div');
            title.className = 'title-file';
            const h1 = document.createElement('h1');
            h1.textContent = file.name;
            const p = document.createElement('p');
            p.textContent = formatBytes(file.size);
            title.appendChild(h1);
            title.appendChild(p);

            desc.appendChild(logo);
            desc.appendChild(title);

            // buttons (right)
            const btns = document.createElement('div');
            btns.className = 'btns-file';

            // Voir (uniquement pour images)
            if (isImg) {
            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.title = 'Voir';
            viewBtn.dataset.action = 'view';
            const viewImg = document.createElement('img');
            viewImg.src = ICON_VIEW;
            viewImg.alt = 'voir';
            viewBtn.appendChild(viewImg);
            btns.appendChild(viewBtn);
            }

            // Télécharger
            const dlBtn = document.createElement('button');
            dlBtn.type = 'button';
            dlBtn.title = 'Télécharger';
            dlBtn.dataset.action = 'download';
            // style couleur positive (reuse existing pattern) - do not change style class itself
            dlBtn.style.backgroundColor = 'rgb(14, 92, 0)';
            const dlImg = document.createElement('img');
            dlImg.src = ICON_DOWNLOAD;
            dlImg.alt = 'download';
            dlBtn.appendChild(dlImg);
            btns.appendChild(dlBtn);

            // Supprimer
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.title = 'Supprimer';
            delBtn.dataset.action = 'delete';
            const delImg = document.createElement('img');
            delImg.src = ICON_DELETE;
            delImg.alt = 'delete';
            // keep default styling
            delBtn.appendChild(delImg);
            btns.appendChild(delBtn);

            row.appendChild(desc);
            row.appendChild(btns);

            return row;
        }

        // ajoute fichiers depuis un FileList / array of File
        function addFiles(fileList) {
            const files = Array.from(fileList || []);
            for (const f of files) {
            const id = nextFileId++;
            // créer URL objet
            const url = URL.createObjectURL(f);
            // stocker
            filesStore.set(String(id), { file: f, url });
            // créer ligne UI
            const row = createFileRow(f, id);
            // append en fin
            filesList.appendChild(row);
            }
            // reset input pour pouvoir resélectionner même fichier
            if (fileInput) fileInput.value = '';
        }

        // gestion drag & drop styles (ajoute la classe dragover)
        function setDragOver(on) {
            if (!fileUpload) return;
            if (on) fileUpload.classList.add('dragover');
            else fileUpload.classList.remove('dragover');
        }

        // handlers events pour buttons (délégué)
        filesList.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const row = btn.closest('.file-conception');
            if (!row) return;
            const id = row.dataset.fileId;
            const stored = filesStore.get(String(id));
            if (!stored) {
            // rien à faire
            return;
            }
            const file = stored.file;
            const url = stored.url;

            if (action === 'view') {
            // ouvrir aperçu image (lightbox)
            openImagePreview(url, file.name);
            return;
            }

            if (action === 'download') {
            // créer anchor et simuler click
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name || 'download';
            // Firefox nécessite appendChild
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
            }

            if (action === 'delete') {
            // suppression ligne + libération URL
            // pas de confirmation demandée - si tu veux en ajouter, fais confirm(...)
            URL.revokeObjectURL(url);
            filesStore.delete(String(id));
            row.remove();
            return;
            }
        });

        // lightbox / preview simple pour images
        let lightboxEl = null;
        function openImagePreview(url, filename) {
            // créer overlay si non existant
            if (lightboxEl) lightboxEl.remove();
            lightboxEl = document.createElement('div');
            lightboxEl.style.position = 'fixed';
            lightboxEl.style.left = '0';
            lightboxEl.style.top = '0';
            lightboxEl.style.width = '100vw';
            lightboxEl.style.height = '100vh';
            lightboxEl.style.background = 'rgba(0,0,0,0.75)';
            lightboxEl.style.display = 'flex';
            lightboxEl.style.alignItems = 'center';
            lightboxEl.style.justifyContent = 'center';
            lightboxEl.style.zIndex = '20000';
            lightboxEl.style.cursor = 'zoom-out';

            const container = document.createElement('div');
            container.style.maxWidth = '90%';
            container.style.maxHeight = '90%';
            container.style.background = 'transparent';
            container.style.borderRadius = '8px';
            container.style.overflow = 'auto';
            container.style.padding = '8px';
            container.style.boxSizing = 'border-box';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';

            const img = document.createElement('img');
            img.src = url;
            img.alt = filename || 'preview';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '80vh';
            img.style.borderRadius = '6px';
            img.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
            img.style.display = 'block';

            const caption = document.createElement('div');
            caption.textContent = filename || '';
            caption.style.color = 'white';
            caption.style.marginTop = '8px';
            caption.style.fontFamily = 'sans-serif';
            caption.style.fontSize = '14px';

            container.appendChild(img);
            container.appendChild(caption);
            lightboxEl.appendChild(container);

            // fermer au clic ou ESC
            lightboxEl.addEventListener('click', (ev) => {
            if (ev.target === lightboxEl) closeLightbox();
            });
            document.addEventListener('keydown', onKeyDown);

            document.body.appendChild(lightboxEl);

            function onKeyDown(e) {
            if (e.key === 'Escape') closeLightbox();
            }
            function closeLightbox() {
            if (!lightboxEl) return;
            lightboxEl.remove();
            lightboxEl = null;
            document.removeEventListener('keydown', onKeyDown);
            }
        }

        // drag & drop events on fileUpload
        if (fileUpload) {
            fileUpload.addEventListener('dragenter', (e) => {
            e.preventDefault(); e.stopPropagation();
            setDragOver(true);
            });
            fileUpload.addEventListener('dragover', (e) => {
            e.preventDefault(); e.stopPropagation();
            setDragOver(true);
            });
            fileUpload.addEventListener('dragleave', (e) => {
            e.preventDefault(); e.stopPropagation();
            // check if left the element entirely
            const rect = fileUpload.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                setDragOver(false);
            }
            });
            fileUpload.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            setDragOver(false);
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length) {
                addFiles(dt.files);
            }
            });
        }

        // input change
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
            const fl = e.target.files;
            if (fl && fl.length) addFiles(fl);
            });
        }

        // optionnel : vider les fichiers si on ferme la modal (libérer les URL)
        // on suppose que la croix a la classe .close-addconception
        const closeBtn = modal.querySelector('.close-addconception');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
            // libération
            filesStore.forEach((v) => {
                try { URL.revokeObjectURL(v.url); } catch (e) {}
            });
            filesStore.clear();
            // vider l'UI
            if (filesList) filesList.innerHTML = '';
            // reset input
            if (fileInput) fileInput.value = '';
            });
        }

        // si tu veux offrir une méthode pour récupérer les fichiers (ex: on submit),
        // expose une fonction sur l'élément modal :
        modal.getAttachedFiles = function () {
            // retourne un array de File objets
            const arr = [];
            filesStore.forEach((v) => arr.push(v.file));
            return arr;
        };

        // FIN du module
        })();



        document.addEventListener('DOMContentLoaded', () => {
            
            const imagesContainer = document.querySelector('.images-container');
            if (!imagesContainer) return;

            const addBtn = imagesContainer.querySelector('.addimage-product');

            // input file invisible (permet multi-upload)
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            // on l'ajoute dans le DOM (ici dans imagesContainer pour garder scope)
            imagesContainer.appendChild(fileInput);

            // Quand on clique sur le bouton +, on ouvre l'explorateur de fichiers
            addBtn.addEventListener('click', () => fileInput.click());

            // Quand l'utilisateur choisit des fichiers, on les lit et on crée des blocs
            fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                files.forEach(file => {
                if (!file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    const newBlock = createImageProductElement(dataUrl);
                    // on insère la nouvelle image juste avant le bouton + pour garder l'ordre
                    imagesContainer.insertBefore(newBlock, addBtn);
                };
                reader.readAsDataURL(file);
                });
                // reset pour pouvoir ré-uploader le même fichier si besoin
                fileInput.value = '';
            });

            // Délégation d'événements pour gérer les suppressions (fonctionne aussi pour éléments ajoutés dynamiquement)
            imagesContainer.addEventListener('click', (e) => {
                const clickedBtn = e.target.closest('button');
                if (!clickedBtn) return;
                // si on a cliqué sur le bouton +, ignorer (il a sa propre logique)
                if (clickedBtn.classList.contains('addimage-product')) return;
                const imageProduct = clickedBtn.closest('.image-product');
                if (imageProduct) imageProduct.remove();
            });

            // Fonction utilitaire : crée le DOM d'une image-product à partir d'un src (dataURL ou URL)
            function createImageProductElement(src) {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-product';

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                // si vous voulez styliser/sélectionner plus tard, ajoutez une classe, ex: delBtn.classList.add('delete-image-btn');

                const delIcon = document.createElement('img');
                delIcon.src = 'img/icon/supprimer1.png'; // icône de suppression (comme dans ton HTML)
                delIcon.alt = 'deleteProduct';
                delBtn.appendChild(delIcon);

                const img = document.createElement('img');
                img.src = src;
                img.alt = 'imageProduct';
                // optionnel : limiter la taille affichée pour garder la grille propre
                img.style.maxWidth = '120px';
                img.style.maxHeight = '120px';
                img.style.objectFit = 'cover';

                wrapper.appendChild(delBtn);
                wrapper.appendChild(img);

                return wrapper;
            }
            });


        document.addEventListener('DOMContentLoaded', () => {

            const overlay = document.querySelector('.filterblack');
            const modal3 = document.querySelector('.add-conception');
            if (!overlay || !modal3) return;

            // Assurer état initial caché (si ton CSS ne le fait pas déjà)
            overlay.style.display = 'none';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s ease';
            modal3.style.display = 'none';

            // Bouton de fermeture dans la modal
            const closeBtn = modal3.querySelector('.close-addconception');

            // Trouver le bouton "plus" du bloc client (on cible le choose-client-plaque qui concerne les clients)
            const conceptionChoose = document.querySelector('.choose-client-plaque');
            // On écoute tout bouton contenant une image "plus.png" DANS le bloc client (robuste si plusieurs variantes)
            const conceptionPlusBtn = document.getElementById('addConceptionBtn')

            function prefillModalFromMain() {
                // selecteurs du formulaire principal (hors modal)
                const mainClientInput = document.querySelector('.first-info .choose-client-plaque .input-choose input');
                const mainProductInput = document.querySelector('.first-info .choose-client-plaque ~ .clientproduit-plaque .choose-client-plaque .input-choose input')
                    || document.querySelectorAll('.first-info .choose-client-plaque .input-choose input')[1]; // fallback

                const suggestionsClient = document.querySelector('.first-info .suggestions-client') || document.querySelector('.suggestions-client');
                const suggestionsProduct = document.querySelector('.first-info .suggestions-product') || document.querySelector('.suggestions-product');

                // selecteurs dans la modal
                const modal = document.querySelector('.add-conception');
                if (!modal) return;
                const modalClientInput = modal.querySelector('.choose-client-plaque .input-choose input');
                const modalProductInput = modal.querySelector('.choose-client-plaque .input-choose input[type="text"]')
                    && modal.querySelectorAll('.choose-client-plaque .input-choose input')[1]; // safer fallback
                // better explicit:
                const modalInputs = modal.querySelectorAll('.choose-client-plaque .input-choose input');
                const modalClient = modalInputs[0];
                const modalProduct = modalInputs[1];

                function findValidSelection(inputEl, suggestionsEl) {
                    if (!inputEl) return null;
                    const text = (inputEl.value || '').trim();
                    if (!text) return null;

                    // 1) si l'input a un data-* (ex: data-value / data-id) c'est considéré valide
                    if (inputEl.dataset && (inputEl.dataset.value || inputEl.dataset.id || inputEl.dataset.selectedId)) {
                    return {
                        text,
                        id: inputEl.dataset.value || inputEl.dataset.id || inputEl.dataset.selectedId
                    };
                    }

                    // 2) sinon, recherche dans la boîte de suggestions une option correspondant au texte
                    if (suggestionsEl) {
                    // chercher item avec aria-selected / selected class / data-value match OR text exact
                    const items = Array.from(suggestionsEl.querySelectorAll('[role="option"], .option, div'));
                    for (const it of items) {
                        const itText = (it.textContent || it.innerText || '').trim();
                        const itData = it.dataset && (it.dataset.value || it.dataset.id);
                        const ariaSel = it.getAttribute && it.getAttribute('aria-selected');
                        const clsSel = it.classList && (it.classList.contains('selected') || it.classList.contains('active'));
                        if ((ariaSel === 'true') || clsSel) {
                        // priorité: aria-selected / selected class => valid
                        return { text: itText || text, id: itData || undefined };
                        }
                        // otherwise if text equals
                        if (itText && itText === text) {
                        return { text: itText, id: itData || undefined };
                        }
                    }
                    }

                    // 3) fallback : si aucune preuve de sélection dans les suggestions, on considère que ce n'est pas "choisi parmi les suggestions"
                    return null;
                }

                // vérifier client
                const selClient = findValidSelection(mainClientInput, suggestionsClient);
                if (selClient && modalClient) {
                    modalClient.value = selClient.text;
                    // copier id dans dataset si présent (utile pour la logique d'auto-complete)
                    if (selClient.id) modalClient.dataset.value = selClient.id;
                    // déclencher event input pour que l'autocomplete du modal réagisse
                    modalClient.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // vérifier produit
                const selProduct = findValidSelection(mainProductInput, suggestionsProduct);
                if (selProduct && modalProduct) {
                    modalProduct.value = selProduct.text;
                    if (selProduct.id) modalProduct.dataset.value = selProduct.id;
                    modalProduct.dispatchEvent(new Event('input', { bubbles: true }));
                }
                }


            // Utilities
            function disablePageScroll() { document.body.style.overflow = 'hidden'; }
            function enablePageScroll() { document.body.style.overflow = ''; }

            function showOverlay() {
                overlay.style.display = 'block';
                // force layout pour que la transition prenne
                requestAnimationFrame(() => {
                overlay.style.opacity = '0.8';
                });
            }
            function hideOverlay() {
                overlay.style.opacity = '0';
                overlay.addEventListener('transitionend', function t(e) {
                if (e.propertyName === 'opacity') {
                    overlay.style.display = 'none';
                    overlay.removeEventListener('transitionend', t);
                }
                });
            }

            function showModal() {
                // si déjà visible, rien
                if (modal3.style.display === 'block') return;
                // disable scroll
                disablePageScroll();
                showOverlay();

                // préparer l'animation (animate.css)
                modal3.classList.remove('animate__animated','animate__fadeInUp');
                modal3.style.display = 'block';

                // petite attente pour s'assurer que display:block est appliqué puis ajouter la classe d'animation
                requestAnimationFrame(() => {
                modal3.classList.add('animate__animated','animate__fadeInUp');
                });

                // retirer la classe d'animation à la fin pour pouvoir la rejouer plus tard
                function onAnimEnd() {
                modal3.classList.remove('animate__animated');
                modal3.classList.remove('animate__fadeInUp');
                modal3.removeEventListener('animationend', onAnimEnd);
                }
                modal3.addEventListener('animationend', onAnimEnd);
            }

            function hideModal() {
                if (modal3.style.display !== 'block') return;
                // réactiver scroll
                enablePageScroll();
                // masquer overlay
                hideOverlay();
                // masquer modal (pas d'animation de sortie demandée)
                modal3.style.display = 'none';
                // s'assurer de retirer classes d'animation
                modal3.classList.remove('animate__animated','animate__fadeInUp');
            }

            // Si le bouton existe, binder le clic
            if (conceptionPlusBtn) {
                conceptionPlusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                prefillModalFromMain();
                showModal();
                });
            }

            // Aussi binder le premier bouton "add client" (au cas où l'autre bouton n'existe pas)
            if (!conceptionPlusBtn && conceptionChoose) {
                const firstBtn = productChoose.querySelector('button');
                if (firstBtn) firstBtn.addEventListener('click', (e) => { e.preventDefault(); showModal(); });
            }

            // fermer via la croix
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });
            }

            // fermer via clic sur overlay (mais éviter de fermer si on clique dans la modal)
            overlay.addEventListener('click', (e) => {
                hideModal();
            });

            // fermer avec ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideModal();
            });

            // Si tu veux aussi fermer quand on clique sur un bouton "annuler" inside modal, tu peux ajouter:
            const cancelBtn = modal3.querySelector('button[aria-label="cancel"], button.cancel, .btn-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });

        });


        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.infosupp-form-product').forEach(section => {
            // On considère que le premier <span> sert d'en-tête cliquable
            const header = section.querySelector('span');
            const arrow = header ? header.querySelector('img') : null;

            // accessible
            header && header.setAttribute('role', 'button');
            header && header.setAttribute('tabindex', '0');
            header && header.setAttribute('aria-expanded', 'false');

            const toggle = () => {
            section.classList.toggle('show');
            const opened = section.classList.contains('show');
            header.setAttribute('aria-expanded', opened ? 'true' : 'false');

            // petite rotation de la flèche si elle existe
            if (arrow) arrow.style.transform = opened ? 'rotate(180deg)' : 'rotate(0deg)';
            };

            // clic souris
            header && header.addEventListener('click', (e) => {
            // empêche le toggle si on clique dans la zone .desc-form-product (au cas où)
            if (e.target.closest('.desc-form-product')) return;
            toggle();
            });

            // support clavier (Enter / Espace)
            header && header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
            });
            });

            const overlay = document.querySelector('.filterblack');
            const modal2 = document.querySelector('.add-product');
            if (!overlay || !modal2) return;

            // Assurer état initial caché (si ton CSS ne le fait pas déjà)
            overlay.style.display = 'none';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s ease';
            modal2.style.display = 'none';

            // Bouton de fermeture dans la modal
            const closeBtn = modal2.querySelector('.close-addproduct');

            // Trouver le bouton "plus" du bloc client (on cible le choose-client-plaque qui concerne les clients)
            const productChoose = document.querySelector('.choose-client-plaque');
            // On écoute tout bouton contenant une image "plus.png" DANS le bloc client (robuste si plusieurs variantes)
            const productPlusBtn = document.getElementById('addProductNew')

            // Utilities
            function disablePageScroll() { document.body.style.overflow = 'hidden'; }
            function enablePageScroll() { document.body.style.overflow = ''; }

            function showOverlay() {
                overlay.style.display = 'block';
                // force layout pour que la transition prenne
                requestAnimationFrame(() => {
                overlay.style.opacity = '0.8';
                });
            }
            function hideOverlay() {
                overlay.style.opacity = '0';
                overlay.addEventListener('transitionend', function t(e) {
                if (e.propertyName === 'opacity') {
                    overlay.style.display = 'none';
                    overlay.removeEventListener('transitionend', t);
                }
                });
            }

            function showModal() {
                // si déjà visible, rien
                if (modal2.style.display === 'block') return;
                // disable scroll
                disablePageScroll();
                showOverlay();

                // préparer l'animation (animate.css)
                modal2.classList.remove('animate__animated','animate__fadeInUp');
                modal2.style.display = 'block';

                // petite attente pour s'assurer que display:block est appliqué puis ajouter la classe d'animation
                requestAnimationFrame(() => {
                modal2.classList.add('animate__animated','animate__fadeInUp');
                });

                // retirer la classe d'animation à la fin pour pouvoir la rejouer plus tard
                function onAnimEnd() {
                modal2.classList.remove('animate__animated');
                modal2.classList.remove('animate__fadeInUp');
                modal2.removeEventListener('animationend', onAnimEnd);
                }
                modal2.addEventListener('animationend', onAnimEnd);
            }

            function hideModal() {
                if (modal2.style.display !== 'block') return;
                // réactiver scroll
                enablePageScroll();
                // masquer overlay
                hideOverlay();
                // masquer modal (pas d'animation de sortie demandée)
                modal2.style.display = 'none';
                // s'assurer de retirer classes d'animation
                modal2.classList.remove('animate__animated','animate__fadeInUp');
            }

            // Si le bouton existe, binder le clic
            if (productPlusBtn) {
                productPlusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showModal();
                });
            }

            // Aussi binder le premier bouton "add client" (au cas où l'autre bouton n'existe pas)
            if (!productPlusBtn && productChoose) {
                const firstBtn = productChoose.querySelector('button');
                if (firstBtn) firstBtn.addEventListener('click', (e) => { e.preventDefault(); showModal(); });
            }

            // fermer via la croix
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });
            }

            // fermer via clic sur overlay (mais éviter de fermer si on clique dans la modal)
            overlay.addEventListener('click', (e) => {
                hideModal();
            });

            // fermer avec ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideModal();
            });

            // Si tu veux aussi fermer quand on clique sur un bouton "annuler" inside modal, tu peux ajouter:
            const cancelBtn = modal2.querySelector('button[aria-label="cancel"], button.cancel, .btn-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });

            });


        (function(){
            const toggle = document.getElementById('selectToggle');
            const dropdown = document.getElementById('selectDropdown');
            const search = document.getElementById('selectSearch');
            const select = document.getElementById('conceptionSelect');
            const selectedThumb = select.querySelector('.selected-thumb');
            const selectedLabel = select.querySelector('.selected-label');

            // ouvrir / fermer
            function openDropdown(){
                dropdown.style.display = 'block';
                toggle.setAttribute('aria-expanded','true');
                dropdown.setAttribute('aria-hidden','false');
                search.focus();
            }
            function closeDropdown(){
                dropdown.style.display = 'none';
                toggle.setAttribute('aria-expanded','false');
                dropdown.setAttribute('aria-hidden','true');
                toggle.focus();
            }

            toggle.addEventListener('click', e => {
                e.stopPropagation();
                if (dropdown.style.display === 'block') closeDropdown(); else openDropdown();
            });

            // clique sur option
            document.querySelectorAll('.option').forEach(opt=>{
                opt.addEventListener('click', ()=>{
                const img = opt.querySelector('img').getAttribute('src');
                const text = opt.querySelector('.option-text').textContent;
                const value = opt.getAttribute('data-value') || text;

                // mettre la selection visible
                selectedThumb.setAttribute('src', img);
                selectedLabel.textContent = text;
                // tu peux stocker la valeur dans un input caché si besoin:
                // document.getElementById('hiddenConceptionInput').value = value;

                closeDropdown();
                });
            });

            // recherche (filter)
            search.addEventListener('input', ()=>{
                const q = search.value.trim().toLowerCase();
                document.querySelectorAll('.option').forEach(opt=>{
                const txt = opt.querySelector('.option-text').textContent.toLowerCase();
                opt.style.display = txt.includes(q) ? 'flex' : 'none';
                });
            });

            // fermer si clique en dehors
            document.addEventListener('click', (e)=>{
                if (!select.contains(e.target)) closeDropdown();
            });

            // keyboard: open/close avec clavier
            select.addEventListener('keydown', (e)=>{
                if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle.click(); }
                if (e.key === 'Escape') closeDropdown();
            });
        })();


        document.addEventListener('DOMContentLoaded', () => {
            const plaqueAdded = document.querySelector('.plaque-added');
            const addBtn = document.querySelector('.btnadd-plaque button'); // bouton existant : Ajouter la plaque
            // container pour ajouter le bouton "Enregistrer la modification"
            const btnContainer = document.querySelector('.btnadd-plaque');
            const numInput = document.querySelector('.ecrit-num-plaque input[type="number"]');
            const typeBlocks = document.querySelectorAll('.choose-type-plaque');
            const colorInput = document.querySelector('.container-couleur-pose-plaque input[type="color"]');
            const posesInput = document.querySelector('.inputnombre');
            const machineSelect = document.querySelector('.machine-select');
            const statutSelect = document.querySelector('.statut-select');
            const rightInfo = document.querySelector('.right-info');

            let currentEditingContainer = null;
            function normalizeText(s){ return (s||'').trim(); }

            // --- Création / gestion du bouton "Enregistrer la modification" ---
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn-save-plaque';
            saveBtn.style.display = 'none'; // caché par défaut
            saveBtn.style.marginLeft = '8px';
            saveBtn.disabled = true;
            // style visuel par défaut (désactivé)
            saveBtn.style.backgroundColor = 'gray';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.style.borderRadius = '6px';
            saveBtn.style.padding = '6px 10px';
            saveBtn.style.cursor = 'not-allowed';
            saveBtn.style.opacity = '0.5'; // **opacity 0.5 quand disabled**
            // contenu
            const saveImg = document.createElement('img');
            saveImg.src = 'img/icon/sauvegarder.png';
            saveImg.alt = '';
            saveImg.style.width = '13px';
            saveImg.style.height = '13px';
            saveImg.style.filter = 'invert(100%)';
            saveImg.style.marginRight = '8px';
            saveBtn.appendChild(saveImg);
            saveBtn.appendChild(document.createTextNode('Enregistrer la modification'));
            if (btnContainer) btnContainer.appendChild(saveBtn);

            // active le bouton save (vert foncé) et rend cliquable
            function enableSaveButton() {
                saveBtn.disabled = false;
                saveBtn.style.backgroundColor = 'rgb(14, 92, 0)'; // vert foncé
                saveBtn.style.cursor = 'pointer';
                saveBtn.style.opacity = '1'; // pleine opacité quand actif
            }
            // désactive et garde visible
            function disableSaveButton() {
                saveBtn.disabled = true;
                saveBtn.style.backgroundColor = 'gray';
                saveBtn.style.cursor = 'not-allowed';
                saveBtn.style.opacity = '0.5'; // opacité réduite quand disabled
            }
            // cacher complètement (après enregistrement ou annulation)
            function hideSaveButton() {
                saveBtn.style.display = 'none';
                disableSaveButton();
            }
            // montrer (quand on ouvre une plaque) en état désactivé
            function showSaveButton() {
                saveBtn.style.display = 'inline-flex';
                disableSaveButton();
            }

            // reset du formulaire d'ajout/modif — remet tout à l'état initial
            function resetPlaqueForm() {
                if (numInput) numInput.value = '';
                if (posesInput) posesInput.value = '';
                if (colorInput) {
                    try { colorInput.value = '#000000'; } catch(e) { /* ignore */ }
                }
                if (machineSelect) machineSelect.value = '';
                if (statutSelect) statutSelect.value = 'Disponible';
                typeBlocks.forEach(block => {
                    const radio = block.querySelector('input[type="radio"]');
                    if (radio) radio.checked = false;
                });
                currentEditingContainer = null;
                // addBtn text should always be "Ajouter la plaque"
                updateAddButtonText();
                hideSaveButton();
            }

            // helper: rgb(...) or rgba(...) --> #rrggbb
            function _componentToHex(c){ const n = Number(c); const hex = n.toString(16); return hex.length === 1 ? '0' + hex : hex; }
            function rgbStringToHex(rgb){
                if(!rgb || typeof rgb !== 'string') return '';
                rgb = rgb.trim();
                if(rgb === 'transparent' || rgb === 'none' || rgb === '') return '';
                const m = rgb.match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
                if(!m) {
                    if(rgb[0] === '#') return rgb;
                    return '';
                }
                return '#' + _componentToHex(m[1]) + _componentToHex(m[2]) + _componentToHex(m[3]);
            }

            function updateEmptyMessage(){
                const existing = plaqueAdded.querySelectorAll('.plaque-added-container').length;
                let msg = plaqueAdded.querySelector('.empty-message');
                if(existing === 0){
                    if(!msg){
                        msg = document.createElement('div');
                        msg.className = 'empty-message';
                        msg.textContent = 'Aucune plaque ajouter';
                        plaqueAdded.appendChild(msg);
                    }
                } else {
                    if(msg) msg.remove();
                }
            }

            function colorForStatus(status){
                if(!status) return 'gray';
                const s = status.toLowerCase().trim();
                if (s.includes('indis')) return 'red';
                if (s.includes('en cours') || s.includes('encours')) return 'orange';
                if (s.includes('dispon')) return 'green';
                return 'gray';
            }

            // animation right-info (animate.css classes)
            function animateRightInfo(){
                if(!rightInfo) return;
                rightInfo.classList.remove('animate__animated','animate__bounceIn');
                void rightInfo.offsetWidth;
                rightInfo.classList.add('animate__animated','animate__bounceIn');
                function cleanup(){
                    rightInfo.classList.remove('animate__animated','animate__bounceIn');
                    rightInfo.removeEventListener('animationend', cleanup);
                }
                rightInfo.addEventListener('animationend', cleanup);
            }

            // construit le contenu gauche (status + infos) d'une ligne, en utilisant data-*
            function buildLeftContent(container){
                const leftPold = container.querySelector('.left-plaque-added p');
                if((!container.dataset.num || !container.dataset.type) && leftPold){
                    const parts = leftPold.textContent.split('|').map(s => s.trim());
                    if(parts[0]) container.dataset.num = parts[0];
                    if(parts[1]) container.dataset.type = parts[1];
                    if(parts[2]) container.dataset.poses = parts[2].replace('poses','').trim();
                    if(parts[3]) container.dataset.machine = parts[3];
                    if(parts[4] && parts[4].toLowerCase().startsWith('statut')) container.dataset.status = parts[4].replace(/statut[:\s]*/i,'').trim();
                }

                // try to ensure dataset.color exists: if missing, try to read from rightDiv computed style
                if(!container.dataset.color){
                    const rightDiv = container.querySelector('.right-plaque-added');
                    if(rightDiv){
                        const bg = getComputedStyle(rightDiv).backgroundColor;
                        const hex = rgbStringToHex(bg);
                        if(hex) container.dataset.color = hex;
                    }
                }

                const num = container.dataset.num || '';
                const type = container.dataset.type || '';
                const poses = container.dataset.poses || '';
                const machine = container.dataset.machine || '';
                const status = container.dataset.status || 'Disponible';

                const leftDiv = container.querySelector('.left-plaque-added');
                if(!leftDiv) return;
                leftDiv.innerHTML = '';

                const p = document.createElement('p');
                p.style.margin = '0';

                const spanPin = document.createElement('span');
                spanPin.className = 'status-pin';
                spanPin.style.backgroundColor = colorForStatus(status);
                spanPin.style.display = 'inline-block';
                spanPin.style.width = '10px';
                spanPin.style.height = '10px';
                spanPin.style.borderRadius = '50%';
                spanPin.style.marginRight = '8px';
                spanPin.style.verticalAlign = 'middle';
                spanPin.dataset.role = 'status-pin';

                const spanLabel = document.createElement('span');
                spanLabel.className = 'status-label';
                spanLabel.textContent = status;
                spanLabel.style.marginRight = '12px';
                spanLabel.style.fontWeight = '600';
                spanLabel.style.verticalAlign = 'middle';

                const spanNum = document.createElement('span');
                spanNum.className = 'meta-num';
                spanNum.textContent = num;
                spanNum.style.marginRight = '8px';
                spanNum.style.verticalAlign = 'middle';

                const spanType = document.createElement('span');
                spanType.className = 'meta-type';
                spanType.textContent = type;
                spanType.style.marginRight = '8px';
                spanType.style.verticalAlign = 'middle';

                const spanPoses = document.createElement('span');
                spanPoses.className = 'meta-poses';
                spanPoses.textContent = `${poses} poses`;
                spanPoses.style.marginRight = '8px';
                spanPoses.style.verticalAlign = 'middle';

                const spanMachine = document.createElement('span');
                spanMachine.className = 'meta-machine';
                spanMachine.textContent = machine;
                spanMachine.style.marginRight = '8px';
                spanMachine.style.verticalAlign = 'middle';

                p.appendChild(spanPin);
                p.appendChild(spanLabel);
                p.appendChild(spanNum);
                p.appendChild(spanType);
                p.appendChild(spanPoses);
                p.appendChild(spanMachine);

                leftDiv.appendChild(p);
            }

            // ouverture en mode édition : affiche le bouton save (désactivé) et pré-remplit le formulaire
            function openForEdit(container){
                if(!container) return;
                buildLeftContent(container);
                const num = container.dataset.num || '';
                const type = container.dataset.type || '';
                const poses = container.dataset.poses || '';
                const machine = container.dataset.machine || '';
                const status = container.dataset.status || '';

                if(numInput) numInput.value = num;

                typeBlocks.forEach(block => {
                    const p = block.querySelector('p');
                    const radio = block.querySelector('input[type="radio"]');
                    if(p && radio) radio.checked = (p.textContent.trim() === type);
                });

                if(posesInput) posesInput.value = poses;
                if(machineSelect){
                    const opt = Array.from(machineSelect.options).find(o => o.text === machine || o.value === machine);
                    if(opt) machineSelect.value = opt.value;
                    else machineSelect.value = '';
                }
                if(statutSelect){
                    const opt = Array.from(statutSelect.options).find(o => o.text === status || o.value === status);
                    if(opt) statutSelect.value = opt.value;
                    else statutSelect.value = 'Disponible';
                }

                // --- load color into colorInput properly ---
                let hex = container.dataset.color || '';
                const rightDiv = container.querySelector('.right-plaque-added');
                if(!hex && rightDiv){
                    const bg = getComputedStyle(rightDiv).backgroundColor;
                    hex = rgbStringToHex(bg);
                }
                if(hex) {
                    try { colorInput.value = hex; } catch(e) { /* ignore invalid */ }
                } else {
                    try { colorInput.value = '#000000'; } catch(e) {}
                }

                currentEditingContainer = container;
                // show save button (disabled until change)
                showSaveButton();
                animateRightInfo();
            }

            function attachDelete(btn){
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const container = btn.closest('.plaque-added-container');
                    if(!container) return;
                    const confirmed = confirm("Confirmer la suppression de cette plaque ?");
                    if(!confirmed) return;
                    if(currentEditingContainer === container){
                        currentEditingContainer = null;
                        resetPlaqueForm();
                    }
                    container.remove();
                    updateEmptyMessage();
                });
            }

            function attachEdit(btn){
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const container = btn.closest('.plaque-added-container');
                    if(!container) return;
                    openForEdit(container);
                });
            }

            // addBtn doit uniquement ajouter (ne gère plus l'édition)
            function updateAddButtonText(){
                if (!addBtn) return;
                addBtn.textContent = '';
                const img = document.createElement('img');
                img.src = 'img/icon/addfleche.png';
                img.alt = '';
                img.style.width = '16px';
                img.style.height = '16px';
                img.style.marginRight = '8px';
                addBtn.appendChild(img);
                addBtn.appendChild(document.createTextNode('Ajouter la plaque'));
            }

            function isDuplicateNumber(num, excludeContainer = null){
                const containers = plaqueAdded.querySelectorAll('.plaque-added-container');
                for(const c of containers){
                    if(excludeContainer && c === excludeContainer) continue;
                    const existingNum = (c.dataset.num || (c.querySelector('.left-plaque-added p') ? c.querySelector('.left-plaque-added p').textContent.split('|')[0].trim() : '')).trim();
                    if(normalizeText(existingNum) === normalizeText(num)) return true;
                }
                return false;
            }

            // --- détecte modifications sur le formulaire pour activer le bouton Save ---
            function onFormChange() {
                // si on est en mode édition, active le saveBtn
                if (!currentEditingContainer) return;
                enableSaveButton();
            }
            // attacher listeners aux champs du formulaire
            if (numInput) numInput.addEventListener('input', onFormChange);
            if (colorInput) colorInput.addEventListener('input', onFormChange);
            if (posesInput) posesInput.addEventListener('input', onFormChange);
            if (machineSelect) machineSelect.addEventListener('change', onFormChange);
            if (statutSelect) statutSelect.addEventListener('change', onFormChange);
            // radios
            typeBlocks.forEach(block => {
                const r = block.querySelector('input[type="radio"]');
                if (r) r.addEventListener('change', onFormChange);
            });

            // initialisation : normaliser les lignes existantes et attacher handlers
            plaqueAdded.querySelectorAll('.plaque-added-container').forEach(c => {
                const leftP = c.querySelector('.left-plaque-added p');
                if(leftP && (!c.dataset.num || !c.dataset.type)){
                    const parts = leftP.textContent.split('|').map(s => s.trim());
                    if(parts[0]) c.dataset.num = parts[0];
                    if(parts[1]) c.dataset.type = parts[1];
                    if(parts[2]) c.dataset.poses = parts[2].replace('poses','').trim();
                    if(parts[3]) c.dataset.machine = parts[3];
                    if(parts[4] && parts[4].toLowerCase().startsWith('statut')) c.dataset.status = parts[4].replace(/statut[:\s]*/i,'').trim();
                }

                // ensure dataset.color is set from rightDiv computed style if present
                const rightDiv = c.querySelector('.right-plaque-added');
                if(rightDiv && !c.dataset.color){
                    const bg = getComputedStyle(rightDiv).backgroundColor;
                    const hex = rgbStringToHex(bg);
                    if(hex) c.dataset.color = hex;
                }

                // remove any old status-pin in right
                const rightPin = c.querySelector('.right-plaque-added .status-pin');
                if(rightPin) rightPin.remove();

                buildLeftContent(c);

                const del = c.querySelector('.delete-plaque-added');
                if(del){
                    const newDel = del.cloneNode(true);
                    del.parentNode.replaceChild(newDel, del);
                    attachDelete(newDel);
                }
                if(!c.querySelector('.edit-plaque-added')){
                    const editBtn = document.createElement('button');
                    editBtn.className = 'edit-plaque-added';
                    editBtn.style.width = '20px';
                    editBtn.style.height = '20px';
                    editBtn.style.backgroundColor = 'rgb(0,128,0)';
                    editBtn.style.border = 'none';
                    editBtn.style.display = 'flex';
                    editBtn.style.justifyContent = 'center';
                    editBtn.style.alignItems = 'center';
                    editBtn.style.borderRadius = '20px';
                    editBtn.style.position = 'absolute';
                    editBtn.style.top = '-5px';
                    editBtn.style.right = '16px';
                    editBtn.style.cursor = 'pointer';
                    const editImg = document.createElement('img');
                    editImg.src = 'img/icon/editer.png';
                    editImg.alt = 'edit';
                    editImg.style.width = '10px';
                    editImg.style.height = '10px';
                    editImg.style.filter = 'invert(0%)';
                    editBtn.appendChild(editImg);
                    c.appendChild(editBtn);
                    attachEdit(editBtn);
                } else {
                    attachEdit(c.querySelector('.edit-plaque-added'));
                }

                // clicking on whole container opens edit
                c.addEventListener('click', (e) => {
                    if(e.target.closest('.delete-plaque-added') || e.target.closest('.edit-plaque-added')) return;
                    openForEdit(c);
                });
            });

            // Add button: uniquement ajout
            addBtn.addEventListener('click', () => {
                const num = numInput ? numInput.value.trim() : '';
                const type = (() => {
                    let choice = '';
                    typeBlocks.forEach(block => {
                        const radio = block.querySelector('input[type="radio"]');
                        const p = block.querySelector('p');
                        if(radio && radio.checked) choice = p ? p.textContent.trim() : '';
                    });
                    return choice;
                })();
                // read color from input — browsers give hex like #rrggbb
                const color = colorInput ? (colorInput.value || '') : '';
                const poses = posesInput ? posesInput.value.trim() : '';
                const machine = machineSelect ? machineSelect.value : '';
                const statut = statutSelect ? statutSelect.value : 'Disponible';

                const machineInvalid = !machine || machine.toLowerCase().includes('selectionnez') || machine === '';
                if(!num || !type || !poses || Number(poses) <= 0 || machineInvalid){
                    alert('Veuillez remplir correctement tous les champs');
                    return;
                }

                if(isDuplicateNumber(num, null)){
                    alert("Impossible d'ajouter : une plaque avec ce numéro existe déjà.");
                    return;
                }

                const container = document.createElement('div');
                container.className = 'plaque-added-container';
                container.style.position = 'relative';
                container.dataset.num = num;
                container.dataset.type = type;
                container.dataset.poses = poses;
                container.dataset.machine = machine;
                container.dataset.status = statut;
                if(color) container.dataset.color = color;

                const delBtn = document.createElement('button');
                delBtn.className = 'delete-plaque-added';
                delBtn.style.width = '20px';
                delBtn.style.height = '20px';
                delBtn.style.backgroundColor = 'rgb(119,2,2)';
                delBtn.style.border = 'none';
                delBtn.style.display = 'flex';
                delBtn.style.justifyContent = 'center';
                delBtn.style.alignItems = 'center';
                delBtn.style.borderRadius = '20px';
                delBtn.style.position = 'absolute';
                delBtn.style.top = '-5px';
                delBtn.style.right = '-5px';
                delBtn.style.cursor = 'pointer';
                const delImg = document.createElement('img');
                delImg.src = 'img/icon/supprimer1.png';
                delImg.alt = 'delete';
                delImg.style.width = '10px';
                delImg.style.height = '10px';
                delBtn.appendChild(delImg);
                container.appendChild(delBtn);

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-plaque-added';
                editBtn.style.width = '20px';
                editBtn.style.height = '20px';
                editBtn.style.backgroundColor = 'rgb(0,128,0)';
                editBtn.style.border = 'none';
                editBtn.style.display = 'flex';
                editBtn.style.justifyContent = 'center';
                editBtn.style.alignItems = 'center';
                editBtn.style.borderRadius = '20px';
                editBtn.style.position = 'absolute';
                editBtn.style.top = '-5px';
                editBtn.style.right = '16px';
                editBtn.style.cursor = 'pointer';
                const editImg = document.createElement('img');
                editImg.src = 'img/icon/editer.png';
                editImg.alt = 'edit';
                editImg.style.width = '10px';
                editImg.style.height = '10px';
                editImg.style.filter = 'invert(0%)';
                editBtn.appendChild(editImg);
                container.appendChild(editBtn);

                const left = document.createElement('div');
                left.className = 'left-plaque-added';
                left.style.display = 'flex';
                left.style.alignItems = 'center';
                left.style.flexWrap = 'wrap';
                const p = document.createElement('p');
                p.style.margin = '0';
                left.appendChild(p);
                container.appendChild(left);

                const right = document.createElement('div');
                right.className = 'right-plaque-added';
                if(color) right.style.backgroundColor = color;
                const rightImg = document.createElement('img');
                rightImg.src = 'img/icon/papeterie-papiers-empiles.png';
                rightImg.alt = 'Plaque';
                rightImg.style.width = '30px';
                rightImg.style.height = '30px';
                right.appendChild(rightImg);
                container.appendChild(right);

                buildLeftContent(container);
                plaqueAdded.appendChild(container);

                // attach behaviors
                attachDelete(container.querySelector('.delete-plaque-added'));
                attachEdit(container.querySelector('.edit-plaque-added'));

                container.addEventListener('click', (e) => {
                    if(e.target.closest('.delete-plaque-added') || e.target.closest('.edit-plaque-added')) return;
                    openForEdit(container);
                });

                updateEmptyMessage();

                // réinitialiser le formulaire après ajout
                resetPlaqueForm();
            });

            // Save button: gère l'enregistrement de la modification
            saveBtn.addEventListener('click', () => {
                if (!currentEditingContainer) return;
                if (saveBtn.disabled) return;

                const num = numInput ? numInput.value.trim() : '';
                const type = (() => {
                    let choice = '';
                    typeBlocks.forEach(block => {
                        const radio = block.querySelector('input[type="radio"]');
                        const p = block.querySelector('p');
                        if(radio && radio.checked) choice = p ? p.textContent.trim() : '';
                    });
                    return choice;
                })();
                const color = colorInput ? (colorInput.value || '') : '';
                const poses = posesInput ? posesInput.value.trim() : '';
                const machine = machineSelect ? machineSelect.value : '';
                const statut = statutSelect ? statutSelect.value : 'Disponible';

                const machineInvalid = !machine || machine.toLowerCase().includes('selectionnez') || machine === '';
                if(!num || !type || !poses || Number(poses) <= 0 || machineInvalid){
                    alert('Veuillez remplir correctement tous les champs : numéro, type, nombre de poses (>0) et machine.');
                    return;
                }

                // vérification duplicate (exclure la ligne en cours)
                if(isDuplicateNumber(num, currentEditingContainer)){
                    alert("Impossible d'enregistrer : une autre plaque possède déjà ce même numéro.");
                    return;
                }

                // appliquer modifications sur la ligne courante
                currentEditingContainer.dataset.num = num;
                currentEditingContainer.dataset.type = type;
                currentEditingContainer.dataset.poses = poses;
                currentEditingContainer.dataset.machine = machine;
                currentEditingContainer.dataset.status = statut;
                if(color) currentEditingContainer.dataset.color = color;

                const rightDiv = currentEditingContainer.querySelector('.right-plaque-added');
                if(rightDiv && (color)) rightDiv.style.backgroundColor = color;

                buildLeftContent(currentEditingContainer);

                // reset état
                currentEditingContainer = null;
                resetPlaqueForm();
                updateEmptyMessage();
                // hide save btn (resetPlaqueForm already hides)
            });

            // init
            updateAddButtonText();
            updateEmptyMessage();
        });


        window.clickAddButtonIfExists = function(chooseEl) {
            if (!chooseEl) return false;
            const buttons = Array.from(chooseEl.querySelectorAll('button'));

            // 1) bouton addclient / addproduct à l'intérieur du chooseEl
            const addBtn = buttons.find(b => {
                const img = b.querySelector('img');
                return img && img.src && (img.src.toLowerCase().includes('addclient.png') || img.src.toLowerCase().includes('addproduct.png'));
            });
            if (addBtn) { addBtn.click(); return true; }

            // 2) fallback : chercher dans le parent .clientproduit-plaque
            const group = chooseEl.closest('.clientproduit-plaque') || chooseEl.parentNode;
            if (group) {
                const groupBtn = Array.from(group.querySelectorAll('button')).find(b => {
                const img = b.querySelector('img');
                return img && img.src && (img.src.toLowerCase().includes('addclient.png') || img.src.toLowerCase().includes('addproduct.png'));
                });
                if (groupBtn) { groupBtn.click(); return true; }
            }

            // 3) dernier recours : clique sur le 1er bouton qui n'est pas delete-input
            const nonDel = buttons.find(b => !b.classList.contains('delete-input'));
            if (nonDel) { nonDel.click(); return true; }

            return false;
        };

        document.addEventListener('DOMContentLoaded', () => {
            const overlay = document.querySelector('.filterblack');
            const modal = document.querySelector('.add-client');
            if (!overlay || !modal) return;

            // Assurer état initial caché (si ton CSS ne le fait pas déjà)
            overlay.style.display = 'none';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s ease';
            modal.style.display = 'none';

            // Bouton de fermeture dans la modal
            const closeBtn = modal.querySelector('.close-addclient');

            // Trouver le bouton "plus" du bloc client (on cible le choose-client-plaque qui concerne les clients)
            const clientChoose = document.querySelector('.choose-client-plaque');
            // On écoute tout bouton contenant une image "plus.png" DANS le bloc client (robuste si plusieurs variantes)
            const clientPlusBtn = document.getElementById('addClientNew');

            // Utilities
            function disablePageScroll() { document.body.style.overflow = 'hidden'; }
            function enablePageScroll() { document.body.style.overflow = ''; }

            function showOverlay() {
                overlay.style.display = 'block';
                // force layout pour que la transition prenne
                requestAnimationFrame(() => {
                overlay.style.opacity = '0.8';
                });
            }
            function hideOverlay() {
                overlay.style.opacity = '0';
                overlay.addEventListener('transitionend', function t(e) {
                if (e.propertyName === 'opacity') {
                    overlay.style.display = 'none';
                    overlay.removeEventListener('transitionend', t);
                }
                });
            }

            function showModal() {
                // si déjà visible, rien
                if (modal.style.display === 'block') return;
                // disable scroll
                disablePageScroll();
                showOverlay();

                // préparer l'animation (animate.css)
                modal.classList.remove('animate__animated','animate__fadeInUp');
                modal.style.display = 'block';

                // petite attente pour s'assurer que display:block est appliqué puis ajouter la classe d'animation
                requestAnimationFrame(() => {
                modal.classList.add('animate__animated','animate__fadeInUp');
                });

                // retirer la classe d'animation à la fin pour pouvoir la rejouer plus tard
                function onAnimEnd() {
                modal.classList.remove('animate__animated');
                modal.classList.remove('animate__fadeInUp');
                modal.removeEventListener('animationend', onAnimEnd);
                }
                modal.addEventListener('animationend', onAnimEnd);
            }

            function hideModal() {
                if (modal.style.display !== 'block') return;
                // réactiver scroll
                enablePageScroll();
                // masquer overlay
                hideOverlay();
                // masquer modal (pas d'animation de sortie demandée)
                modal.style.display = 'none';
                // s'assurer de retirer classes d'animation
                modal.classList.remove('animate__animated','animate__fadeInUp');
            }

            // Si le bouton existe, binder le clic
            if (clientPlusBtn) {
                clientPlusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showModal();
                });
            }

            // Aussi binder le premier bouton "add client" (au cas où l'autre bouton n'existe pas)
            if (!clientPlusBtn && clientChoose) {
                const firstBtn = clientChoose.querySelector('button');
                if (firstBtn) firstBtn.addEventListener('click', (e) => { e.preventDefault(); showModal(); });
            }

            // fermer via la croix
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });
            }

            // fermer via clic sur overlay (mais éviter de fermer si on clique dans la modal)
            overlay.addEventListener('click', (e) => {
                hideModal();
            });

            // fermer avec ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideModal();
            });

            // Si tu veux aussi fermer quand on clique sur un bouton "annuler" inside modal, tu peux ajouter:
            const cancelBtn = modal.querySelector('button[aria-label="cancel"], button.cancel, .btn-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); hideModal(); });

            });


        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.all-info-plaque-container').forEach(container => {
                // si on a déjà transformé, skip
                if (container.querySelector('.scroll-inner')) return;

                // 1) créer wrapper scrollable et déplacer le contenu dedans
                const scrollInner = document.createElement('div');
                scrollInner.className = 'scroll-inner';
                // move all existing children into scrollInner
                while (container.firstChild) {
                scrollInner.appendChild(container.firstChild);
                }
                // append scrollInner as seul enfant principal
                container.appendChild(scrollInner);

                // 2) créer overlays (top + bottom) comme ENFANTS du container (pas du scrollInner)
                const top = document.createElement('div');
                top.className = 'inner-shadow top';
                const bottom = document.createElement('div');
                bottom.className = 'inner-shadow bottom';
                container.appendChild(top);
                container.appendChild(bottom);

                // 3) fonction update basée sur le scrollInner (le vrai scroller)
                const update = () => {
                const el = scrollInner;
                const isScrollable = el.scrollHeight > el.clientHeight + 1;
                const scrolled = el.scrollTop > 5;
                const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2;

                // toggle classes sur le container parent (pour afficher/masquer ombres)
                if (scrolled) container.classList.add('show-top'); else container.classList.remove('show-top');
                if (isScrollable && !atBottom) container.classList.add('show-bottom'); else container.classList.remove('show-bottom');
                };

                // throttle rAF
                let ticking = false;
                const onScroll = () => {
                if (!ticking) {
                    requestAnimationFrame(() => { update(); ticking = false; });
                    ticking = true;
                }
                };

                // écouter scroll + resize (resize peut changer hauteur)
                scrollInner.addEventListener('scroll', onScroll);
                window.addEventListener('resize', onScroll);

                // init
                update();

                // expose utilitaires si besoin
                scrollInner._updateShadows = update;
            });

            // util publique : force la MAJ (utile après clonage dynamique)
            window.updateAllInfoPlaqueShadows = () => {
                document.querySelectorAll('.all-info-plaque-container .scroll-inner').forEach(si => si._updateShadows?.());
            };
        });
        
        (function enableCloneChooseClientPlague() {

        // helper pour insérer après un nœud
        function insertAfter(newNode, referenceNode) {
            referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }

        // crée un wrapper .choose-client-plaque contenant uniquement .input-choose + suggestions
        function createChooseClientInputOnly(origChooseEl) {
            const isClient = origChooseEl.querySelector('.suggestions')?.classList.contains('suggestions-client');

            const wrapper = document.createElement('div');
            wrapper.className = 'choose-client-plaque';

            // .input-choose avec bouton delete + input
            const inputChoose = document.createElement('div');
            inputChoose.className = 'input-choose';

            // bouton delete
            const btnDel = document.createElement('button');
            btnDel.className = 'delete-input';
            const imgDel = document.createElement('img');
            imgDel.src = 'img/icon/supprimer1.png';
            imgDel.alt = 'supprimer';
            btnDel.appendChild(imgDel);

            const input = document.createElement('input');
            input.type = 'text';
            const origInput = origChooseEl.querySelector('input');
            input.placeholder = origInput ? (origInput.placeholder || '') : '';

            inputChoose.appendChild(btnDel);
            inputChoose.appendChild(input);
            wrapper.appendChild(inputChoose);

            // suggestions (copie le nom de classe si client/product pour garder le style)
            const sugg = document.createElement('div');
            sugg.className = isClient ? 'suggestions suggestions-client' : 'suggestions suggestions-product';
            sugg.setAttribute('role', 'listbox');
            sugg.setAttribute('aria-label', isClient ? 'suggestions-client' : 'suggestions-product');
            wrapper.appendChild(sugg);

            return wrapper;
        }

        // trouve le bouton "plus" réel DANS un chooseEl (en évitant le bouton "addclient"/"addproduct")
        function findPlusButton(chooseEl) {
            const buttons = Array.from(chooseEl.querySelectorAll('button'));
            // préférer le bouton qui contient une image "plus.png"
            let plusBtn = buttons.find(b => {
            const img = b.querySelector('img');
            return img && img.src && img.src.toLowerCase().includes('plus.png');
            });
            // fallback : si pas trouvé, prendre le deuxième bouton (ancienne logique)
            if (!plusBtn) plusBtn = buttons[1] || null;
            return plusBtn;
        }

        // Met à jour la visibilité des boutons delete pour un parent (.clientproduit-plaque)
        function updateDeleteVisibilityForParent(parentEl) {
            if (!parentEl) return;
            const chooses = Array.from(parentEl.querySelectorAll('.choose-client-plaque'));
            chooses.forEach((ch, idx) => {
            const del = ch.querySelector('.input-choose .delete-input');
            if (!del) return;
            // cacher sur le premier, montrer sur les autres
            if (idx === 0) {
                del.style.display = 'none';
                del.setAttribute('aria-hidden', 'true');
            } else {
                del.style.display = '';
                del.setAttribute('aria-hidden', 'false');
            }
            });
        }

        // initialisation d'un chooseEl (lié aux suggestions, delete, et bind du plus si c'est l'original)
        function initChooseElement(chooseEl) {
            if (!chooseEl || chooseEl._initDone) return;
            chooseEl._initDone = true;

            const input = chooseEl.querySelector('input');
            const suggestionsEl = chooseEl.querySelector('.suggestions') || (() => {
            // si element minimal créé dynamiquement n'a pas suggestions, on en crée une
            const s = document.createElement('div');
            s.className = 'suggestions';
            chooseEl.appendChild(s);
            return s;
            })();
            const isClient = suggestionsEl.classList.contains('suggestions-client');

            // jeux de données (tu peux étendre)
            const clients = [
            {name: 'Chicken Street', img: 'img/icon/profilclient.png'},
            {name: 'Boucherie Atlas', img: 'img/icon/profilclient.png'},
            {name: 'Supermarché El-Wahy', img: 'img/icon/profilclient.png'},
            {name: 'Café Roma', img: 'img/icon/profilclient.png'}
            ];
            const products = [
            {name: 'Boite burger', img: 'img/icon/produit - Copie.png'},
            {name: 'Boite pizza', img: 'img/icon/produit - Copie.png'},
            {name: 'Papier sandwich', img: 'img/icon/produit - Copie.png'},
            {name: 'Sac frites', img: 'img/icon/produit - Copie.png'}
            ];
            const data = isClient ? clients : products;

            function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            }

            function clickAddButtonIfExists(chooseEl) {
                if (!chooseEl) return false;
                const buttons = Array.from(chooseEl.querySelectorAll('button'));

                // 1) chercher un bouton dont l'image contienne addclient.png ou addproduct.png
                const addBtn = buttons.find(b => {
                    const img = b.querySelector('img');
                    return img && img.src && (img.src.toLowerCase().includes('addclient.png') || img.src.toLowerCase().includes('addproduct.png'));
                });
                if (addBtn) { addBtn.click(); return true; }

                // 2) fallback : chercher dans le parent .clientproduit-plaque (au cas où le bouton est là)
                const group = chooseEl.closest('.clientproduit-plaque') || chooseEl.parentNode;
                if (group) {
                    const groupBtn = Array.from(group.querySelectorAll('button')).find(b => {
                    const img = b.querySelector('img');
                    return img && img.src && (img.src.toLowerCase().includes('addclient.png') || img.src.toLowerCase().includes('addproduct.png'));
                    });
                    if (groupBtn) { groupBtn.click(); return true; }
                }

                // 3) dernier recours : clique sur le premier bouton qui n'a pas la classe delete-input
                const nonDel = buttons.find(b => !b.classList.contains('delete-input'));
                if (nonDel) { nonDel.click(); return true; }

                return false;
            }

            function renderSuggestions(list, query) {
            suggestionsEl.innerHTML = '';
            if (!list.length) {
                const no = document.createElement('div');
                no.className = 'no-result';
                if (query && query.trim() !== '') {
                no.innerHTML = `Aucun résultat pour « <b>${escapeHtml(query)}</b> »`;
                } else {
                no.textContent = 'Aucun résultat';
                }
                suggestionsEl.appendChild(no);

                const create = document.createElement('div');
                create.className = 'create-item';
                create.innerHTML = `
                <img src="${isClient ? 'img/icon/addclient.png' : 'img/icon/addproduct.png'}" alt="create">
                <div class="label">${ query && query.trim() !== '' ? `Créer « ${escapeHtml(query)} »` : (isClient ? 'Créer un nouveau client' : 'Créer un nouveau produit') }</div>
                `;
                create.addEventListener('click', () => {
                    if (query && query.trim() !== '') input.value = query;
                    // safe call to the global helper
                    window.clickAddButtonIfExists(chooseEl);
                    suggestionsEl.style.display = 'none';
                });
                suggestionsEl.appendChild(create);
                suggestionsEl.style.display = 'block';
                return;
            }

            list.forEach(item => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.setAttribute('role', 'option');
                div.innerHTML = `
                <img src="${item.img}" alt="${escapeHtml(item.name)}">
                <div class="name">${escapeHtml(item.name)}</div>
                `;
                div.addEventListener('click', () => {
                input.value = item.name;
                suggestionsEl.style.display = 'none';
                });
                suggestionsEl.appendChild(div);
            });
            suggestionsEl.style.display = 'block';
            }

            function update() {
            const val = input.value.trim();
            if (val === '') {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
                return;
            }
            const matches = data.filter(d => d.name.toLowerCase().includes(val.toLowerCase())).slice(0, 8);
            renderSuggestions(matches, val);
            }

            if (input) {
            input.addEventListener('input', update);
            input.addEventListener('focus', update);
            input.addEventListener('keydown', (e) => { if (e.key === 'Escape') suggestionsEl.style.display = 'none'; });
            }

            // fermer suggestions si clic en dehors
            document.addEventListener('click', (e) => {
            if (!chooseEl.contains(e.target)) {
                suggestionsEl.style.display = 'none';
            }
            });

            // DELETE BUTTON : supprime le .choose-client-plaque parent
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
                // après suppression on met à jour la visibilité des delete dans ce groupe
                updateDeleteVisibilityForParent(groupParent);
                if (window.updateAllInfoPlaqueShadows) window.updateAllInfoPlaqueShadows();
                });
            }
            }

            // BIND du bouton "+" (pour l'élément d'origine) : il va insérer un nouveau choose-client-plaque minimal
            const plusBtn = findPlusButton(chooseEl);
            if (plusBtn && !plusBtn._cloneBound) {
            plusBtn._cloneBound = true;
            plusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const newNode = createChooseClientInputOnly(chooseEl);
                insertAfter(newNode, chooseEl);
                // initialiser le nouveau node pour suggestions + delete
                initChooseElement(newNode);
                // mettre à jour visibilité delete pour tout le groupe
                const groupParent = chooseEl.closest('.clientproduit-plaque') || chooseEl.parentNode;
                updateDeleteVisibilityForParent(groupParent);
                // focus sur le nouvel input
                setTimeout(() => {
                const ni = newNode.querySelector('input');
                if (ni) ni.focus();
                }, 20);
            });
            }
        }

        // initialiser tous les éléments existants puis corriger visibilité delete par groupe
        document.querySelectorAll('.choose-client-plaque').forEach(el => {
            initChooseElement(el);
        });

        // pour chaque parent .clientproduit-plaque on met à jour la visibilité (cache delete sur le 1er)
        document.querySelectorAll('.clientproduit-plaque').forEach(parent => {
            updateDeleteVisibilityForParent(parent);
        });

        // exposer pour debug/utilité
        window.initChooseElement = initChooseElement;
        window.updateDeleteVisibilityForParent = updateDeleteVisibilityForParent;

        })();



        document.addEventListener('DOMContentLoaded', () => {
            const clients = [
                {name: 'Chicken Street', img: 'img/icon/profilclient.png'},
                {name: 'Boucherie Atlas', img: 'img/icon/profilclient.png'},
                {name: 'Supermarché El-Wahy', img: 'img/icon/profilclient.png'},
                {name: 'Café Roma', img: 'img/icon/profilclient.png'}
            ];
            const products = [
                {name: 'Boite burger', img: 'img/icon/produit - Copie.png'},
                {name: 'Boite pizza', img: 'img/icon/produit - Copie.png'},
                {name: 'Papier sandwich', img: 'img/icon/produit - Copie.png'},
                {name: 'Sac frites', img: 'img/icon/produit - Copie.png'}
            ];

  document.querySelectorAll('.choose-client-plaque').forEach((chooseEl) => {
    const input = chooseEl.querySelector('input');
    const suggestionsEl = chooseEl.querySelector('.suggestions');

    const isClient = suggestionsEl && suggestionsEl.classList.contains('suggestions-client');
    const data = isClient ? clients : products;

    function renderSuggestions(list, query) {
      suggestionsEl.innerHTML = '';

      if (!list.length) {
        // message Aucun résultat
        const no = document.createElement('div');
        no.className = 'no-result';
        if (query && query.trim() !== '') {
          no.innerHTML = `Aucun résultat pour « <b>${escapeHtml(query)}</b> »`;
        } else {
          no.textContent = 'Aucun résultat';
        }
        suggestionsEl.appendChild(no);

        // ajout de la proposition de création
        const create = document.createElement('div');
        create.className = 'create-item';
        // icône + label (tu peux changer l'icone)
        create.innerHTML = `
          <img src="${isClient ? 'img/icon/addclient.png' : 'img/icon/addproduct.png'}" alt="create">
          <div class="label">${ query && query.trim() !== '' ? `Créer « ${escapeHtml(query)} »` : (isClient ? 'Créer un nouveau client' : 'Créer un nouveau produit') }</div>
        `;
        create.addEventListener('click', () => {
            if (query && query.trim() !== '') input.value = query;
            // safe call to the global helper
            window.clickAddButtonIfExists(chooseEl);
            suggestionsEl.style.display = 'none';
        });
        suggestionsEl.appendChild(create);

        suggestionsEl.style.display = 'block';
        return;
      }

      // sinon on affiche les résultats normalement
      list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.setAttribute('role', 'option');
        div.innerHTML = `
          <img src="${item.img}" alt="${escapeHtml(item.name)}">
          <div class="name">${escapeHtml(item.name)}</div>
        `;
        div.addEventListener('click', () => {
          input.value = item.name;
          suggestionsEl.style.display = 'none';
        });
        suggestionsEl.appendChild(div);
      });
      suggestionsEl.style.display = 'block';
    }

    function update() {
      const val = input.value.trim();
      if (val === '') {
        // si tu veux suggestions par défaut, décommente la ligne suivante :
        // renderSuggestions(data.slice(0,6), '');
        suggestionsEl.style.display = 'none';
        suggestionsEl.innerHTML = '';
        return;
      }
      const matches = data.filter(d => d.name.toLowerCase().includes(val.toLowerCase())).slice(0, 8);
      renderSuggestions(matches, val);
    }

    input.addEventListener('input', update);
    input.addEventListener('focus', update);

    document.addEventListener('click', (e) => {
      if (!chooseEl.contains(e.target)) {
        suggestionsEl.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') suggestionsEl.style.display = 'none';
    });
  });



  // utilitaire simple pour échapper du HTML dans les labels
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});



document.addEventListener('DOMContentLoaded', () => {

/* ============================================================
     4) Onglets, sidebar, splash (inchangés mais centralisés)
     ============================================================ */
  (function(){
    const onglets = document.querySelectorAll('.all-onglets-container .btns-onglets .onglet');
    const containers = document.querySelectorAll('.all-onglets-container .onglet-container');

    onglets.forEach((tab, i) => {
      if (!tab.hasAttribute('tabindex')) tab.setAttribute('tabindex', '0');
      if (!tab.hasAttribute('role')) tab.setAttribute('role', 'button');

      tab.addEventListener('click', () => activate(i));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(i); }
      });
    });

    function activate(index) {
      onglets.forEach((t, i) => t.classList.toggle('active', i === index));
      containers.forEach((c, i) => c.style.display = (i === index) ? 'flex' : 'none');
    }

    const current = Array.from(onglets).findIndex(t => t.classList.contains('active'));
    activate(current === -1 ? 0 : current);
  })();


  /* ============================================================
     5) Sidebar / notifications / overlay (inchangé)
     ============================================================ */
  (function(){
    const burgerBtn = document.querySelector('.header .burger');
    const closeBtn = document.querySelector('.sidebar .close-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const notifBtn = document.querySelector('.notif-user');
    const sidenotifEl = document.querySelector('.sidenotif');
    const overlay = document.querySelector('.filterblack');

    if (!overlay || !sidebar || !sidenotifEl) return;

    overlay.style.display = 'none';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    sidebar.style.transform = 'translateX(-100%)';
    sidebar.style.transition = 'transform 0.3s ease';
    sidenotifEl.style.transform = 'translateX(100%)';
    sidenotifEl.style.transition = 'transform 0.3s ease';
    sidenotifEl.addEventListener('click', e => e.stopPropagation());

    let sidebarOpen = false;
    let notifOpen = false;

    function showOverlay() {
      overlay.style.display = 'block';
      requestAnimationFrame(() => overlay.style.opacity = '0.8');
    }
    function hideOverlayIfNeeded() {
      if (!sidebarOpen && !notifOpen) overlay.style.opacity = '0';
    }
    overlay.addEventListener('transitionend', e => {
      if (e.propertyName === 'opacity' && overlay.style.opacity === '0') overlay.style.display = 'none';
    });

    function openSidebar() { sidebar.style.transform = 'translateX(0)'; sidebarOpen = true; showOverlay(); }
    function closeSidebar() { sidebar.style.transform = 'translateX(-100%)'; sidebarOpen = false; hideOverlayIfNeeded(); }
    burgerBtn?.addEventListener('click', openSidebar);
    closeBtn?.addEventListener('click', closeSidebar);

    function openNotif() { sidenotifEl.style.transform = 'translateX(0)'; notifOpen = true; showOverlay(); }
    function closeNotif() { sidenotifEl.style.transform = 'translateX(100%)'; notifOpen = false; hideOverlayIfNeeded(); }
    notifBtn?.addEventListener('click', e => { e.stopPropagation(); notifOpen ? closeNotif() : openNotif(); });
    overlay.addEventListener('click', () => { if (sidebarOpen) closeSidebar(); if (notifOpen) closeNotif(); });
  })();


  /* ============================================================
     6) Splash (inchangé)
     ============================================================ */
  (function(){
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
  })();

});