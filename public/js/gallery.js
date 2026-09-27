'use strict';

/* ============================================================
   gallery.js — /gallery page. Renders every photo listed in
   /gallery/photos.json (built by scripts/build-gallery.py) as
   a lazy-loaded square grid, and opens a full-screen lightbox
   on tap (arrows / ← → keys / swipe, Esc to close).
   ============================================================ */

(function () {
  const grid = document.getElementById('galleryGrid');
  const countEl = document.getElementById('galleryCount');
  const lb = document.getElementById('galleryLightbox');
  const lbImg = document.getElementById('glbImg');
  const lbCount = document.getElementById('glbCount');
  const lbDownload = document.getElementById('glbDownload');
  const lbStage = document.getElementById('glbStage');
  let photos = [];
  let current = -1;
  let lastFocus = null;

  fetch('/gallery/photos.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((list) => { photos = list; render(); })
    .catch(() => { grid.innerHTML = '<p class="gallery-empty">Photos could not be loaded. Please refresh the page.</p>'; });

  function render() {
    countEl.textContent = photos.length + ' Photographs';
    const frag = document.createDocumentFragment();
    photos.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'g-tile';
      btn.setAttribute('aria-label', 'Open photo ' + (i + 1) + ' of ' + photos.length);
      const img = document.createElement('img');
      img.src = p.t;
      img.width = p.w;
      img.height = p.h;
      img.alt = '';
      img.loading = i < 18 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      btn.appendChild(img);
      btn.addEventListener('click', () => open(i));
      frag.appendChild(btn);
    });
    grid.appendChild(frag);
    // Cached images may already be complete before the listener fires.
    grid.querySelectorAll('img').forEach((img) => { if (img.complete) img.classList.add('is-loaded'); });
  }

  /* ---------- Lightbox ---------- */
  function open(i) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i);
    document.getElementById('glbClose').focus();
  }

  function close() {
    lb.hidden = true;
    document.body.style.overflow = '';
    lbImg.removeAttribute('src');
    current = -1;
    if (lastFocus) lastFocus.focus();
  }

  function show(i) {
    current = (i + photos.length) % photos.length;
    const p = photos[current];
    lb.classList.add('is-loading');
    // Show the (already cached) thumbnail instantly, then swap in the large copy.
    lbImg.src = p.t;
    const full = new Image();
    full.onload = () => { if (photos[current] === p) { lbImg.src = p.l; lb.classList.remove('is-loading'); } };
    full.onerror = () => { if (photos[current] === p) lb.classList.remove('is-loading'); };
    full.src = p.l;
    lbImg.alt = 'Photo ' + (current + 1) + ' of ' + photos.length;
    lbCount.textContent = (current + 1) + ' / ' + photos.length;
    lbDownload.href = p.l;
    lbDownload.setAttribute('download', 'nepa-conclave-2026-' + String(current + 1).padStart(3, '0') + '.webp');
    // Warm the neighbours so next/prev feel instant.
    [current + 1, current - 1].forEach((n) => { new Image().src = photos[(n + photos.length) % photos.length].l; });
  }

  document.getElementById('glbPrev').addEventListener('click', () => show(current - 1));
  document.getElementById('glbNext').addEventListener('click', () => show(current + 1));
  document.getElementById('glbClose').addEventListener('click', close);
  // The <img> box fills the stage (object-fit: contain), so a click on the
  // letterboxed space around the actual photo should still close the viewer.
  lbStage.addEventListener('click', (e) => {
    if (e.target === lbStage) return close();
    if (e.target !== lbImg || !lbImg.naturalWidth) return;
    const r = lbImg.getBoundingClientRect();
    const scale = Math.min(r.width / lbImg.naturalWidth, r.height / lbImg.naturalHeight);
    const w = lbImg.naturalWidth * scale, h = lbImg.naturalHeight * scale;
    const x = e.clientX - r.left - (r.width - w) / 2;
    const y = e.clientY - r.top - (r.height - h) / 2;
    if (x < 0 || y < 0 || x > w || y > h) close();
  });

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
  });

  // Swipe left/right to move between photos (single finger only, so pinch-zoom still works).
  let sx = 0, sy = 0, tracking = false;
  lbStage.addEventListener('touchstart', (e) => {
    tracking = e.touches.length === 1;
    if (tracking) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  lbStage.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
