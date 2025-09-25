// scan.js (remplacé) — détection uniquement si QR centré + son + vibration
(() => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frameEl = document.querySelector('.frame');
  const loader = document.getElementById('loader');
  const status = document.getElementById('status');

  let running = false;
  let detDebounce = false; // empêchera spam de fetch
  const ORIGIN = window.location.origin;
  // redirection spéciale si scan.html?redirect=gestion
  const redirectToGestion = (new URLSearchParams(window.location.search).get('redirect') || '').toLowerCase() === 'gestion';

  // audio preload
  const audio = new Audio('sound/ping.mp3');
  audio.preload = 'auto';
  audio.volume = 1.0;

  const hasBarcodeDetector = ('BarcodeDetector' in window) && (typeof window.BarcodeDetector === 'function');


  const failedLookup = new Map(); 
  // failedLookup maps: qrcode -> { attempts: n, blockedUntil: timestampMs }

  // helper: retourne true si on doit skip la requete pour ce qrcode
  function isBlockedQrcode(q) {
    const info = failedLookup.get(q);
    if (!info) return false;
    if (!info.blockedUntil) return false;
    return Date.now() < info.blockedUntil;
  }

  // helper: on augmente backoff and block
  function registerFailure(q, statusCode) {
    const prev = failedLookup.get(q) || { attempts: 0, blockedUntil: 0 };
    prev.attempts = (prev.attempts || 0) + 1;
    // backoff: 1s * 2^(attempts-1), cap 60s
    const blockMs = Math.min(60000, 1000 * Math.pow(2, Math.max(0, prev.attempts - 1)));
    prev.blockedUntil = Date.now() + blockMs;
    prev.lastStatus = statusCode || null;
    failedLookup.set(q, prev);
    // automatic cleanup after block expires + small margin
    setTimeout(() => {
      const cur = failedLookup.get(q);
      if (cur && Date.now() > cur.blockedUntil + 5000) failedLookup.delete(q);
    }, blockMs + 5000);
  }

  async function startCamera() {
    if (running) return;
    running = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      resizeCanvas();
      // ensure audio can be played after user gesture (startCamera is triggered on click/touch)
      try { audio.play().then(()=>audio.pause()).catch(()=>{}); } catch(e){}
      requestAnimationFrame(processFrame);
    } catch (err) {
      console.error('camera error', err);
      status.textContent = 'Impossible d\'accéder à la caméra.';
      running = false;
    }
  }

  function resizeCanvas() {
    // canvas square sized from video intrinsic size but clamped
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const size = Math.min(1024, Math.max(256, Math.min(vw, vh)));
    canvas.width = size;
    canvas.height = size;
  }

  // calcule le rectangle du cadre (.frame) en coordonnées canvas
  function getFrameRectInCanvas() {
    try {
      const frameRect = frameEl.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      // ratio canvas pixels per displayed video pixel
      const ratioX = canvas.width / videoRect.width;
      const ratioY = canvas.height / videoRect.height;
      const left = (frameRect.left - videoRect.left) * ratioX;
      const top = (frameRect.top - videoRect.top) * ratioY;
      const width = frameRect.width * ratioX;
      const height = frameRect.height * ratioY;
      // clamp within canvas
      const x = Math.max(0, Math.min(canvas.width, left));
      const y = Math.max(0, Math.min(canvas.height, top));
      const w = Math.max(0, Math.min(canvas.width - x, width));
      const h = Math.max(0, Math.min(canvas.height - y, height));
      return { x, y, w, h };
    } catch (e) {
      // fallback: central square 60%
      const w = canvas.width * 0.6;
      const h = canvas.height * 0.6;
      return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
    }
  }

  // determiner si un point (cx,cy) en coords canvas est dans le cadre
  function isPointInFrame(cx, cy) {
    const r = getFrameRectInCanvas();
    return cx >= r.x && cx <= (r.x + r.w) && cy >= r.y && cy <= (r.y + r.h);
  }

  // compute centroid from barcode detection (handles different shapes)
  function centroidFromDetection(det) {
    // BarcodeDetector: may have boundingBox { x,y,width,height } or cornerPoints
    if (det.boundingBox) {
      const b = det.boundingBox;
      const cx = b.x + (b.width || 0) / 2;
      const cy = b.y + (b.height || 0) / 2;
      return { cx, cy };
    }
    if (det.cornerPoints && Array.isArray(det.cornerPoints) && det.cornerPoints.length) {
      let sx = 0, sy = 0;
      det.cornerPoints.forEach(p => { sx += p.x; sy += p.y; });
      return { cx: sx / det.cornerPoints.length, cy: sy / det.cornerPoints.length };
    }
    // jsQR style: det.location has topLeftCorner etc
    if (det.topLeftCorner || det.location) {
      const loc = det.location || det;
      const pts = [];
      ['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].forEach(k => {
        if (loc[k]) pts.push(loc[k]);
        else if (loc[k + 'Corner']) pts.push(loc[k + 'Corner']);
      });
      if (pts.length) {
        let sx=0, sy=0;
        pts.forEach(p => { sx += p.x; sy += p.y; });
        return { cx: sx/pts.length, cy: sy/pts.length };
      }
    }
    return null;
  }

  // Draw optional bounding guide (for debug/UX): show small guide in frame area when detection occurs
  function showFrameFeedback(inFrame) {
    if (inFrame) {
      frameEl.classList.add('qr-found'); // green style exists in CSS
      status.textContent = 'QR bien centré — traitement…';
    } else {
      // gentle feedback: pulse but not accept
      frameEl.classList.remove('qr-found');
      frameEl.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.35), 0 0 18px rgba(255,165,0,0.06)';
      status.textContent = 'QR détecté mais pas dans le cadre central.';
      // reset the visual after short time
      setTimeout(()=> { frameEl.style.boxShadow = ''; if(!frameEl.classList.contains('qr-found')) status.textContent = 'Placez le QR dans le cadre…'; }, 700);
    }
  }

  // play sound + vibrate
  function successFeedback() {
    try {
      audio.currentTime = 0;
      // play will usually succeed because user already interacted to start camera
      audio.play().catch(()=>{ /* ignore autoplay block */ });
    } catch(e){}
    try {
      if (navigator.vibrate) navigator.vibrate([60,30,40]);
    } catch(e){}
    // visual pulse
    frameEl.classList.add('qr-found');
    setTimeout(()=> frameEl.classList.remove('qr-found'), 900);
  }

  // draw optional bounding box on canvas (for jsQR)
  function drawBoundingBoxOnCanvas(loc) {
    try {
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = Math.max(2, canvas.width * 0.008);
      ctx.beginPath();
      if (loc.topLeftCorner && loc.topRightCorner && loc.bottomRightCorner && loc.bottomLeftCorner) {
        ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
        ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
        ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
        ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
        ctx.closePath();
        ctx.stroke();
      }
    } catch(e){}
  }

  async function processFrame() {
    if (!running) return;
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resizeCanvas();

        // draw center-cropped video into canvas (same logic as before)
        const vw = video.videoWidth, vh = video.videoHeight;
        const cw = canvas.width, ch = canvas.height;
        const scale = Math.max(cw / vw, ch / vh);
        const sw = cw / scale, sh = ch / scale;
        const sx = Math.max(0, (vw - sw) / 2), sy = Math.max(0, (vh - sh) / 2);

        ctx.clearRect(0,0,cw,ch);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);

        let detection = null;
        let detectionMeta = null;

        if (hasBarcodeDetector) {
          try {
            const imgBitmap = await createImageBitmap(canvas);
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await detector.detect(imgBitmap);
            if (barcodes && barcodes.length) {
              detection = barcodes[0]; // use first
              detectionMeta = { type: 'barcode' };
            }
            imgBitmap.close && imgBitmap.close();
          } catch (e) {
            // fallback silently
            detection = null;
          }
        }

        if (!detection) {
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (typeof jsQR === 'function') {
              const r = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
              if (r && r.data) {
                detection = r;
                detectionMeta = { type: 'jsqr' };
                // optional visual bounding (draw on canvas)
                drawBoundingBoxOnCanvas(r.location || {});
              }
            }
          } catch (e) {
            // ignore
          }
        }

        if (detection && detectionMeta) {
          // compute centroid in canvas coords
          const c = centroidFromDetection(detection) || null;
          if (c) {
            const inFrame = isPointInFrame(c.cx, c.cy);
            showFrameFeedback(inFrame);

            // Remplacer le bloc "if (inFrame) { ... }" dans processFrame par ceci :
            if (inFrame) {
              // extraire la valeur brute si possible (même logique que plus bas)
              let rawVal = detection.rawValue || detection.data || detection.text || null;
              if (!rawVal) {
                // pas de valeur -> rien à faire
                return;
              }
              const qStr = String(rawVal).trim();

              // 1) si ce qrcode est dans la liste "failedLookup" et bloqué, on skip entièrement
              if (isBlockedQrcode(qStr)) {
                const info = failedLookup.get(qStr) || { attempts: 0, blockedUntil: Date.now() };
                const rem = Math.max(0, Math.ceil((info.blockedUntil - Date.now()) / 1000));
                if (!frameEl.dataset.blockNoticeShown) {
                  frameEl.dataset.blockNoticeShown = '1';
                  console.log(`[scan] detected but blocked -> skip q=${qStr} (rem ${rem}s) attempts=${info.attempts}`);
                  status.textContent = `QR déjà testé — réessayer dans ~${rem}s`;
                  setTimeout(() => { delete frameEl.dataset.blockNoticeShown; }, 1500);
                }
                // on évite d'appeler handleDetected / de produire des logs répétitifs.
                return;
              }

              // 2) si pas bloqué, on suit le comportement normal mais en vérifiant detDebounce
              if (!detDebounce) {
                successFeedback();
                detDebounce = true;
                handleDetected(qStr).catch(e => { console.error('handleDetected error', e); detDebounce = false; });
              }
            } else {
              // not centered -> do not call handleDetected, show orange hint
              // nothing else
            }
          } else {
            // detection without location (rare) -> keep original behavior (accept)
            if (!detDebounce) {
              // extract raw value
              let rawVal = detection.rawValue || detection.data || detection.text || null;
              if (!rawVal) {
                detDebounce = false;
                return;
              }
              const qStr = String(rawVal).trim();

              // check blocked QR before doing anything
              if (isBlockedQrcode(qStr)) {
                const info = failedLookup.get(qStr) || { attempts: 0, blockedUntil: Date.now() };
                const rem = Math.max(0, Math.ceil((info.blockedUntil - Date.now()) / 1000));
                if (!frameEl.dataset.blockNoticeShown) {
                  frameEl.dataset.blockNoticeShown = '1';
                  console.log(`[scan] detected (no-location) but blocked -> skip q=${qStr} (rem ${rem}s) attempts=${info.attempts}`);
                  status.textContent = `QR déjà testé — réessayer dans ~${rem}s`;
                  setTimeout(() => { delete frameEl.dataset.blockNoticeShown; }, 1500);
                }
                // ensure we don't keep detDebounce locked forever
                setTimeout(() => { detDebounce = false; }, 600);
                return;
              }

              // not blocked -> proceed
              successFeedback();
              detDebounce = true;
              handleDetected(qStr).catch(e => { console.error('handleDetected error', e); detDebounce = false; });
            }
          }
        } else {
          // no detection -> ensure frame normal style
          frameEl.classList.remove('qr-found');
          status.textContent = 'Placez le QR dans le cadre…';
        }
      }
    } catch (e) {
      console.error('processFrame error', e);
    } finally {
      // continue loop
      requestAnimationFrame(processFrame);
    }
  }

  // handleDetected: unchanged business logic (lookup + redirect) but we keep detDebounce control here
  // ====== remplacement robuste de handleDetected ======
  async function handleDetected(value) {
    try {
      const q = String(value || '').trim();
      console.log('[scan] handleDetected q=', q);
      if (!q) {
        detDebounce = false;
        return;
      }

      // si déjà bloqué pour ce qrcode => skip
      if (isBlockedQrcode(q)) {
        const info = failedLookup.get(q);
        const rem = Math.max(0, Math.ceil((info.blockedUntil - Date.now())/1000));
        console.log(`[scan] qrcode blocked, skip (remaining ${rem}s), attempts=${info.attempts}`);
        status.textContent = `QR déjà testé — réessayer dans ~${rem}s`;
        // keep detDebounce true pour éviter appels concurrents
        setTimeout(() => { detDebounce = false; }, 800); 
        return;
      }

      loader.classList.add('show');
      status.textContent = 'Recherche de la conception…';

      const apiUrl = `/suivi/conceptions/lookup?qrcode=${encodeURIComponent(q)}`;
      console.log('[scan] fetch ->', apiUrl);

      const res = await fetch(apiUrl, { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      console.log('[scan] fetch status', res.status);

      // lire texte brut (utile quand backend renvoie html/texte)
      const rawText = await res.text().catch(() => null);
      let data = null;
      try { if (rawText) data = JSON.parse(rawText); } catch(e){ /* non JSON */ }
      console.log('[scan] response rawText=', rawText, ' parsed=', data);

      if (res.ok) {
        // extraction d'un id (même logique que précédemment)
        function findId(obj) {
          if (!obj) return null;
          if (typeof obj === 'string' || typeof obj === 'number') {
            const s = String(obj);
            const uuidMatch = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F\-]{9,}/);
            const numMatch = s.match(/\d{3,}/);
            return uuidMatch ? uuidMatch[0] : (numMatch ? numMatch[0] : null);
          }
          if (Array.isArray(obj)) {
            for (const it of obj) {
              const id = findId(it);
              if (id) return id;
            }
            return null;
          }
          const keys = ['id_conception','conception_id','conceptionId','id','uuid','conception','conceptionUuid'];
          for (const k of keys) if (obj[k]) return findId(obj[k]);
          for (const k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj,k)) continue;
            const id = findId(obj[k]);
            if (id) return id;
          }
          return null;
        }

        const cid = findId(data) || null;
        console.log('[scan] extracted cid=', cid);

        if (cid) {
          status.textContent = 'Conception trouvée — redirection…';
          stopCamera();

          if (redirectToGestion) {
            // redirection relative vers newplaque.html?id_conception=...
            const targetUrl = new URL('../Plaque/newplaque.html', window.location.href); // relative -> works in subfolders
            targetUrl.searchParams.set('id_conception', String(cid));
            console.log('[scan] redirect (gestion) ->', targetUrl.toString());
            // utilise href (comme dans ton exemple) pour conserver l'historique
            window.location.href = targetUrl.toString();
            return;
          }

          // comportement par défaut existant
          const redirectUrl = `/frontend/Plaque/suiviplaque.html?conception_id=${encodeURIComponent(cid)}`;
          console.log('[scan] redirect ->', redirectUrl);
          window.location.replace(redirectUrl);
          return;
        } else {
          // ok 200 mais pas d'id => on considère échec (évite loop)
          console.warn('[scan] fetch ok mais aucun id trouvé dans la réponse:', data || rawText);
          registerFailure(q, 200);
          status.textContent = 'Conception introuvable pour ce QR (réponse inattendue).';
        }
      } else if (res.status === 404) {
        console.log('[scan] 404 for q=', q);
        registerFailure(q, 404);
        status.textContent = 'Aucune conception trouvée (404).';
      } else {
        console.error('[scan] erreur fetch', res.status, rawText);
        registerFailure(q, res.status);
        status.textContent = `Erreur serveur: ${res.status}. Réessayer plus tard.`;
      }
    } catch (err) {
      console.error('handleDetected error', err);
      status.textContent = 'Erreur de recherche — réessayez.';
    } finally {
      loader.classList.remove('show');
      // réactive détection après court délai si pas bloqué
      setTimeout(() => { detDebounce = false; }, 1200);
    }
  }


  function stopCamera() {
    try {
      const s = video.srcObject;
      if (s && s.getTracks) s.getTracks().forEach(t => { try { t.stop(); } catch (e) { } });
      video.srcObject = null;
    } catch (e) { }
    running = false;
  }

  // user triggers start capture
  const cameraWrapper = document.getElementById('camera-wrapper');
  cameraWrapper.addEventListener('click', () => { startCamera().catch(()=>{}); });
  cameraWrapper.addEventListener('touchstart', (e) => { e.preventDefault(); startCamera().catch(()=>{}); }, { passive: false });

  // try auto-start if permission already granted
  (async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      startCamera().catch(()=>{});
    } catch (e) {
      // permission not granted: wait for user action
    }
  })();

  // cleanup
  window.addEventListener('beforeunload', () => stopCamera());
})();
