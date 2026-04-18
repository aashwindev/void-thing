create table organizations (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('owner','admin','developer','viewer')),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  repo_url text,
  created_at timestamptz not null default now(),
  unique(org_id, name)
);

create table environments (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null check (name in ('dev','preview','staging','prod')),
  created_at timestamptz not null default now(),
  unique(project_id, name)
);

create table service_connections (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('vercel','netlify','supabase','cloudflare','aws','github')),
  account_label text not null,
  scopes text[] not null default '{}',
  status text not null check (status in ('active','revoked','error')) default 'active',
  credential_ref text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_connection_bindings (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  environment text not null check (environment in ('dev','preview','staging','prod')),
  provider text not null,
  connection_id uuid not null references service_connections(id) on delete cascade,
  target_identifier text,
  created_at timestamptz not null default now(),
  unique(project_id, environment, provider)
);

create table policies (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  effect text not null check (effect in ('allow','deny','require_approval')),
  tool text not null,
  environment text,
  condition_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid,
  reason text not null,
  required_roles text[] not null default '{admin}',
  status text not null check (status in ('pending','approved','rejected','expired')) default 'pending',
  requested_by uuid not null references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table runs (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  tool text not null,
  provider text,
  environment text not null check (environment in ('dev','preview','staging','prod')),
  status text not null check (status in ('queued','in_progress','waiting_approval','succeeded','failed','rolled_back')) default 'queued',
  request_json jsonb not null,
  output_json jsonb not null default '{}',
  error_json jsonb,
  idempotency_key text,
  requested_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index runs_idempotency_unique
on runs(org_id, project_id, tool, coalesce(idempotency_key, ''));

create table run_steps (
  id uuid primary key,
  run_id uuid not null references runs(id) on delete cascade,
  step_order int not null,
  provider text,
  action text not null,
  status text not null check (status in ('queued','in_progress','succeeded','failed','rolled_back')) default 'queued',
  input_json jsonb not null,
  output_json jsonb not null default '{}',
  rollback_json jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  unique(run_id, step_order)
);

create table audit_events (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid references runs(id) on delete set null,
  actor_type text not null check (actor_type in ('user','agent','system','provider_webhook')),
  actor_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index audit_events_org_time_idx on audit_events(org_id, created_at desc);
create index runs_project_time_idx on runs(project_id, created_at desc);
