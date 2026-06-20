MENU Real Estate Group website and admin panel

This is a host-ready Node website for MENU Real Estate Group. The public site is backed by real editable data in data/content.json, and the admin panel writes changes through server APIs.

Run locally:
- Install Node.js 18 or newer.
- Open this folder in a terminal.
- Run: npm start
- Public site: http://localhost:3000/
- Admin panel: http://localhost:3000/admin
- Health check: http://localhost:3000/healthz

Admin login:
- First local login is username admin and password Admin123!
- You can set a different first password with ADMIN_PASSWORD=your-password npm start
- Change the admin password from the Account tab after first login.
- Existing users are stored in data/users.json and can be mirrored to Supabase for hosting.

Admin panel:
- Dashboard shows live service counts, image counts, storage mode, recent service updates, and service records needing attention.
- Services tab edits the real public service data.
- Image manager uploads, captions, deletes, and sets service hero images.
- Permissions tab manages admin, content editor, and image-only partner accounts.
- Audit log records logins, content edits, uploads, image actions, user edits, and password changes.

Hosting:
- The project includes render.yaml for Render and Procfile for Procfile-based hosts.
- Build command: npm install
- Start command: npm start
- Health check path: /healthz
- Required production env vars:
  - NODE_ENV=production
  - ADMIN_PASSWORD=choose-a-strong-first-password
  - SERVER_SECRET=long-random-private-value
- Recommended persistent storage env vars:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - IMGBB_API_KEY

Persistent content and users:
- With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, service content, users, and audit entries are mirrored to Supabase.
- Local JSON remains a fallback.
- Create these Supabase tables before enabling sync:
- The same SQL is saved in supabase-schema.sql.

```sql
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.audit_log (
  id uuid primary key,
  at timestamptz not null,
  user_id text,
  username text,
  action text not null,
  details jsonb default '{}'::jsonb
);

alter table public.site_content enable row level security;
alter table public.audit_log enable row level security;
```

Persistent images:
- With IMGBB_API_KEY set, uploaded service images are hosted externally and survive redeploys.
- Without IMGBB_API_KEY, uploads are saved to uploads/ on the server. This is fine locally, but many hosts wipe local files during redeploys.
- Optional test setting: IMGBB_EXPIRATION_SECONDS=60 makes ImgBB test uploads expire automatically.

Preflight check:
- Run: npm run check
- Then start the server and open /healthz.

Deployment files:
- render.yaml: Render blueprint
- Procfile: Heroku/Railway-style process file
- .env.example: production environment template
- .gitignore: keeps secrets and local runtime files out of source control
