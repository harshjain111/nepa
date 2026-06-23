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

  /* ---- 0. Floating register: show only between the hero and the footer ---- */
  const floatBtn = document.querySelector('.floating-register');
  const topHero = document.querySelector('.hero, .page-hero');
  const pageFoot = document.querySelector('.site-footer, .credit-bar');
  if (floatBtn) {
    if ('IntersectionObserver' in window && (topHero || pageFoot)) {
      let heroIn = !!topHero;   // start hidden when sitting on the hero
      let footIn = false;
      const apply = () => floatBtn.classList.toggle('is-shown', !heroIn && !footIn);
      if (topHero) {
        new IntersectionObserver(([e]) => { heroIn = e.isIntersecting; apply(); },
          { threshold: 0 }).observe(topHero);
      }
      if (pageFoot) {
        new IntersectionObserver(([e]) => { footIn = e.isIntersecting; apply(); },
          { threshold: 0 }).observe(pageFoot);
      }
      apply();
    } else {
      floatBtn.classList.add('is-shown'); // no anchors → always available
    }
  }

  /* ---- 1. Card spotlight (delegated) ---- */
  const SPOT = '.org-card, .day-col, .venue-card, .leader, .sponsor-card, .charter-card';
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest(SPOT);
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ---- Hero video: robust autoplay (desktop only) ----
     The mustard-field poster always shows; the video fades in once a real
     frame is ready. We listen on EVERY "frame available" event (so a cached
     load that fires before this runs is still caught), retry if autoplay is
     blocked or the network stalls, and poll as a final safety net so the
     hero never sits on a dim/blank frame. */
  const heroVideo = document.getElementById('heroVideo');
  if (heroVideo) {
    const wantVideo = !reduce &&
      window.matchMedia && window.matchMedia('(min-width: 760px)').matches;
    if (wantVideo) {
      const reveal = () => {
        if (heroVideo.readyState >= 2) heroVideo.classList.add('is-playing');
      };
      ['loadeddata', 'canplay', 'canplaythrough', 'playing'].forEach((ev) =>
        heroVideo.addEventListener(ev, reveal));

      const attempt = () => {
        const p = heroVideo.play();
        if (p && p.catch) p.catch(() => {
          // autoplay blocked → kick it off on the first user gesture
          const kick = () => { heroVideo.play().catch(() => {}); };
          ['pointerdown', 'touchstart', 'scroll', 'keydown'].forEach((ev) =>
            window.addEventListener(ev, kick, { once: true, passive: true }));
        });
      };

      heroVideo.preload = 'auto';
      try { heroVideo.load(); } catch (_) {}   // force the source to fetch
      reveal();                                 // cached / already-ready case
      attempt();

      // safety net: retry up to ~6s, then stop once it's actually playing
      let ticks = 0;
      const guard = setInterval(() => {
        reveal();
        if (heroVideo.paused) attempt();
        if (++ticks >= 10 || (!heroVideo.paused && heroVideo.readyState >= 3)) {
          clearInterval(guard);
        }
      }, 600);

      // if the source genuinely fails, leave the poster in place (no error UI)
      heroVideo.addEventListener('error', () => clearInterval(guard));
    }
    // On mobile / reduced-motion the poster (hero-field.jpg) remains the backdrop.
  }

  /* ---- 5. Scroll-spy: highlight the in-view section in the nav ----
     (the scroll-progress bar itself is handled by main.js initScrollProgress) */
  (function scrollSpy() {
    const links = Array.from(document.querySelectorAll('.nav a[href*="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map();
    links.forEach((a) => {
      const id = (a.getAttribute('href').split('#')[1] || '').trim();
      const sec = id && document.getElementById(id);
      if (sec) map.set(sec, a);
    });
    if (!map.size) return;
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        // only manage anchor links so the cross-page is-active stays intact
        map.forEach((a, sec) => {
          if (a.getAttribute('href').includes('#')) a.classList.toggle('is-active', sec === e.target);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    map.forEach((_, sec) => spy.observe(sec));
  })();

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
    // NB: the floating Register pill is intentionally excluded — it must stay
    // put (its centering transform would fight the magnetic translate).
    const wire = () => document
      .querySelectorAll('.hero__cta .btn-primary')
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
