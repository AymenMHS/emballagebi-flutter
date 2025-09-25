        document.addEventListener('DOMContentLoaded', () => {
          document.querySelectorAll('.index-start .logo img').forEach(img => {
            const whiteSrc = img.getAttribute('src');
            const redSrc = img.dataset.red;
            if (!redSrc) return; // si pas de data-red, on ignore

            // Précharger l'image rouge
            const preload = new Image();
            preload.src = redSrc;

            // Fonctions de swap
            const showRed = () => { img.src = redSrc; };
            const showWhite = () => { img.src = whiteSrc; };

            // Mouse / pointer
            img.addEventListener('mouseenter', showRed);
            img.addEventListener('mouseleave', showWhite);

            // Focus/blur pour accessibilité (clavier)
            img.addEventListener('focus', showRed);
            img.addEventListener('blur', showWhite);

            // Touch (mobile) — on utilise pointer events si dispo
            img.addEventListener('pointerdown', showRed);
            img.addEventListener('pointerup', showWhite);
            img.addEventListener('pointercancel', showWhite);

            // Fallback pour anciens navigateurs (touch)
            img.addEventListener('touchstart', showRed, {passive: true});
            img.addEventListener('touchend', showWhite, {passive: true});
          });
        });
            // Swipe & drag support pour sidebar (gauche) et sidenotif (droite)
        (function() {
          const sidebar = document.querySelector('.sidebar');
          const sidenotifEl = document.querySelector('.sidenotif');
          const filterOverlay = document.querySelector('.filterblack');

          if (!sidebar || !sidenotifEl || !filterOverlay) return;

          let startX = 0, currentX = 0, touching = false;
          let draggingPanel = null; // 'left' or 'right' or null
          const EDGE_THRESHOLD = 28; // px depuis le bord pour initier swipe
          const OPEN_THRESHOLD_RATIO = 0.25; // proportion needed to open

          // helpers
          function showOverlay() { filterOverlay.classList.add('visible'); }
          function hideOverlayIfClosed() {
            if (!sidebar.classList.contains('open') && !sidenotifEl.classList.contains('open')) {
              filterOverlay.classList.remove('visible');
            }
          }

          function setTranslateX(el, x) {
            el.style.transform = `translateX(${x}px)`;
          }

          function resetPanelStyle(el, side) {
            el.style.transform = '';
            el.classList.remove('dragging');
          }

          // Start touch (could be edge swipe or drag on panel)
          function onTouchStart(e) {
            if (e.touches && e.touches.length === 1) {
              startX = e.touches[0].clientX;
              currentX = startX;
              touching = true;
              draggingPanel = null;

              // edge swipe from left -> open sidebar
              if (startX <= EDGE_THRESHOLD && !sidebar.classList.contains('open')) {
                draggingPanel = 'left';
                sidebar.classList.add('dragging');
                showOverlay();
              }
              // edge swipe from right -> open sidenotif
              else if (startX >= (window.innerWidth - EDGE_THRESHOLD) && !sidenotifEl.classList.contains('open')) {
                draggingPanel = 'right';
                sidenotifEl.classList.add('dragging');
                showOverlay();
              } else {
                // if user touches on an open panel, allow closing by dragging it
                const rectLeft = sidebar.getBoundingClientRect();
                const rectRight = sidenotifEl.getBoundingClientRect();
                if (sidebar.classList.contains('open') && startX <= rectLeft.right) { draggingPanel = 'left'; sidebar.classList.add('dragging'); }
                else if (sidenotifEl.classList.contains('open') && startX >= rectRight.left) { draggingPanel = 'right'; sidenotifEl.classList.add('dragging'); }
              }
            }
          }

          function onTouchMove(e) {
            if (!touching || !draggingPanel || !e.touches || e.touches.length !== 1) return;
            currentX = e.touches[0].clientX;
            const dx = currentX - startX;

            if (draggingPanel === 'left') {
              // When closed, panel moves from -width to -width + dx (but clamped)
              const w = sidebar.offsetWidth;
              let translate = -w + Math.max(0, dx); // dx positive pulls it in
              // If panel already open and dx negative, allow closing with negative dx
              if (sidebar.classList.contains('open')) {
                translate = Math.min(0, dx); // dx negative moves it left to hide
              }
              // clamp
              translate = Math.min(0, Math.max(-w, translate));
              setTranslateX(sidebar, translate);
            } else if (draggingPanel === 'right') {
              const w = sidenotifEl.offsetWidth;
              let translate = w + Math.min(0, dx); // when closed dx negative pulls it in
              if (sidenotifEl.classList.contains('open')) {
                translate = Math.max(0, dx); // dx positive moves it right to hide
              }
              // translateX should be between 0 (open) and w (hidden)
              translate = Math.max(0, Math.min(w, translate));
              // convert to CSS value: we want translateX(translate) but for right panel initial closed state is +w px -> we use translateX(translate)
              setTranslateX(sidenotifEl, translate + 'px'); // keep px as string
            }
          }

          function onTouchEnd() {
            if (!touching || !draggingPanel) { touching = false; draggingPanel = null; return; }
            const dx = currentX - startX;
            if (draggingPanel === 'left') {
              const w = sidebar.offsetWidth;
              const opened = (sidebar.classList.contains('open')) ? (dx > -w * (1 - OPEN_THRESHOLD_RATIO)) : (dx > w * OPEN_THRESHOLD_RATIO);
              if (opened) {
                sidebar.classList.add('open');
                sidebar.style.transform = ''; // let CSS class handle transform
              } else {
                sidebar.classList.remove('open');
                sidebar.style.transform = ''; // reset
                hideOverlayIfClosed();
              }
              sidebar.classList.remove('dragging');
            } else if (draggingPanel === 'right') {
              const w = sidenotifEl.offsetWidth;
              const opened = (sidenotifEl.classList.contains('open')) ? (dx < w * (1 - OPEN_THRESHOLD_RATIO)) : (dx < -w * OPEN_THRESHOLD_RATIO);
              if (opened) {
                sidenotifEl.classList.add('open');
                sidenotifEl.style.transform = '';
              } else {
                sidenotifEl.classList.remove('open');
                sidenotifEl.style.transform = '';
                hideOverlayIfClosed();
              }
              sidenotifEl.classList.remove('dragging');
            }
            touching = false;
            draggingPanel = null;
          }

          // Attach global touch events (for edge swipes)
          document.addEventListener('touchstart', onTouchStart, {passive: true});
          document.addEventListener('touchmove', onTouchMove, {passive: true});
          document.addEventListener('touchend', onTouchEnd, {passive: true});
          document.addEventListener('touchcancel', onTouchEnd, {passive: true});

          // existing click handlers (kept)
          const burgerBtn = document.querySelector('.header .burger');
          const closeBtn = document.querySelector('.sidebar .close-sidebar');
          const notifBtn = document.querySelector('.notif-user');

          function openSidebar() { sidebar.classList.add('open'); showOverlay(); }
          function closeSidebar() { sidebar.classList.remove('open'); hideOverlayIfClosed(); }
          function openNotif() { sidenotifEl.classList.add('open'); showOverlay(); }
          function closeNotif() { sidenotifEl.classList.remove('open'); hideOverlayIfClosed(); }

          if (burgerBtn) burgerBtn.addEventListener('click', (e) => { e.stopPropagation(); openSidebar(); });
          if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeSidebar(); });
          if (notifBtn) notifBtn.addEventListener('click', (e) => { e.stopPropagation(); if (sidenotifEl.classList.contains('open')) closeNotif(); else openNotif(); });

          // close if overlay tapped
          filterOverlay.addEventListener('click', () => { closeSidebar(); closeNotif(); });

          // close with Escape for accessibility
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { closeSidebar(); closeNotif(); }
          });

          // When panels are opened programmatically, ensure overlay visible
          const observer = new MutationObserver(() => {
            if (sidebar.classList.contains('open') || sidenotifEl.classList.contains('open')) showOverlay();
            else hideOverlayIfClosed();
          });
          observer.observe(sidebar, {attributes: true, attributeFilter: ['class']});
          observer.observe(sidenotifEl, {attributes: true, attributeFilter: ['class']});
        })();