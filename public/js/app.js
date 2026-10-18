// app.js — Campus Lost & Found frontend logic
// Vanilla JS single-page app. All data comes from the Express API below.

(function () {
  'use strict';

  const API = '/api';
  const REQUEST_TIMEOUT_MS = 20000;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // ---------- Global state ----------
  let currentUser = null;
  let currentView = 'browse';
  let activeFilters = { search: '', type: 'All', category: 'All', status: 'All' };
  // Each list load gets a ticket; responses for older tickets are ignored so a
  // slow request can never overwrite newer results or leave skeletons behind.
  let browseTicket = 0;
  let mineTicket = 0;

  // ---------- DOM refs ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const authArea = $('#authArea');
  const itemsGrid = $('#itemsGrid');
  const mineGrid = $('#mineGrid');
  const emptyState = $('#emptyState');
  const mineEmptyState = $('#mineEmptyState');
  const resultsMeta = $('#resultsMeta');
  const mineMeta = $('#mineMeta');
  const itemModal = $('#itemModal');
  const authModal = $('#authModal');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ============================================================
  // Helpers
  // ============================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Item dates are stored as YYYY-MM-DD; read them as local dates so they
  // don't shift by a day in timezones behind UTC.
  function formatDate(value) {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function todayLocal() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), reduceMotion.matches ? 0 : 220);
    }, 3600);
  }

  function setBusy(btn, busy, busyLabel) {
    const label = $('.btn-label', btn) || btn;
    if (busy) {
      btn.dataset.label = label.textContent;
      label.textContent = busyLabel;
      btn.disabled = true;
      btn.classList.add('is-busy');
    } else {
      if (btn.dataset.label) label.textContent = btn.dataset.label;
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        credentials: 'same-origin',
        ...options,
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(
        err.name === 'AbortError'
          ? 'The server took too long to respond. Please try again.'
          : 'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      clearTimeout(timer);
    }
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
  // Dialogs
  // ============================================================
  let lastFocus = null;

  function openDialog(dialog) {
    if (!dialog.open) {
      lastFocus = document.activeElement;
      dialog.showModal();
      document.body.classList.add('modal-open');
    }
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  [itemModal, authModal].forEach(dialog => {
    dialog.addEventListener('close', () => {
      if (!itemModal.open && !authModal.open) document.body.classList.remove('modal-open');
      if (dialog === authModal) resetAuthForms();
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    });
    // Clicking the backdrop (outside the dialog box) closes it
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(dialog);
    });
  });

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
        <span class="user-chip" title="${escapeHtml(currentUser.email)}">
          <span class="user-chip-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
          <span class="user-chip-name">${escapeHtml(currentUser.name)}</span>
        </span>
        <button type="button" class="btn btn-quiet btn-sm" id="logoutBtn">Log out</button>
      `;
      $('#logoutBtn').addEventListener('click', handleLogout);
    } else {
      authArea.innerHTML = `<button type="button" class="btn btn-primary btn-sm" id="loginOpenBtn">Log in</button>`;
      $('#loginOpenBtn').addEventListener('click', () => openAuthModal('login'));
    }
  }

  async function handleLogout(e) {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Logging out…');
    try {
      await api('/auth/logout', { method: 'POST' });
      currentUser = null;
      renderAuthArea();
      showToast('You have been logged out.');
      navigateTo('browse');
    } catch (err) {
      setBusy(btn, false);
      showToast(err.message, 'error');
    }
  }

  const AUTH_COPY = {
    login: ['Welcome back', 'Log in to report items and contact the people who posted them.'],
    register: ['Create your account', 'Use your name and email so people can reach you about an item.'],
  };

  function openAuthModal(tab, reason) {
    setAuthTab(tab);
    if (reason) $('#authModalSub').textContent = reason;
    openDialog(authModal);
    $(tab === 'login' ? '#loginEmail' : '#registerName').focus();
  }

  function resetAuthForms() {
    $('#loginForm').reset();
    $('#registerForm').reset();
    $('#loginError').classList.add('hidden');
    $('#registerError').classList.add('hidden');
  }

  function setAuthTab(tab) {
    $$('.auth-tab').forEach(t => {
      const selected = t.dataset.authtab === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
    });
    $('#loginForm').classList.toggle('hidden', tab !== 'login');
    $('#registerForm').classList.toggle('hidden', tab !== 'register');
    $('#authModalTitle').textContent = AUTH_COPY[tab][0];
    $('#authModalSub').textContent = AUTH_COPY[tab][1];
  }

  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => setAuthTab(tab.dataset.authtab));
    // Arrow keys move between tabs (WAI-ARIA tabs pattern)
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tab.dataset.authtab === 'login' ? 'register' : 'login';
      setAuthTab(next);
      $(`#tab-${next}`).focus();
    });
  });
  $('#authModalClose').addEventListener('click', () => closeDialog(authModal));

  function onSignedIn(user, message) {
    currentUser = user;
    renderAuthArea();
    closeDialog(authModal);
    showToast(message);
    if (currentView === 'mine') loadMineItems();
    else loadBrowseItems();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#loginError');
    const btn = $('button[type="submit"]', e.currentTarget);
    errEl.classList.add('hidden');
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    setBusy(btn, true, 'Logging in…');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      onSignedIn(data, `Welcome back, ${data.name.split(' ')[0]}.`);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      setBusy(btn, false);
    }
  });

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#registerError');
    const btn = $('button[type="submit"]', e.currentTarget);
    errEl.classList.add('hidden');
    const name = $('#registerName').value.trim();
    const email = $('#registerEmail').value.trim();
    const password = $('#registerPassword').value;
    setBusy(btn, true, 'Creating account…');
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      onSignedIn(data, `Welcome, ${data.name.split(' ')[0]}. Your account is ready.`);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      setBusy(btn, false);
    }
  });

  // ============================================================
  // Navigation
  // ============================================================
  function navigateTo(view, { focus = false } = {}) {
    if ((view === 'mine' || view === 'post') && !currentUser) {
      openAuthModal('login', view === 'post'
        ? 'Log in to report a lost or found item.'
        : 'Log in to see the items you have posted.');
      view = 'browse';
    }

    const changed = view !== currentView;
    currentView = view;
    $$('.view').forEach(v => {
      const active = v.dataset.view === view;
      v.classList.toggle('hidden', !active);
      v.classList.toggle('is-entering', active && changed);
    });
    $$('.nav-link').forEach(link => {
      if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (view === 'browse') loadBrowseItems();
    if (view === 'mine') loadMineItems();

    if (changed) window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (focus) $('#app').focus({ preventScroll: true });
  }

  $$('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav, { focus: true });
    });
  });

  $('#jumpToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    $('#register').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    $('#searchInput').focus({ preventScroll: true });
  });

  // Masthead gets a soft shadow once the page scrolls under it
  const masthead = $('.masthead');
  window.addEventListener('scroll', () => {
    masthead.classList.toggle('is-scrolled', window.scrollY > 4);
  }, { passive: true });

  // ============================================================
  // Browse / Search / Filter
  // ============================================================
  function renderSkeletons(container, count = 6) {
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = Array.from({ length: count }).map(() => `
      <div class="item-card skeleton" aria-hidden="true">
        <div class="item-media"></div>
        <div class="item-body">
          <div class="skeleton-line w-30"></div>
          <div class="skeleton-line w-80"></div>
          <div class="skeleton-line w-100"></div>
        </div>
      </div>`).join('');
  }

  function filtersActive() {
    return Boolean(activeFilters.search.trim()) || activeFilters.type !== 'All' ||
      activeFilters.category !== 'All' || activeFilters.status !== 'All';
  }

  const ART = {
    empty: `<svg class="empty-art" viewBox="0 0 104 104" aria-hidden="true">
        <path d="M22 50V26a3 3 0 0 1 3-3h24l33 33-27 27z"/><circle cx="35" cy="36" r="4.5" class="accent"/>
        <path d="M40 57h17M44 66h9" /></svg>`,
    search: `<svg class="empty-art" viewBox="0 0 104 104" aria-hidden="true">
        <circle cx="45" cy="45" r="23"/><path d="m62 62 20 20" /><path d="M37 45h16" class="accent"/></svg>`,
    error: `<svg class="empty-art" viewBox="0 0 104 104" aria-hidden="true">
        <path d="M52 18 88 82H16z"/><path d="M52 44v17M52 70v1.5"/></svg>`,
  };

  function renderEmpty(container, { art, title, text, actions = '' }) {
    container.innerHTML = `
      ${ART[art]}
      <div>
        <h3>${title}</h3>
        <p>${text}</p>
        ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
      </div>`;
    container.classList.toggle('is-error', art === 'error');
    container.classList.remove('hidden');
    $$('[data-nav]', container).forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav, { focus: true });
    }));
  }

  function renderResultsMeta(count) {
    resultsMeta.innerHTML = `<strong>${plural(count, 'report')}</strong>${filtersActive() ? ' match your filters' : ''}`;
  }

  async function loadBrowseItems() {
    const ticket = ++browseTicket;
    renderSkeletons(itemsGrid);
    emptyState.classList.add('hidden');
    resultsMeta.textContent = 'Loading reports…';
    syncFilterUI();
    try {
      const params = new URLSearchParams();
      if (activeFilters.search.trim()) params.set('search', activeFilters.search.trim());
      if (activeFilters.type !== 'All') params.set('type', activeFilters.type);
      if (activeFilters.category !== 'All') params.set('category', activeFilters.category);
      if (activeFilters.status !== 'All') params.set('status', activeFilters.status);

      const data = await api(`/items?${params.toString()}`);
      if (ticket !== browseTicket) return;
      renderItemsGrid(itemsGrid, data.items);
      renderResultsMeta(data.items.length);

      if (!data.items.length) {
        if (filtersActive()) {
          renderEmpty(emptyState, {
            art: 'search',
            title: 'No reports match these filters',
            text: 'Try a shorter search term, or widen the type, category or status.',
            actions: '<button type="button" class="btn btn-quiet" data-clear-filters>Clear filters</button>',
          });
          $('[data-clear-filters]', emptyState).addEventListener('click', clearFilters);
        } else {
          renderEmpty(emptyState, {
            art: 'empty',
            title: 'Nothing has been reported yet',
            text: 'When someone posts a lost or found item, it will appear here. Lost something yourself? Start the register.',
            actions: '<a href="#post" class="btn btn-primary" data-nav="post">Report an item</a>',
          });
        }
      }
    } catch (err) {
      if (ticket !== browseTicket) return;
      itemsGrid.innerHTML = '';
      itemsGrid.setAttribute('aria-busy', 'false');
      resultsMeta.textContent = '';
      renderEmpty(emptyState, {
        art: 'error',
        title: 'Reports couldn’t be loaded',
        text: escapeHtml(err.message),
        actions: '<button type="button" class="btn btn-quiet" data-retry>Try again</button>',
      });
      $('[data-retry]', emptyState).addEventListener('click', loadBrowseItems);
    }
  }

  async function loadMineItems() {
    const ticket = ++mineTicket;
    renderSkeletons(mineGrid, 3);
    mineEmptyState.classList.add('hidden');
    mineMeta.textContent = '';
    try {
      const data = await api('/items/mine');
      if (ticket !== mineTicket) return;
      renderItemsGrid(mineGrid, data.items);
      const resolved = data.items.filter(i => i.status === 'claimed').length;
      mineMeta.innerHTML = data.items.length
        ? `<strong>${plural(data.items.length, 'post')}</strong> · ${resolved} resolved`
        : '';
      if (!data.items.length) {
        renderEmpty(mineEmptyState, {
          art: 'empty',
          title: 'You haven’t posted anything yet',
          text: 'Lost or found something on campus? Report it so others can see it and get in touch.',
          actions: '<a href="#post" class="btn btn-primary" data-nav="post">Report an item</a>',
        });
      }
    } catch (err) {
      if (ticket !== mineTicket) return;
      mineGrid.innerHTML = '';
      mineGrid.setAttribute('aria-busy', 'false');
      renderEmpty(mineEmptyState, {
        art: 'error',
        title: 'Your posts couldn’t be loaded',
        text: escapeHtml(err.message),
        actions: '<button type="button" class="btn btn-quiet" data-retry>Try again</button>',
      });
      $('[data-retry]', mineEmptyState).addEventListener('click', loadMineItems);
    }
  }

  function itemCardHTML(item, index) {
    const isLost = item.type === 'lost';
    const isClaimed = item.status === 'claimed';
    const icon = ['Electronics', 'Books', 'ID Cards', 'Clothing', 'Bags', 'Keys'].includes(item.category)
      ? item.category : 'Other';
    const media = item.imageFilename
      ? `<img src="/uploads/${encodeURIComponent(item.imageFilename)}" alt="" loading="lazy" decoding="async" />`
      : `<div class="item-media-empty"><svg aria-hidden="true"><use href="#i-${icon}"/></svg><span>No photo</span></div>`;

    return `
      <article class="item-card ${isLost ? 'is-lost' : 'is-found'} ${isClaimed ? 'is-claimed' : ''}" style="--i:${Math.min(index, 12)}">
        <div class="item-media">
          ${media}
          <span class="item-tag"><span class="dot ${isLost ? 'dot-lost' : 'dot-found'}" aria-hidden="true"></span>${isLost ? 'Lost' : 'Found'}</span>
          ${isClaimed ? '<span class="item-stamp">Resolved</span>' : ''}
        </div>
        <div class="item-body">
          <p class="item-kicker">${escapeHtml(item.category)}</p>
          <h3 class="item-title">
            <button type="button" data-id="${escapeHtml(item.id)}" aria-haspopup="dialog">
              <span class="sr-only">${isLost ? 'Lost' : 'Found'}${isClaimed ? ', resolved' : ''}: </span>${escapeHtml(item.title)}
            </button>
          </h3>
          <p class="item-desc">${escapeHtml(item.description)}</p>
          <div class="item-foot">
            <span class="item-place"><svg aria-hidden="true"><use href="#i-pin"/></svg><span>${escapeHtml(item.location)}</span></span>
            <time class="item-date" datetime="${escapeHtml(item.date)}">${formatDate(item.date)}</time>
          </div>
        </div>
      </article>
    `;
  }

  function renderItemsGrid(container, items) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = items.map(itemCardHTML).join('');
    $$('.item-title button', container).forEach(btn => {
      btn.addEventListener('click', () => openItemModal(btn.dataset.id));
    });
  }

  // Filter bar interactions
  function syncFilterUI() {
    $$('#typeFilter .segment').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.value === activeFilters.type)));
    $('#categoryFilter').value = activeFilters.category;
    $('#statusFilter').value = activeFilters.status;
    $('#categoryFilter').classList.toggle('is-set', activeFilters.category !== 'All');
    $('#statusFilter').classList.toggle('is-set', activeFilters.status !== 'All');
    $('#clearFilters').classList.toggle('hidden', !filtersActive());
  }

  function clearFilters() {
    activeFilters = { search: '', type: 'All', category: 'All', status: 'All' };
    $('#searchInput').value = '';
    loadBrowseItems();
    $('#searchInput').focus();
  }
  $('#clearFilters').addEventListener('click', clearFilters);

  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      activeFilters.search = e.target.value;
      loadBrowseItems();
    }, 300);
  });

  $$('#typeFilter .segment').forEach(segment => {
    segment.addEventListener('click', () => {
      activeFilters.type = segment.dataset.value;
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
  // Item Detail Dialog
  // ============================================================
  async function openItemModal(id) {
    const body = $('#modalBody');
    body.innerHTML = `
      <div class="detail-skeleton" aria-label="Loading item">
        <div class="skeleton-line w-30"></div>
        <div class="skeleton-line w-80"></div>
        <div class="skeleton-line w-100"></div>
        <div class="skeleton-line w-100"></div>
      </div>`;
    openDialog(itemModal);
    $('#modalClose').focus();

    try {
      const data = await api(`/items/${encodeURIComponent(id)}`);
      const item = data.item;
      const isLost = item.type === 'lost';
      const isOwner = currentUser && currentUser.id === item.userId;
      const isClaimed = item.status === 'claimed';
      const firstName = escapeHtml((item.posterName || '').split(' ')[0] || 'the poster');

      const imgHTML = item.imageFilename
        ? `<div class="detail-media"><img src="/uploads/${encodeURIComponent(item.imageFilename)}" alt="Photo of ${escapeHtml(item.title)}" /></div>`
        : '';

      let actionsHTML = '';
      if (isOwner) {
        actionsHTML = `
          <div class="modal-actions" id="ownerActions">
            ${isClaimed
              ? `<button type="button" class="btn btn-quiet" data-action="reopen">Mark as unresolved</button>`
              : `<button type="button" class="btn btn-primary" data-action="claim">Mark as ${isLost ? 'found / returned' : 'claimed'}</button>`}
            <button type="button" class="btn btn-danger-quiet" data-action="delete">Delete post</button>
          </div>`;
      } else if (currentUser) {
        actionsHTML = item.posterEmail ? `
          <div class="modal-actions">
            <a class="btn btn-primary" href="mailto:${encodeURIComponent(item.posterEmail)}?subject=${encodeURIComponent('About your ' + item.type + ' item: ' + item.title)}">
              Email ${firstName}
              <svg class="btn-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>
            </a>
          </div>` : '';
      } else {
        actionsHTML = `<div class="modal-actions"><button type="button" class="btn btn-primary" data-action="login-to-contact">Log in to contact ${firstName}</button></div>`;
      }

      body.innerHTML = `
        ${imgHTML}
        <div class="detail-body">
          <div class="detail-kicker">
            <span class="label ${isLost ? 'label-lost' : 'label-found'}"><span class="dot ${isLost ? 'dot-lost' : 'dot-found'}" aria-hidden="true"></span>${isLost ? 'Lost' : 'Found'}</span>
            ${isClaimed ? '<span class="label label-resolved">Resolved</span>' : ''}
          </div>
          <h2 id="modalTitle" class="modal-title">${escapeHtml(item.title)}</h2>
          <p class="detail-desc">${escapeHtml(item.description)}</p>
          <dl class="detail-meta">
            <div><dt>Category</dt><dd>${escapeHtml(item.category)}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(item.location)}</dd></div>
            <div><dt>Date</dt><dd>${formatDate(item.date)}</dd></div>
            <div><dt>Posted by</dt><dd>${escapeHtml(item.posterName)}</dd></div>
          </dl>
          ${actionsHTML}
        </div>
      `;

      const bindOwnerActions = () => {
        const claimBtn = $('[data-action="claim"]', body);
        const reopenBtn = $('[data-action="reopen"]', body);
        const deleteBtn = $('[data-action="delete"]', body);
        if (claimBtn) claimBtn.addEventListener('click', () => updateItemStatus(item.id, 'claimed', claimBtn));
        if (reopenBtn) reopenBtn.addEventListener('click', () => updateItemStatus(item.id, 'open', reopenBtn));
        if (deleteBtn) deleteBtn.addEventListener('click', () => askDelete(item.id, bindOwnerActions));
      };
      bindOwnerActions();

      const loginBtn = $('[data-action="login-to-contact"]', body);
      if (loginBtn) loginBtn.addEventListener('click', () => {
        closeDialog(itemModal);
        openAuthModal('login', 'Log in to contact the person who posted this item.');
      });
    } catch (err) {
      body.innerHTML = `
        <div class="detail-body">
          <h2 id="modalTitle" class="modal-title">Item unavailable</h2>
          <p class="form-error" role="alert">${escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  $('#modalClose').addEventListener('click', () => closeDialog(itemModal));

  function refreshCurrentList() {
    if (currentView === 'mine') loadMineItems(); else loadBrowseItems();
  }

  async function updateItemStatus(id, status, btn) {
    setBusy(btn, true, 'Saving…');
    try {
      await api(`/items/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast(status === 'claimed' ? 'Marked as resolved.' : 'Reopened as unresolved.');
      closeDialog(itemModal);
      refreshCurrentList();
    } catch (err) {
      setBusy(btn, false);
      showToast(err.message, 'error');
    }
  }

  // Two-step delete inside the dialog instead of a browser confirm()
  function askDelete(id, rebind) {
    const actions = $('#ownerActions');
    const previous = actions.innerHTML;
    actions.innerHTML = `
      <p class="confirm-text" id="confirmText">Delete this post for good? This can’t be undone.</p>
      <button type="button" class="btn btn-danger" data-action="confirm-delete" aria-describedby="confirmText"><span class="btn-label">Yes, delete it</span></button>
      <button type="button" class="btn btn-quiet" data-action="cancel-delete">Keep it</button>`;
    const confirmBtn = $('[data-action="confirm-delete"]', actions);
    confirmBtn.focus();
    $('[data-action="cancel-delete"]', actions).addEventListener('click', () => {
      actions.innerHTML = previous;
      rebind();
      $('[data-action="delete"]', actions).focus();
    });
    confirmBtn.addEventListener('click', async () => {
      setBusy(confirmBtn, true, 'Deleting…');
      try {
        await api(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Post deleted.');
        closeDialog(itemModal);
        refreshCurrentList();
      } catch (err) {
        setBusy(confirmBtn, false);
        showToast(err.message, 'error');
      }
    });
  }

  // ============================================================
  // Post Item Form
  // ============================================================
  const postForm = $('#postForm');
  const imageInput = $('#image');
  const dropzone = $('#dropzone');
  const dateInput = $('#date');

  function resetDate() {
    dateInput.value = todayLocal();
    dateInput.max = todayLocal();
  }

  function clearImage() {
    imageInput.value = '';
    $('#imagePreviewWrap').classList.add('hidden');
    dropzone.classList.remove('hidden');
  }

  function showPostError(message, field) {
    const errEl = $('#postError');
    errEl.textContent = message;
    errEl.classList.remove('hidden');
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    $('#postError').classList.add('hidden');
    if (!file) { clearImage(); return; }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      clearImage();
      showPostError('Only JPG, PNG, WEBP, or GIF images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      clearImage();
      showPostError('Image is too large. Please choose one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      $('#imagePreview').src = ev.target.result;
      $('#imagePreviewName').textContent = file.name;
      $('#imagePreviewWrap').classList.remove('hidden');
      dropzone.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });

  ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, () => dropzone.classList.add('is-dragover')));
  ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, () => dropzone.classList.remove('is-dragover')));

  $('#clearImage').addEventListener('click', () => {
    clearImage();
    imageInput.focus();
  });

  const description = $('#description');
  const descCount = $('#descCount');
  description.addEventListener('input', () => {
    descCount.textContent = `${description.value.length} / 500`;
  });

  $$('input, select, textarea', postForm).forEach(el => {
    el.addEventListener('input', () => el.removeAttribute('aria-invalid'));
  });

  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#postSubmitBtn');
    $('#postError').classList.add('hidden');

    // Check required fields in reading order and point at the first gap
    const required = [
      ['#title', 'Give your report a title.'],
      ['#category', 'Choose a category.'],
      ['#date', 'Add the date it was lost or found.'],
      ['#location', 'Say where it was lost or found.'],
      ['#description', 'Add a short description.'],
    ];
    for (const [sel, message] of required) {
      const field = $(sel);
      if (!field.value.trim()) { showPostError(message, field); return; }
    }

    const formData = new FormData(postForm);
    setBusy(btn, true, 'Submitting…');

    try {
      await api('/items', { method: 'POST', body: formData });
      showToast('Report posted. It’s now in the register.');
      postForm.reset();
      clearImage();
      resetDate();
      descCount.textContent = '0 / 500';
      navigateTo('mine');
    } catch (err) {
      showPostError(err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  resetDate();

  // ============================================================
  // Init
  // ============================================================
  (async function init() {
    renderSkeletons(itemsGrid);
    await refreshCurrentUser();
    currentView = null; // force first render of the browse view
    navigateTo('browse');
  })();
})();
