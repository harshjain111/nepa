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

  /* ============================================================
     DATA — verified against the official NEPA brochure (8pp).
     Event: National Edible Oil Conclave 2026 · "संपर्क / Sampark"
     ============================================================ */

  // Key Reasons to Attend (brochure p.3) — replaces the old "Charter".
  const WHY = [
    { t: 'Connect', d: 'Meet 400+ traders, manufacturers, buyers & industry stakeholders.' },
    { t: 'Grow', d: 'Unlock sourcing, trade & distribution opportunities.' },
    { t: 'Learn', d: 'Gain insights on markets, policy & future trends.' },
    { t: 'Network', d: 'Build meaningful business relationships nationwide.' },
    { t: 'Lead', d: "Be part of India's evolving edible oil ecosystem." },
  ];

  // Two days of Innovation and Impact (brochure p.7).
  const PROGRAMME = [
    {
      tag: 'Day 01',
      title: 'Saturday, 19 September 2026',
      note: 'Saturday is reserved for arrival, the opening dialogue between industry and trade, and the warmth of an Assamese welcome.',
      items: [
        { time: '1:15 PM', event: 'Registration & Welcome' },
        { time: '4:30 PM', event: 'Panel Session' },
        { time: '7:30 PM', event: 'Cultural Evening, Followed by Gala Dinner' },
      ],
    },
    {
      tag: 'Day 02',
      title: 'Sunday, 20 September 2026',
      items: [
        { time: '8:30 AM', event: 'Breakfast' },
        { time: '10:00 AM', event: 'Opening Ceremony & Lighting of the Lamp' },
        { time: '10:30 AM', event: 'Panel Session' },
        { time: '11:00 AM', event: 'Address by President' },
        { time: '11:30 AM', event: 'Address by Guest of Honour' },
        { time: '11:45 AM', event: 'Address by Chief Guest' },
        { time: '12:00 PM', event: 'Felicitation' },
        { time: '1:30 PM', event: 'Lunch' },
      ],
    },
  ];

  // Sponsorship tariff (brochure p.5). All amounts + GST.
  const SPONSOR_TIERS = [
    { tier: 'Diamond', amount: '₹15,00,000', rank: 'diamond', inclusions: ['Premier presence across the Conclave', 'Top-tier branding & visibility'] },
    { tier: 'Platinum', amount: '₹10,00,000', rank: 'platinum', inclusions: ['08 Delegates', '4 Rooms · 5 Star', 'Banners', 'Electronic Media', 'Souvenirs', '2 Stalls'] },
    { tier: 'Gold', amount: '₹5,00,000', rank: 'gold', inclusions: ['04 Delegates', '2 Rooms · 5 Star', 'Banners', 'Electronic Media', 'Souvenirs', '1 Stall'] },
    { tier: 'Silver', amount: '₹3,00,000', rank: 'silver', inclusions: ['02 Delegates', '1 Room · 5 Star', 'Banners', 'Electronic Media', 'Souvenirs', '1 Stall'] },
    { tier: 'Bronze', amount: '₹1,00,000', rank: 'bronze', inclusions: ['02 Delegates', '1 Room · 5 Star', 'Banners', 'Electronic Media', 'Souvenirs'] },
    { tier: 'Kit Bag Sponsor', amount: '₹5,00,000', rank: 'kit', inclusions: ['Delegate kit branding', 'Logo on every conclave bag'] },
  ];

  // Associate / category sponsorships (brochure p.5). All + GST.
  const SPONSOR_OTHER = [
    { tier: 'Cocktail Sponsor', amount: '₹8,00,000' },
    { tier: 'Dinner Sponsor', amount: '₹7,00,000' },
    { tier: 'Lunch Sponsor', amount: '₹6,00,000' },
    { tier: 'Table Branding', amount: '₹2,00,000' },
    { tier: 'Gift Sponsor', amount: '₹2,00,000' },
    { tier: 'Hi-Tea Sponsor', amount: '₹2,00,000' },
    { tier: 'Exhibition Stall', amount: '₹70,000', note: 'Per stall · 3m × 3m · incl. 1 delegate + 1 room (3 Star)' },
    { tier: 'Magazine Ad', amount: '₹25,000' },
  ];

  // The Mustard Oil Promotion Council (brochure p.2) — 9 members, verified roles.
  const COUNCIL = [
    { name: 'Shri Babu Lal Data', role: 'President · COOIT', org: 'MOPA · Central Organization for Oil Industry & Trade', lead: true, img: '/img/council/babu-lal-data.jpg' },
    { name: 'Shri Suresh Nagpal', role: 'Chairman · COOIT', org: 'Mustard Oil Producers Association (MOPA)', lead: true, img: '/img/council/suresh-nagpal.jpg' },
    { name: 'Shri Kailash Kabra', role: 'President · NEPA', org: 'National Edible Oil Promotion Association', lead: true, img: '/img/council/kailash-kabra.jpg' },
    { name: 'Shri Gajender Jha', role: 'General Secretary · COOIT', org: 'Central Organization for Oil Industry & Trade', img: '/img/council/gajender-jha.jpg' },
    { name: 'Shri Mahesh Goyal', role: 'Treasurer · COOIT', org: 'Central Organization for Oil Industry & Trade', img: '/img/council/mahesh-goyal.jpg' },
    { name: 'Shri Krishna Kumar Aggarwal', role: 'General Secretary · MOPA', org: 'Mustard Oil Producers Association (MOPA)', img: '/img/council/krishna-kumar-aggarwal.jpg' },
    { name: 'Shri Dinesh Rathore', role: 'Advisor · NEPA', org: "UP Oil Miller's Association", img: '/img/council/dinesh-rathore.jpg' },
    { name: 'Shri Neeraj Bothra', role: 'Secretary & Convenor · NEPA', org: 'National Edible Oil Promotion Association', img: '/img/council/neeraj-bothra.jpg' },
    { name: 'Shri Prakash Kabra', role: 'Treasurer · NEPA', org: 'National Edible Oil Promotion Association', img: '/img/council/prakash-kabra.jpg' },
  ];

  // Conclave Organising Committee (brochure p.4) — 37 members, verified.
  const COMMITTEE = [
    { name: 'Shri Dilip Khandelwal', city: 'Cuttack', role: 'Vice President' },
    { name: 'Shri Mukesh Agarwal', city: 'Kolkata', role: 'Vice President' },
    { name: 'Shri Mulchand Baid', city: 'Silchar', role: 'Vice President' },
    { name: 'Shri Dinesh Rathi', city: 'Guwahati', role: 'Joint Secretary' },
    { name: 'Shri Gautam Deorah', city: 'Guwahati', role: 'Joint Treasurer' },
    { name: 'Shri Praveen Kothari', city: 'Guwahati', role: 'Editor' },
    { name: 'Shri Mohit Baid', city: 'Guwahati', role: 'Sub Editor' },
    { name: 'Shri Vineet Golcha', city: 'Karimganj' },
    { name: 'Shri Moses Zanunsiama', city: 'Aizawl' },
    { name: 'Shri Vaibhav Jain', city: 'Guwahati' },
    { name: 'Shri Gagan Deorah', city: 'Shillong' },
    { name: 'Shri Balram Choudhary', city: 'Barpeta' },
    { name: 'Shri Mukul Deka', city: 'Mangaldoi' },
    { name: 'Shri Siyaram Jaiswal', city: 'Tezpur' },
    { name: 'Shri Mahendra Chandak', city: 'Dhekiajuli' },
    { name: 'Shri Vivek Goel', city: 'Siliguri' },
    { name: 'Shri Shiv (Dabbu) Agarwal', city: 'Guwahati' },
    { name: 'Shri Kamal Jain', city: 'Guwahati' },
    { name: 'Shri Rahul Gangh', city: 'Guwahati' },
    { name: 'Shri Niru Jain', city: 'Guwahati' },
    { name: 'Shri Rakesh Surana', city: 'Guwahati' },
    { name: 'Shri Kapil Jha', city: 'Guwahati' },
    { name: 'Shri Navin Jain', city: 'Siliguri' },
    { name: 'Shri Vishal Sharma', city: 'Jaipur' },
    { name: 'Shri Khokha Mandal', city: 'Guwahati' },
    { name: 'Shri Suresh Harlalka', city: 'Dhubri' },
    { name: 'Shri Anil Jain', city: 'Guwahati' },
    { name: 'Shri Naresh Somani', city: 'Guwahati' },
    { name: 'Shri Arvind Mour', city: 'Guwahati' },
    { name: 'Shri Manoj Sethia', city: 'Guwahati' },
    { name: 'Shri Sanjay Deorah', city: 'Dibrugarh' },
    { name: 'Shri Binod Ghorawat', city: 'Tinsukia' },
    { name: 'Shri Sawarmal Agarwal', city: 'Tinsukia' },
    { name: 'Shri Deepu Beria', city: 'Jorhat' },
    { name: 'Shri Nirmal Kumar Dargar', city: 'Jaipur' },
    { name: 'Shri Amit Choudhury', city: 'Guwahati' },
    { name: 'Shri Arun Kedia', city: 'Kolkata' },
  ];

  /* ---------------- Escape helper ---------------- */
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  /* ---------------- Icons (line-art SVG; stroke = currentColor) ---------------- */
  const ICON = (inner) =>
    `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const WHY_ICONS = [
    // Connect — interlocking rings
    ICON('<circle cx="13" cy="16" r="7"/><circle cx="19" cy="16" r="7"/>'),
    // Grow — upward trend
    ICON('<path d="M5 22h22"/><path d="M6 21l7-7 4 4 9-10"/><path d="M22 8h4v4"/>'),
    // Learn — lightbulb
    ICON('<path d="M16 4a8 8 0 0 0-5 14c1 .9 1.5 2 1.5 3h7c0-1 .5-2.1 1.5-3a8 8 0 0 0-5-14Z"/><path d="M13 25h6M14 28h4"/>'),
    // Network — connected nodes
    ICON('<circle cx="16" cy="7" r="3"/><circle cx="7" cy="23" r="3"/><circle cx="25" cy="23" r="3"/><path d="M16 10l-7 10M16 10l7 10M10 23h12"/>'),
    // Lead — flag
    ICON('<path d="M9 5v23"/><path d="M9 6h15l-3.5 4.5L24 15H9"/>'),
  ];

  /* ---------------- Render: Why Attend ---------------- */
  function renderWhy() {
    const grid = document.getElementById('whyGrid');
    if (!grid) return;
    grid.innerHTML = WHY.map((c, i) => `
      <article class="why-card reveal" data-delay="${(i % 4) + 1}">
        <span class="why-card__icon">${WHY_ICONS[i] || ''}</span>
        <h3>${esc(c.t)}</h3>
        <p>${esc(c.d)}</p>
      </article>`).join('');
  }

  /* ---------------- Render: Programme ---------------- */
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
        ${day.note ? `<p class="day-col__note">${esc(day.note)}</p>` : ''}
      </div>`).join('');
  }

  /* ---------------- Render: Sponsorship ---------------- */
  const sponsorMailto = (tier) =>
    `mailto:nepaconnect2026@gmail.com?subject=${encodeURIComponent('Sponsorship — ' + tier + ' — National Edible Oil Conclave 2026')}`;

  function renderSponsors() {
    const grid = document.getElementById('sponsorGrid');
    if (grid) {
      grid.innerHTML = SPONSOR_TIERS.map((s, i) => `
        <article class="sponsor-card sponsor-card--${s.rank} reveal" data-tier="${esc(s.tier)}" data-delay="${(i % 3) + 1}">
          <span class="sponsor-card__tier">${esc(s.tier)}</span>
          <span class="sponsor-card__amount">${esc(s.amount)} <em>+ GST</em></span>
          <ul class="sponsor-card__incl">
            ${s.inclusions.map((x) => `<li>${esc(x)}</li>`).join('')}
          </ul>
          <a class="btn btn-ghost btn-block sponsor-card__btn" href="${sponsorMailto(s.tier)}">Enquire</a>
        </article>`).join('');
    }
    const other = document.getElementById('sponsorOther');
    if (other) {
      other.innerHTML = SPONSOR_OTHER.map((s, i) => `
        <article class="sponsor-mini reveal" data-delay="${(i % 4) + 1}">
          <span class="sponsor-mini__tier">${esc(s.tier)}</span>
          <span class="sponsor-mini__amount">${esc(s.amount)} <em>+ GST</em></span>
          ${s.note ? `<span class="sponsor-mini__note">${esc(s.note)}</span>` : ''}
        </article>`).join('');
    }
  }

  /* ---------------- Render: Council ---------------- */
  function renderCouncil() {
    const grid = document.getElementById('councilGrid');
    if (!grid) return;
    grid.innerHTML = COUNCIL.map((m, i) => `
      <article class="leader${m.lead ? ' leader--lead' : ''} reveal" data-delay="${(i % 3) + 1}">
        ${m.img ? `<img class="leader__photo" src="${m.img}" alt="${esc(m.name)}" loading="lazy" />` : ''}
        <span class="leader__name">${esc(m.name)}</span>
        <span class="leader__role">${esc(m.role)}</span>
        <span class="leader__org">${esc(m.org)}</span>
      </article>`).join('');
  }

  /* ---------------- Render: Organising Committee ---------------- */
  function renderCommittee() {
    const list = document.getElementById('committeeList');
    if (!list) return;
    list.innerHTML = COMMITTEE.map((m) => `
      <li class="committee-item">
        <span class="committee-item__name">${esc(m.name)}</span>
        <span class="committee-item__meta">${m.role ? esc(m.role) + ' · ' : ''}${esc(m.city)}</span>
      </li>`).join('');
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
        note.textContent = `Early-bird rate ends ${nice}`;
      } else {
        note.textContent = 'Spot registration open';
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

  /* ---------------- Boot ---------------- */
  function boot(config) {
    renderWhy();
    renderProgramme();
    renderSponsors();
    renderCouncil();
    renderCommittee();
    initHeader();
    initRegistration(config);
    initContact();
    initScrollProgress();
    initCountdown(config);
    initCounters();
    initParticles();
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
