const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const INITIAL_ADMIN_FILE = path.join(DATA_DIR, 'initial-admin.txt');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((values, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return values;
    const index = trimmed.indexOf('=');
    if (index === -1) return values;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
    return values;
  }, {});
}

const fileEnv = loadEnvFile(path.join(ROOT, '.env'));

function envValue(name, fallback = '') {
  return process.env[name] || fileEnv[name] || fallback;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function createPassword() {
  return `${crypto.randomBytes(18).toString('base64url')}!A1`;
}

async function supabaseRequest(pathSuffix, options) {
  const supabaseUrl = envValue('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = envValue('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathSuffix}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`Supabase ${response.status}: ${message}`);
  }
  return body;
}

async function syncUsers(users, updatedAt) {
  const supabaseUrl = envValue('SUPABASE_URL');
  const serviceKey = envValue('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return 'skipped';

  const table = envValue('SUPABASE_CONTENT_TABLE', 'site_content');
  const usersKey = envValue('SUPABASE_USERS_KEY', 'menu-real-estate-users');
  const filter = `${table}?key=eq.${encodeURIComponent(usersKey)}`;
  const patched = await supabaseRequest(filter, {
    method: 'PATCH',
    body: JSON.stringify({ value: users, updated_at: updatedAt })
  });
  if (Array.isArray(patched) && patched.length) return 'updated';

  await supabaseRequest(table, {
    method: 'POST',
    body: JSON.stringify({ key: usersKey, value: users, updated_at: updatedAt })
  });
  return 'created';
}

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date().toISOString();
  const password = envValue('RESET_ADMIN_PASSWORD') || createPassword();
  const users = [
    {
      id: crypto.randomUUID(),
      username: 'admin',
      displayName: 'Site Admin',
      role: 'admin',
      active: true,
      password: hashPassword(password),
      createdAt: now,
      updatedAt: now
    }
  ];

  fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    INITIAL_ADMIN_FILE,
    `Initial admin login\nUsername: admin\nPassword: ${password}\n\nChange this password from the admin panel after first login.\n`,
    'utf8'
  );

  const supabaseStatus = await syncUsers(users, now);
  console.log(`Admin users reset: ${users.length}`);
  console.log(`Supabase users: ${supabaseStatus}`);
  console.log(`New admin login saved to: ${path.relative(ROOT, INITIAL_ADMIN_FILE)}`);
})();
