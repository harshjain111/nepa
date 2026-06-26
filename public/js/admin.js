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

  function showDashboard() {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    applyRoleUI();
    loadRegistrations();
    loadMessages();
    loadArchived();
  }

  // Reflect read-only mode in the header (controls are also conditionally
  // rendered per-row, and the backend rejects any write from a viewer).
  function applyRoleUI() {
    const sub = document.querySelector('.admin-header .brand__sub');
    if (sub) sub.textContent = isViewer() ? 'Registrations · Read-only' : 'Registrations';
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
  $('refreshBtn').addEventListener('click', () => { loadRegistrations(); loadMessages(); loadArchived(); });

  /* ---------------- tabs ---------------- */
  $('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const view = btn.dataset.view;
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('is-active', t === btn));
    $('viewRegistrations').hidden = view !== 'registrations';
    $('viewMessages').hidden = view !== 'messages';
    $('viewArchived').hidden = view !== 'archived';
    if (view === 'archived') loadArchived();
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
     BOOT — auto-login if a token exists
     ============================================================ */
  if (token()) showDashboard();
  else showLogin();
})();
