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
