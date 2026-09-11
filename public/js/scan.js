'use strict';

/* ============================================================
   scan.js — meal check-in scanner (gate role, also admin).
   Reads the delegate's ID-card QR (a vCard) with the device
   camera and redeems the selected meal.
   ============================================================ */

(function () {
  const TOKEN_KEY = 'nepa_admin_token';
  const ROLE_KEY = 'nepa_admin_role';
  const MEAL_KEY = 'nepa_scan_meal';

  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY);
  const role = () => sessionStorage.getItem(ROLE_KEY) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const api = async (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {});
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401) { handleLogout(); throw new Error('Session expired. Please sign in again.'); }
    return res;
  };
  const jpost = (path, body) => api(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());

  const loginScreen = $('loginScreen');
  const scanApp = $('scanApp');
  const loginError = $('loginError');

  let qr = null;          // Html5Qrcode instance
  let scanning = false;
  let meals = [];
  let lastText = '';      // debounce identical decodes
  let lastAt = 0;
  let busy = false;       // a redeem is in flight / result showing

  /* ---------------- auth ---------------- */
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const id = $('gateId').value.trim();
    const password = $('gatePassword').value;
    const btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invalid credentials');
      if (data.role !== 'gate' && data.role !== 'admin') {
        throw new Error('This login cannot run the scanner. Use the gate account.');
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(ROLE_KEY, data.role);
      $('gatePassword').value = '';
      showApp();
    } catch (err) {
      loginError.textContent = err.message || 'Login failed';
      loginError.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  function handleLogout() {
    stopCamera();
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    scanApp.hidden = true;
    loginScreen.hidden = false;
  }
  $('logoutBtn').addEventListener('click', handleLogout);

  /* ---------------- app ---------------- */
  async function showApp() {
    loginScreen.hidden = true;
    scanApp.hidden = false;
    await loadMeals();
  }

  async function loadMeals() {
    const sel = $('mealSelect');
    const hint = $('mealHint');
    try {
      const res = await api('/api/meals');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load meals');
      meals = (data.meals || []).filter((m) => m.active !== false);
      if (!meals.length) {
        sel.innerHTML = '<option value="">No meals set up yet</option>';
        hint.textContent = 'Ask the admin to add meals in the admin panel first.';
        hint.hidden = false;
        $('startBtn').disabled = true;
        return;
      }
      $('startBtn').disabled = false;
      const saved = sessionStorage.getItem(MEAL_KEY);
      const opt = (m) => `<option value="${esc(m.id)}"${m.id === saved ? ' selected' : ''}>${esc(m.name)}${m.mealDay ? ' · ' + esc(m.mealDay) : ''}</option>`;
      const mealsG = meals.filter((m) => m.kind !== 'event');
      const eventsG = meals.filter((m) => m.kind === 'event');
      let html = '';
      if (mealsG.length) html += `<optgroup label="Meals">${mealsG.map(opt).join('')}</optgroup>`;
      if (eventsG.length) html += `<optgroup label="Events">${eventsG.map(opt).join('')}</optgroup>`;
      sel.innerHTML = html || meals.map(opt).join('');
      updateMealHint();
    } catch (err) {
      hint.textContent = err.message;
      hint.hidden = false;
    }
  }

  function currentMeal() {
    const id = $('mealSelect').value;
    return meals.find((m) => m.id === id) || null;
  }
  function updateMealHint() {
    const m = currentMeal();
    const hint = $('mealHint');
    const banner = $('activeBanner');
    if (!m) { hint.hidden = true; if (banner) banner.hidden = true; return; }
    const per = (m.maxPerPerson || 1) === 1 ? 'once per delegate' : `up to ${m.maxPerPerson}× per delegate`;
    const verb = m.kind === 'event' ? 'attended' : 'served';
    hint.textContent = `${m.redeemed || 0} ${verb} so far · ${per}`;
    hint.hidden = false;
    // Big always-on reminder of the active session.
    if (banner) {
      banner.className = 'scan-active scan-active--' + (m.kind === 'event' ? 'event' : 'meal');
      $('activeName').textContent = m.name + (m.mealDay ? ' · ' + m.mealDay : '');
      $('activeCount').textContent = `${m.redeemed || 0} ${verb}`;
      banner.hidden = false;
    }
  }
  $('mealSelect').addEventListener('change', () => {
    sessionStorage.setItem(MEAL_KEY, $('mealSelect').value);
    updateMealHint();
  });

  /* ---------------- camera ---------------- */
  $('startBtn').addEventListener('click', startCamera);
  $('stopBtn').addEventListener('click', stopCamera);

  async function startCamera() {
    if (scanning) return;
    if (!currentMeal()) { alert('Pick a meal first.'); return; }
    if (typeof Html5Qrcode === 'undefined') { alert('Scanner library failed to load. Check your connection and reload.'); return; }
    $('readerIdle').hidden = true;
    qr = qr || new Html5Qrcode('reader', { verbose: false });
    const config = { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 };
    try {
      await qr.start({ facingMode: 'environment' }, config, onDecode, () => {});
      scanning = true;
      $('startBtn').hidden = true;
      $('stopBtn').hidden = false;
    } catch (err) {
      $('readerIdle').hidden = false;
      alert('Could not start the camera: ' + (err && err.message ? err.message : err) +
        '\n\nAllow camera access, and open this page over https.');
    }
  }

  async function stopCamera() {
    $('startBtn').hidden = false;
    $('stopBtn').hidden = true;
    if (!qr || !scanning) return;
    scanning = false;
    try { await qr.stop(); } catch { /* ignore */ }
    $('readerIdle').hidden = false;
  }

  function onDecode(text) {
    if (busy) return;
    const now = Date.now();
    if (text === lastText && now - lastAt < 3000) return; // debounce same card
    lastText = text; lastAt = now;
    redeem({ token: text });
  }

  /* ---------------- manual entry ---------------- */
  $('manualBtn').addEventListener('click', () => {
    const v = $('manualId').value.trim();
    if (!v) return;
    redeem({ regId: v });
  });
  $('manualId').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('manualBtn').click(); });

  /* ---------------- redeem + result ---------------- */
  async function redeem(payload) {
    const meal = currentMeal();
    if (!meal) { alert('Pick a meal first.'); return; }
    busy = true;
    try {
      const data = await jpost('/api/redeem', Object.assign({ mealId: meal.id }, payload));
      if (!data.ok) { showResult('error', 'Error', '', data.error || 'Could not check in', ''); return; }
      renderResult(data, meal);
      // keep the local "served" counter roughly current
      if (data.status === 'ok') { meal.redeemed = (meal.redeemed || 0) + 1; updateMealHint(); }
    } catch (err) {
      showResult('error', 'Error', '', err.message, '');
    }
  }

  function renderResult(data, meal) {
    const r = data.registrant || {};
    const name = r.fullName || '';
    const metaBits = [r.organization, r.designation, r.city].filter(Boolean).join(' · ');
    const isEvent = meal.kind === 'event';
    if (data.status === 'ok') {
      showResult('ok', '✓ Checked in', name, metaBits, `${esc(meal.name)} — ${isEvent ? 'admit' : 'serve now'}`);
      buzz([120]);
    } else if (data.status === 'already') {
      const when = data.lastAt ? new Date(data.lastAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '';
      showResult('already', isEvent ? '✕ Already attended' : '✕ Already availed', name, metaBits, `${esc(meal.name)}${isEvent ? ' — attended' : ' taken'}${when ? ' at ' + esc(when) : ''}`);
      buzz([80, 60, 80]);
    } else if (data.status === 'notfound') {
      showResult('warn', 'Not a valid delegate QR', '', '', 'This code is not a registered delegate.');
      buzz([200]);
    } else if (data.status === 'nomeal' || data.status === 'inactive') {
      showResult('warn', 'Meal unavailable', '', '', 'This meal is not active. Refresh the meal list.');
    } else {
      showResult('error', 'Error', '', '', 'Unexpected response.');
    }
  }

  function showResult(kind, status, name, meta, sub) {
    const box = $('scanResult');
    box.className = 'scan-result scan-result--' + kind;
    $('resultIcon').textContent = kind === 'ok' ? '✓' : (kind === 'already' ? '✕' : '!');
    $('resultStatus').textContent = status;
    $('resultName').textContent = name || '';
    $('resultName').hidden = !name;
    $('resultMeta').textContent = meta || '';
    $('resultMeta').hidden = !meta;
    $('resultSub').textContent = sub || '';
    $('resultSub').hidden = !sub;
    box.hidden = false;
  }

  function closeResult() {
    $('scanResult').hidden = true;
    busy = false;
    lastText = ''; // allow re-scan of the same card after closing
    $('manualId').value = '';
  }
  $('nextBtn').addEventListener('click', closeResult);

  function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ } }

  /* ---------------- boot ---------------- */
  if (token() && (role() === 'gate' || role() === 'admin')) showApp();
  else { loginScreen.hidden = false; }
})();
