// app.js — Campus Lost & Found frontend logic
// Vanilla JS single-page app. All data comes from the Express API below.

(function () {
  'use strict';

  const API = '/api';

  // ---------- Global state ----------
  let currentUser = null;
  let currentView = 'browse';
  let allItemsCache = [];
  let activeFilters = { search: '', type: 'All', category: 'All', status: 'All' };

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const authArea = $('#authArea');
  const itemsGrid = $('#itemsGrid');
  const mineGrid = $('#mineGrid');
  const emptyState = $('#emptyState');
  const mineEmptyState = $('#mineEmptyState');
  const resultsMeta = $('#resultsMeta');

  // ============================================================
  // Helpers
  // ============================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.2s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      ...options,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      // some responses (e.g. plain 500 from a crashed route) may not be JSON
      data = { error: 'Unexpected server response.' };
    }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // ============================================================
  // Auth
  // ============================================================
  async function refreshCurrentUser() {
    try {
      const data = await api('/auth/me');
      currentUser = data.user;
    } catch (_) {
      currentUser = null;
    }
    renderAuthArea();
  }

  function renderAuthArea() {
    if (currentUser) {
      const initial = currentUser.name.trim().charAt(0).toUpperCase() || '?';
      authArea.innerHTML = `
        <div class="user-pill">
          <span class="user-pill-avatar">${escapeHtml(initial)}</span>
          <span>${escapeHtml(currentUser.name)}</span>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">Log out</button>
      `;
      $('#logoutBtn').addEventListener('click', handleLogout);
    } else {
      authArea.innerHTML = `<button class="btn btn-primary" id="loginOpenBtn">Log in / Sign up</button>`;
      $('#loginOpenBtn').addEventListener('click', () => openAuthModal('login'));
    }
  }

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      currentUser = null;
      renderAuthArea();
      showToast('Logged out.');
      navigateTo('browse');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function openAuthModal(tab) {
    $('#authModalOverlay').classList.remove('hidden');
    setAuthTab(tab);
  }
  function closeAuthModal() {
    $('#authModalOverlay').classList.add('hidden');
    $('#loginForm').reset();
    $('#registerForm').reset();
    $('#loginError').classList.add('hidden');
    $('#registerError').classList.add('hidden');
  }
  function setAuthTab(tab) {
    $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authtab === tab));
    $('#loginForm').classList.toggle('hidden', tab !== 'login');
    $('#registerForm').classList.toggle('hidden', tab !== 'register');
  }

  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => setAuthTab(tab.dataset.authtab)));
  $('#authModalClose').addEventListener('click', closeAuthModal);
  $('#authModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'authModalOverlay') closeAuthModal(); });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#loginError');
    errEl.classList.add('hidden');
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      currentUser = data;
      renderAuthArea();
      closeAuthModal();
      showToast(`Welcome back, ${data.name.split(' ')[0]}!`);
      loadBrowseItems();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#registerError');
    errEl.classList.add('hidden');
    const name = $('#registerName').value.trim();
    const email = $('#registerEmail').value.trim();
    const password = $('#registerPassword').value;
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      currentUser = data;
      renderAuthArea();
      closeAuthModal();
      showToast(`Welcome, ${data.name.split(' ')[0]}! Your account is ready.`);
      loadBrowseItems();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  // ============================================================
  // Navigation
  // ============================================================
  function navigateTo(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== view));
    $$('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.nav === view));

    if (view === 'browse') loadBrowseItems();
    if (view === 'mine') {
      if (!currentUser) {
        showToast('Log in to see your posts.', 'error');
        openAuthModal('login');
        navigateTo('browse');
        return;
      }
      loadMineItems();
    }
    if (view === 'post' && !currentUser) {
      showToast('Log in to report an item.', 'error');
      openAuthModal('login');
      navigateTo('browse');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav);
    });
  });

  // ============================================================
  // Browse / Search / Filter
  // ============================================================
  function renderSkeletons(container, count = 6) {
    container.innerHTML = Array.from({ length: count }).map(() => '<div class="skeleton-card"></div>').join('');
  }

  async function loadBrowseItems() {
    renderSkeletons(itemsGrid);
    emptyState.classList.add('hidden');
    try {
      const params = new URLSearchParams();
      if (activeFilters.search) params.set('search', activeFilters.search);
      if (activeFilters.type !== 'All') params.set('type', activeFilters.type);
      if (activeFilters.category !== 'All') params.set('category', activeFilters.category);
      if (activeFilters.status !== 'All') params.set('status', activeFilters.status);

      const data = await api(`/items?${params.toString()}`);
      allItemsCache = data.items;
      renderItemsGrid(itemsGrid, data.items, { showOwnerActions: false });
      resultsMeta.textContent = `${data.items.length} item${data.items.length === 1 ? '' : 's'} found`;
      emptyState.classList.toggle('hidden', data.items.length > 0);
    } catch (err) {
      itemsGrid.innerHTML = '';
      showToast(err.message, 'error');
    }
  }

  async function loadMineItems() {
    renderSkeletons(mineGrid);
    mineEmptyState.classList.add('hidden');
    try {
      const data = await api('/items/mine');
      renderItemsGrid(mineGrid, data.items, { showOwnerActions: true });
      mineEmptyState.classList.toggle('hidden', data.items.length > 0);
    } catch (err) {
      mineGrid.innerHTML = '';
      showToast(err.message, 'error');
    }
  }

  function tagCardHTML(item, { showOwnerActions }) {
    const isLost = item.type === 'lost';
    const isClaimed = item.status === 'claimed';
    const imgHTML = item.imageFilename
      ? `<img class="tag-image" src="/uploads/${escapeHtml(item.imageFilename)}" alt="${escapeHtml(item.title)}" loading="lazy" />`
      : `<div class="tag-image-placeholder">${isLost ? '🔍' : '📦'}</div>`;

    return `
      <article class="tag-card ${isLost ? 'is-lost' : 'is-found'} ${isClaimed ? 'is-claimed' : ''}" data-id="${item.id}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(item.title)}">
        <span class="tag-punch" aria-hidden="true"></span>
        ${imgHTML}
        <div class="tag-body">
          <div class="tag-meta-row">
            <span class="badge ${isLost ? 'badge-lost' : 'badge-found'}">${isLost ? 'Lost' : 'Found'}</span>
            ${isClaimed ? '<span class="badge badge-claimed">Resolved</span>' : ''}
            <span class="tag-category">${escapeHtml(item.category)}</span>
          </div>
          <h3 class="tag-title">${escapeHtml(item.title)}</h3>
          <p class="tag-desc">${escapeHtml(item.description)}</p>
          <div class="tag-footer">
            <span>📍 ${escapeHtml(item.location)}</span>
            <span>${formatDate(item.date)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderItemsGrid(container, items, opts) {
    if (!items.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = items.map(item => tagCardHTML(item, opts)).join('');
    Array.from(container.querySelectorAll('.tag-card')).forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', () => openItemModal(id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openItemModal(id);
        }
      });
    });
  }

  // Filter bar interactions
  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      activeFilters.search = e.target.value;
      loadBrowseItems();
    }, 300);
  });

  $$('#typeFilter .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('#typeFilter .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilters.type = pill.dataset.value;
      loadBrowseItems();
    });
  });

  $('#categoryFilter').addEventListener('change', (e) => {
    activeFilters.category = e.target.value;
    loadBrowseItems();
  });

  $('#statusFilter').addEventListener('change', (e) => {
    activeFilters.status = e.target.value;
    loadBrowseItems();
  });

  // ============================================================
  // Item Detail Modal
  // ============================================================
  async function openItemModal(id) {
    const overlay = $('#itemModalOverlay');
    const body = $('#modalBody');
    body.innerHTML = '<div class="skeleton-card" style="height:300px"></div>';
    overlay.classList.remove('hidden');

    try {
      const data = await api(`/items/${id}`);
      const item = data.item;
      const isLost = item.type === 'lost';
      const isOwner = currentUser && currentUser.id === item.userId;
      const isClaimed = item.status === 'claimed';

      const imgHTML = item.imageFilename
        ? `<img class="modal-image" src="/uploads/${escapeHtml(item.imageFilename)}" alt="${escapeHtml(item.title)}" />`
        : '';

      let actionsHTML = '';
      if (isOwner) {
        actionsHTML = `
          <div class="modal-actions">
            ${isClaimed
              ? `<button class="btn btn-ghost" data-action="reopen">Mark as unresolved</button>`
              : `<button class="btn btn-primary" data-action="claim">Mark as ${isLost ? 'found / returned' : 'claimed'}</button>`}
            <button class="btn btn-danger-outline" data-action="delete">Delete post</button>
          </div>`;
      } else if (currentUser) {
        actionsHTML = `
          <div class="modal-actions">
            <a class="btn btn-primary" href="mailto:${encodeURIComponent(item.posterEmail || '')}?subject=${encodeURIComponent('About your ' + item.type + ' item: ' + item.title)}">
              Contact ${escapeHtml(item.posterName.split(' ')[0])}
            </a>
          </div>`;
      } else {
        actionsHTML = `<div class="modal-actions"><button class="btn btn-primary" data-action="login-to-contact">Log in to contact poster</button></div>`;
      }

      body.innerHTML = `
        ${imgHTML}
        <div class="modal-eyebrow-row">
          <span class="badge ${isLost ? 'badge-lost' : 'badge-found'}">${isLost ? 'Lost' : 'Found'}</span>
          ${isClaimed ? '<span class="badge badge-claimed">Resolved</span>' : ''}
        </div>
        <h2 id="modalTitle">${escapeHtml(item.title)}</h2>
        <p class="modal-desc">${escapeHtml(item.description)}</p>
        <div class="modal-meta-grid">
          <div><span>Category</span>${escapeHtml(item.category)}</div>
          <div><span>Location</span>${escapeHtml(item.location)}</div>
          <div><span>Date</span>${formatDate(item.date)}</div>
          <div><span>Posted by</span>${escapeHtml(item.posterName)}</div>
        </div>
        ${actionsHTML}
      `;

      const claimBtn = body.querySelector('[data-action="claim"]');
      const reopenBtn = body.querySelector('[data-action="reopen"]');
      const deleteBtn = body.querySelector('[data-action="delete"]');
      const loginBtn = body.querySelector('[data-action="login-to-contact"]');

      if (claimBtn) claimBtn.addEventListener('click', () => updateItemStatus(item.id, 'claimed'));
      if (reopenBtn) reopenBtn.addEventListener('click', () => updateItemStatus(item.id, 'open'));
      if (deleteBtn) deleteBtn.addEventListener('click', () => deleteItemConfirm(item.id));
      if (loginBtn) loginBtn.addEventListener('click', () => { closeItemModal(); openAuthModal('login'); });
    } catch (err) {
      body.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function closeItemModal() {
    $('#itemModalOverlay').classList.add('hidden');
  }
  $('#modalClose').addEventListener('click', closeItemModal);
  $('#itemModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'itemModalOverlay') closeItemModal(); });

  async function updateItemStatus(id, status) {
    try {
      await api(`/items/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast(status === 'claimed' ? 'Marked as resolved.' : 'Reopened.');
      closeItemModal();
      if (currentView === 'mine') loadMineItems(); else loadBrowseItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteItemConfirm(id) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/items/${id}`, { method: 'DELETE' });
      showToast('Post deleted.');
      closeItemModal();
      if (currentView === 'mine') loadMineItems(); else loadBrowseItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Escape key closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeItemModal();
      closeAuthModal();
    }
  });

  // ============================================================
  // Post Item Form
  // ============================================================
  $$('.type-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.type-toggle-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      $('#itemType').value = btn.dataset.type;
    });
  });

  $('#image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const wrap = $('#imagePreviewWrap');
    if (!file) { wrap.classList.add('hidden'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      $('#imagePreview').src = ev.target.result;
      wrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  $('#clearImage').addEventListener('click', () => {
    $('#image').value = '';
    $('#imagePreviewWrap').classList.add('hidden');
  });

  $('#postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = $('#postHint');
    const btn = $('#postSubmitBtn');
    hint.textContent = '';
    hint.classList.remove('form-error');

    const formData = new FormData($('#postForm'));

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const res = await fetch(`${API}/items`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit your report.');

      showToast('Item reported successfully!');
      $('#postForm').reset();
      $('#imagePreviewWrap').classList.add('hidden');
      $$('.type-toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', i === 0);
        b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      });
      $('#itemType').value = 'lost';
      navigateTo('mine');
    } catch (err) {
      hint.textContent = err.message;
      hint.classList.add('form-error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit report';
    }
  });

  // Default the date field to today
  $('#date').valueAsDate = new Date();

  // ============================================================
  // Init
  // ============================================================
  (async function init() {
    await refreshCurrentUser();
    navigateTo('browse');
  })();
})();
