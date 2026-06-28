const state = {
  user: null,
  roles: {},
  content: { services: {}, partners: [] },
  status: null,
  users: [],
  activity: [],
  page: 'dashboard',
  selectedServiceId: null,
  subpanel: 'details',
  dirty: false,
  confirmResolve: null,
  filters: {
    services: { query: '', status: 'all', sort: 'title' },
    users: { query: '', role: 'all', status: 'all', sort: 'name' },
    activity: { query: '', action: 'all', sort: 'newest' }
  }
};

const PAGES = {
  dashboard: ['Overview', 'Dashboard'],
  services: ['Content', 'Services'],
  partners: ['Content', 'Partners'],
  users: ['Administration', 'Users & Roles'],
  activity: ['Administration', 'Activity Log'],
  account: ['My account', 'Password & Security'],
  permission: ['Access', 'Permission Denied']
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  bindEvents();
  setLoginStatus('Checking session...');
  try {
    const session = await api('/api/session');
    state.user = session.user;
    state.roles = session.roles || {};
    await refreshData();
    showApp();
  } catch {
    showLogin();
  }
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', login);
  $('#showLoginPass').addEventListener('change', event => {
    $('#loginPass').type = event.target.checked ? 'text' : 'password';
  });
  $('#logoutBtn').addEventListener('click', logout);

  $$('.nav button[data-page]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });
  $$('[data-open]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.open));
  });
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#mobileOverlay').addEventListener('click', closeSidebar);
  $('#globalSearch').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    setPage('services');
    $('#serviceSearch').value = event.target.value;
    state.filters.services.query = event.target.value;
    renderServiceList();
  });

  $('#exportBtn').addEventListener('click', exportContent);

  $('#serviceSearch').addEventListener('input', event => {
    state.filters.services.query = event.target.value;
    renderServiceList();
  });
  $('#serviceFilter').addEventListener('change', event => {
    state.filters.services.status = event.target.value;
    renderServiceList();
  });
  $('#serviceSort').addEventListener('change', event => {
    state.filters.services.sort = event.target.value;
    renderServiceList();
  });

  $('#serviceForm').addEventListener('submit', saveService);
  $('#serviceForm').addEventListener('input', serviceFormChanged);
  $('#saveTopBtn').addEventListener('click', submitServiceForm);
  $('#saveStickyBtn').addEventListener('click', submitServiceForm);
  $('#discardBtn').addEventListener('click', discardServiceChanges);
  $$('.tab[data-sub]').forEach(button => {
    button.addEventListener('click', () => setSubpanel(button.dataset.sub));
  });
  $('#uploadForm').addEventListener('submit', uploadImage);
  $('#imageList').addEventListener('click', handleImageAction);

  $('#partnerForm').addEventListener('submit', addPartner);
  $('#partnerAdminList').addEventListener('click', handlePartnerAction);

  $('#userSearch').addEventListener('input', event => {
    state.filters.users.query = event.target.value;
    renderUsers();
  });
  $('#roleFilter').addEventListener('change', event => {
    state.filters.users.role = event.target.value;
    renderUsers();
  });
  $('#statusFilter').addEventListener('change', event => {
    state.filters.users.status = event.target.value;
    renderUsers();
  });
  $('#userSort').addEventListener('change', event => {
    state.filters.users.sort = event.target.value;
    renderUsers();
  });
  $('#createUserBtn').addEventListener('click', () => openUserDrawer());
  $('#userRows').addEventListener('click', handleUserAction);
  $('#userDrawerForm').addEventListener('submit', saveUser);
  $('#drawerOverlay').addEventListener('click', closeUserDrawer);
  $('#closeDrawerBtn').addEventListener('click', closeUserDrawer);
  $('#cancelDrawerBtn').addEventListener('click', closeUserDrawer);
  $('#showDrawerPass').addEventListener('change', event => togglePasswords('#userDrawerForm', event.target.checked));

  $('#activitySearch').addEventListener('input', event => {
    state.filters.activity.query = event.target.value;
    renderActivity();
  });
  $('#activityFilter').addEventListener('change', event => {
    state.filters.activity.action = event.target.value;
    renderActivity();
  });
  $('#activitySort').addEventListener('change', event => {
    state.filters.activity.sort = event.target.value;
    renderActivity();
  });
  $('#refreshBtn').addEventListener('click', loadActivity);
  $('#exportActivityBtn').addEventListener('click', exportActivity);

  $('#passwordForm').addEventListener('submit', changePassword);
  $('#showAccountPass').addEventListener('change', event => togglePasswords('#passwordForm', event.target.checked));

  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('#confirmBackdrop').addEventListener('click', () => closeConfirm(false));
  $('#confirmOk').addEventListener('click', () => closeConfirm(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSidebar();
      closeUserDrawer();
      closeConfirm(false);
    }
  });
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (!data.username || !data.password) {
    setLoginStatus('Enter username and password.', true);
    return;
  }
  try {
    setBusy($('#loginBtn'), true, 'Signing in...');
    const session = await api('/api/login', { method: 'POST', body: data });
    state.user = session.user;
    state.roles = session.roles || {};
    await refreshData();
    showApp();
    showToast('Signed in', 'Welcome back.', 'success');
  } catch (error) {
    setLoginStatus(error.message, true);
  } finally {
    setBusy($('#loginBtn'), false);
  }
}

async function logout() {
  if (state.dirty) {
    const ok = await confirmAction({
      title: 'Discard unsaved changes?',
      message: 'You have unsaved service edits.',
      details: 'Logging out will discard changes that were not saved.',
      confirmText: 'Log out'
    });
    if (!ok) return;
  }
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  state.dirty = false;
  showLogin();
}

function showLogin() {
  $('#loginView').hidden = false;
  $('#appView').hidden = true;
  setLoginStatus('');
}

function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  renderShell();
  renderAll();
  setPage(state.page || 'dashboard', { force: true });
}

function renderShell() {
  const name = state.user?.displayName || state.user?.username || 'Site Admin';
  const role = state.user?.roleLabel || 'Admin';
  $('#sessionName').textContent = name;
  $('#sessionRole').textContent = role;
  $('#sessionAvatar').textContent = initials(name);
  $('#welcomeTitle').textContent = `Good day, ${name}`;
  $('#accountRoleLabel').textContent = role;
  $('#accountRoleBadge').textContent = role;
  $('#accountPermissionText').textContent = `${state.user?.permissions?.length || 0} permissions enabled.`;
  $$('[data-page="partners"]').forEach(button => button.hidden = !can('partners:manage'));
  $$('[data-page="users"]').forEach(button => button.hidden = !can('users:manage'));
  $$('[data-page="activity"]').forEach(button => button.hidden = !can('audit:view'));
}

async function refreshData() {
  await loadContent();
  await loadStatus();
  if (can('users:manage')) await loadUsers(false);
  if (can('audit:view')) await loadActivity(false);
}

async function loadContent() {
  state.content = await api('/api/content');
  state.content.partners = Array.isArray(state.content.partners) ? state.content.partners : [];
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
  renderServices();
  renderPartners();
  if (can('users:manage')) renderUsers();
  if (can('audit:view')) renderActivity();
}

async function setPage(page, options = {}) {
  if (!options.force && state.page === 'services' && page !== 'services' && state.dirty) {
    const ok = await confirmAction({
      title: 'Discard unsaved changes?',
      message: 'The selected service has unsaved edits.',
      details: 'Save changes before leaving, or discard the edits.',
      confirmText: 'Discard'
    });
    if (!ok) return;
    state.dirty = false;
  }
  if (page === 'users' && !can('users:manage')) return showPermission('Users & Roles');
  if (page === 'activity' && !can('audit:view')) return showPermission('Activity Log');
  if (page === 'partners' && !can('partners:manage')) return showPermission('Partners');

  state.page = page;
  closeSidebar();
  $$('.page').forEach(panel => panel.hidden = panel.id !== `${page}Page`);
  $$('.nav button[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const meta = PAGES[page] || PAGES.dashboard;
  $('#crumb').textContent = meta[0];
  $('#title').textContent = meta[1];

  if (page === 'users') await loadUsers();
  if (page === 'activity') await loadActivity();
}

function showPermission(section) {
  $('#permissionMessage').textContent = `Your current role does not include access to ${section}.`;
  state.page = 'permission';
  $$('.page').forEach(panel => panel.hidden = panel.id !== 'permissionPage');
  $('#crumb').textContent = PAGES.permission[0];
  $('#title').textContent = PAGES.permission[1];
  showToast('Permission denied', `You cannot open ${section}.`, 'error');
}

function renderDashboard() {
  const services = serviceArray();
  const imageCount = countImages(services);
  const ready = services.filter(service => serviceScore(service) >= 80 && !missingServiceFields(service).length);
  const activeUsers = can('users:manage') ? state.users.filter(user => user.active).length : state.status?.users?.active || 0;

  $('#metricServices').textContent = services.length;
  $('#metricImages').textContent = imageCount;
  $('#metricReady').textContent = `${ready.length}/${services.length || 0}`;
  $('#metricUsers').textContent = activeUsers;

  const percent = services.length ? Math.round((ready.length / services.length) * 100) : 0;
  $('#readyRing').style.setProperty('--score', percent);
  $('#readyPercent').textContent = `${percent}%`;

  const bars = activityBars();
  $('#activityChart').innerHTML = bars.map(item => `<div class="bar" data-day="${item.day}" style="height:${item.height}%"></div>`).join('');

  $('#recentList').innerHTML = services
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 5)
    .map(service => `
      <a class="list-item" href="/${escapeAttr(service.page || '')}" target="_blank" rel="noopener">
        <div class="avatar">${escapeHtml(initials(service.title))}</div>
        <div class="list-copy"><strong>${escapeHtml(service.title || service.id)}</strong><span>${escapeHtml(service.category || 'Service')} - ${escapeHtml(formatDate(service.updatedAt))}</span></div>
        <span class="badge ${serviceScore(service) >= 80 ? 'green' : 'orange'}">${serviceScore(service) >= 80 ? 'Ready' : 'Review'}</span>
      </a>
    `).join('') || emptyHtml('No service updates yet.');

  const tasks = dashboardTasks(services);
  $('#taskCount').textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
  $('#taskList').innerHTML = tasks.map(task => `
    <button class="list-item list-button" type="button" data-task-service="${escapeAttr(task.id || '')}">
      <span class="metric-icon ${task.severity === 'high' ? 'red-icon' : ''}">${task.icon}</span>
      <span class="list-copy"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.detail)}</span></span>
      <span class="badge ${task.severity === 'high' ? 'red' : 'orange'}">${escapeHtml(task.label)}</span>
    </button>
  `).join('') || emptyHtml('No urgent content tasks.');
  $$('#taskList [data-task-service]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.taskService) state.selectedServiceId = button.dataset.taskService;
      setPage('services');
      renderServices();
    });
  });
}

function activityBars() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = new Array(7).fill(0);
  state.activity.forEach(record => {
    const date = new Date(record.at);
    if (!Number.isNaN(date.getTime())) {
      const index = (date.getDay() + 6) % 7;
      counts[index] += 1;
    }
  });
  const max = Math.max(1, ...counts);
  return days.map((day, index) => ({ day, height: Math.max(14, Math.round((counts[index] / max) * 92)) }));
}

function dashboardTasks(services) {
  const tasks = [];
  services.forEach(service => {
    const missing = missingServiceFields(service);
    if (missing.length) {
      tasks.push({ id: service.id, icon: '!', title: `${service.title || service.id} needs content`, detail: `Missing ${missing.join(', ')}.`, label: 'Review', severity: missing.length > 2 ? 'high' : 'medium' });
    } else if (serviceScore(service) < 80) {
      tasks.push({ id: service.id, icon: 'S', title: `${service.title || service.id} can be stronger`, detail: 'Improve headline, SEO summary, or image descriptions.', label: 'Improve', severity: 'medium' });
    }
  });
  return tasks.slice(0, 5);
}

function renderServices() {
  renderServiceList();
  renderServiceEditor();
}

function renderServiceStats() {
  const services = serviceArray();
  const ready = services.filter(service => serviceScore(service) >= 80 && !missingServiceFields(service).length).length;
  const attention = services.length - ready;
  $('#serviceOverview').innerHTML = `
    <article class="card service-stat"><span class="service-stat-icon">S</span><div class="service-stat-copy"><strong>${services.length}</strong><span>Total services</span></div></article>
    <article class="card service-stat"><span class="service-stat-icon" style="background:#eaf8f1;color:var(--green)">OK</span><div class="service-stat-copy"><strong>${ready}</strong><span>Ready pages</span></div></article>
    <article class="card service-stat"><span class="service-stat-icon" style="background:#fff7e4;color:#946112">!</span><div class="service-stat-copy"><strong>${attention}</strong><span>Need attention</span></div></article>
    <article class="card service-stat"><span class="service-stat-icon" style="background:#edf4ff;color:var(--blue)">IMG</span><div class="service-stat-copy"><strong>${countImages(services)}</strong><span>Images</span></div></article>
  `;
}

function renderServiceList() {
  const list = filteredServices();
  $('#serviceCount').textContent = `${list.length} ${list.length === 1 ? 'service' : 'services'}`;
  $('#serviceList').innerHTML = list.map(service => {
    const score = serviceScore(service);
    const missing = missingServiceFields(service);
    const needsReview = missing.length || score < 80;
    const imageCount = (service.images || []).length;
    return `
      <button class="service-item ${service.id === state.selectedServiceId ? 'active' : ''}" type="button" data-service-id="${escapeAttr(service.id)}">
        <div class="service-item-top"><strong>${escapeHtml(service.title || service.id)}</strong><span class="badge ${needsReview ? 'orange' : 'green'}">${needsReview ? 'Review' : 'Ready'}</span></div>
        <div class="service-item-meta"><span>${escapeHtml(service.category || 'Service')}</span><span>${imageCount} ${imageCount === 1 ? 'image' : 'images'}</span></div>
      </button>
    `;
  }).join('') || emptyHtml('No services match the current filters.');

  $$('#serviceList [data-service-id]').forEach(button => {
    button.addEventListener('click', async () => {
      if (state.selectedServiceId === button.dataset.serviceId) return;
      if (state.dirty) {
        const ok = await confirmAction({
          title: 'Discard unsaved changes?',
          message: 'The selected service has unsaved edits.',
          details: 'Save changes first, or discard the edits to open another service.',
          confirmText: 'Discard'
        });
        if (!ok) return;
      }
      state.selectedServiceId = button.dataset.serviceId;
      state.dirty = false;
      renderServices();
    });
  });
}

function filteredServices() {
  const { query, status, sort } = state.filters.services;
  const q = query.trim().toLowerCase();
  return serviceArray()
    .filter(service => {
      const text = `${service.title || ''} ${service.category || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      const missing = missingServiceFields(service);
      if (status === 'complete') return !missing.length && serviceScore(service) >= 80;
      if (status === 'missing') return missing.length || serviceScore(service) < 80;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'category') return String(a.category || '').localeCompare(String(b.category || '')) || String(a.title || '').localeCompare(String(b.title || ''));
      if (sort === 'score') return serviceScore(a) - serviceScore(b);
      if (sort === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function renderServiceEditor() {
  const service = currentService();
  $('#serviceEmpty').hidden = Boolean(service);
  $('#serviceEditor').hidden = !service;
  if (!service) return;

  const pageHref = `/${service.page || ''}`;
  const imageCount = (service.images || []).length;
  $('#selectedCategory').textContent = service.category || 'Service';
  $('#selectedTitle').textContent = service.title || 'Untitled service';
  $('#selectedMeta').textContent = `${imageCount} ${imageCount === 1 ? 'image' : 'images'} - Last edited ${formatDate(service.updatedAt)}`;
  $('#serviceAvatar').textContent = initials(service.title || service.id);
  $('#previewServiceBtn').href = pageHref;

  const form = $('#serviceForm');
  form.elements.title.value = service.title || '';
  form.elements.category.value = service.category || '';
  form.elements.heroTitle.value = service.heroTitle || '';
  form.elements.summary.value = service.summary || '';
  form.elements.sideSummary.value = service.sideSummary || '';
  form.elements.description.value = service.description || '';
  updateCounters();
  renderMedia(service);
  renderSeo(service);
  setSubpanel(state.subpanel || 'details');
  setDirty(false);

  const textAllowed = can('content:edit');
  $$('#serviceForm input, #serviceForm textarea, #saveTopBtn, #saveStickyBtn, #discardBtn').forEach(node => {
    node.disabled = !textAllowed;
  });
  const imageAllowed = can('images:manage');
  $$('#uploadForm input, #uploadForm button, #imageList button').forEach(node => {
    node.disabled = !imageAllowed;
  });
  $('#imagePermissionHint').textContent = imageAllowed ? 'Upload images, choose the hero image, and manage captions for this service page.' : 'Your role cannot upload or manage images.';
}

function renderMedia(service) {
  const images = service.images || [];
  const altReady = images.filter(image => image.alt).length;
  const captioned = images.filter(image => image.caption).length;
  $('#mediaSummary').innerHTML = `
    <div><strong>${images.length}</strong><span>Total assets</span></div>
    <div><strong>${service.heroImage ? 'Ready' : 'Missing'}</strong><span>Hero image</span></div>
    <div><strong>${altReady}/${images.length || 0}</strong><span>Alt text</span></div>
    <div><strong>${captioned}/${images.length || 0}</strong><span>Captions</span></div>
  `;

  $('#imageList').innerHTML = images.map((image, index) => {
    const isHero = service.heroImage === image.src;
    return `
      <article class="media-card" data-image-id="${escapeAttr(image.id)}">
        <div class="media-thumb"><img src="${escapeAttr(image.src)}" alt="${escapeAttr(image.alt || service.title || 'Service image')}"></div>
        <div class="media-card-body">
          <div class="media-card-title"><strong>${isHero ? 'Hero image' : `Gallery image ${index + 1}`}</strong><span class="badge ${isHero ? 'green' : 'gray'}">${isHero ? 'Hero' : 'Gallery'}</span></div>
          <label class="field"><span>Alt text</span><input data-field="alt" value="${escapeAttr(image.alt || '')}" maxlength="180"></label>
          <label class="field"><span>Caption</span><input data-field="caption" value="${escapeAttr(image.caption || '')}" maxlength="240"></label>
          <small>${escapeHtml(image.src)}</small>
          <div class="media-actions">
            <button class="btn btn-secondary" data-image-action="save" type="button">Save</button>
            <button class="btn btn-secondary" data-image-action="hero" type="button" ${isHero ? 'disabled' : ''}>Hero</button>
            <button class="btn btn-danger" data-image-action="delete" type="button">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join('') || emptyHtml('No images yet. Upload the first service image.');
}

function renderSeo(service) {
  const title = service.heroTitle || service.title || 'Service page title';
  const description = service.summary || service.description || 'The search description will appear here.';
  const url = service.page ? `menu.rw/${service.page.replace(/^\/+/, '')}` : 'menu.rw/services/service-page';
  const image = service.heroImage || firstImage(service);

  $('#googleUrl').textContent = url;
  $('#googleTitle').textContent = title;
  $('#googleDescription').textContent = trimText(description, 160);
  $('#socialTitle').textContent = title;
  $('#socialDescription').textContent = trimText(service.sideSummary || service.summary || description, 120);
  const social = $('#socialArt');
  if (image) {
    social.style.backgroundImage = `linear-gradient(rgba(21,36,59,.18),rgba(21,36,59,.45)),url("${cssUrl(image)}")`;
    social.textContent = '';
  } else {
    social.style.backgroundImage = '';
    social.textContent = 'MENU';
  }

  const suggestions = seoSuggestions(service);
  $('#seoSuggestions').innerHTML = suggestions.map(item => `
    <div class="list-item"><span class="metric-icon ${item.good ? 'green-icon' : ''}">${item.good ? 'OK' : '!'}</span><span class="list-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span></div>
  `).join('');
}

function setSubpanel(panel) {
  state.subpanel = ['details', 'images', 'seo'].includes(panel) ? panel : 'details';
  $$('.tab[data-sub]').forEach(tab => tab.classList.toggle('active', tab.dataset.sub === state.subpanel));
  $$('.subpanel').forEach(section => section.hidden = section.id !== `${state.subpanel}Panel`);
}

function serviceFormChanged() {
  setDirty(true);
  updateCounters();
  const service = { ...currentService(), ...Object.fromEntries(new FormData($('#serviceForm'))) };
  renderSeo(service);
}

function updateCounters() {
  const form = $('#serviceForm');
  $$('[data-counter-for]').forEach(node => {
    const field = node.dataset.counterFor;
    const input = form.elements[field];
    const max = input?.getAttribute('maxlength') || '';
    node.textContent = `${String(input?.value || '').length}${max ? `/${max}` : ''}`;
  });
}

function setDirty(value) {
  state.dirty = Boolean(value);
  $('#saveState').textContent = state.dirty ? 'Unsaved' : 'Saved';
  $('#saveState').className = `badge ${state.dirty ? 'orange' : 'green'}`;
  $('#stickyText').textContent = state.dirty ? 'Unsaved changes' : 'No unsaved changes';
}

function submitServiceForm() {
  $('#serviceForm').requestSubmit();
}

async function saveService(event) {
  event.preventDefault();
  const service = currentService();
  if (!service) return;
  const data = Object.fromEntries(new FormData($('#serviceForm')));
  const error = validateService(data);
  if (error) {
    setServiceStatus(error, true);
    return;
  }
  try {
    setBusy($('#saveTopBtn'), true, 'Saving...');
    const response = await api(`/api/services/${service.id}`, { method: 'PUT', body: data });
    state.content.services[service.id] = response.service;
    state.content.updatedAt = response.service.updatedAt;
    setDirty(false);
    await loadStatus();
    renderAll();
    setServiceStatus('Service changes saved.');
    showToast('Service saved', 'Public content was updated.', 'success');
  } catch (error) {
    setServiceStatus(error.message, true);
  } finally {
    setBusy($('#saveTopBtn'), false);
  }
}

async function discardServiceChanges() {
  if (state.dirty) {
    const ok = await confirmAction({
      title: 'Discard edits?',
      message: 'This will reset the form to the last saved service content.',
      confirmText: 'Discard'
    });
    if (!ok) return;
  }
  setDirty(false);
  renderServiceEditor();
}

function validateService(data) {
  if (!data.title?.trim()) return 'Navigation title is required.';
  if (!data.category?.trim()) return 'Category is required.';
  if (!data.summary?.trim()) return 'Short summary is required.';
  if (!data.description?.trim()) return 'Full page description is required.';
  if (data.title.length > 140) return 'Navigation title is too long.';
  if ((data.heroTitle || '').length > 160) return 'Page headline is too long.';
  if (data.summary.length > 500) return 'Short summary is too long.';
  if ((data.sideSummary || '').length > 320) return 'Booking card summary is too long.';
  if (data.description.length > 8000) return 'Full page description is too long.';
  return '';
}

function validateImageFile(file) {
  if (!file || !file.size) return 'Choose an image to upload.';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return 'Use PNG, JPG, WEBP, or GIF.';
  if (file.size > 8 * 1024 * 1024) return 'Image must be smaller than 8 MB.';
  return '';
}

async function uploadImage(event) {
  event.preventDefault();
  const service = currentService();
  if (!service) return;
  const form = $('#uploadForm');
  const data = new FormData(form);
  const file = data.get('image');
  const imageError = validateImageFile(file);
  if (imageError) return setServiceStatus(imageError, true);
  try {
    setBusy($('#uploadBtn'), true, 'Uploading...');
    const dataUrl = await fileToDataUrl(file);
    const response = await api(`/api/services/${service.id}/upload`, {
      method: 'POST',
      body: {
        fileName: file.name,
        dataUrl,
        alt: data.get('alt'),
        caption: data.get('caption'),
        setAsHero: Boolean(data.get('setAsHero'))
      }
    });
    state.content.services[service.id] = response.service;
    form.reset();
    await loadStatus();
    renderAll();
    setSubpanel('images');
    setServiceStatus('Image uploaded.');
    showToast('Image uploaded', 'The service gallery was updated.', 'success');
  } catch (error) {
    setServiceStatus(error.message, true);
  } finally {
    setBusy($('#uploadBtn'), false);
  }
}

async function handleImageAction(event) {
  const button = event.target.closest('[data-image-action]');
  if (!button) return;
  const card = button.closest('[data-image-id]');
  const imageId = card?.dataset.imageId;
  const service = currentService();
  if (!imageId || !service) return;
  const action = button.dataset.imageAction;

  try {
    if (action === 'save') {
      const response = await api(`/api/services/${service.id}/images/${imageId}`, {
        method: 'PATCH',
        body: {
          alt: card.querySelector('[data-field="alt"]').value,
          caption: card.querySelector('[data-field="caption"]').value
        }
      });
      state.content.services[service.id] = response.service;
      renderServices();
      setSubpanel('images');
      showToast('Image saved', 'Image details were updated.', 'success');
    }
    if (action === 'hero') {
      const response = await api(`/api/services/${service.id}/images/${imageId}`, { method: 'PATCH', body: { setAsHero: true } });
      state.content.services[service.id] = response.service;
      renderServices();
      setSubpanel('images');
      showToast('Hero updated', 'Public hero image was changed.', 'success');
    }
    if (action === 'delete') {
      const ok = await confirmAction({
        title: 'Delete image?',
        message: 'This image will be removed from the service gallery.',
        confirmText: 'Delete',
        danger: true
      });
      if (!ok) return;
      const response = await api(`/api/services/${service.id}/images/${imageId}`, { method: 'DELETE' });
      state.content.services[service.id] = response.service;
      renderServices();
      setSubpanel('images');
      showToast('Image deleted', 'The image was removed.', 'success');
    }
  } catch (error) {
    setServiceStatus(error.message, true);
  }
}

async function loadUsers(render = true) {
  if (!can('users:manage')) return;
  try {
    const data = await api('/api/users');
    state.users = data.users || [];
    populateRoleFilters();
    if (render) renderUsers();
  } catch (error) {
    showToast('Users unavailable', error.message, 'error');
  }
}

function populateRoleFilters() {
  const roleOptions = Object.entries(state.roles).map(([key, role]) => `<option value="${escapeAttr(key)}">${escapeHtml(role.label || key)}</option>`).join('');
  $('#roleFilter').innerHTML = `<option value="all">All roles</option>${roleOptions}`;
  $('#userDrawerForm select[name="role"]').innerHTML = roleOptions;
}

function renderUsers() {
  if (!can('users:manage')) return;
  const rows = filteredUsers();
  $('#userRows').innerHTML = rows.map(user => `
    <tr>
      <td><div class="user-cell"><div class="avatar">${escapeHtml(initials(user.displayName || user.username))}</div><div class="list-copy"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>@${escapeHtml(user.username)}</span></div></div></td>
      <td><span class="badge blue">${escapeHtml(user.roleLabel || roleLabel(user.role))}</span></td>
      <td><span class="badge ${user.active ? 'green' : 'gray'}">${user.active ? 'Active' : 'Paused'}</span></td>
      <td>${escapeHtml(formatDate(user.updatedAt || user.createdAt))}</td>
      <td><div class="row-actions"><button class="btn btn-secondary" data-user-action="edit" data-user-id="${escapeAttr(user.id)}" type="button">Edit</button><button class="btn ${user.active ? 'btn-secondary' : 'btn-primary'}" data-user-action="toggle" data-user-id="${escapeAttr(user.id)}" type="button">${user.active ? 'Pause' : 'Activate'}</button></div></td>
    </tr>
  `).join('') || `<tr><td colspan="5">${emptyHtml('No users match the current filters.')}</td></tr>`;
}

function filteredUsers() {
  const { query, role, status, sort } = state.filters.users;
  const q = query.trim().toLowerCase();
  return state.users
    .filter(user => {
      const text = `${user.username || ''} ${user.displayName || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (status === 'active' && !user.active) return false;
      if (status === 'paused' && user.active) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'role') return String(a.roleLabel || a.role).localeCompare(String(b.roleLabel || b.role));
      if (sort === 'updated') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return String(a.displayName || a.username).localeCompare(String(b.displayName || b.username));
    });
}

async function handleUserAction(event) {
  const button = event.target.closest('[data-user-action]');
  if (!button) return;
  const user = state.users.find(item => item.id === button.dataset.userId);
  if (!user) return;
  if (button.dataset.userAction === 'edit') openUserDrawer(user);
  if (button.dataset.userAction === 'toggle') {
    const active = !user.active;
    const ok = await confirmAction({
      title: active ? 'Activate user?' : 'Pause user?',
      message: active ? `${user.displayName || user.username} will be able to sign in.` : `${user.displayName || user.username} will not be able to sign in.`,
      confirmText: active ? 'Activate' : 'Pause',
      danger: !active
    });
    if (!ok) return;
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: { active } });
      await loadUsers();
      renderDashboard();
      showToast(active ? 'User activated' : 'User paused', `${user.displayName || user.username} was updated.`, 'success');
    } catch (error) {
      showToast('User update failed', error.message, 'error');
    }
  }
}

function openUserDrawer(user = null) {
  populateRoleFilters();
  const form = $('#userDrawerForm');
  form.reset();
  form.elements.id.value = user?.id || '';
  form.elements.username.value = user?.username || '';
  form.elements.username.disabled = Boolean(user);
  form.elements.displayName.value = user?.displayName || '';
  form.elements.role.value = user?.role || Object.keys(state.roles)[0] || 'image_editor';
  form.elements.active.checked = user ? Boolean(user.active) : true;
  $('#drawerTitle').textContent = user ? 'Edit user' : 'Create user';
  $('#saveUserBtn').textContent = user ? 'Save user' : 'Create user';
  $('#drawerStatus').textContent = '';
  $('#drawerOverlay').hidden = false;
  $('#userDrawer').hidden = false;
  form.elements.displayName.focus();
}

function closeUserDrawer() {
  $('#drawerOverlay').hidden = true;
  $('#userDrawer').hidden = true;
}

async function saveUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.active = form.elements.active.checked;
  const isEdit = Boolean(data.id);
  const error = validateUser(data, isEdit);
  if (error) {
    setDrawerStatus(error, true);
    return;
  }
  try {
    setBusy($('#saveUserBtn'), true, 'Saving...');
    if (isEdit) {
      const body = { displayName: data.displayName, role: data.role, active: data.active };
      if (data.password) body.password = data.password;
      await api(`/api/users/${data.id}`, { method: 'PATCH', body });
    } else {
      await api('/api/users', { method: 'POST', body: data });
    }
    await loadUsers();
    renderDashboard();
    closeUserDrawer();
    showToast(isEdit ? 'User saved' : 'User created', `${data.displayName || data.username} was updated.`, 'success');
  } catch (error) {
    setDrawerStatus(error.message, true);
  } finally {
    setBusy($('#saveUserBtn'), false);
  }
}

function validateUser(data, isEdit) {
  if (!isEdit && !/^[a-z0-9_.-]{3,32}$/i.test(data.username || '')) return 'Username must be 3-32 characters and use letters, numbers, dots, dashes, or underscores.';
  if (!data.displayName?.trim()) return 'Display name is required.';
  if (!state.roles[data.role]) return 'Choose a valid role.';
  if (!isEdit && String(data.password || '').length < 8) return 'Password must be at least 8 characters.';
  if (data.password && String(data.password).length < 8) return 'Password must be at least 8 characters.';
  if (data.password !== data.confirmPassword) return 'Passwords do not match.';
  return '';
}

async function loadActivity(render = true) {
  if (!can('audit:view')) return;
  try {
    const data = await api('/api/audit');
    state.activity = data.records || [];
    populateActivityFilters();
    if (render) {
      renderActivity();
      renderDashboard();
    }
  } catch (error) {
    showToast('Activity unavailable', error.message, 'error');
  }
}

function populateActivityFilters() {
  const actions = Array.from(new Set(state.activity.map(record => record.action).filter(Boolean))).sort();
  $('#activityFilter').innerHTML = '<option value="all">All actions</option>' + actions.map(action => `<option value="${escapeAttr(action)}">${escapeHtml(actionLabel(action))}</option>`).join('');
}

function renderActivity() {
  if (!can('audit:view')) return;
  const records = filteredActivity();
  $('#activityList').innerHTML = records.map(record => `
    <article class="audit-item">
      <div class="audit-head">
        <div class="audit-main"><span class="audit-icon"><svg class="icon"><use href="#activityIcon"/></svg></span><div class="audit-copy"><strong>${escapeHtml(activitySummary(record))}</strong><span>${escapeHtml(record.username || 'System')} - ${escapeHtml(formatDate(record.at))}</span></div></div>
        <span class="badge blue">${escapeHtml(actionLabel(record.action))}</span>
      </div>
      <details><summary>View technical details</summary><pre>${escapeHtml(JSON.stringify(record.details || {}, null, 2))}</pre></details>
    </article>
  `).join('') || emptyHtml('No activity matches the current filters.');
}

function filteredActivity() {
  const { query, action, sort } = state.filters.activity;
  const q = query.trim().toLowerCase();
  const records = state.activity.filter(record => {
    const text = `${record.action || ''} ${record.username || ''} ${JSON.stringify(record.details || {})}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (action !== 'all' && record.action !== action) return false;
    return true;
  });
  if (sort === 'oldest') return records.slice().reverse();
  return records;
}

function activitySummary(record) {
  const actor = record.username || 'System';
  const details = record.details || {};
  const service = details.serviceId ? state.content.services?.[details.serviceId] : null;
  const map = {
    login: `${actor} signed in`,
    logout: `${actor} signed out`,
    'service:update': `${actor} updated ${service?.title || 'a service page'}`,
    'image:upload': `${actor} uploaded an image`,
    'image:update': `${actor} updated image details`,
    'image:delete': `${actor} deleted an image`,
    'partner:create': `${actor} added ${details.name || 'a partner'}`,
    'partner:delete': `${actor} removed ${details.name || 'a partner'}`,
    'user:create': `${actor} created ${details.username || 'a user'}`,
    'user:update': `${actor} updated ${details.username || 'a user'}`
  };
  return map[record.action] || `${actor} performed ${actionLabel(record.action)}`;
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (String(data.newPassword || '').length < 8) return setPasswordStatus('New password must be at least 8 characters.', true);
  if (data.newPassword !== data.confirmPassword) return setPasswordStatus('Passwords do not match.', true);
  try {
    setBusy($('#passwordBtn'), true, 'Updating...');
    await api('/api/me/password', { method: 'POST', body: { oldPassword: data.oldPassword, newPassword: data.newPassword } });
    form.reset();
    setPasswordStatus('Password updated.');
    showToast('Password updated', 'Your account password was changed.', 'success');
  } catch (error) {
    setPasswordStatus(error.message, true);
  } finally {
    setBusy($('#passwordBtn'), false);
  }
}

function exportContent() {
  window.location.href = '/api/export';
}

function exportActivity() {
  downloadJson(`menu-activity-${new Date().toISOString().slice(0, 10)}.json`, filteredActivity());
}

function renderPartners() {
  const partners = partnerArray();
  const phone = companyPhone();
  $('#partnerPhoneNote').textContent = `${phone} will be shown on every partner card.`;
  $('#partnerCount').textContent = `${partners.length} ${partners.length === 1 ? 'partner' : 'partners'}`;
  $('#partnerAdminList').innerHTML = partners.map(partner => `
    <article class="partner-admin-card" data-partner-id="${escapeAttr(partner.id)}">
      <img src="${escapeAttr(partner.image)}" alt="${escapeAttr(partner.name || 'Partner profile')}" loading="lazy">
      <div class="partner-admin-copy">
        <strong>${escapeHtml(partner.name || 'Unnamed partner')}</strong>
        <span>${escapeHtml(partner.role || 'Partner')}</span>
        <a href="tel:${escapeAttr(phoneDigits(phone))}">${escapeHtml(phone)}</a>
      </div>
      <button class="btn btn-danger" data-partner-action="delete" type="button">Remove</button>
    </article>
  `).join('') || emptyHtml('No partners yet. Add the first partner profile.');

  const allowed = can('partners:manage');
  $$('#partnerForm input, #partnerForm button, #partnerAdminList button').forEach(node => {
    node.disabled = !allowed;
  });
}

async function addPartner(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const role = String(data.get('role') || '').trim();
  const file = data.get('image');
  if (!name) return setPartnerStatus('Partner name is required.', true);
  if (!role) return setPartnerStatus('Partner role is required.', true);
  if (name.length > 100) return setPartnerStatus('Partner name is too long.', true);
  if (role.length > 100) return setPartnerStatus('Partner role is too long.', true);
  const imageError = validateImageFile(file);
  if (imageError) return setPartnerStatus(imageError, true);

  try {
    setBusy($('#addPartnerBtn'), true, 'Adding...');
    const dataUrl = await fileToDataUrl(file);
    const response = await api('/api/partners', {
      method: 'POST',
      body: { name, role, fileName: file.name, dataUrl }
    });
    state.content.partners = response.partners || [];
    state.content.updatedAt = response.updatedAt || state.content.updatedAt;
    form.reset();
    renderPartners();
    setPartnerStatus('Partner added.');
    showToast('Partner added', `${name} now appears on the home page.`, 'success');
  } catch (error) {
    setPartnerStatus(error.message, true);
  } finally {
    setBusy($('#addPartnerBtn'), false);
  }
}

async function handlePartnerAction(event) {
  const button = event.target.closest('[data-partner-action]');
  if (!button) return;
  const card = button.closest('[data-partner-id]');
  const partner = partnerArray().find(item => item.id === card?.dataset.partnerId);
  if (!partner) return;
  const ok = await confirmAction({
    title: 'Remove partner?',
    message: `${partner.name || 'This partner'} will be removed from the home page.`,
    confirmText: 'Remove',
    danger: true
  });
  if (!ok) return;

  try {
    setBusy(button, true, 'Removing...');
    const response = await api(`/api/partners/${partner.id}`, { method: 'DELETE' });
    state.content.partners = response.partners || [];
    state.content.updatedAt = response.updatedAt || state.content.updatedAt;
    renderPartners();
    showToast('Partner removed', 'The home page partner list was updated.', 'success');
  } catch (error) {
    setPartnerStatus(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

function currentService() {
  return state.content?.services?.[state.selectedServiceId] || null;
}

function serviceArray() {
  return Object.values(state.content?.services || {});
}

function partnerArray() {
  return Array.isArray(state.content?.partners) ? state.content.partners : [];
}

function companyPhone() {
  return state.content?.companyPhone || '+250 782 616 150';
}

function serviceChecks(service) {
  const images = Array.isArray(service.images) ? service.images : [];
  return [
    { label: 'Clear title', done: Boolean(service.title) },
    { label: 'Benefit headline', done: Boolean(service.heroTitle || service.title) },
    { label: 'Useful summary', done: String(service.summary || '').trim().length >= 70 },
    { label: 'Detailed copy', done: String(service.description || '').trim().length >= 180 },
    { label: 'Hero image', done: Boolean(service.heroImage) },
    { label: '2+ images', done: images.length >= 2 },
    { label: 'Alt text ready', done: Boolean(images.length) && images.every(image => String(image.alt || '').trim()) },
    { label: 'Booking copy', done: Boolean(service.sideSummary || service.summary) }
  ];
}

function serviceScore(service) {
  const checks = serviceChecks(service);
  return Math.round((checks.filter(check => check.done).length / checks.length) * 100);
}

function missingServiceFields(service) {
  return [
    !service.summary ? 'summary' : '',
    !service.description ? 'description' : '',
    !service.heroImage ? 'hero image' : '',
    !Array.isArray(service.images) || !service.images.length ? 'gallery images' : ''
  ].filter(Boolean);
}

function seoSuggestions(service) {
  const text = `${service.heroTitle || ''} ${service.title || ''} ${service.summary || ''} ${service.description || ''}`;
  return [
    { good: String(service.heroTitle || service.title || '').length >= 35, title: 'Benefit-focused headline', detail: 'Use a headline that explains the client value.' },
    { good: String(service.summary || '').length >= 120, title: 'Strong search summary', detail: 'Include who the service helps, where, and why it matters.' },
    { good: /rwanda|kigali/i.test(text), title: 'Rwanda search relevance', detail: 'Mention Rwanda or Kigali naturally where relevant.' },
    { good: Boolean(service.heroImage), title: 'Share image ready', detail: 'A hero image improves public page and social sharing trust.' }
  ];
}

function countImages(services) {
  return services.reduce((sum, service) => sum + (Array.isArray(service.images) ? service.images.length : 0), 0);
}

function firstImage(service) {
  const image = (service.images || []).find(item => item && item.src);
  return image ? image.src : '';
}

function can(permission) {
  return Boolean(state.user?.permissions?.includes(permission));
}

function roleLabel(role) {
  return state.roles?.[role]?.label || role || 'Role';
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#mobileOverlay').hidden = false;
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#mobileOverlay').hidden = true;
}

function setLoginStatus(message, error = false) {
  const node = $('#loginStatus');
  node.textContent = message || '';
  node.className = `form-status ${error ? 'error' : ''}`;
}

function setServiceStatus(message, error = false) {
  const node = $('#serviceStatus');
  node.textContent = message || '';
  node.className = `form-status ${error ? 'error' : 'success'}`;
}

function setPartnerStatus(message, error = false) {
  const node = $('#partnerStatus');
  node.textContent = message || '';
  node.className = `form-status ${error ? 'error' : 'success'}`;
}

function setDrawerStatus(message, error = false) {
  const node = $('#drawerStatus');
  node.textContent = message || '';
  node.className = `form-status ${error ? 'error' : 'success'}`;
}

function setPasswordStatus(message, error = false) {
  const node = $('#passwordStatus');
  node.textContent = message || '';
  node.className = `form-status ${error ? 'error' : 'success'}`;
}

function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text || 'Working...';
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = Boolean(busy);
}

function showToast(title, message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message || '')}</span>`;
  $('#toastWrap').appendChild(toast);
  setTimeout(() => toast.remove(), 4600);
}

function confirmAction({ title, message, details = '', confirmText = 'Confirm', danger = false }) {
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmDetails').textContent = details;
  $('#confirmOk').textContent = confirmText;
  $('#confirmOk').className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  $('#confirmDialog').hidden = false;
  $('#confirmCancel').focus();
  return new Promise(resolve => {
    state.confirmResolve = resolve;
  });
}

function closeConfirm(result) {
  if ($('#confirmDialog').hidden || !state.confirmResolve) return;
  $('#confirmDialog').hidden = true;
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  resolve(Boolean(result));
}

function togglePasswords(formSelector, visible) {
  const form = $(formSelector);
  if (!form) return;
  form.querySelectorAll('input[type="password"], input[name="password"], input[name="confirmPassword"], input[name="oldPassword"], input[name="newPassword"]').forEach(input => {
    if (input.name === 'username' || input.name === 'displayName') return;
    input.type = visible ? 'text' : 'password';
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function api(path, options = {}) {
  const init = {
    method: options.method || 'GET',
    headers: {},
    credentials: 'same-origin'
  };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function emptyHtml(message) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function initials(value) {
  return String(value || 'ME')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'ME';
}

function actionLabel(action) {
  return String(action || 'activity')
    .replace(/:/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatShortDate(value) {
  if (!value) return 'Not saved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDate(value) {
  if (!value) return 'Not saved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function trimText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '%22').replace(/\n/g, '');
}

function phoneDigits(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits || '+250782616150';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
