'use strict';

/* ============================================================
   main.js — NEPA Mustard Oil Conclave 2026
   Content rendering · reveal animation · gem particles ·
   3-step registration flow (CLAUDE.md §5, §8)
   ============================================================ */

(function () {
  /* ---------------- Currency (Indian grouping) ---------------- */
  const inr = (n) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);

  /* ---------------- Data arrays ---------------- */
  const CHARTER = [
    { t: 'Bridge between B2B Channel', d: 'Channelise cold-pressed, single-origin mustard oil through a unified network between manufacturers and distributors.' },
    { t: 'Stand with the Mustard Farmers', d: 'Strengthen MSP support, ensure fair price discovery, and integrate the smallholder farmer into the National Mission on Edible Oils–Oilseeds.' },
    { t: 'Educate & Counter Misinformation', d: 'Articulate, with evidence, the health virtues of mustard oil — its omega-3 content, low saturated fat, and place in Ayurveda and modern nutrition.' },
    { t: 'Strengthen FSSAI Standards', d: 'Advocate robust standards, swift enforcement against adulteration, and preservation of the ban on blending in mustard oil.' },
    { t: 'Build a Heritage Brand', d: 'Pursue Geographical Indication (GI) tags for regional varieties and project Indian mustard oil on the world stage.' },
    { t: 'Develop Export Markets', d: 'Open new corridors for Indian mustard oil — to the diaspora, specialty retail, and global culinary traditions.' },
    { t: 'Modernise the Ghani', d: 'Support technology adoption in extraction, packaging, traceability and food-safety without compromising the kachi ghani process.' },
    { t: 'Unify the Value Chain', d: 'Bring producers, millers, refiners, packers, traders and retailers under one collective voice.' },
  ];

  const PROGRAMME = [
    {
      tag: 'Day One',
      title: 'Saturday, 19 Sept 2026',
      items: [
        { time: '1:15 pm', event: 'Registration & Welcome Lunch' },
        { time: '4:30 pm', event: 'Panel Session: Bridge between B2B Channel' },
        { time: '7:30 pm', event: 'Cultural Evening: Bihu Performance & Gala Dinner' },
      ],
    },
    {
      tag: 'Day Two',
      title: 'Sunday, 20 Sept 2026',
      items: [
        { time: '8:30 am', event: 'Registration & Breakfast' },
        { time: '10:00 am', event: 'Opening & Lamp Lighting' },
        { time: '10:30 am', event: 'Panel: Pure Kachi Ghani — FSSAI Standards' },
        { time: '11:00 am', event: 'Presidential Address — Shri Babu Lal Data, President, COOIT' },
        { time: '11:15 am', event: 'Address — Shri Kailash Kabra, President, NEPA' },
        { time: '11:30 am', event: 'Address — Shri Suresh Nagpal, Chairman, COOIT' },
        { time: '11:45 am', event: "Chief Guest Address — Hon'ble Minister" },
        { time: '12:45 pm', event: 'Industry–Government Dialogue' },
        { time: '1:30 pm', event: 'Lunch' },
        { time: '2:30 pm', event: 'Open Discussions' },
        { time: '3:30 pm', event: 'Mustard Oil Excellence Awards' },
        { time: '4:00 pm', event: 'The Guwahati Mustard Charter: Public Reading' },
        { time: '4:30 pm', event: 'High Tea & Vote of Thanks' },
      ],
    },
  ];

  // Tier names per the official deck; figures to be announced.
  const SPONSORS = [
    { tier: 'Major Sponsor', note: 'Premier presence across the Conclave' },
    { tier: 'Diamond', note: 'Delegates · 5-star rooms · stalls' },
    { tier: 'Gold', note: 'Delegates · 5-star rooms · stall' },
    { tier: 'Silver', note: 'Delegate · 5-star room · stall' },
    { tier: 'Bronze', note: 'Delegate · 5-star room' },
  ];

  // Conclave Organising Committee (from the official deck).
  const COMMITTEE = [
    'Shri Sanjay Goenka', 'Shri Harnish Jain', 'Shri Manish Jain', 'Shri Raju Khandelwal',
    'Shri Satpal Lather', 'Smt. Rajni Aggarwal', 'Shri Yash Aggarwal', 'Shri Mahesh Rathore',
    'Shri Satish Babbar', 'Shri Dinesh Goyal', 'Shri Lalit Goyal', 'Shri Vinod Rajput',
    'Shri Gaurav Thakar', 'Shri Himanshu Aggarwal', 'Shri S.K. Jain', 'Shri Bharat Bhagat',
    'Shri Kumar Krishan Goyal', 'Shri Ajay Gupta', 'Shri Deepak Kanda', 'Shri Inder Aggarwal',
    'Shri Sandeep Aggarwal', 'Shri Sushil Tayal',
  ];

  /* ---------------- Escape helper ---------------- */
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  /* ---------------- Render cards ---------------- */
  function renderCharter() {
    const grid = document.getElementById('charterGrid');
    if (!grid) return;
    grid.innerHTML = CHARTER.map((c, i) => `
      <article class="charter-card reveal" data-delay="${(i % 4) + 1}">
        <span class="charter-card__no">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(c.t)}</h3>
        <p>${esc(c.d)}</p>
      </article>`).join('');
  }

  function renderProgramme() {
    const grid = document.getElementById('programmeGrid');
    if (!grid) return;
    grid.innerHTML = PROGRAMME.map((day, i) => `
      <div class="day-col reveal" data-delay="${i + 1}">
        <div class="day-col__head">
          <span class="day-col__tag">${esc(day.tag)}</span>
          <h3 class="day-col__title">${esc(day.title)}</h3>
        </div>
        <ul class="timeline">
          ${day.items.map((it) => `
            <li>
              <span class="timeline__time">${esc(it.time)}</span>
              <span class="timeline__event">${esc(it.event)}</span>
            </li>`).join('')}
        </ul>
      </div>`).join('');
  }

  function renderSponsors() {
    const grid = document.getElementById('sponsorGrid');
    if (!grid) return;
    grid.innerHTML = SPONSORS.map((s, i) => `
      <article class="sponsor-card reveal" data-tier="${esc(s.tier)}" data-delay="${(i % 4) + 1}">
        <span class="sponsor-card__tier">${esc(s.tier)}</span>
        <span class="sponsor-card__amount sponsor-card__amount--soon">Coming soon</span>
        <span class="sponsor-card__note">${esc(s.note)}</span>
        <a class="sponsor-card__btn" href="mailto:nepaconnect2026@gmail.com?subject=${encodeURIComponent('Sponsorship — ' + s.tier + ' — Mustard Conclave 2026')}">Contact Secretariat</a>
      </article>`).join('');
  }

  function renderCommittee() {
    const list = document.getElementById('committeeList');
    if (!list) return;
    list.innerHTML = COMMITTEE.map((name) => `<li>${esc(name)}</li>`).join('');
  }

  /* ---------------- Reveal on scroll ---------------- */
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------------- Gem particles ---------------- */
  function initParticles() {
    const host = document.getElementById('heroParticles');
    if (!host) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const count = window.innerWidth < 600 ? 10 : 18;
    for (let i = 0; i < count; i++) {
      const g = document.createElement('span');
      g.className = 'gem';
      const size = 5 + Math.random() * 8;
      g.style.left = Math.random() * 100 + '%';
      g.style.bottom = '-20px';
      g.style.width = size + 'px';
      g.style.height = size + 'px';
      g.style.animationDuration = 9 + Math.random() * 10 + 's';
      g.style.animationDelay = -(Math.random() * 12) + 's';
      g.style.opacity = String(0.3 + Math.random() * 0.5);
      host.appendChild(g);
    }
  }

  /* ---------------- Header + mobile nav ---------------- */
  function initHeader() {
    const header = document.getElementById('siteHeader');
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('primaryNav');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      nav.addEventListener('click', (e) => {
        if (e.target.closest('a, .btn')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  /* ============================================================
     REGISTRATION MODAL
     ============================================================ */
  function initRegistration(config) {
    const modal = document.getElementById('registerModal');
    const form = document.getElementById('registerForm');
    const confirmation = document.getElementById('confirmation');
    if (!modal || !form) return;

    const state = { step: 1, member: null, method: null };
    let lastFocused = null;

    const steps = Array.from(form.querySelectorAll('[data-step-panel]'));
    const stepIndicators = Array.from(document.querySelectorAll('#stepper .step'));

    /* ---- field error helpers ---- */
    const setError = (key, msg) => {
      const span = form.querySelector(`[data-error-for="${key}"]`) ||
        document.querySelector(`[data-error-for="${key}"]`);
      if (span) {
        span.textContent = msg || '';
        span.classList.toggle('show', !!msg);
      }
      const input = document.getElementById(key);
      if (input) input.closest('.field')?.classList.toggle('field--invalid', !!msg);
    };
    const clearErrors = () => {
      document.querySelectorAll('[data-error-for]').forEach((s) => {
        s.textContent = '';
        s.classList.remove('show');
      });
      form.querySelectorAll('.field--invalid').forEach((f) => f.classList.remove('field--invalid'));
    };

    /* ---- pricing ---- */
    const delegateFee = config.delegateFee;
    const membershipFee = config.membershipFee;
    const feeType = config.feeType;

    const updatePrices = () => {
      const member = state.member === true;
      const total = delegateFee + (member ? membershipFee : 0);
      document.getElementById('delegateLabel').textContent = `Delegate Fee (${feeType})`;
      document.getElementById('delegateAmount').textContent = inr(delegateFee);
      document.getElementById('memberAmount').textContent = inr(membershipFee);
      document.getElementById('memberRow').hidden = !member;
      document.getElementById('totalAmount').textContent = inr(total);
      document.getElementById('payAmount').textContent = inr(total);
    };

    // initial tariff live note + summary defaults
    const liveNote = document.getElementById('tariffLiveNote');
    if (liveNote) liveNote.textContent = `Current rate: ${feeType} — ${inr(delegateFee)} (membership +${inr(membershipFee)}).`;
    document.getElementById('delegateLabel').textContent = `Delegate Fee (${feeType})`;
    document.getElementById('delegateAmount').textContent = inr(delegateFee);
    document.getElementById('totalAmount').textContent = inr(delegateFee);
    document.getElementById('payAmount').textContent = inr(delegateFee);
    document.getElementById('memberAmount').textContent = inr(membershipFee);

    /* ---- step navigation ---- */
    const showStep = (n) => {
      state.step = n;
      steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.stepPanel) === n));
      stepIndicators.forEach((ind) => {
        const sn = Number(ind.dataset.step);
        ind.classList.toggle('is-active', sn === n);
        ind.classList.toggle('is-done', sn < n);
      });
    };

    const validateStep1 = () => {
      clearErrors();
      let ok = true;
      const fullName = document.getElementById('fullName').value.trim();
      const mobile = document.getElementById('mobile').value.trim();
      const email = document.getElementById('email').value.trim();
      const organization = document.getElementById('organization').value.trim();
      if (!fullName) { setError('fullName', 'Please enter your full name.'); ok = false; }
      if (!/^\d{10}$/.test(mobile)) { setError('mobile', 'Enter a valid 10-digit mobile number.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('email', 'Enter a valid email address.'); ok = false; }
      if (!organization) { setError('organization', 'Please enter your organization.'); ok = false; }
      return ok;
    };

    const validateStep2 = () => {
      clearErrors();
      if (state.member === null) {
        setError('member', 'Please choose Yes or No.');
        return false;
      }
      return true;
    };

    /* ---- mobile: strip non-digits, max 10 ---- */
    const mobileInput = document.getElementById('mobile');
    mobileInput.addEventListener('input', () => {
      mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
    });

    /* ---- membership toggle ---- */
    document.getElementById('memberToggle').querySelectorAll('[data-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.member = btn.dataset.member === 'true';
        document.querySelectorAll('#memberToggle .toggle-btn').forEach((b) =>
          b.classList.toggle('is-active', b === btn));
        setError('member', '');
        updatePrices();
      });
    });

    /* ---- method toggle ---- */
    const payPanels = Array.from(form.querySelectorAll('[data-pay-panel]'));
    document.getElementById('methodGroup').querySelectorAll('[data-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.method = btn.dataset.method;
        document.querySelectorAll('#methodGroup .method-card').forEach((b) =>
          b.classList.toggle('is-active', b === btn));
        payPanels.forEach((p) => (p.hidden = p.dataset.payPanel !== state.method));
        setError('method', '');
        setError('upiScreenshot', '');
        setError('bankScreenshot', '');
      });
    });

    /* ---- next / prev ---- */
    form.querySelectorAll('[data-next]').forEach((b) =>
      b.addEventListener('click', () => {
        if (state.step === 1 && !validateStep1()) return;
        if (state.step === 2 && !validateStep2()) return;
        showStep(Math.min(state.step + 1, 3));
      }));
    form.querySelectorAll('[data-prev]').forEach((b) =>
      b.addEventListener('click', () => showStep(Math.max(state.step - 1, 1))));

    /* ---- submit ---- */
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      if (!state.method) { setError('method', 'Please choose a payment method.'); return; }

      const fileInput =
        state.method === 'UPI' ? document.getElementById('upiScreenshot') :
        state.method === 'Bank' ? document.getElementById('bankScreenshot') : null;

      if ((state.method === 'UPI' || state.method === 'Bank')) {
        const errKey = state.method === 'UPI' ? 'upiScreenshot' : 'bankScreenshot';
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
          setError(errKey, 'A payment screenshot is required for this method.');
          return;
        }
      }

      const fd = new FormData();
      fd.append('fullName', document.getElementById('fullName').value.trim());
      fd.append('mobile', document.getElementById('mobile').value.trim());
      fd.append('email', document.getElementById('email').value.trim());
      fd.append('organization', document.getElementById('organization').value.trim());
      fd.append('nepaMember', String(state.member === true));
      fd.append('paymentMethod', state.method);
      if (state.method === 'Bank') fd.append('referenceNo', document.getElementById('bankRef').value.trim());
      if (state.method === 'Cash') fd.append('note', document.getElementById('cashNote').value.trim());
      if (fileInput && fileInput.files[0]) fd.append('screenshot', fileInput.files[0]);

      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      try {
        const res = await fetch('/api/register', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Registration failed. Please try again.');
        showConfirmation(data);
      } catch (err) {
        setError('submit', err.message || 'Something went wrong. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Registration';
      }
    });

    function showConfirmation(data) {
      form.hidden = true;
      document.getElementById('stepper').hidden = true;
      document.querySelector('.modal__head').hidden = true;
      document.getElementById('confName').textContent = data.fullName;
      document.getElementById('confRegId').textContent = data.regId;
      document.getElementById('confFeeType').textContent = data.feeType;
      document.getElementById('confAmount').textContent = inr(data.totalAmount);
      confirmation.hidden = false;
    }

    /* ---- open / close ---- */
    const open = () => {
      lastFocused = document.activeElement;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const first = document.getElementById('fullName');
      if (first) setTimeout(() => first.focus(), 50);
    };

    const reset = () => {
      form.reset();
      state.step = 1; state.member = null; state.method = null;
      clearErrors();
      document.querySelectorAll('#memberToggle .toggle-btn, #methodGroup .method-card')
        .forEach((b) => b.classList.remove('is-active'));
      payPanels.forEach((p) => (p.hidden = true));
      form.hidden = false;
      document.getElementById('stepper').hidden = false;
      document.querySelector('.modal__head').hidden = false;
      confirmation.hidden = true;
      showStep(1);
      updatePrices();
      state.member = null;
      document.getElementById('memberRow').hidden = true;
    };

    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      reset();
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    };

    document.querySelectorAll('[data-open-register]').forEach((b) =>
      b.addEventListener('click', open));
    document.querySelectorAll('[data-close-register]').forEach((b) =>
      b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });

    showStep(1);
  }

  /* ============================================================
     CONTACT FORM
     ============================================================ */
  function initContact() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const success = document.getElementById('contactSuccess');
    const submitBtn = document.getElementById('contactSubmit');

    const setErr = (key, msg) => {
      const span = form.querySelector(`[data-error-for="${key}"]`);
      if (span) { span.textContent = msg || ''; span.classList.toggle('show', !!msg); }
      const input = document.getElementById(key);
      if (input) input.closest('.field')?.classList.toggle('field--invalid', !!msg);
    };
    const clearErrs = () => {
      form.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; s.classList.remove('show'); });
      form.querySelectorAll('.field--invalid').forEach((f) => f.classList.remove('field--invalid'));
    };

    const phone = document.getElementById('cPhone');
    phone.addEventListener('input', () => { phone.value = phone.value.replace(/\D/g, '').slice(0, 15); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrs();
      const name = document.getElementById('cName').value.trim();
      const email = document.getElementById('cEmail').value.trim();
      const phoneVal = phone.value.trim();
      const subject = document.getElementById('cSubject').value.trim();
      const message = document.getElementById('cMessage').value.trim();

      let ok = true;
      if (!name) { setErr('cName', 'Please enter your name.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('cEmail', 'Enter a valid email address.'); ok = false; }
      if (phoneVal && !/^\d{7,15}$/.test(phoneVal)) { setErr('cPhone', 'Enter 7–15 digits, or leave blank.'); ok = false; }
      if (!message) { setErr('cMessage', 'Please enter a message.'); ok = false; }
      if (!ok) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone: phoneVal, subject, message }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send your message. Please try again.');
        form.reset();
        success.hidden = false;
        setTimeout(() => { success.hidden = true; }, 8000);
      } catch (err) {
        setErr('cSubmit', err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      }
    });
  }

  /* ============================================================
     SCROLL PROGRESS BAR
     ============================================================ */
  function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = pct + '%';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* ============================================================
     COUNTDOWN TO THE CONCLAVE
     ============================================================ */
  function initCountdown(config) {
    const root = document.getElementById('countdown');
    if (!root) return;
    const target = new Date('2026-09-19T09:00:00+05:30').getTime();
    const set = (k, v) => {
      const el = root.querySelector(`[data-cd="${k}"]`);
      if (el) el.textContent = String(v).padStart(2, '0');
    };
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        ['days', 'hours', 'minutes', 'seconds'].forEach((k) => set(k, 0));
        root.querySelector('.countdown__lead').textContent = 'The Conclave is here';
        return false;
      }
      const s = Math.floor(diff / 1000);
      set('days', Math.floor(s / 86400));
      set('hours', Math.floor((s % 86400) / 3600));
      set('minutes', Math.floor((s % 3600) / 60));
      set('seconds', s % 60);
      return true;
    };
    tick();
    const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000);

    // Early-bird urgency note
    const note = document.getElementById('earlyBirdNote');
    if (note && config && config.earlyBirdCutoff) {
      const today = new Date().toISOString().slice(0, 10);
      if (today <= config.earlyBirdCutoff) {
        const d = new Date(config.earlyBirdCutoff + 'T00:00:00');
        const nice = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        note.textContent = `★ Early-bird rate ends ${nice}`;
      } else {
        note.textContent = '★ Spot registration open';
      }
    }
  }

  /* ============================================================
     COUNT-UP STATS
     ============================================================ */
  function initCounters() {
    const els = document.querySelectorAll('[data-count-to]');
    if (!els.length) return;
    const run = (el) => {
      const to = parseInt(el.dataset.countTo, 10) || 0;
      const suffix = el.dataset.countSuffix || '';
      const dur = 1400;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------------- Charter card pointer glow ---------------- */
  function initCharterGlow() {
    const grid = document.getElementById('charterGrid');
    if (!grid) return;
    grid.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.charter-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    });
  }

  /* ---------------- Boot ---------------- */
  function boot(config) {
    renderCharter();
    renderProgramme();
    renderSponsors();
    renderCommittee();
    initHeader();
    initParticles();
    initRegistration(config);
    initContact();
    initScrollProgress();
    initCountdown(config);
    initCounters();
    initCharterGlow();
    // primary register CTAs get the sheen sweep
    document.querySelectorAll('[data-open-register].btn-primary').forEach((b) => b.classList.add('btn-shine'));
    // reveal observes everything, including freshly-rendered cards
    initReveal();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let config = { feeType: 'Early Bird', delegateFee: 8000, membershipFee: 3100, earlyBirdCutoff: '2026-08-15' };
    try {
      const res = await fetch('/api/config');
      if (res.ok) config = await res.json();
    } catch (e) {
      // fall back to defaults if config fetch fails
    }
    boot(config);
  });
})();
