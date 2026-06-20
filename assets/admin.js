const state = {
  user: null,
  roles: {},
  content: null,
  status: null,
  users: [],
  auditRecords: [],
  selectedServiceId: null,
  activeTab: 'dashboard'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const loginView = $('#loginView');
const appView = $('#appView');
const panelTitle = $('#panelTitle');

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  bindGlobalEvents();
  try {
    const session = await api('/api/session');
    state.user = session.user;
    state.roles = session.roles;
    await refreshAdminData();
    showApp();
  } catch {
    showLogin();
  }
}

function bindGlobalEvents() {
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutBtn').addEventListener('click', handleLogout);
  $('#serviceSearch').addEventListener('input', renderServiceList);
  $('#serviceForm').addEventListener('submit', saveServiceText);
  $('#uploadForm').addEventListener('submit', uploadImage);
  $('#createUserForm').addEventListener('submit', createUser);
  $('#passwordForm').addEventListener('submit', changePassword);
  $('#refreshAuditBtn').addEventListener('click', loadAudit);
  $('#exportBtn').addEventListener('click', exportBackup);

  $$('.nav-btn').forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const status = $('#loginStatus');
  setStatus(status, '');
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const session = await api('/api/login', { method: 'POST', body: data });
    state.user = session.user;
    state.roles = session.roles;
    await refreshAdminData();
    showApp();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function handleLogout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  state.status = null;
  state.content = null;
  showLogin();
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  $('#sessionName').textContent = state.user.displayName || state.user.username;
  $('#sessionRole').textContent = state.user.roleLabel || state.user.role;
  $$('.admin-only').forEach(node => {
    node.hidden = !can('users:manage');
  });
  setTab('dashboard');
  renderAll();
}

async function refreshAdminData() {
  await loadContent();
  await loadStatus();
}

async function loadContent() {
  state.content = await api('/api/content');
  const ids = Object.keys(state.content.services || {});
  if (!state.selectedServiceId || !state.content.services[state.selectedServiceId]) {
    state.selectedServiceId = ids[0] || null;
  }
}

async function loadStatus() {
  try {
    state.status = await api('/api/admin/status');
  } catch {
    state.status = null;
  }
}

function renderAll() {
  renderDashboard();
  renderServiceList();
  renderServiceEditor();
  if (can('users:manage')) loadUsers();
  if (can('audit:view')) loadAudit();
}

function setTab(tab) {
  if (tab === 'users' && !can('users:manage')) tab = 'dashboard';
  if (tab === 'audit' && !can('audit:view')) tab = 'dashboard';
  state.activeTab = tab;
  $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.tab-panel').forEach(panel => {
    panel.hidden = panel.id !== `${tab}Tab`;
  });
  panelTitle.textContent = {
    dashboard: 'Dashboard',
    services: 'Service Manager',
    users: 'Permissions',
    audit: 'Audit Log',
    account: 'Account'
  }[tab] || 'Admin';
  if (tab === 'users' && can('users:manage')) loadUsers();
  if (tab === 'audit' && can('audit:view')) loadAudit();
}

function renderDashboard() {
  const services = serviceArray();
  const status = state.status || fallbackStatus();
  const content = status.content || {};

  $('#metricServices').textContent = content.serviceCount ?? services.length;
  $('#metricImages').textContent = content.imageCount ?? services.reduce((sum, service) => sum + (service.images || []).length, 0);
  $('#metricHeroImages').textContent = content.servicesWithHero ?? services.filter(service => service.heroImage).length;
  $('#metricLastUpdated').textContent = formatMetricDate(content.updatedAt || state.content?.updatedAt);

  renderRecentServices(content.recentServices || services);
  renderAttentionList(content.incompleteServices || []);
}

function renderRecentServices(services) {
  const list = $('#recentServices');
  const items = [...services].slice(0, 5);
  if (!items.length) {
    list.innerHTML = '<p class="muted">No service records found.</p>';
    return;
  }
  list.innerHTML = items.map(service => `
    <a class="activity-item" href="/${escapeAttr(service.page || '')}" target="_blank" rel="noopener">
      <strong>${escapeHtml(service.title || service.id)}</strong>
      <span>${escapeHtml(service.category || 'Service')} &middot; ${escapeHtml(formatDate(service.updatedAt))}</span>
    </a>
  `).join('');
}

function renderAttentionList(items) {
  const list = $('#serviceAttention');
  if (!items.length) {
    list.innerHTML = '<p class="muted">All managed service records have text, hero imagery, and gallery images.</p>';
    return;
  }
  list.innerHTML = items.map(item => `
    <button class="activity-item attention-item" type="button" data-service-id="${escapeAttr(item.id)}">
      <strong>${escapeHtml(item.title || item.id)}</strong>
      <span>Missing ${escapeHtml((item.missing || []).join(', '))}</span>
    </button>
  `).join('');
  list.querySelectorAll('[data-service-id]').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedServiceId = button.dataset.serviceId;
      setTab('services');
      renderServiceList();
      renderServiceEditor();
    });
  });
}

function fallbackStatus() {
  const services = serviceArray();
  return {
    content: {
      siteName: state.content?.siteName || 'MENU Real Estate Group',
      updatedAt: state.content?.updatedAt,
      serviceCount: services.length,
      imageCount: services.reduce((sum, service) => sum + (service.images || []).length, 0),
      servicesWithHero: services.filter(service => service.heroImage).length,
      incompleteServices: services
        .filter(service => !service.summary || !service.description || !service.heroImage || !(service.images || []).length)
        .map(service => ({ id: service.id, title: service.title, missing: ['content or images'] })),
      recentServices: services
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, 5)
    },
    users: { total: state.users.length, active: state.users.filter(user => user.active).length },
    audit: { total: state.auditRecords.length }
  };
}

function renderServiceList() {
  const query = $('#serviceSearch').value.trim().toLowerCase();
  const list = $('#serviceList');
  list.innerHTML = '';
  serviceArray()
    .filter(service => `${service.title} ${service.category}`.toLowerCase().includes(query))
    .forEach(service => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `service-item ${service.id === state.selectedServiceId ? 'active' : ''}`;
      button.innerHTML = `<strong>${escapeHtml(service.title)}</strong><span>${escapeHtml(service.category)} &middot; ${(service.images || []).length} images</span>`;
      button.addEventListener('click', () => {
        state.selectedServiceId = service.id;
        renderServiceList();
        renderServiceEditor();
      });
      list.appendChild(button);
    });
}

function renderServiceEditor() {
  const service = currentService();
  if (!service) return;
  $('#selectedCategory').textContent = service.category || 'Service';
  $('#selectedTitle').textContent = service.title || 'Untitled service';
  $('#selectedPreview').href = `/${service.page || ''}`;

  const form = $('#serviceForm');
  form.elements.title.value = service.title || '';
  form.elements.category.value = service.category || '';
  form.elements.summary.value = service.summary || '';
  form.elements.description.value = service.description || '';

  const textAllowed = can('content:edit');
  [...form.elements].forEach(element => {
    if (element.name) element.disabled = !textAllowed;
  });
  $('#saveServiceBtn').disabled = !textAllowed;
  $('#saveServiceBtn').classList.toggle('is-disabled', !textAllowed);

  const imageAllowed = can('images:manage');
  const uploadForm = $('#uploadForm');
  uploadForm.classList.toggle('is-disabled', !imageAllowed);
  uploadForm.querySelectorAll('input, button').forEach(element => {
    element.disabled = !imageAllowed;
  });
  $('#imagePermissionHint').textContent = imageAllowed ? 'Live image management is active.' : 'You do not have image permissions.';
  renderImages(service);
}

function renderImages(service) {
  const grid = $('#imageGrid');
  grid.innerHTML = '';
  const images = service.images || [];
  if (!images.length) {
    grid.innerHTML = '<p class="muted">No images yet. Upload the first one for this service.</p>';
    return;
  }
  images.forEach(image => {
    const card = document.createElement('article');
    card.className = 'image-card';
    card.innerHTML = `
      <img src="${escapeAttr(image.src)}" alt="${escapeAttr(image.alt || service.title)}">
      <div class="image-card-body">
        ${service.heroImage === image.src ? '<span class="hero-badge">Hero image</span>' : ''}
        <input data-field="alt" value="${escapeAttr(image.alt || '')}" placeholder="Alt text">
        <input data-field="caption" value="${escapeAttr(image.caption || '')}" placeholder="Caption">
        <small>${escapeHtml(image.src)}</small>
        <div class="image-actions">
          <button class="ghost-btn" type="button" data-action="save">Save</button>
          <button class="ghost-btn" type="button" data-action="hero">Set Hero</button>
          <button class="danger-btn" type="button" data-action="delete">Delete</button>
        </div>
      </div>
    `;
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveImageMeta(image.id, card));
    card.querySelector('[data-action="hero"]').addEventListener('click', () => setHeroImage(image.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteImage(image.id));
    grid.appendChild(card);
  });
}

async function saveServiceText(event) {
  event.preventDefault();
  const status = $('#serviceStatus');
  setStatus(status, '');
  const service = currentService();
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await api(`/api/services/${service.id}`, { method: 'PUT', body: data });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    await loadStatus();
    setStatus(status, 'Service text saved to the live site data.');
    renderAll();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function uploadImage(event) {
  event.preventDefault();
  const status = $('#serviceStatus');
  setStatus(status, '');
  const service = currentService();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const file = formData.get('image');
  if (!file || !file.size) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    const response = await api(`/api/services/${service.id}/upload`, {
      method: 'POST',
      body: {
        fileName: file.name,
        dataUrl,
        alt: formData.get('alt'),
        caption: formData.get('caption'),
        setAsHero: Boolean(formData.get('setAsHero'))
      }
    });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    form.reset();
    await loadStatus();
    setStatus(status, 'Image uploaded and published to the selected service.');
    renderAll();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function saveImageMeta(imageId, card) {
  const service = currentService();
  const status = $('#serviceStatus');
  try {
    const response = await api(`/api/services/${service.id}/images/${imageId}`, {
      method: 'PATCH',
      body: {
        alt: card.querySelector('[data-field="alt"]').value,
        caption: card.querySelector('[data-field="caption"]').value
      }
    });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    await loadStatus();
    setStatus(status, 'Image details saved.');
    renderAll();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function setHeroImage(imageId) {
  const service = currentService();
  const status = $('#serviceStatus');
  try {
    const response = await api(`/api/services/${service.id}/images/${imageId}`, {
      method: 'PATCH',
      body: { setAsHero: true }
    });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    await loadStatus();
    setStatus(status, 'Hero image updated on the live service page.');
    renderAll();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function deleteImage(imageId) {
  if (!confirm('Delete this image from the service?')) return;
  const service = currentService();
  const status = $('#serviceStatus');
  try {
    const response = await api(`/api/services/${service.id}/images/${imageId}`, { method: 'DELETE' });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    await loadStatus();
    setStatus(status, 'Image deleted from the service.');
    renderAll();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function loadUsers() {
  if (!can('users:manage')) return;
  try {
    const data = await api('/api/users');
    state.users = data.users;
    renderUsers();
    renderDashboard();
  } catch (error) {
    setStatus($('#userStatus'), error.message, true);
  }
}

function renderUsers() {
  const list = $('#userList');
  list.innerHTML = '';
  state.users.forEach(user => {
    const card = document.createElement('article');
    card.className = 'user-card';
    card.innerHTML = `
      <h3>${escapeHtml(user.displayName || user.username)}</h3>
      <p class="muted">${escapeHtml(user.username)} &middot; ${escapeHtml(user.roleLabel)} &middot; ${user.active ? 'Active' : 'Paused'}</p>
      <div class="user-card-grid">
        <input data-field="displayName" value="${escapeAttr(user.displayName || '')}" placeholder="Display name">
        <select data-field="role">
          ${Object.entries(state.roles).map(([key, role]) => `<option value="${key}" ${user.role === key ? 'selected' : ''}>${escapeHtml(role.label)}</option>`).join('')}
        </select>
        <label class="inline-check"><input data-field="active" type="checkbox" ${user.active ? 'checked' : ''}> Active</label>
      </div>
      <div class="user-card-grid">
        <input data-field="password" type="password" placeholder="New password (optional)">
        <button class="ghost-btn" type="button" data-action="save">Save User</button>
      </div>
    `;
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveUser(user.id, card));
    list.appendChild(card);
  });
}

async function createUser(event) {
  event.preventDefault();
  const status = $('#userStatus');
  const form = event.currentTarget;
  setStatus(status, '');
  try {
    const data = Object.fromEntries(new FormData(form));
    await api('/api/users', { method: 'POST', body: data });
    form.reset();
    await loadUsers();
    await loadStatus();
    renderDashboard();
    setStatus(status, 'User created and stored.');
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function saveUser(userId, card) {
  const status = $('#userStatus');
  setStatus(status, '');
  const body = {
    displayName: card.querySelector('[data-field="displayName"]').value,
    role: card.querySelector('[data-field="role"]').value,
    active: card.querySelector('[data-field="active"]').checked
  };
  const password = card.querySelector('[data-field="password"]').value;
  if (password) body.password = password;
  try {
    await api(`/api/users/${userId}`, { method: 'PATCH', body });
    await loadUsers();
    await loadStatus();
    renderDashboard();
    setStatus(status, 'User updated.');
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function loadAudit() {
  if (!can('audit:view')) return;
  const list = $('#auditList');
  if (list && state.activeTab === 'audit') list.innerHTML = '<p class="muted">Loading audit log...</p>';
  try {
    const data = await api('/api/audit');
    state.auditRecords = data.records || [];
    renderAuditList();
    renderDashboard();
  } catch (error) {
    if (list) list.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function renderAuditList() {
  const list = $('#auditList');
  if (!list) return;
  list.innerHTML = '';
  state.auditRecords.forEach(record => {
    const card = document.createElement('article');
    card.className = 'audit-card';
    card.innerHTML = `
      <strong>${escapeHtml(record.action)} by ${escapeHtml(record.username)}</strong>
      <span>${escapeHtml(formatDate(record.at))}</span>
      <code>${escapeHtml(JSON.stringify(record.details || {}, null, 2))}</code>
    `;
    list.appendChild(card);
  });
  if (!state.auditRecords.length) list.innerHTML = '<p class="muted">No audit activity yet.</p>';
}

async function changePassword(event) {
  event.preventDefault();
  const status = $('#passwordStatus');
  const form = event.currentTarget;
  setStatus(status, '');
  try {
    const data = Object.fromEntries(new FormData(form));
    await api('/api/me/password', { method: 'POST', body: data });
    form.reset();
    setStatus(status, 'Password updated.');
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

function exportBackup() {
  const a = document.createElement('a');
  a.href = '/api/export';
  a.download = `menu-real-estate-content-${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function currentService() {
  return state.content?.services?.[state.selectedServiceId];
}

function serviceArray() {
  return Object.values(state.content?.services || {});
}

function can(permission) {
  return state.user?.permissions?.includes(permission);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
}

function formatMetricDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDate(value) {
  if (!value) return 'Not published yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not published yet';
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
