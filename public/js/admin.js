'use strict';

/* ============================================================
   admin.js — login, dashboard, table, filters, Excel export
   (CLAUDE.md §9). XSS-safe: every user string is escaped.
   ============================================================ */

(function () {
  const TOKEN_KEY = 'nepa_admin_token';
  const ROLE_KEY = 'nepa_admin_role';

  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY);
  const role = () => sessionStorage.getItem(ROLE_KEY) || 'admin';
  const isViewer = () => role() === 'viewer';

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const inr = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const api = async (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {});
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401) { handleLogout(); throw new Error('Session expired. Please sign in again.'); }
    return res;
  };

  /* ---------------- state ---------------- */
  let records = [];
  let messages = [];

  /* ============================================================
     LOGIN
     ============================================================ */
  const loginScreen = $('loginScreen');
  const dashboard = $('dashboard');
  const loginForm = $('loginForm');
  const loginError = $('loginError');

  // Which views each role may see (and the loader for each).
  const VIEWS = {
    registrations: { el: 'viewRegistrations', roles: ['admin', 'viewer'], load: () => loadRegistrations() },
    messages:      { el: 'viewMessages',      roles: ['admin', 'viewer'], load: () => loadMessages() },
    archived:      { el: 'viewArchived',      roles: ['admin', 'viewer'], load: () => loadArchived() },
    idcards:       { el: 'viewIdcards',       roles: ['admin'],           load: () => loadCards() },
    meals:         { el: 'viewMeals',         roles: ['admin'],           load: () => loadMeals() },
    checkins:      { el: 'viewCheckins',      roles: ['admin'],           load: () => loadCheckins() },
    import:        { el: 'viewImport',        roles: ['admin'],           load: () => {} },
    hotels:        { el: 'viewHotels',        roles: ['admin', 'hotel'],  load: () => loadHotels() },
    hotelBookings: { el: 'viewHotelBookings', roles: ['admin', 'hotel'],  load: () => loadHotelBookings() },
  };

  function activateView(view) {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    Object.values(VIEWS).forEach((v) => { const el = $(v.el); if (el) el.hidden = true; });
    const el = $(VIEWS[view] && VIEWS[view].el);
    if (el) el.hidden = false;
  }

  function showDashboard() {
    // The gate/catering team has no admin views — send them to the scanner.
    if (role() === 'gate') { window.location.replace('/scan'); return; }
    loginScreen.hidden = true;
    dashboard.hidden = false;
    applyRoleUI();
    reloadAll();
  }

  // Load every view the current role can access (keeps tab badges accurate).
  function reloadAll() {
    const r = role();
    if (VIEWS.registrations.roles.includes(r)) { loadRegistrations(); loadMessages(); loadArchived(); }
    if (r === 'admin') { loadMeals(); }
    if (VIEWS.hotels.roles.includes(r)) { loadHotels(); loadHotelBookings(); }
  }

  // Gate tabs + chrome by role; open the first tab the role is allowed.
  function applyRoleUI() {
    const r = role();
    const sub = document.querySelector('.admin-header .brand__sub');
    if (sub) sub.textContent = r === 'viewer' ? 'Read-only' : r === 'hotel' ? 'Hotel Team' : 'Registrations';
    const brandName = document.querySelector('.admin-header .brand__name');
    if (brandName) brandName.textContent = r === 'hotel' ? 'Hotel Admin' : 'Conclave Admin';

    let firstAllowed = null;
    document.querySelectorAll('.admin-tab').forEach((t) => {
      const cfg = VIEWS[t.dataset.view];
      const allowed = cfg && cfg.roles.includes(r);
      t.hidden = !allowed;
      if (allowed && !firstAllowed) firstAllowed = t.dataset.view;
    });
    // Backup is a registrations feature — hide it for the hotel team.
    if ($('backupBtn')) $('backupBtn').hidden = !(r === 'admin' || r === 'viewer');
    // Only a full admin can manually register a delegate.
    if ($('manualRegBtn')) $('manualRegBtn').hidden = r !== 'admin';
    if (firstAllowed) activateView(firstAllowed);
  }
  function showLogin() {
    dashboard.hidden = true;
    loginScreen.hidden = false;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const id = $('adminId').value.trim();
    const password = $('adminPassword').value;
    const btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invalid credentials');
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(ROLE_KEY, data.role || 'admin');
      $('adminPassword').value = '';
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message || 'Login failed';
      loginError.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  async function handleLogout() {
    try { await fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token()}` } }); }
    catch (e) { /* ignore */ }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    showLogin();
  }
  $('logoutBtn').addEventListener('click', handleLogout);
  $('refreshBtn').addEventListener('click', reloadAll);

  /* ---------------- tabs ---------------- */
  $('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn || btn.hidden) return;
    const view = btn.dataset.view;
    activateView(view);
    const cfg = VIEWS[view];
    if (cfg && cfg.load) cfg.load(); // refresh on switch
  });

  /* ============================================================
     DATA LOAD + RENDER
     ============================================================ */
  async function loadRegistrations() {
    try {
      const res = await api('/api/registrations');
      const data = await res.json();
      records = (data.registrations || []);
      renderStats();
      renderTable();
      if (typeof renderCards === 'function') renderCards();
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------- count-up ---------- */
  function countUp(el, target) {
    if (!el) return;
    const dur = 700;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-IN');
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString('en-IN');
    };
    requestAnimationFrame(step);
  }

  function renderStats() {
    const total = records.length;
    const members = records.filter((r) => r.nepaMember).length;
    const early = records.filter((r) => r.feeType === 'Early Bird').length;
    const spot = records.filter((r) => r.feeType === 'Spot').length;
    const revenue = records.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const confirmed = records.filter((r) => r.status === 'Confirmed').length;
    const pending = total - confirmed;

    countUp($('statTotal'), total);
    countUp($('statMembers'), members);
    $('statFeeSplit').textContent = `${early} / ${spot}`;
    $('statRevenue').textContent = inr(revenue);
    countUp($('statConfirmed'), confirmed);
    $('statPending').textContent = `${pending} pending`;

    // breakdown — payment method
    const byMethod = (m) => records.filter((r) => r.paymentMethod === m).length;
    document.querySelector('[data-method-upi]').textContent = byMethod('UPI');
    document.querySelector('[data-method-bank]').textContent = byMethod('Bank');
    document.querySelector('[data-method-cash]').textContent = byMethod('Cash');
    // membership
    document.querySelector('[data-member-yes]').textContent = members;
    document.querySelector('[data-member-no]').textContent = total - members;
    // status
    document.querySelector('[data-status-confirmed]').textContent = confirmed;
    document.querySelector('[data-status-pending]').textContent = pending;
  }

  /* ---------- filtering ---------- */
  function filtered() {
    const q = $('searchInput').value.trim().toLowerCase();
    const method = $('methodFilter').value;
    const status = $('statusFilter').value;
    return records.filter((r) => {
      if (method && r.paymentMethod !== method) return false;
      if (status && r.status !== status) return false;
      if (q) {
        const hay = `${r.fullName} ${r.mobile} ${r.organization} ${r.email} ${r.gstNumber || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const tbody = $('regTbody');
    const rows = filtered();
    $('tableEmpty').hidden = rows.length > 0;
    tbody.innerHTML = rows.map((r) => {
      const shot = r.screenshotUrl
        ? `<button class="link-view" data-view="${esc(r.screenshotUrl)}">View</button>`
        : '<span class="cell-muted">—</span>';
      const confirmed = r.status === 'Confirmed';
      const badge = `<span class="status-badge status-badge--${confirmed ? 'confirmed' : 'pending'}">${confirmed ? 'Confirmed' : 'Pending'}</span>`;
      // Viewer sees just the badge; admin gets an explicit action so it's
      // obvious what clicking does ("Click to confirm" / "Undo").
      const statusCell = isViewer()
        ? badge
        : `<div class="status-set">
             ${badge}
             ${confirmed
               ? `<button class="status-action status-action--undo" data-toggle="${esc(r.id)}" title="Revert to Pending">Undo</button>`
               : `<button class="status-action status-action--confirm" data-toggle="${esc(r.id)}">Click to confirm</button>`}
           </div>`;
      const actionsCell = isViewer()
        ? '<span class="cell-muted">—</span>'
        : `<button class="btn-delete" data-delete="${esc(r.id)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
          </button>`;
      return `
        <tr>
          <td class="cell-name">${esc(r.fullName)}<br><span class="cell-muted" style="font-weight:400;font-size:.78rem">${esc(r.regId)}</span></td>
          <td>${esc(r.organization)}</td>
          <td>${r.gstNumber ? esc(r.gstNumber) : '<span class="cell-muted">—</span>'}</td>
          <td>${esc(r.mobile)}</td>
          <td class="cell-muted">${esc(r.email)}</td>
          <td>${r.nepaMember ? '<span class="pill pill--yes">Member</span>' : '<span class="pill pill--no">No</span>'}</td>
          <td>${esc(r.feeType)}</td>
          <td class="cell-amount">${inr(r.totalAmount)}</td>
          <td><span class="pill pill--method">${esc(r.paymentMethod)}</span></td>
          <td>${r.referenceNo ? esc(r.referenceNo) : '<span class="cell-muted">—</span>'}</td>
          <td>${shot}</td>
          <td class="cell-muted">${esc(fmtDate(r.createdAt))}</td>
          <td>${statusCell}</td>
          <td>${actionsCell}</td>
        </tr>`;
    }).join('');
  }

  /* ---------- table actions (delegated) ---------- */
  $('regTbody').addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('[data-view]');
    const toggleBtn = e.target.closest('[data-toggle]');
    const deleteBtn = e.target.closest('[data-delete]');

    if (viewBtn) { openLightbox(viewBtn.dataset.view); return; }

    if (toggleBtn) {
      const id = toggleBtn.dataset.toggle;
      toggleBtn.disabled = true;
      try {
        const res = await api(`/api/registrations/${id}/status`, { method: 'PATCH' });
        const data = await res.json();
        if (data.ok) {
          const rec = records.find((r) => r.id === id);
          if (rec) rec.status = data.status;
          renderStats(); renderTable();
        }
      } catch (err) { alert(err.message); }
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.delete;
      const rec = records.find((r) => r.id === id);
      if (!confirm(`Archive registration for "${rec ? rec.fullName : 'this delegate'}"?\n\nIt will be hidden from this list but kept safe — you can restore it from the Archived tab.`)) return;
      try {
        const res = await api(`/api/registrations/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not archive.');
        records = records.filter((r) => r.id !== id);
        renderStats(); renderTable();
        loadArchived();
      } catch (err) { alert(err.message); }
    }
  });

  /* ============================================================
     ARCHIVED (soft-deleted) — restore / permanent delete
     ============================================================ */
  let archived = [];
  async function loadArchived() {
    try {
      const res = await api('/api/registrations/archived');
      const data = await res.json();
      archived = data.registrations || [];
      const badge = $('archivedBadge');
      if (badge) { badge.textContent = archived.length; badge.hidden = archived.length === 0; }
      renderArchived();
    } catch (err) { console.error(err); }
  }

  function renderArchived() {
    const tbody = $('archivedTbody');
    if (!tbody) return;
    const empty = $('archivedEmpty');
    if (empty) empty.hidden = archived.length > 0;
    const viewer = isViewer();
    tbody.innerHTML = archived.map((r) => `
        <tr>
          <td class="cell-name">${esc(r.fullName)}<br><span class="cell-muted" style="font-weight:400;font-size:.78rem">${esc(r.regId)}</span></td>
          <td>${esc(r.organization)}</td>
          <td>${esc(r.mobile)}</td>
          <td class="cell-amount">${inr(r.totalAmount)}</td>
          <td><span class="pill pill--method">${esc(r.paymentMethod)}</span></td>
          <td class="cell-muted">${esc(fmtDate(r.archivedAt))}</td>
          <td>${viewer ? '<span class="cell-muted">—</span>' : `
            <div class="archived-actions">
              <button class="status-action status-action--confirm" data-restore="${esc(r.id)}">Restore</button>
              <button class="status-action status-action--undo" data-purge="${esc(r.id)}" title="Delete permanently">Delete forever</button>
            </div>`}</td>
        </tr>`).join('');
  }

  const archTbody = $('archivedTbody');
  if (archTbody) archTbody.addEventListener('click', async (e) => {
    const restoreBtn = e.target.closest('[data-restore]');
    const purgeBtn = e.target.closest('[data-purge]');
    if (restoreBtn) {
      const id = restoreBtn.dataset.restore;
      restoreBtn.disabled = true;
      try {
        const res = await api(`/api/registrations/${id}/restore`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not restore.');
        archived = archived.filter((r) => r.id !== id);
        renderArchived();
        $('archivedBadge').textContent = archived.length;
        $('archivedBadge').hidden = archived.length === 0;
        loadRegistrations();
      } catch (err) { alert(err.message); restoreBtn.disabled = false; }
      return;
    }
    if (purgeBtn) {
      const id = purgeBtn.dataset.purge;
      const rec = archived.find((r) => r.id === id);
      if (!confirm(`Permanently delete "${rec ? rec.fullName : 'this record'}"?\n\nThis CANNOT be undone. Consider downloading a Backup first.`)) return;
      try {
        const res = await api(`/api/registrations/${id}/purge`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete.');
        archived = archived.filter((r) => r.id !== id);
        renderArchived();
        $('archivedBadge').textContent = archived.length;
        $('archivedBadge').hidden = archived.length === 0;
      } catch (err) { alert(err.message); }
    }
  });

  /* ---------------- one-click backup ---------------- */
  const backupBtn = $('backupBtn');
  if (backupBtn) backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    const orig = backupBtn.textContent;
    backupBtn.textContent = 'Backing up…';
    try {
      const res = await api('/api/admin/backup');
      if (!res.ok) throw new Error('Backup failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url; a.download = `nepa-backup-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
    finally { backupBtn.disabled = false; backupBtn.textContent = orig; }
  });

  /* ---------- filters wiring ---------- */
  ['searchInput', 'methodFilter', 'statusFilter'].forEach((id) =>
    $(id).addEventListener('input', renderTable));

  /* ============================================================
     ENQUIRY MESSAGES
     ============================================================ */
  async function loadMessages() {
    try {
      const res = await api('/api/messages');
      const data = await res.json();
      messages = data.messages || [];
      renderMessages();
      updateMsgBadge();
    } catch (err) {
      console.error(err);
    }
  }

  function updateMsgBadge() {
    const unread = messages.filter((m) => !m.read).length;
    const badge = $('msgBadge');
    badge.textContent = unread;
    badge.hidden = unread === 0;
  }

  function filteredMessages() {
    const q = $('msgSearch').value.trim().toLowerCase();
    const f = $('msgFilter').value;
    return messages.filter((m) => {
      if (f === 'unread' && m.read) return false;
      if (f === 'read' && !m.read) return false;
      if (q) {
        const hay = `${m.name} ${m.email} ${m.subject || ''} ${m.message}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderMessages() {
    const tbody = $('msgTbody');
    const rows = filteredMessages();
    $('msgEmpty').hidden = rows.length > 0;
    tbody.innerHTML = rows.map((m) => {
      const readCell = isViewer()
        ? `<span class="status-toggle ${m.read ? 'status-toggle--pending' : 'status-toggle--confirmed'}" style="cursor:default">${m.read ? 'Read' : 'Unread'}</span>`
        : `<button class="status-toggle ${m.read ? 'status-toggle--pending' : 'status-toggle--confirmed'}" data-msgread="${esc(m.id)}">${m.read ? 'Read' : 'Mark read'}</button>`;
      const delCell = isViewer()
        ? '<span class="cell-muted">—</span>'
        : `<button class="btn-delete" data-msgdelete="${esc(m.id)}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
        </button>`;
      return `
      <tr class="${m.read ? '' : 'msg-row--unread'}">
        <td class="cell-name">${esc(m.name)}</td>
        <td class="cell-muted">${esc(m.email)}</td>
        <td>${m.phone ? esc(m.phone) : '<span class="cell-muted">—</span>'}</td>
        <td>${m.subject ? esc(m.subject) : '<span class="cell-muted">—</span>'}</td>
        <td class="msg-cell">${esc(m.message)}</td>
        <td class="cell-muted">${esc(fmtDate(m.createdAt))}</td>
        <td>${readCell}</td>
        <td>${delCell}</td>
      </tr>`;
    }).join('');
  }

  $('msgTbody').addEventListener('click', async (e) => {
    const readBtn = e.target.closest('[data-msgread]');
    const delBtn = e.target.closest('[data-msgdelete]');

    if (readBtn) {
      const id = readBtn.dataset.msgread;
      const msg = messages.find((m) => m.id === id);
      readBtn.disabled = true;
      try {
        const res = await api(`/api/messages/${id}/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: msg ? !msg.read : true }),
        });
        const data = await res.json();
        if (data.ok) { if (msg) msg.read = data.read; renderMessages(); updateMsgBadge(); }
      } catch (err) { alert(err.message); }
      return;
    }

    if (delBtn) {
      const id = delBtn.dataset.msgdelete;
      const msg = messages.find((m) => m.id === id);
      if (!confirm(`Delete the enquiry from "${msg ? msg.name : 'this person'}"? This cannot be undone.`)) return;
      try {
        const res = await api(`/api/messages/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) { messages = messages.filter((m) => m.id !== id); renderMessages(); updateMsgBadge(); }
      } catch (err) { alert(err.message); }
    }
  });

  ['msgSearch', 'msgFilter'].forEach((id) => $(id).addEventListener('input', renderMessages));

  /* ============================================================
     LIGHTBOX
     ============================================================ */
  const lightbox = $('lightbox');
  function openLightbox(url) {
    $('lightboxImg').src = url;
    lightbox.hidden = false;
  }
  function closeLightbox() {
    lightbox.hidden = true;
    $('lightboxImg').src = '';
  }
  document.querySelectorAll('[data-close-lightbox]').forEach((b) => b.addEventListener('click', closeLightbox));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lightbox.hidden) closeLightbox(); });

  /* ============================================================
     EXPORT TO EXCEL (currently-filtered rows)
     ============================================================ */
  $('exportBtn').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { alert('Excel library failed to load (check your connection).'); return; }
    const rows = filtered();
    if (!rows.length) { alert('No rows to export.'); return; }
    const origin = window.location.origin;
    const data = rows.map((r) => {
      // Fall back gracefully for rows saved before GST breakdown existed.
      const subtotal = r.subtotal != null ? r.subtotal : (Number(r.delegateFee) || 0) + (Number(r.membershipFee) || 0);
      const gstAmount = r.gstAmount != null ? r.gstAmount : Math.max(0, (Number(r.totalAmount) || 0) - subtotal);
      const gstPct = r.gstRate ? Math.round(r.gstRate * 100) : 18;
      // Supabase Storage returns absolute URLs; only prepend origin for local /uploads paths.
      const shot = r.screenshotUrl
        ? (/^https?:\/\//.test(r.screenshotUrl) ? r.screenshotUrl : origin + r.screenshotUrl)
        : '';
      return {
        'Reg ID': r.regId,
        'Name': r.fullName,
        'Organization': r.organization,
        'GST Number': r.gstNumber || '',
        'Mobile': r.mobile,
        'Email': r.email,
        'NEPA Member': r.nepaMember ? 'Yes' : 'No',
        'Fee Type': r.feeType,
        'Delegate Fee': r.delegateFee,
        'Membership Fee': r.membershipFee,
        'Subtotal': subtotal,
        [`GST (${gstPct}%)`]: gstAmount,
        'Total Amount': r.totalAmount,
        'Payment Method': r.paymentMethod,
        'Reference No': r.referenceNo || '',
        'Screenshot URL': shot,
        'Note': r.note || '',
        'Status': r.status,
        'Registered': fmtDate(r.createdAt),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    XLSX.writeFile(wb, `NEPA-Conclave-Registrations-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ============================================================
     HOTELS — management (add / edit rooms & prices / delete)
     ============================================================ */
  let hotels = [];
  async function loadHotels() {
    if (!$('hotelsList')) return;
    try {
      const res = await api('/api/admin/hotels');
      const data = await res.json();
      hotels = data.hotels || [];
      renderHotels();
    } catch (err) { console.error(err); }
  }

  function renderHotels() {
    const list = $('hotelsList'); if (!list) return;
    if ($('hotelsEmpty')) $('hotelsEmpty').hidden = hotels.length > 0;
    list.innerHTML = hotels.map((h) => `
      <div class="hotel-admin-card" data-hotel="${esc(h.id)}">
        <div class="hotel-admin-card__meter">
          <span class="hotel-admin-card__used">${h.roomsUsed} / ${h.totalRooms}</span>
          <span class="hotel-admin-card__mlabel">rooms used</span>
          <span class="hotel-admin-card__left ${h.roomsRemaining <= 0 ? 'is-full' : ''}">${h.roomsRemaining <= 0 ? 'FULL' : h.roomsRemaining + ' left'}</span>
        </div>
        <div class="hotel-admin-card__fields">
          <label>Hotel name<input data-f="name" value="${esc(h.name)}" /></label>
          <label>Address<input data-f="address" value="${esc(h.address || '')}" /></label>
          <label>Total rooms<input data-f="totalRooms" type="number" min="0" value="${h.totalRooms}" /></label>
          <label>Single ₹<input data-f="singlePrice" type="number" min="0" value="${h.singlePrice}" /></label>
          <label>Double ₹<input data-f="doublePrice" type="number" min="0" value="${h.doublePrice}" /></label>
          <label class="hotel-admin-card__toggle"><input data-f="active" type="checkbox" ${h.active ? 'checked' : ''} /> Accepting bookings</label>
        </div>
        <div class="hotel-admin-card__actions">
          <button class="status-action status-action--confirm" data-save="${esc(h.id)}">Save</button>
          <button class="btn-delete" data-hoteldelete="${esc(h.id)}" title="Delete hotel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`).join('');
  }

  const hoAddBtn = $('hoAddBtn');
  if (hoAddBtn) hoAddBtn.addEventListener('click', async () => {
    const err = $('hoAddErr'); err.hidden = true;
    const name = $('hoName').value.trim();
    if (!name) { err.textContent = 'Hotel name is required.'; err.hidden = false; return; }
    hoAddBtn.disabled = true;
    try {
      const res = await api('/api/admin/hotels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, address: $('hoAddress').value.trim(),
          totalRooms: $('hoRooms').value, singlePrice: $('hoSingle').value, doublePrice: $('hoDouble').value,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not add hotel.');
      $('hoName').value = ''; $('hoAddress').value = ''; $('hoRooms').value = '';
      loadHotels();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { hoAddBtn.disabled = false; }
  });

  const hotelsList = $('hotelsList');
  if (hotelsList) hotelsList.addEventListener('click', async (e) => {
    const save = e.target.closest('[data-save]');
    const del = e.target.closest('[data-hoteldelete]');
    if (save) {
      const card = save.closest('[data-hotel]');
      const id = save.dataset.save;
      const fields = {};
      card.querySelectorAll('[data-f]').forEach((inp) => { fields[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; });
      save.disabled = true; const t = save.textContent; save.textContent = 'Saving…';
      try {
        const res = await api(`/api/admin/hotels/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save.');
        loadHotels();
      } catch (err) { alert(err.message); save.disabled = false; save.textContent = t; }
      return;
    }
    if (del) {
      const id = del.dataset.hoteldelete;
      const h = hotels.find((x) => x.id === id);
      let msg = `Delete "${h ? h.name : 'this hotel'}"?`;
      if (h && h.roomsUsed > 0) msg += `\n\nIt has ${h.roomsUsed} booking(s). They'll be kept (with the hotel name) but no longer linked. Consider marking it "not accepting bookings" instead.`;
      if (!confirm(msg)) return;
      try {
        const res = await api(`/api/admin/hotels/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete.');
        loadHotels();
      } catch (err) { alert(err.message); }
    }
  });

  /* ============================================================
     HOTEL BOOKINGS
     ============================================================ */
  let hotelBookings = [];
  async function loadHotelBookings() {
    if (!$('hbTbody')) return;
    try {
      const res = await api('/api/hotel-bookings');
      const data = await res.json();
      hotelBookings = data.bookings || [];
      const badge = $('hbBadge');
      if (badge) { badge.textContent = hotelBookings.length; badge.hidden = hotelBookings.length === 0; }
      renderHotelBookings();
    } catch (err) { console.error(err); }
  }

  function filteredHB() {
    const q = $('hbSearch').value.trim().toLowerCase();
    const st = $('hbStatusFilter').value;
    return hotelBookings.filter((b) => {
      if (st && b.status !== st) return false;
      if (q) { const hay = `${b.fullName} ${b.firm || ''} ${b.mobile} ${b.hotelName || ''}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }

  function renderHotelBookings() {
    const tbody = $('hbTbody'); if (!tbody) return;
    const rows = filteredHB();
    if ($('hbEmpty')) $('hbEmpty').hidden = rows.length > 0;
    tbody.innerHTML = rows.map((b) => {
      const confirmed = b.status === 'Confirmed';
      const shot = b.screenshotUrl ? `<button class="link-view" data-view="${esc(b.screenshotUrl)}">View</button>` : '<span class="cell-muted">—</span>';
      const badge = `<span class="status-badge status-badge--${confirmed ? 'confirmed' : 'pending'}">${confirmed ? 'Confirmed' : 'Pending'}</span>`;
      const statusCell = `<div class="status-set">${badge}${confirmed
        ? `<button class="status-action status-action--undo" data-hbtoggle="${esc(b.id)}" title="Revert to Pending">Undo</button>`
        : `<button class="status-action status-action--confirm" data-hbtoggle="${esc(b.id)}">Click to confirm</button>`}</div>`;
      return `
        <tr>
          <td class="cell-name">${esc(b.bookingId)}</td>
          <td>${esc(b.fullName)}</td>
          <td>${b.firm ? esc(b.firm) : '<span class="cell-muted">—</span>'}</td>
          <td>${esc(b.mobile)}</td>
          <td>${esc(b.hotelName || '—')}</td>
          <td>${esc(b.occupancy)}</td>
          <td>${b.guestName ? esc(b.guestName) : '<span class="cell-muted">—</span>'}</td>
          <td class="cell-amount">${inr(b.totalAmount)}</td>
          <td><span class="pill pill--method">${esc(b.paymentMethod)}</span></td>
          <td>${b.referenceNo ? esc(b.referenceNo) : '<span class="cell-muted">—</span>'}</td>
          <td>${shot}</td>
          <td class="cell-muted">${esc(fmtDate(b.createdAt))}</td>
          <td>${statusCell}</td>
          <td><button class="btn-delete" data-hbdelete="${esc(b.id)}" title="Remove booking (frees the room)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
          </button></td>
        </tr>`;
    }).join('');
  }

  const hbTbody = $('hbTbody');
  if (hbTbody) hbTbody.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('[data-view]');
    const toggleBtn = e.target.closest('[data-hbtoggle]');
    const delBtn = e.target.closest('[data-hbdelete]');
    if (viewBtn) { openLightbox(viewBtn.dataset.view); return; }
    if (toggleBtn) {
      const id = toggleBtn.dataset.hbtoggle;
      toggleBtn.disabled = true;
      try {
        const res = await api(`/api/hotel-bookings/${id}/status`, { method: 'PATCH' });
        const data = await res.json();
        if (data.ok) { const rec = hotelBookings.find((b) => b.id === id); if (rec) rec.status = data.status; renderHotelBookings(); }
      } catch (err) { alert(err.message); }
      return;
    }
    if (delBtn) {
      const id = delBtn.dataset.hbdelete;
      const b = hotelBookings.find((x) => x.id === id);
      if (!confirm(`Remove the booking "${b ? b.bookingId : ''}" for ${b ? b.fullName : 'this guest'}?\n\nThis frees the room. The booking is archived (recoverable by an admin), not permanently deleted.`)) return;
      try {
        const res = await api(`/api/hotel-bookings/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not remove.');
        hotelBookings = hotelBookings.filter((x) => x.id !== id);
        renderHotelBookings();
        const badge = $('hbBadge'); if (badge) { badge.textContent = hotelBookings.length; badge.hidden = hotelBookings.length === 0; }
        loadHotels(); // room count changed
      } catch (err) { alert(err.message); }
    }
  });

  ['hbSearch', 'hbStatusFilter'].forEach((id) => { const el = $(id); if (el) el.addEventListener('input', renderHotelBookings); });

  const hbExportBtn = $('hbExportBtn');
  if (hbExportBtn) hbExportBtn.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { alert('Excel library failed to load.'); return; }
    const rows = filteredHB();
    if (!rows.length) { alert('No bookings to export.'); return; }
    const origin = window.location.origin;
    const data = rows.map((b) => ({
      'Booking ID': b.bookingId, 'Name': b.fullName, 'Firm': b.firm || '', 'Address': b.address || '',
      'Mobile': b.mobile, 'Email': b.email || '', 'Hotel': b.hotelName || '', 'Occupancy': b.occupancy,
      'Second Guest': b.guestName || '', 'Room Price': b.roomPrice, 'GST': b.gstAmount, 'Total Amount': b.totalAmount,
      'Payment Method': b.paymentMethod, 'Reference No': b.referenceNo || '',
      'Screenshot URL': b.screenshotUrl ? (/^https?:\/\//.test(b.screenshotUrl) ? b.screenshotUrl : origin + b.screenshotUrl) : '',
      'Status': b.status, 'Booked': fmtDate(b.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hotel Bookings');
    XLSX.writeFile(wb, `NEPA-Hotel-Bookings-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ============================================================
     ID CARDS — search, edit, print (single + bulk), calibration
     ============================================================ */
  const selectedCards = new Set();

  // vCard for the QR (mirrors lib/vcard.js). A hidden UID carries our token.
  function buildVCard(r) {
    const e = (v) => String(v == null ? '' : v)
      .replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const name = e(r.fullName || '');
    const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${name};;;;`, `FN:${name}`];
    if (r.organization) L.push(`ORG:${e(r.organization)}`);
    if (r.designation) L.push(`TITLE:${e(r.designation)}`);
    if (r.mobile) L.push(`TEL;TYPE=CELL:${e(r.mobile)}`);
    if (r.email) L.push(`EMAIL;TYPE=INTERNET:${e(r.email)}`);
    if (r.city) L.push(`ADR;TYPE=WORK:;;;${e(r.city)};;;`);
    if (r.qrToken) L.push(`UID:NEPA26:${e(r.qrToken)}`);
    L.push('END:VCARD');
    return L.join('\r\n');
  }

  function renderQR(container, text) {
    container.innerHTML = '';
    if (typeof QRCode === 'undefined' || !text) return;
    // eslint-disable-next-line no-new
    new QRCode(container, {
      text, width: 420, height: 420,
      colorDark: '#000000', colorLight: 'rgba(255,255,255,0)',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  function buildCardEl(r, withTemplate) {
    const card = document.createElement('div');
    card.className = 'idcard' + (withTemplate ? ' idcard--template' : '');
    const inner = document.createElement('div');
    inner.className = 'idcard__inner';
    const qr = document.createElement('div');
    qr.className = 'idcard__qr';
    inner.appendChild(qr);
    renderQR(qr, buildVCard(r));
    const add = (cls, txt) => { const d = document.createElement('div'); d.className = 'idcard__field ' + cls; d.textContent = txt || ''; inner.appendChild(d); };
    add('idcard__name', r.fullName || '');
    add('idcard__company', r.organization || '');
    add('idcard__designation', r.designation || '');
    add('idcard__city', r.city || '');
    card.appendChild(inner);
    return card;
  }

  function applyAlignVars(el) {
    const x = parseFloat($('alignX').value) || 0;
    const y = parseFloat($('alignY').value) || 0;
    const s = (parseFloat($('alignScale').value) || 100) / 100;
    el.style.setProperty('--nx', x + 'mm');
    el.style.setProperty('--ny', y + 'mm');
    el.style.setProperty('--scale', String(s));
  }

  // Load saved calibration
  (function initAlign() {
    try {
      const saved = JSON.parse(localStorage.getItem('nepa_card_align') || '{}');
      if ($('alignX')) $('alignX').value = saved.x != null ? saved.x : 0;
      if ($('alignY')) $('alignY').value = saved.y != null ? saved.y : 0;
      if ($('alignScale')) $('alignScale').value = saved.scale != null ? saved.scale : 100;
      if ($('alignTemplate')) $('alignTemplate').checked = !!saved.tpl;
    } catch (e) { /* ignore */ }
  })();
  function saveAlign() {
    try {
      localStorage.setItem('nepa_card_align', JSON.stringify({
        x: $('alignX').value, y: $('alignY').value, scale: $('alignScale').value, tpl: $('alignTemplate').checked,
      }));
    } catch (e) { /* ignore */ }
  }

  function cardReady(r) { return !!(r.designation && r.city); }

  function filteredCards() {
    const q = ($('cardSearch').value || '').trim().toLowerCase();
    const f = $('cardFilter').value;
    return records.filter((r) => {
      if (f === 'ready' && !cardReady(r)) return false;
      if (f === 'incomplete' && cardReady(r)) return false;
      if (f === 'printed' && !r.cardPrintedAt) return false;
      if (f === 'notprinted' && r.cardPrintedAt) return false;
      if (q) {
        const hay = `${r.fullName} ${r.mobile} ${r.organization || ''} ${r.designation || ''} ${r.city || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function updatePrintBtn() {
    const btn = $('cardPrintBtn');
    if (btn) btn.textContent = `Print selected (${selectedCards.size})`;
  }

  function renderCards() {
    const tbody = $('cardTbody');
    if (!tbody) return;
    const rows = filteredCards();
    if ($('cardEmpty')) $('cardEmpty').hidden = rows.length > 0;
    const miss = '<span class="cell-missing">—</span>';
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td class="card-check-col"><input type="checkbox" data-cardcheck="${esc(r.id)}" ${selectedCards.has(r.id) ? 'checked' : ''} /></td>
        <td class="cell-name">${esc(r.fullName)}</td>
        <td>${r.organization ? esc(r.organization) : miss}</td>
        <td>${r.designation ? esc(r.designation) : miss}</td>
        <td>${r.city ? esc(r.city) : miss}</td>
        <td class="cell-muted">${esc(r.regId)}</td>
        <td class="cell-muted">${r.cardPrintedAt ? esc(fmtDate(r.cardPrintedAt)) : '—'}</td>
        <td>
          <div class="status-set">
            <button class="status-action" data-cardpreview="${esc(r.id)}">Preview</button>
            <button class="status-action status-action--confirm" data-cardprint="${esc(r.id)}">Print</button>
            <button class="status-action status-action--undo" data-cardedit="${esc(r.id)}">✎ Edit</button>
          </div>
        </td>
      </tr>`).join('');
    updatePrintBtn();
    const head = $('cardHeadCheck');
    if (head) head.checked = rows.length > 0 && rows.every((r) => selectedCards.has(r.id));
  }

  function loadCards() {
    if (records.length) { renderCards(); }
    else { loadRegistrations(); } // will renderCards() when done
  }

  ['cardSearch', 'cardFilter'].forEach((id) => { const el = $(id); if (el) el.addEventListener('input', renderCards); });

  const cardAlignBtn = $('cardAlignBtn');
  if (cardAlignBtn) cardAlignBtn.addEventListener('click', () => { const p = $('cardAlign'); p.hidden = !p.hidden; });
  ['alignX', 'alignY', 'alignScale', 'alignTemplate'].forEach((id) => { const el = $(id); if (el) el.addEventListener('change', saveAlign); });

  const cardHeadCheck = $('cardHeadCheck');
  if (cardHeadCheck) cardHeadCheck.addEventListener('change', () => {
    const rows = filteredCards();
    if (cardHeadCheck.checked) rows.forEach((r) => selectedCards.add(r.id));
    else rows.forEach((r) => selectedCards.delete(r.id));
    renderCards();
  });
  const cardSelectAllBtn = $('cardSelectAllBtn');
  if (cardSelectAllBtn) cardSelectAllBtn.addEventListener('click', () => {
    filteredCards().forEach((r) => selectedCards.add(r.id));
    renderCards();
  });

  const cardTbody = $('cardTbody');
  if (cardTbody) cardTbody.addEventListener('click', (e) => {
    const chk = e.target.closest('[data-cardcheck]');
    const prev = e.target.closest('[data-cardpreview]');
    const prn = e.target.closest('[data-cardprint]');
    const ed = e.target.closest('[data-cardedit]');
    if (chk) { const id = chk.dataset.cardcheck; if (chk.checked) selectedCards.add(id); else selectedCards.delete(id); updatePrintBtn(); return; }
    if (prev) { openCardPreview(prev.dataset.cardpreview); return; }
    if (prn) { const r = records.find((x) => x.id === prn.dataset.cardprint); if (r) printCards([r]); return; }
    if (ed) { openEdit(ed.dataset.cardedit); return; }
  });

  const cardPrintBtn = $('cardPrintBtn');
  if (cardPrintBtn) cardPrintBtn.addEventListener('click', () => {
    const regs = records.filter((r) => selectedCards.has(r.id));
    if (!regs.length) { alert('Select at least one delegate to print.'); return; }
    printCards(regs);
  });

  function printCards(regs) {
    if (typeof QRCode === 'undefined') { alert('QR library failed to load. Check your connection and reload.'); return; }
    const area = $('printArea');
    area.innerHTML = '';
    const withTpl = $('alignTemplate') && $('alignTemplate').checked;
    regs.forEach((r) => { const c = buildCardEl(r, withTpl); applyAlignVars(c); area.appendChild(c); });
    setTimeout(() => {
      window.print();
      markPrinted(regs.map((r) => r.id));
    }, 80);
  }

  async function markPrinted(ids) {
    try {
      const res = await api('/api/registrations/mark-printed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const when = new Date().toISOString();
        ids.forEach((id) => { const r = records.find((x) => x.id === id); if (r) r.cardPrintedAt = when; });
        renderCards();
      }
    } catch (e) { /* non-fatal */ }
  }

  /* ---------------- card preview modal ---------------- */
  function openCardPreview(id) {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    const stage = $('cardPreviewStage');
    const card = buildCardEl(r, true);
    // scale the 250mm card down to fit the modal (~300px wide)
    const pxPerMm = 3.7795;
    const scale = 300 / (250 * pxPerMm);
    card.style.transform = `scale(${scale})`;
    stage.style.width = (250 * pxPerMm * scale) + 'px';
    stage.style.height = (353 * pxPerMm * scale) + 'px';
    stage.innerHTML = '';
    stage.appendChild(card);
    $('cardPreviewModal').dataset.reg = id;
    $('cardPreviewModal').hidden = false;
  }
  function closeCardPreview() { $('cardPreviewModal').hidden = true; }
  document.querySelectorAll('[data-close-preview]').forEach((el) => el.addEventListener('click', closeCardPreview));
  const cardPreviewPrintBtn = $('cardPreviewPrintBtn');
  if (cardPreviewPrintBtn) cardPreviewPrintBtn.addEventListener('click', () => {
    const id = $('cardPreviewModal').dataset.reg;
    const r = records.find((x) => x.id === id);
    closeCardPreview();
    if (r) printCards([r]);
  });

  /* ============================================================
     EDIT DELEGATE (designation / city / corrections)
     ============================================================ */
  function openEdit(id) {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    $('editModal').dataset.reg = id;
    $('editTitle').textContent = `Edit — ${r.fullName || ''}`;
    $('editName').value = r.fullName || '';
    $('editOrg').value = r.organization || '';
    $('editDesignation').value = r.designation || '';
    $('editCity').value = r.city || '';
    $('editMobile').value = r.mobile || '';
    $('editEmail').value = r.email || '';
    $('editGst').value = r.gstNumber || '';
    $('editErr').hidden = true;
    $('editModal').hidden = false;
    setTimeout(() => $('editDesignation').focus(), 30);
  }
  function closeEdit() { $('editModal').hidden = true; }
  document.querySelectorAll('[data-close-edit]').forEach((el) => el.addEventListener('click', closeEdit));

  const editSaveBtn = $('editSaveBtn');
  if (editSaveBtn) editSaveBtn.addEventListener('click', async () => {
    const id = $('editModal').dataset.reg;
    const err = $('editErr'); err.hidden = true;
    const fields = {
      fullName: $('editName').value.trim(),
      organization: $('editOrg').value.trim(),
      designation: $('editDesignation').value.trim(),
      city: $('editCity').value.trim(),
      mobile: $('editMobile').value.trim(),
      email: $('editEmail').value.trim(),
      gstNumber: $('editGst').value.trim().toUpperCase(),
    };
    if (fields.mobile && !/^\d{10}$/.test(fields.mobile)) { err.textContent = 'Mobile must be exactly 10 digits.'; err.hidden = false; return; }
    editSaveBtn.disabled = true; const t = editSaveBtn.textContent; editSaveBtn.textContent = 'Saving…';
    try {
      const res = await api(`/api/registrations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save.');
      const r = records.find((x) => x.id === id);
      if (r) Object.assign(r, data.registration || fields);
      closeEdit();
      renderCards(); renderTable();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { editSaveBtn.disabled = false; editSaveBtn.textContent = t; }
  });

  /* ============================================================
     MEALS — catalog management
     ============================================================ */
  let meals = [];
  async function loadMeals() {
    if (!$('mealsList')) return;
    try {
      const res = await api('/api/meals');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load meals');
      meals = data.meals || [];
      renderMeals();
    } catch (err) {
      if ($('mealAddErr')) { $('mealAddErr').textContent = err.message; $('mealAddErr').hidden = false; }
    }
  }

  function renderMeals() {
    const list = $('mealsList'); if (!list) return;
    if ($('mealsEmpty')) $('mealsEmpty').hidden = meals.length > 0;
    list.innerHTML = meals.map((m) => {
      const isEvent = m.kind === 'event';
      return `
      <div class="meal-card" data-meal="${esc(m.id)}">
        <div class="meal-card__top">
          <strong>${esc(m.name)} <span class="meal-badge meal-badge--${isEvent ? 'event' : 'meal'}">${isEvent ? 'Event' : 'Meal'}</span></strong>
          <span class="meal-card__stat">
            <span class="meal-card__served">${m.redeemed || 0}<span> ${isEvent ? 'entries' : 'served'}</span></span>
            ${isEvent ? `<span class="meal-card__unique">${m.unique || 0} unique</span>` : ''}
          </span>
        </div>
        <div class="meal-card__fields">
          <label>Type<select data-mf="kind"><option value="meal"${isEvent ? '' : ' selected'}>Meal</option><option value="event"${isEvent ? ' selected' : ''}>Event</option></select></label>
          <label>Name<input data-mf="name" value="${esc(m.name)}" /></label>
          <label>Day / label<input data-mf="mealDay" value="${esc(m.mealDay || '')}" /></label>
          <label>Times per delegate<input data-mf="maxPerPerson" type="number" min="1" value="${m.maxPerPerson || 1}" /></label>
          <label class="meal-card__toggle"><input data-mf="active" type="checkbox" ${m.active !== false ? 'checked' : ''} /> Active</label>
        </div>
        <div class="meal-card__actions">
          <button class="status-action status-action--confirm" data-mealsave="${esc(m.id)}">Save</button>
          <button class="btn-delete" data-mealdelete="${esc(m.id)}" title="Delete meal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  const mealAddBtn = $('mealAddBtn');
  if (mealAddBtn) mealAddBtn.addEventListener('click', async () => {
    const err = $('mealAddErr'); err.hidden = true;
    const name = $('mealName').value.trim();
    if (!name) { err.textContent = 'Meal name is required.'; err.hidden = false; return; }
    mealAddBtn.disabled = true;
    try {
      const res = await api('/api/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mealDay: $('mealDay').value.trim(), kind: $('mealKind').value, maxPerPerson: $('mealMax').value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not add.');
      $('mealName').value = ''; $('mealDay').value = ''; $('mealMax').value = '1';
      loadMeals();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { mealAddBtn.disabled = false; }
  });

  const mealsList = $('mealsList');
  if (mealsList) mealsList.addEventListener('click', async (e) => {
    const save = e.target.closest('[data-mealsave]');
    const del = e.target.closest('[data-mealdelete]');
    if (save) {
      const card = save.closest('[data-meal]');
      const id = save.dataset.mealsave;
      const fields = {};
      card.querySelectorAll('[data-mf]').forEach((inp) => { fields[inp.dataset.mf] = inp.type === 'checkbox' ? inp.checked : inp.value; });
      save.disabled = true; const t = save.textContent; save.textContent = 'Saving…';
      try {
        const res = await api(`/api/meals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save.');
        loadMeals();
      } catch (err) { alert(err.message); save.disabled = false; save.textContent = t; }
      return;
    }
    if (del) {
      const id = del.dataset.mealdelete;
      const m = meals.find((x) => x.id === id);
      if (!confirm(`Delete "${m ? m.name : 'this meal'}"?\n\nAll its check-in records will be removed too. This cannot be undone.`)) return;
      try {
        const res = await api(`/api/meals/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete.');
        loadMeals();
      } catch (err) { alert(err.message); }
    }
  });

  /* ============================================================
     CHECK-INS (meal log) — who was served, when, by whom + delete
     ============================================================ */
  let checkins = [];
  async function loadCheckins() {
    if (!$('ciTbody')) return;
    // keep the meal filter options in sync with the meals catalog
    try {
      if (!meals.length) { const mr = await api('/api/meals'); const md = await mr.json(); if (md.ok) meals = md.meals || []; }
    } catch (e) { /* ignore */ }
    const sel = $('ciMealFilter');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">All meals</option>' +
        meals.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
      sel.value = cur;
    }
    try {
      const mealId = sel ? sel.value : '';
      const res = await api('/api/redemptions' + (mealId ? `?mealId=${encodeURIComponent(mealId)}` : ''));
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load check-ins');
      checkins = data.redemptions || [];
      renderCheckins();
    } catch (err) { alert(err.message); }
  }

  function filteredCheckins() {
    const q = ($('ciSearch').value || '').trim().toLowerCase();
    return checkins.filter((r) => {
      if (!q) return true;
      const hay = `${r.fullName || ''} ${r.regId || ''} ${r.organization || ''} ${r.mealName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderCheckins() {
    const tbody = $('ciTbody'); if (!tbody) return;
    const rows = filteredCheckins();
    if ($('ciEmpty')) $('ciEmpty').hidden = rows.length > 0;
    if ($('ciCount')) $('ciCount').textContent = `${rows.length} check-in${rows.length === 1 ? '' : 's'}`;
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td class="cell-name">${esc(r.fullName || '—')}</td>
        <td class="cell-muted">${esc(r.regId || '')}</td>
        <td>${r.organization ? esc(r.organization) : '<span class="cell-muted">—</span>'}</td>
        <td>${esc(r.mealName || '—')} <span class="meal-badge meal-badge--${r.mealKind === 'event' ? 'event' : 'meal'}">${r.mealKind === 'event' ? 'Event' : 'Meal'}</span>${r.mealDay ? ` <span class="cell-muted">· ${esc(r.mealDay)}</span>` : ''}</td>
        <td class="cell-muted">${esc(fmtDate(r.redeemedAt))}</td>
        <td class="cell-muted">${esc(r.redeemedBy || '—')}</td>
        <td><button class="btn-delete" data-cidelete="${esc(r.id)}" title="Delete this check-in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke-linecap="round"/></svg>
        </button></td>
      </tr>`).join('');
  }

  const ciSearch = $('ciSearch');
  if (ciSearch) ciSearch.addEventListener('input', renderCheckins);
  const ciMealFilter = $('ciMealFilter');
  if (ciMealFilter) ciMealFilter.addEventListener('change', loadCheckins);

  const ciTbody = $('ciTbody');
  if (ciTbody) ciTbody.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-cidelete]');
    if (!del) return;
    const id = del.dataset.cidelete;
    const rec = checkins.find((x) => x.id === id);
    if (!confirm(`Delete this check-in for ${rec ? (rec.fullName || 'this delegate') : 'this delegate'} (${rec ? rec.mealName : ''})?\n\nThey will be able to avail this meal again.`)) return;
    try {
      const res = await api(`/api/redemptions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete.');
      checkins = checkins.filter((x) => x.id !== id);
      renderCheckins();
      loadMeals(); // served counts changed
    } catch (err) { alert(err.message); }
  });

  const ciExportBtn = $('ciExportBtn');
  if (ciExportBtn) ciExportBtn.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { alert('Excel library failed to load.'); return; }
    const rows = filteredCheckins();
    if (!rows.length) { alert('No check-ins to export.'); return; }
    const data = rows.map((r) => ({
      'Delegate': r.fullName || '', 'Reg ID': r.regId || '', 'Company': r.organization || '',
      'Mobile': r.mobile || '', 'Meal': r.mealName || '', 'Day': r.mealDay || '',
      'Served At': fmtDate(r.redeemedAt), 'By': r.redeemedBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Check-ins');
    XLSX.writeFile(wb, `NEPA-Meal-Checkins-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ============================================================
     BULK IMPORT (Excel)
     ============================================================ */
  let importRows = [];

  function matchField(header) {
    const h = String(header || '').trim().toLowerCase();
    if (!h) return null;
    if (/(company|organi|firm|business)/.test(h)) return 'organization';
    if (/(designation|title|role|position)/.test(h)) return 'designation';
    if (/(city|location|town|place)/.test(h)) return 'city';
    if (/gst/.test(h)) return 'gstNumber';
    if (/(mobile|phone|contact|whatsapp|cell|number|mob)/.test(h)) return 'mobile';
    if (/(e-?mail)/.test(h)) return 'email';
    if (/(note|remark|comment)/.test(h)) return 'note';
    if (/name/.test(h)) return 'fullName';
    return null;
  }

  const importFile = $('importFile');
  if (importFile) importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('importFileName').textContent = file.name;
    if (typeof XLSX === 'undefined') { alert('Excel library failed to load.'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      if (!matrix.length) { alert('That sheet looks empty.'); return; }
      const headers = matrix[0].map(matchField);
      importRows = [];
      for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || row.every((c) => String(c).trim() === '')) continue;
        const rec = { __row: i + 1 };
        headers.forEach((f, idx) => { if (f && rec[f] == null) rec[f] = String(row[idx] == null ? '' : row[idx]).trim(); });
        if (rec.mobile) rec.mobile = rec.mobile.replace(/\D/g, '');
        importRows.push(rec);
      }
      renderImportPreview();
    } catch (err) { alert('Could not read the file: ' + err.message); }
  });

  function renderImportPreview() {
    const wrap = $('importPreview');
    const tbody = $('importTbody');
    const valid = importRows.filter((r) => r.fullName && /^\d{10}$/.test(r.mobile || ''));
    const bad = importRows.length - valid.length;
    $('importSummary').innerHTML = `Found <b>${importRows.length}</b> data rows — <span class="imp-ok">${valid.length} ready</span>${bad ? `, <span class="imp-fail">${bad} will be skipped (missing name or bad mobile)</span>` : ''}.`;
    $('importCount').textContent = importRows.length;
    tbody.innerHTML = importRows.slice(0, 200).map((r) => {
      const ok = r.fullName && /^\d{10}$/.test(r.mobile || '');
      return `<tr${ok ? '' : ' style="opacity:.55"'}>
        <td class="cell-muted">${r.__row}</td>
        <td>${esc(r.fullName || '') || '<span class="cell-missing">—</span>'}</td>
        <td>${esc(r.mobile || '') || '<span class="cell-missing">—</span>'}</td>
        <td>${esc(r.email || '')}</td>
        <td>${esc(r.organization || '')}</td>
        <td>${esc(r.designation || '')}</td>
        <td>${esc(r.city || '')}</td>
        <td>${ok ? '' : '<span class="cell-missing">will skip</span>'}</td>
      </tr>`;
    }).join('');
    if (importRows.length > 200) tbody.innerHTML += `<tr><td colspan="8" class="cell-muted">…and ${importRows.length - 200} more (all will be imported)</td></tr>`;
    wrap.hidden = false;
    $('importReport').hidden = true;
  }

  function clearImport() {
    importRows = [];
    $('importFile').value = '';
    $('importFileName').textContent = 'No file selected';
    $('importPreview').hidden = true;
    $('importReport').hidden = true;
  }
  const importClearBtn = $('importClearBtn');
  if (importClearBtn) importClearBtn.addEventListener('click', clearImport);

  const importRunBtn = $('importRunBtn');
  if (importRunBtn) importRunBtn.addEventListener('click', async () => {
    if (!importRows.length) return;
    importRunBtn.disabled = true; const t = importRunBtn.textContent; importRunBtn.textContent = 'Importing…';
    try {
      const res = await api('/api/registrations/bulk-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows, onDuplicate: $('importDup').value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed.');
      renderImportReport(data.report);
      loadRegistrations(); // refresh lists + cards
    } catch (e) { alert(e.message); }
    finally { importRunBtn.disabled = false; importRunBtn.textContent = t; }
  });

  function renderImportReport(rep) {
    $('importPreview').hidden = true;
    const box = $('importReport');
    const failRows = (rep.rows || []).filter((r) => r.status === 'failed' || r.status === 'skipped');
    box.innerHTML = `
      <div class="import-report__tot">
        <span class="imp-ok">Inserted <b>${rep.inserted}</b></span>
        <span>Updated <b>${rep.updated}</b></span>
        <span class="imp-skip">Skipped <b>${rep.skipped}</b></span>
        <span class="imp-fail">Failed <b>${rep.failed}</b></span>
      </div>
      ${failRows.length ? `<div class="table-wrap import-preview-wrap"><table class="reg-table"><thead><tr><th>Row</th><th>Name</th><th>Status</th><th>Reason</th></tr></thead><tbody>${failRows.map((r) => `<tr><td class="cell-muted">${r.row || ''}</td><td>${esc(r.name || '')}</td><td class="${r.status === 'skipped' ? 'imp-skip' : 'imp-fail'}">${r.status}</td><td>${esc(r.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="cell-muted">All rows imported cleanly.</p>'}`;
    box.hidden = false;
    importRows = [];
  }

  /* ============================================================
     MANUAL REGISTER (admin adds a delegate; public reg is closed)
     ============================================================ */
  function openManual() {
    ['mrName', 'mrMobile', 'mrEmail', 'mrOrg', 'mrDesignation', 'mrCity', 'mrGst'].forEach((id) => { if ($(id)) $(id).value = ''; });
    if ($('mrMember')) $('mrMember').checked = false;
    if ($('mrMethod')) $('mrMethod').value = 'Offline';
    if ($('mrStatus')) $('mrStatus').value = 'Confirmed';
    $('mrErr').hidden = true;
    $('manualModal').hidden = false;
    setTimeout(() => $('mrName').focus(), 30);
  }
  function closeManual() { $('manualModal').hidden = true; }
  const manualRegBtn = $('manualRegBtn');
  if (manualRegBtn) manualRegBtn.addEventListener('click', openManual);
  document.querySelectorAll('[data-close-manual]').forEach((el) => el.addEventListener('click', closeManual));

  const mrSaveBtn = $('mrSaveBtn');
  if (mrSaveBtn) mrSaveBtn.addEventListener('click', async () => {
    const err = $('mrErr'); err.hidden = true;
    const payload = {
      fullName: $('mrName').value.trim(),
      mobile: $('mrMobile').value.replace(/\D/g, ''),
      email: $('mrEmail').value.trim(),
      organization: $('mrOrg').value.trim(),
      designation: $('mrDesignation').value.trim(),
      city: $('mrCity').value.trim(),
      gstNumber: $('mrGst').value.trim().toUpperCase(),
      nepaMember: $('mrMember').checked,
      paymentMethod: $('mrMethod').value,
      status: $('mrStatus').value,
    };
    if (!payload.fullName) { err.textContent = 'Full name is required.'; err.hidden = false; return; }
    if (!/^\d{10}$/.test(payload.mobile)) { err.textContent = 'Mobile must be exactly 10 digits.'; err.hidden = false; return; }
    mrSaveBtn.disabled = true; const t = mrSaveBtn.textContent; mrSaveBtn.textContent = 'Registering…';
    try {
      const res = await api('/api/registrations/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not register.');
      closeManual();
      loadRegistrations();
      alert(`Registered ${data.registration.fullName} — ${data.registration.regId}.`);
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { mrSaveBtn.disabled = false; mrSaveBtn.textContent = t; }
  });

  /* ============================================================
     BOOT — auto-login if a token exists
     ============================================================ */
  if (token()) showDashboard();
  else showLogin();
})();
