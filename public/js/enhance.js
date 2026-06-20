'use strict';

/* ============================================================
   enhance.js — interaction polish layer (loaded after main.js)
   · pointer-follow spotlight on cards (event-delegated, so it
     works for cards main.js renders asynchronously)
   · hero parallax (mouse + scroll)
   · magnetic primary buttons
   · subtle 3D tilt on the delegate card
   Everything degrades gracefully and respects reduced-motion.
   ============================================================ */

(function () {
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia &&
    window.matchMedia('(pointer: fine)').matches;

  /* ---- 1. Card spotlight (delegated) ---- */
  const SPOT = '.org-card, .day-col, .venue-card, .leader, .sponsor-card, .charter-card';
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest(SPOT);
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  if (reduce) return; // skip the heavier motion below

  /* ---- 2. Hero parallax ---- */
  const arch = document.querySelector('.hero__arch');
  const crest = document.querySelector('.hero__crest');
  const heroInner = document.querySelector('.hero__inner');

  if (arch || crest) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (arch) arch.style.transform = `translateX(-50%) translateY(${y * 0.18}px)`;
        if (crest) crest.style.transform = `translateY(${y * 0.08}px)`;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (fine && heroInner) {
    const hero = document.querySelector('.hero');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      if (arch) arch.style.marginLeft = `${dx * 18}px`;
      heroInner.style.transform = `translate(${dx * 8}px, ${dy * 6}px)`;
    });
    hero.addEventListener('pointerleave', () => {
      heroInner.style.transform = '';
      if (arch) arch.style.marginLeft = '';
    });
  }

  /* ---- 3. Magnetic primary buttons (pointer-fine only) ---- */
  if (fine) {
    const magnetize = (btn) => {
      const strength = 0.32;
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    };
    // run after main.js has had a tick to add .btn-shine etc.
    const wire = () => document
      .querySelectorAll('.hero__cta .btn-primary, .floating-register')
      .forEach(magnetize);
    if (document.readyState === 'complete') wire();
    else window.addEventListener('load', wire);
  }

  /* ---- 4. 3D tilt on the delegate card ---- */
  if (fine) {
    const tiltSetup = () => {
      const card = document.querySelector('.delegate-card');
      if (!card) return;
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform .2s var(--ease-out)';
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          `perspective(900px) rotateY(${dx * 5}deg) rotateX(${-dy * 5}deg) translateY(-4px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    };
    if (document.readyState === 'complete') tiltSetup();
    else window.addEventListener('load', tiltSetup);
  }
})();
