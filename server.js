const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, '.env'));
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json');
const SECRET_FILE = path.join(DATA_DIR, 'server-secret.txt');
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'menu_admin_session';
const SESSION_AGE_SECONDS = 60 * 60 * 8;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const IMGBB_EXPIRATION_SECONDS = Number(process.env.IMGBB_EXPIRATION_SECONDS || 0);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_CONTENT_TABLE = process.env.SUPABASE_CONTENT_TABLE || 'site_content';
const SUPABASE_AUDIT_TABLE = process.env.SUPABASE_AUDIT_TABLE || 'audit_log';
const SUPABASE_CONTENT_KEY = process.env.SUPABASE_CONTENT_KEY || 'menu-real-estate-content';
const SUPABASE_USERS_KEY = process.env.SUPABASE_USERS_KEY || 'menu-real-estate-users';
const SUPABASE_AUDIT_KEY = process.env.SUPABASE_AUDIT_KEY || 'menu-real-estate-audit';
let supabaseHydrationPromise = null;
let supabaseHydrated = false;
let supabaseUsersHydrationPromise = null;
let supabaseUsersHydrated = false;
let supabaseAuditHydrationPromise = null;
let supabaseAuditHydrated = false;
let supabaseAuditUsesTable = true;
const supabaseState = {
  contentReady: false,
  usersReady: false,
  auditReady: false,
  contentError: '',
  usersError: '',
  auditError: ''
};

const ROLE_DEFS = {
  admin: {
    label: 'Admin',
    permissions: ['content:edit', 'images:manage', 'users:manage', 'audit:view']
  },
  editor: {
    label: 'Content Editor',
    permissions: ['content:edit', 'images:manage']
  },
  image_editor: {
    label: 'Image Only Partner',
    permissions: ['images:manage']
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

ensureSetup();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/healthz' || pathname === '/health') {
      await sendHealth(res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    if (pathname === '/favicon.ico') {
      res.writeHead(302, { Location: '/assets/favicon.png', 'Cache-Control': 'public, max-age=86400' });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (pathname === '/data/content.json') {
      await hydrateContentFromSupabaseOnce();
    }

    serveStatic(res, pathname, req.method === 'HEAD');
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  const users = readJson(USERS_FILE, []);
  const defaultNote = path.join(DATA_DIR, 'initial-admin.txt');
  console.log(`MENU Real Estate admin server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  if (fs.existsSync(defaultNote) && users.length === 1 && users[0].username === 'admin') {
    console.log(`Initial admin credentials are saved in: ${defaultNote}`);
  }
});

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    await sendHealth(res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req);
    await hydrateUsersFromSupabaseOnce();
    const users = readUsers();
    const user = users.find(item => item.username.toLowerCase() === String(body.username || '').toLowerCase());
    if (!user || !user.active || !verifyPassword(String(body.password || ''), user.password)) {
      sendJson(res, 401, { error: 'Invalid username or password' });
      return;
    }

    const session = createSession(user);
    audit(user, 'login', { username: user.username });
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${session}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}`);
    sendJson(res, 200, { user: publicUser(user), roles: publicRoles() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const user = getUserFromRequest(req);
    if (user) audit(user, 'logout', {});
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    sendJson(res, 200, { ok: true });
    return;
  }

  await hydrateUsersFromSupabaseOnce();
  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET' && pathname === '/api/session') {
    sendJson(res, 200, { user: publicUser(user), roles: publicRoles() });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/content') {
    sendJson(res, 200, await getManagedContent());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/status') {
    sendJson(res, 200, await getAdminStatus());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/export') {
    if (!requirePermission(user, res, 'content:edit')) return;
    await exportContent(res, user);
    return;
  }

  const serviceMatch = pathname.match(/^\/api\/services\/([^/]+)$/);
  if (serviceMatch && req.method === 'PUT') {
    const serviceId = serviceMatch[1];
    const body = await readBody(req);
    await updateService(res, user, serviceId, body);
    return;
  }

  const uploadMatch = pathname.match(/^\/api\/services\/([^/]+)\/upload$/);
  if (uploadMatch && req.method === 'POST') {
    requirePermission(user, res, 'images:manage') && await uploadImage(res, user, uploadMatch[1], await readBody(req, 18 * 1024 * 1024));
    return;
  }

  const imageMatch = pathname.match(/^\/api\/services\/([^/]+)\/images\/([^/]+)$/);
  if (imageMatch && req.method === 'PATCH') {
    if (requirePermission(user, res, 'images:manage')) await updateImage(res, user, imageMatch[1], imageMatch[2], await readBody(req));
    return;
  }

  if (imageMatch && req.method === 'DELETE') {
    if (requirePermission(user, res, 'images:manage')) await deleteImage(res, user, imageMatch[1], imageMatch[2]);
    return;
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    if (!requirePermission(user, res, 'users:manage')) return;
    sendJson(res, 200, { users: readUsers().map(publicUser) });
    return;
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    if (!requirePermission(user, res, 'users:manage')) return;
    await createUser(res, user, await readBody(req));
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === 'PATCH') {
    if (!requirePermission(user, res, 'users:manage')) return;
    await updateUser(res, user, userMatch[1], await readBody(req));
    return;
  }

  if (pathname === '/api/me/password' && req.method === 'POST') {
    await updateOwnPassword(res, user, await readBody(req));
    return;
  }

  if (pathname === '/api/audit' && req.method === 'GET') {
    if (!requirePermission(user, res, 'audit:view')) return;
    await hydrateAuditFromSupabaseOnce();
    const records = readJson(AUDIT_FILE, []).slice(-300).reverse();
    sendJson(res, 200, { records });
    return;
  }

  sendJson(res, 404, { error: 'API route not found' });
}

async function updateService(res, user, serviceId, body) {
  const content = await getManagedContent();
  const service = content.services[serviceId];
  if (!service) {
    sendJson(res, 404, { error: 'Service not found' });
    return;
  }

  const textFields = ['title', 'category', 'summary', 'description'];
  const imageFields = ['heroImage', 'images'];
  const wantsTextEdit = textFields.some(field => Object.prototype.hasOwnProperty.call(body, field));
  const wantsImageEdit = imageFields.some(field => Object.prototype.hasOwnProperty.call(body, field));

  if (wantsTextEdit && !hasPermission(user, 'content:edit')) {
    sendJson(res, 403, { error: 'You do not have permission to edit text content.' });
    return;
  }

  if (wantsImageEdit && !hasPermission(user, 'images:manage')) {
    sendJson(res, 403, { error: 'You do not have permission to manage images.' });
    return;
  }

  for (const field of textFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) service[field] = String(body[field] || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'heroImage')) service.heroImage = String(body.heroImage || '').trim();
  if (Array.isArray(body.images)) service.images = normalizeImages(body.images);

  service.updatedAt = new Date().toISOString();
  service.updatedBy = user.username;
  content.updatedAt = service.updatedAt;
  await saveContent(content);
  audit(user, 'service:update', { serviceId, fields: Object.keys(body).filter(field => field !== 'images') });
  sendJson(res, 200, { service });
}

async function uploadImage(res, user, serviceId, body) {
  const content = await getManagedContent();
  const service = content.services[serviceId];
  if (!service) {
    sendJson(res, 404, { error: 'Service not found' });
    return;
  }

  const storedImage = await storeUploadedImage(res, serviceId, body);
  if (!storedImage) return;

  const image = {
    id: crypto.randomUUID(),
    src: storedImage.src,
    provider: storedImage.provider,
    hostedId: storedImage.hostedId || '',
    alt: String(body.alt || service.title || 'Service image').trim(),
    caption: String(body.caption || '').trim(),
    uploadedBy: user.username,
    uploadedAt: new Date().toISOString()
  };

  service.images = Array.isArray(service.images) ? service.images : [];
  service.images.unshift(image);
  if (body.setAsHero || !service.heroImage) service.heroImage = image.src;
  service.updatedAt = new Date().toISOString();
  service.updatedBy = user.username;
  content.updatedAt = service.updatedAt;
  await saveContent(content);
  audit(user, 'image:upload', { serviceId, imageId: image.id, src: image.src });
  sendJson(res, 201, { image, service });
}

async function updateImage(res, user, serviceId, imageId, body) {
  const content = await getManagedContent();
  const service = content.services[serviceId];
  if (!service || !Array.isArray(service.images)) {
    sendJson(res, 404, { error: 'Image not found' });
    return;
  }
  const image = service.images.find(item => item.id === imageId);
  if (!image) {
    sendJson(res, 404, { error: 'Image not found' });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'alt')) image.alt = String(body.alt || '').trim();
  if (Object.prototype.hasOwnProperty.call(body, 'caption')) image.caption = String(body.caption || '').trim();
  if (body.setAsHero) service.heroImage = image.src;
  service.updatedAt = new Date().toISOString();
  service.updatedBy = user.username;
  content.updatedAt = service.updatedAt;
  await saveContent(content);
  audit(user, 'image:update', { serviceId, imageId });
  sendJson(res, 200, { image, service });
}

async function deleteImage(res, user, serviceId, imageId) {
  const content = await getManagedContent();
  const service = content.services[serviceId];
  if (!service || !Array.isArray(service.images)) {
    sendJson(res, 404, { error: 'Image not found' });
    return;
  }
  const index = service.images.findIndex(item => item.id === imageId);
  if (index === -1) {
    sendJson(res, 404, { error: 'Image not found' });
    return;
  }
  const [removed] = service.images.splice(index, 1);
  if (service.heroImage === removed.src) service.heroImage = service.images[0]?.src || '';
  if (removed.src && removed.src.startsWith('/uploads/')) {
    const full = path.resolve(ROOT, `.${removed.src}`);
    if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) fs.unlinkSync(full);
  }
  service.updatedAt = new Date().toISOString();
  service.updatedBy = user.username;
  content.updatedAt = service.updatedAt;
  await saveContent(content);
  audit(user, 'image:delete', { serviceId, imageId });
  sendJson(res, 200, { service });
}

async function createUser(res, actor, body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || 'image_editor');
  if (!/^[a-z0-9_.-]{3,32}$/i.test(username)) {
    sendJson(res, 400, { error: 'Username must be 3-32 characters and use letters, numbers, dots, dashes, or underscores.' });
    return;
  }
  if (password.length < 8) {
    sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
    return;
  }
  if (!ROLE_DEFS[role]) {
    sendJson(res, 400, { error: 'Unknown role.' });
    return;
  }
  const users = readUsers();
  if (users.some(item => item.username.toLowerCase() === username.toLowerCase())) {
    sendJson(res, 409, { error: 'Username already exists.' });
    return;
  }
  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: String(body.displayName || username).trim(),
    role,
    active: body.active !== false,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  users.push(user);
  await saveUsers(users);
  audit(actor, 'user:create', { username, role });
  sendJson(res, 201, { user: publicUser(user) });
}

async function updateUser(res, actor, userId, body) {
  const users = readUsers();
  const user = users.find(item => item.id === userId);
  if (!user) {
    sendJson(res, 404, { error: 'User not found.' });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) user.displayName = String(body.displayName || user.username).trim();
  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    if (!ROLE_DEFS[body.role]) {
      sendJson(res, 400, { error: 'Unknown role.' });
      return;
    }
    user.role = body.role;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'active')) user.active = Boolean(body.active);
  if (body.password) {
    if (String(body.password).length < 8) {
      sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      return;
    }
    user.password = hashPassword(String(body.password));
  }
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  audit(actor, 'user:update', { username: user.username, role: user.role, active: user.active });
  sendJson(res, 200, { user: publicUser(user) });
}

async function updateOwnPassword(res, user, body) {
  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');
  if (!verifyPassword(oldPassword, user.password)) {
    sendJson(res, 400, { error: 'Current password is incorrect.' });
    return;
  }
  if (newPassword.length < 8) {
    sendJson(res, 400, { error: 'New password must be at least 8 characters.' });
    return;
  }
  const users = readUsers();
  const saved = users.find(item => item.id === user.id);
  if (!saved) {
    sendJson(res, 404, { error: 'User not found.' });
    return;
  }
  saved.password = hashPassword(newPassword);
  saved.updatedAt = new Date().toISOString();
  await saveUsers(users);
  audit(user, 'password:update', {});
  sendJson(res, 200, { ok: true });
}

async function exportContent(res, user) {
  const content = await getManagedContent();
  const body = JSON.stringify(content, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  audit(user, 'content:export', {});
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="menu-real-estate-content-${date}.json"`,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function getManagedContent() {
  await hydrateContentFromSupabaseOnce();
  return readContent();
}

async function saveContent(content) {
  writeJson(CONTENT_FILE, content);
  await syncContentToSupabase(content);
}

async function saveUsers(users) {
  writeJson(USERS_FILE, users);
  await syncUsersToSupabase(users);
}

async function storeUploadedImage(res, serviceId, body) {
  const parsed = parseDataImage(String(body.dataUrl || ''));
  if (!parsed) {
    sendJson(res, 400, { error: 'Upload must be a PNG, JPG, WEBP, or GIF image.' });
    return null;
  }

  if (!parsed.buffer.length || parsed.buffer.length > 8 * 1024 * 1024) {
    sendJson(res, 400, { error: 'Image must be smaller than 8 MB.' });
    return null;
  }

  try {
    if (IMGBB_API_KEY) return await uploadImageToImgBB(parsed, serviceId, body.fileName);
    return saveLocalImage(parsed, serviceId, body.fileName);
  } catch (error) {
    console.error('Image upload failed:', error);
    sendJson(res, 502, { error: error.message || 'Image upload failed.' });
    return null;
  }
}

function parseDataImage(dataUrl) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
  const base64 = match[2];
  return { mime, ext, base64, buffer: Buffer.from(base64, 'base64') };
}

async function uploadImageToImgBB(parsed, serviceId, originalFileName) {
  const safeBase = safeFilePart(path.basename(String(originalFileName || 'image'), path.extname(String(originalFileName || 'image'))));
  const name = safeFilePart(serviceId) + '-' + Date.now() + '-' + (safeBase || 'image');
  const form = new URLSearchParams({ image: parsed.base64, name });
  if (IMGBB_EXPIRATION_SECONDS > 0) {
    form.set('expiration', String(Math.max(60, Math.floor(IMGBB_EXPIRATION_SECONDS))));
  }
  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(IMGBB_API_KEY), {
    method: 'POST',
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(data?.error?.message || ('Image host returned ' + response.status));
  }
  return {
    src: data.data.display_url || data.data.url,
    provider: 'imgbb',
    hostedId: data.data.id || ''
  };
}

function saveLocalImage(parsed, serviceId, originalFileName) {
  const safeBase = safeFilePart(path.basename(String(originalFileName || 'image'), path.extname(String(originalFileName || 'image'))));
  const filename = safeFilePart(serviceId) + '-' + Date.now() + '-' + (safeBase || 'image') + parsed.ext;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, parsed.buffer);
  return { src: '/uploads/' + filename, provider: 'local', hostedId: '' };
}

function supabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function hydrateContentFromSupabaseOnce() {
  if (!supabaseEnabled() || supabaseHydrated) return;
  if (!supabaseHydrationPromise) {
    supabaseHydrationPromise = (async () => {
      try {
        const rows = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_CONTENT_KEY) + '&select=value');
        const remoteContent = Array.isArray(rows) ? rows[0]?.value : null;
        if (remoteContent && remoteContent.services) writeJson(CONTENT_FILE, remoteContent);
        else await syncContentToSupabase(readContent());
        supabaseState.contentReady = true;
        supabaseState.contentError = '';
      } catch (error) {
        supabaseState.contentReady = false;
        supabaseState.contentError = error.message;
        console.warn('Supabase content hydration skipped:', error.message);
      } finally {
        supabaseHydrated = true;
      }
    })();
  }
  await supabaseHydrationPromise;
}

async function hydrateUsersFromSupabaseOnce() {
  if (!supabaseEnabled() || supabaseUsersHydrated) return;
  if (!supabaseUsersHydrationPromise) {
    supabaseUsersHydrationPromise = (async () => {
      try {
        const rows = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_USERS_KEY) + '&select=value');
        const remoteUsers = Array.isArray(rows) ? rows[0]?.value : null;
        if (Array.isArray(remoteUsers) && remoteUsers.length) writeJson(USERS_FILE, remoteUsers);
        else await syncUsersToSupabase(readUsers());
        supabaseState.usersReady = true;
        supabaseState.usersError = '';
      } catch (error) {
        supabaseState.usersReady = false;
        supabaseState.usersError = error.message;
        console.warn('Supabase user hydration skipped:', error.message);
      } finally {
        supabaseUsersHydrated = true;
      }
    })();
  }
  await supabaseUsersHydrationPromise;
}

async function hydrateAuditFromSupabaseOnce() {
  if (!supabaseEnabled() || supabaseAuditHydrated) return;
  if (!supabaseAuditHydrationPromise) {
    supabaseAuditHydrationPromise = (async () => {
      try {
        const rows = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_AUDIT_KEY) + '&select=value');
        const remoteAudit = Array.isArray(rows) ? rows[0]?.value : null;
        if (Array.isArray(remoteAudit)) writeJson(AUDIT_FILE, remoteAudit);
        else await syncAuditSnapshotToSupabase();
        supabaseState.auditReady = true;
        supabaseState.auditError = '';
      } catch (error) {
        supabaseState.auditReady = false;
        supabaseState.auditError = error.message;
        console.warn('Supabase audit hydration skipped:', error.message);
      } finally {
        supabaseAuditHydrated = true;
      }
    })();
  }
  await supabaseAuditHydrationPromise;
}

async function syncContentToSupabase(content) {
  if (!supabaseEnabled()) return;
  const updatedAt = new Date().toISOString();
  try {
    const patched = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_CONTENT_KEY), {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { value: content, updated_at: updatedAt }
    });
    if (!Array.isArray(patched) || !patched.length) {
      await supabaseRest(SUPABASE_CONTENT_TABLE, '', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { key: SUPABASE_CONTENT_KEY, value: content, updated_at: updatedAt }
      });
    }
    supabaseState.contentReady = true;
    supabaseState.contentError = '';
  } catch (error) {
    supabaseState.contentReady = false;
    supabaseState.contentError = error.message;
    console.warn('Supabase content sync skipped:', error.message);
  }
}

function syncAuditToSupabase(record) {
  if (!supabaseEnabled()) return;
  if (!supabaseAuditUsesTable) {
    syncAuditSnapshotToSupabase();
    return;
  }
  supabaseRest(SUPABASE_AUDIT_TABLE, '', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id: record.id,
      at: record.at,
      user_id: record.userId,
      username: record.username,
      action: record.action,
      details: record.details || {}
    }
  })
    .then(() => {
      supabaseState.auditReady = true;
      supabaseState.auditError = '';
    })
    .catch(error => {
      supabaseAuditUsesTable = false;
      console.warn('Supabase audit table sync skipped, using content-table audit fallback:', error.message);
      syncAuditSnapshotToSupabase();
    });
}

async function syncAuditSnapshotToSupabase() {
  if (!supabaseEnabled()) return;
  const records = readJson(AUDIT_FILE, []);
  const updatedAt = new Date().toISOString();
  try {
    const patched = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_AUDIT_KEY), {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { value: records, updated_at: updatedAt }
    });
    if (!Array.isArray(patched) || !patched.length) {
      await supabaseRest(SUPABASE_CONTENT_TABLE, '', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { key: SUPABASE_AUDIT_KEY, value: records, updated_at: updatedAt }
      });
    }
    supabaseState.auditReady = true;
    supabaseState.auditError = '';
  } catch (error) {
    supabaseState.auditReady = false;
    supabaseState.auditError = error.message;
    console.warn('Supabase audit fallback sync skipped:', error.message);
  }
}

async function syncUsersToSupabase(users) {
  if (!supabaseEnabled()) return;
  const updatedAt = new Date().toISOString();
  try {
    const patched = await supabaseRest(SUPABASE_CONTENT_TABLE, '?key=eq.' + encodeURIComponent(SUPABASE_USERS_KEY), {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { value: users, updated_at: updatedAt }
    });
    if (!Array.isArray(patched) || !patched.length) {
      await supabaseRest(SUPABASE_CONTENT_TABLE, '', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { key: SUPABASE_USERS_KEY, value: users, updated_at: updatedAt }
      });
    }
    supabaseState.usersReady = true;
    supabaseState.usersError = '';
  } catch (error) {
    supabaseState.usersReady = false;
    supabaseState.usersError = error.message;
    console.warn('Supabase user sync skipped:', error.message);
  }
}

async function sendHealth(res) {
  const content = await getManagedContent();
  await hydrateUsersFromSupabaseOnce();
  await hydrateAuditFromSupabaseOnce();
  const services = Object.values(content.services || {});
  sendJson(res, 200, {
    ok: true,
    siteName: content.siteName || 'MENU Real Estate Group',
    updatedAt: content.updatedAt || null,
    services: services.length,
    storage: {
      content: supabaseEnabled() && supabaseState.contentReady ? 'supabase' : 'local-json',
      images: IMGBB_API_KEY ? 'imgbb' : 'local-uploads'
    },
    supabase: {
      configured: supabaseEnabled(),
      contentReady: supabaseState.contentReady,
      usersReady: supabaseState.usersReady,
      auditReady: supabaseState.auditReady
    }
  });
}

async function getAdminStatus() {
  const content = await getManagedContent();
  await hydrateAuditFromSupabaseOnce();
  const users = readUsers();
  const auditRecords = readJson(AUDIT_FILE, []);
  const services = Object.values(content.services || {});
  const servicesWithHero = services.filter(service => Boolean(service.heroImage)).length;
  const imageCount = services.reduce((sum, service) => sum + (Array.isArray(service.images) ? service.images.length : 0), 0);
  const incompleteServices = services
    .filter(service => !service.summary || !service.description || !service.heroImage || !Array.isArray(service.images) || !service.images.length)
    .map(service => ({
      id: service.id,
      title: service.title || service.id,
      missing: [
        !service.summary ? 'summary' : '',
        !service.description ? 'description' : '',
        !service.heroImage ? 'hero image' : '',
        !Array.isArray(service.images) || !service.images.length ? 'gallery images' : ''
      ].filter(Boolean)
    }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    content: {
      siteName: content.siteName || 'MENU Real Estate Group',
      updatedAt: content.updatedAt || null,
      serviceCount: services.length,
      imageCount,
      servicesWithHero,
      incompleteServices,
      recentServices: services
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, 5)
        .map(service => ({
          id: service.id,
          title: service.title || service.id,
          category: service.category || '',
          page: service.page || '',
          updatedAt: service.updatedAt || null,
          updatedBy: service.updatedBy || ''
        }))
    },
    users: {
      total: users.length,
      active: users.filter(user => user.active).length,
      roles: users.reduce((roles, user) => {
        roles[user.role] = (roles[user.role] || 0) + 1;
        return roles;
      }, {})
    },
    audit: {
      total: auditRecords.length,
      recent: auditRecords.slice(-5).reverse()
    },
    hosting: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: PORT,
      contentStorage: supabaseEnabled() && supabaseState.contentReady ? 'Supabase with local JSON fallback' : 'Local JSON only',
      imageStorage: IMGBB_API_KEY ? 'ImgBB hosted images' : 'Local uploads folder',
      supabaseConfigured: supabaseEnabled(),
      supabaseContentReady: supabaseState.contentReady,
      supabaseUsersReady: supabaseState.usersReady,
      supabaseAuditReady: supabaseState.auditReady,
      persistentContent: supabaseEnabled() && supabaseState.contentReady,
      persistentUsers: supabaseEnabled() && supabaseState.usersReady,
      persistentImages: Boolean(IMGBB_API_KEY),
      warnings: [
        !supabaseEnabled() ? 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before hosting if the host has ephemeral storage.' : '',
        supabaseEnabled() && !supabaseState.contentReady ? 'Create the Supabase site_content table before hosting persistent service content.' : '',
        supabaseEnabled() && !supabaseState.usersReady ? 'Create the Supabase site_content table before hosting persistent admin users.' : '',
        supabaseEnabled() && !supabaseState.auditReady ? 'Create the Supabase audit_log table before hosting persistent audit logs.' : '',
        !IMGBB_API_KEY ? 'Set IMGBB_API_KEY before hosting if uploaded images must survive redeploys.' : '',
        process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD ? 'Set ADMIN_PASSWORD for the first production deploy.' : ''
      ].filter(Boolean)
    }
  };
}

async function supabaseRest(table, query = '', options = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + encodeURIComponent(table) + query, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.hint || text || ('Supabase returned ' + response.status);
    throw new Error(message);
  }
  return data;
}

function serveStatic(res, pathname, headOnly = false) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  if (requested === '/admin') requested = '/admin.html';

  const fullPath = path.resolve(ROOT, `.${requested}`);
  if (!fullPath.startsWith(ROOT)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (fullPath.startsWith(DATA_DIR) && path.basename(fullPath) !== 'content.json') {
    sendText(res, 404, 'Not found');
    return;
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.json' ? 'no-store' : 'public, max-age=60'
  });
  if (!headOnly) fs.createReadStream(fullPath).pipe(res);
  else res.end();
}

function readContent() {
  return readJson(CONTENT_FILE, { version: 1, services: {} });
}

function readUsers() {
  return readJson(USERS_FILE, []);
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${file}:`, error);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeImages(images) {
  return images.map(item => ({
    id: String(item.id || crypto.randomUUID()),
    src: String(item.src || ''),
    alt: String(item.alt || ''),
    caption: String(item.caption || ''),
    uploadedBy: String(item.uploadedBy || ''),
    uploadedAt: String(item.uploadedAt || ''),
    provider: String(item.provider || ''),
    hostedId: String(item.hostedId || '')
  })).filter(item => item.src);
}

function ensureSetup() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), 'utf8');
  if (!fs.existsSync(AUDIT_FILE)) writeJson(AUDIT_FILE, []);

  if (!fs.existsSync(USERS_FILE)) {
    const initialPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const admin = {
      id: crypto.randomUUID(),
      username: 'admin',
      displayName: 'Site Admin',
      role: 'admin',
      active: true,
      password: hashPassword(initialPassword),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeJson(USERS_FILE, [admin]);
    fs.writeFileSync(path.join(DATA_DIR, 'initial-admin.txt'), `Initial admin login\nUsername: admin\nPassword: ${initialPassword}\n\nChange this password from the admin panel after first login.\n`, 'utf8');
  }

  if (!fs.existsSync(CONTENT_FILE)) writeJson(CONTENT_FILE, { version: 1, siteName: 'MENU Real Estate Group', updatedAt: new Date().toISOString(), services: {} });
}

function getSecret() {
  if (process.env.SERVER_SECRET) return process.env.SERVER_SECRET;
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function createSession(user) {
  const payload = {
    uid: user.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS,
    nonce: crypto.randomBytes(8).toString('hex')
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function getUserFromRequest(req) {
  try {
    const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
    if (!token || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const user = readUsers().find(item => item.id === payload.uid);
    return user && user.active ? user : null;
  } catch {
    return null;
  }
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: 'Login required' });
    return null;
  }
  return user;
}

function hasPermission(user, permission) {
  return ROLE_DEFS[user.role]?.permissions.includes(permission);
}

function requirePermission(user, res, permission) {
  if (!hasPermission(user, permission)) {
    sendJson(res, 403, { error: 'Permission denied' });
    return false;
  }
  return true;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel: ROLE_DEFS[user.role]?.label || user.role,
    permissions: ROLE_DEFS[user.role]?.permissions || [],
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function publicRoles() {
  return Object.fromEntries(Object.entries(ROLE_DEFS).map(([key, value]) => [key, { label: value.label, permissions: value.permissions }]));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, saved) {
  const [salt, hash] = String(saved || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    if (index === -1) return [part, ''];
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function audit(user, action, details) {
  const records = readJson(AUDIT_FILE, []);
  const record = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    action,
    details
  };
  records.push(record);
  writeJson(AUDIT_FILE, records.slice(-1000));
  syncAuditToSupabase(record);
}

function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    console.warn('Could not load .env file:', error.message);
  }
}

function safeFilePart(value) {
  return String(value || '').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase();
}
