'use strict';

/* ============================================================
   hotel.js — hotel booking flow (/hotel).
   4 steps: Hotel → Package → Details → Payment → Confirmation.
   Payment mirrors the delegate registration flow.
   ============================================================ */

(function () {
  const form = document.getElementById('hotelForm');
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  const state = { step: 1, hotel: null, occupancy: null, method: null, gstRate: 0.18 };
  let hotels = [];

  const steps = Array.from(form.querySelectorAll('[data-step-panel]'));
  const indicators = Array.from(document.querySelectorAll('#hStepper .step'));

  /* ---------- errors ---------- */
  const setError = (key, msg) => {
    const span = form.querySelector(`[data-error-for="${key}"]`);
    if (span) { span.textContent = msg || ''; span.classList.toggle('show', !!msg); }
    const input = $(key);
    if (input) input.closest('.field') && input.closest('.field').classList.toggle('field--invalid', !!msg);
  };
  const clearErrors = () => {
    form.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; s.classList.remove('show'); });
    form.querySelectorAll('.field--invalid').forEach((f) => f.classList.remove('field--invalid'));
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- step nav ---------- */
  function showStep(n) {
    state.step = n;
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.stepPanel) === n));
    indicators.forEach((ind) => {
      const sn = Number(ind.dataset.step);
      ind.classList.toggle('is-active', sn === n);
      ind.classList.toggle('is-done', sn < n);
    });
    const shell = form.closest('.register-shell');
    if (shell) shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- load hotels ---------- */
  async function loadHotels() {
    const list = $('hotelList');
    try {
      const res = await fetch('/api/hotels');
      const data = await res.json();
      state.gstRate = typeof data.gstRate === 'number' ? data.gstRate : 0.18;
      hotels = data.hotels || [];
    } catch (e) { hotels = []; }

    if (!hotels.length) {
      list.innerHTML = '<div class="hotel-empty">Hotel booking isn\'t open yet. Please check back soon, or contact the Secretariat at 94350-40234.</div>';
      return;
    }
    list.innerHTML = hotels.map((h) => {
      const full = h.full || h.roomsRemaining <= 0;
      const left = full ? 'Fully booked' : `${h.roomsRemaining} room${h.roomsRemaining === 1 ? '' : 's'} left`;
      return `
        <button type="button" class="hotel-card${full ? ' is-full' : ''}" data-hotel="${esc(h.id)}"${full ? ' disabled aria-disabled="true"' : ''}>
          <span class="hotel-card__top">
            <span class="hotel-card__name">${esc(h.name)}</span>
            <span class="hotel-card__rooms${full ? ' is-full' : ''}">${left}</span>
          </span>
          ${h.address ? `<span class="hotel-card__addr">${esc(h.address)}</span>` : ''}
          <span class="hotel-card__prices">Single ${inr(h.singlePrice)} · Double ${inr(h.doublePrice)} <em>+ GST</em></span>
        </button>`;
    }).join('');

    list.querySelectorAll('[data-hotel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state.hotel = hotels.find((h) => h.id === btn.dataset.hotel) || null;
        list.querySelectorAll('.hotel-card').forEach((b) => b.classList.toggle('is-active', b === btn));
        setError('hotel', '');
        // reset package selection when hotel changes
        state.occupancy = null;
        document.querySelectorAll('#pkgGroup .pkg-card').forEach((c) => c.classList.remove('is-active'));
        $('hPrice').hidden = true;
        renderPackagePrices();
      });
    });
  }

  function renderPackagePrices() {
    if (!state.hotel) return;
    document.querySelector('[data-pkg-price="Single"]').innerHTML = `${inr(state.hotel.singlePrice)} <em>+ GST</em>`;
    document.querySelector('[data-pkg-price="Double"]').innerHTML = `${inr(state.hotel.doublePrice)} <em>+ GST</em>`;
  }

  function priceFor(occ) {
    const room = occ === 'Single' ? state.hotel.singlePrice : state.hotel.doublePrice;
    const gst = Math.round(room * state.gstRate);
    return { room, gst, total: room + gst };
  }

  function updateSummary() {
    if (!state.hotel || !state.occupancy) return;
    const p = priceFor(state.occupancy);
    $('hRoomLabel').textContent = `${state.occupancy} Occupancy`;
    $('hRoomAmount').textContent = inr(p.room);
    $('hGstAmount').textContent = inr(p.gst);
    $('hTotalAmount').textContent = inr(p.total);
    $('hPrice').hidden = false;
    $('hPayAmount').textContent = inr(p.total);
  }

  /* ---------- package select ---------- */
  document.getElementById('pkgGroup').querySelectorAll('[data-pkg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.occupancy = btn.dataset.pkg;
      document.querySelectorAll('#pkgGroup .pkg-card').forEach((c) => c.classList.toggle('is-active', c === btn));
      setError('pkg', '');
      updateSummary();
      // show/hide second-guest field on step 3
      const gf = form.querySelector('[data-guest-field]');
      if (gf) gf.hidden = state.occupancy !== 'Double';
    });
  });

  /* ---------- mobile digit strip ---------- */
  $('hMobile').addEventListener('input', () => { $('hMobile').value = $('hMobile').value.replace(/\D/g, '').slice(0, 10); });

  /* ---------- payment method toggle ---------- */
  const payPanels = Array.from(form.querySelectorAll('[data-pay-panel]'));
  document.getElementById('hMethodGroup').querySelectorAll('[data-method]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.method = btn.dataset.method;
      document.querySelectorAll('#hMethodGroup .method-card').forEach((b) => b.classList.toggle('is-active', b === btn));
      payPanels.forEach((p) => (p.hidden = p.dataset.payPanel !== state.method));
      setError('method', ''); setError('hUpiShot', ''); setError('hBankShot', '');
    });
  });

  /* ---------- validation per step ---------- */
  function validateStep(n) {
    clearErrors();
    if (n === 1) {
      if (!state.hotel) { setError('hotel', 'Please choose a hotel.'); return false; }
      if (state.hotel.roomsRemaining <= 0) { setError('hotel', 'That hotel is full — please pick another.'); return false; }
      return true;
    }
    if (n === 2) {
      if (!state.occupancy) { setError('pkg', 'Please choose single or double occupancy.'); return false; }
      return true;
    }
    if (n === 3) {
      let ok = true;
      if (!$('hName').value.trim()) { setError('hName', 'Please enter your full name.'); ok = false; }
      if (!$('hFirm').value.trim()) { setError('hFirm', 'Please enter your firm / organization.'); ok = false; }
      if (!$('hAddress').value.trim()) { setError('hAddress', 'Please enter your address.'); ok = false; }
      if (!/^\d{10}$/.test($('hMobile').value.trim())) { setError('hMobile', 'Enter a valid 10-digit number.'); ok = false; }
      const em = $('hEmail').value.trim();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError('hEmail', 'Enter a valid email or leave it blank.'); ok = false; }
      return ok;
    }
    return true;
  }

  form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => {
    if (!validateStep(state.step)) return;
    showStep(Math.min(state.step + 1, 4));
  }));
  form.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => showStep(Math.max(state.step - 1, 1))));

  /* ---------- submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    if (!state.method) { setError('method', 'Please choose a payment method.'); return; }

    const fileInput = state.method === 'UPI' ? $('hUpiShot') : state.method === 'Bank' ? $('hBankShot') : null;
    if (state.method === 'UPI' || state.method === 'Bank') {
      const key = state.method === 'UPI' ? 'hUpiShot' : 'hBankShot';
      if (!fileInput || !fileInput.files || !fileInput.files[0]) { setError(key, 'A payment screenshot is required for this method.'); return; }
    }

    const fd = new FormData();
    fd.append('hotelId', state.hotel.id);
    fd.append('occupancy', state.occupancy);
    fd.append('fullName', $('hName').value.trim());
    fd.append('firm', $('hFirm').value.trim());
    fd.append('address', $('hAddress').value.trim());
    fd.append('mobile', $('hMobile').value.trim());
    fd.append('email', $('hEmail').value.trim());
    if (state.occupancy === 'Double') fd.append('guestName', $('hGuest').value.trim());
    fd.append('paymentMethod', state.method);
    if (state.method === 'Bank') fd.append('referenceNo', $('hBankRef').value.trim());
    if (state.method === 'Cash') fd.append('note', $('hCashNote').value.trim());
    if (fileInput && fileInput.files[0]) fd.append('screenshot', fileInput.files[0]);

    const btn = $('hSubmit');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const res = await fetch('/api/hotel-bookings', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Booking failed. Please try again.');
      showConfirmation(data);
    } catch (err) {
      setError('submit', err.message || 'Something went wrong. Please try again.');
      // if the hotel filled up mid-flow, refresh availability
      if (/full|available/i.test(err.message || '')) loadHotels();
    } finally {
      btn.disabled = false; btn.textContent = 'Complete Booking';
    }
  });

  function showConfirmation(data) {
    form.hidden = true;
    document.getElementById('hStepper').hidden = true;
    const head = document.querySelector('.register-head');
    if (head) head.hidden = true;
    $('hConfName').textContent = data.fullName || $('hName').value.trim();
    $('hConfId').textContent = data.bookingId;
    $('hConfHotel').textContent = `${data.hotelName} · ${data.occupancy}`;
    $('hConfAmount').textContent = inr(data.totalAmount);
    $('hConfirmation').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- prefill from a just-completed registration ---------- */
  function applyPrefill() {
    try {
      const raw = sessionStorage.getItem('nepa_hotel_prefill');
      if (!raw) return;
      sessionStorage.removeItem('nepa_hotel_prefill');
      const p = JSON.parse(raw);
      if (p.fullName) $('hName').value = p.fullName;
      if (p.mobile) $('hMobile').value = p.mobile;
      if (p.organization) $('hFirm').value = p.organization;
    } catch (e) { /* ignore */ }
  }

  loadHotels();
  applyPrefill();
  showStep(1);
})();
