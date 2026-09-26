'use strict';

/* ============================================================
   souvenir.js — the Souvenir 2026 flipbook (/souvenir).
   Pages are pre-rendered WebP images of the souvenir PDF
   (public/docs/souvenir/pages/p001.webp …). StPageFlip (CDN) does
   the page-turn; images are lazy-loaded around the open page.
   ============================================================ */

(function () {
  // ---- EDIT HERE if the souvenir PDF is replaced -------------
  const SOUVENIR = {
    pages: 164,
    dir: '/docs/souvenir/pages/',
    width: 1038,  // rendered page size (px) — sets the aspect ratio
    height: 1400,
  };
  const PRELOAD_BEHIND = 3;
  const PRELOAD_AHEAD = 6;

  const book = document.getElementById('svBook');
  const reader = document.getElementById('svReader');
  if (!book || !reader) return;

  const prevBtn = document.getElementById('svPrev');
  const nextBtn = document.getElementById('svNext');
  const countEl = document.getElementById('svCount');
  const range = document.getElementById('svRange');
  const fullBtn = document.getElementById('svFull');

  const src = (i) => `${SOUVENIR.dir}p${String(i + 1).padStart(3, '0')}.webp`;
  const last = SOUVENIR.pages - 1;

  // Build the page elements (front & back covers are "hard" boards).
  const frag = document.createDocumentFragment();
  for (let i = 0; i < SOUVENIR.pages; i++) {
    const page = document.createElement('div');
    page.className = 'sv-page';
    if (i === 0 || i === last) page.dataset.density = 'hard';
    const img = document.createElement('img');
    img.alt = `Souvenir page ${i + 1}`;
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('load', () => page.classList.add('is-loaded'));
    page.appendChild(img);
    frag.appendChild(page);
  }
  book.appendChild(frag);
  const pages = Array.from(book.children);

  function loadAround(idx) {
    const from = Math.max(0, idx - PRELOAD_BEHIND);
    const to = Math.min(last, idx + PRELOAD_AHEAD);
    for (let i = from; i <= to; i++) {
      const img = pages[i].firstChild;
      if (!img.getAttribute('src')) img.src = src(i);
    }
  }
  loadAround(0);

  if (typeof St === 'undefined' || !St.PageFlip) {
    // CDN blocked: fall back to a plain scrolling stack of pages.
    reader.classList.add('sv-reader--fallback');
    pages.forEach((p, i) => { p.firstChild.loading = 'lazy'; p.firstChild.src = src(i); });
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flip = new St.PageFlip(book, {
    width: SOUVENIR.width,
    height: SOUVENIR.height,
    size: 'stretch',
    minWidth: 1,          // real value set by pickLayout() below
    maxWidth: SOUVENIR.width,
    minHeight: 300,
    maxHeight: SOUVENIR.height,
    showCover: true,
    usePortrait: true,
    drawShadow: true,
    maxShadowOpacity: 0.45,
    flippingTime: reduceMotion ? 350 : 900,
    mobileScrollSupport: true,
    swipeDistance: 24,
    showPageCorners: true,
    autoSize: true,
  });
  flip.loadFromHTML(pages);

  // One page or a two-page spread — whichever shows the pages larger on
  // this screen (e.g. an upright tablet reads better one page at a time).
  // StPageFlip goes single-page when the stage is narrower than 2 × minWidth.
  const stage = document.getElementById('svStage');
  const ratio = SOUVENIR.width / SOUVENIR.height;
  function pickLayout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const singleH = Math.min(h, w / ratio);
    const spreadH = Math.min(h, w / 2 / ratio);
    flip.getSettings().minWidth = singleH > spreadH * 1.2 ? Math.ceil(w / 2) + 1 : 1;
    flip.update();
  }
  pickLayout();
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(pickLayout);
  });

  function update(idx) {
    loadAround(idx);
    const portrait = flip.getOrientation() === 'portrait';
    let label;
    if (idx === 0) label = 'Cover';
    else if (idx === last) label = 'Back cover';
    else if (portrait || idx + 1 >= last) label = `Page ${idx + 1} of ${SOUVENIR.pages}`;
    else label = `Pages ${idx + 1}–${idx + 2} of ${SOUVENIR.pages}`;
    countEl.textContent = label;
    range.value = String(idx + 1);
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx >= last || (!portrait && idx + 1 >= last);
  }

  flip.on('flip', (e) => update(e.data));
  flip.on('changeOrientation', () => update(flip.getCurrentPageIndex()));
  flip.on('init', () => update(flip.getCurrentPageIndex()));
  update(0);

  prevBtn.addEventListener('click', () => flip.flipPrev());
  nextBtn.addEventListener('click', () => flip.flipNext());

  // Slider: preview the target page's label while dragging, jump on release.
  range.max = String(SOUVENIR.pages);
  range.addEventListener('input', () => { countEl.textContent = `Go to page ${range.value}`; });
  range.addEventListener('change', () => {
    const target = Number(range.value) - 1;
    loadAround(target);
    flip.turnToPage(target);
    update(flip.getCurrentPageIndex());
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); flip.flipNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); flip.flipPrev(); }
  });

  // The control bar floats over the book on wide screens — fade it out
  // while reading, bring it back on any mouse move, tap or key press.
  const bar = reader.querySelector('.sv-bar');
  let idleTimer = 0;
  function wake() {
    reader.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (bar.matches(':hover') || bar.contains(document.activeElement)) return wake();
      reader.classList.add('is-idle');
    }, 2600);
  }
  ['mousemove', 'touchstart', 'keydown', 'wheel'].forEach((t) =>
    document.addEventListener(t, wake, { passive: true }));
  wake();

  // Full screen (hidden where the API is unavailable, e.g. iPhone Safari).
  const canFull = !!(reader.requestFullscreen || reader.webkitRequestFullscreen);
  if (!canFull) fullBtn.hidden = true;
  fullBtn.addEventListener('click', () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (reader.requestFullscreen || reader.webkitRequestFullscreen).call(reader);
  });
  const onFs = () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    reader.classList.toggle('is-fullscreen', on);
    fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    // Let the new layout settle, then have the book re-measure itself.
    requestAnimationFrame(pickLayout);
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
})();
