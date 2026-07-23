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
    loginScreen.hidden = true;
    dashboard.hidden = false;
    applyRoleUI();
    reloadAll();
  }

  // Load every view the current role can access (keeps tab badges accurate).
  function reloadAll() {
    const r = role();
    if (VIEWS.registrations.roles.includes(r)) { loadRegistrations(); loadMessages(); loadArchived(); }
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
        const hay = `${r.fullName} ${r.mobile} ${r.organization} ${r.email}`.toLowerCase();
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
     BOOT — auto-login if a token exists
     ============================================================ */
  if (token()) showDashboard();
  else showLogin();
})();
