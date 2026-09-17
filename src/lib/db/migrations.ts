// Database schema, applied in order by `migrate()`. SQL lives in TypeScript so
// the server bundle carries it; `npm run db:migrate` applies the same list to Supabase.
//
// Design rule (the Markus lesson): store history, not current state.
// Fitness logs are append-only. An edit inserts a new row and stamps the old one
// with `superseded_at`, so any past moment can be reconstructed ("as of") and the
// coach's prescriptions can be replayed exactly.

export interface Migration {
  version: string;
  sql: string;
}

const versioned = `
  recorded_at   timestamptz not null default now(),
  superseded_at timestamptz`;

const init = `
create table if not exists app_users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  display_name     text not null default '',
  password_hash    text not null,
  session_version  integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists app_users_email_key on app_users (lower(email));

create table if not exists login_attempts (
  id          bigint generated always as identity primary key,
  email       text not null,
  ip          text not null,
  succeeded   boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on login_attempts (lower(email), created_at desc);
create index if not exists login_attempts_ip_idx on login_attempts (ip, created_at desc);

-- ---------------------------------------------------------------------------
-- Fitness log (versioned)
-- ---------------------------------------------------------------------------
create table if not exists weigh_ins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_users(id) on delete cascade,
  date         date not null,
  weight_kg    numeric(5,2) check (weight_kg between 25 and 250),
  protocol_ok  boolean not null default true,
  bed_at       timestamptz,
  wake_at      timestamptz,
  note         text not null default '',
  ${versioned},
  supersedes   uuid references weigh_ins(id),
  check (wake_at is null or bed_at is null or wake_at > bed_at)
);
create unique index if not exists weigh_ins_current on weigh_ins (user_id, date) where superseded_at is null;
create index if not exists weigh_ins_asof on weigh_ins (user_id, date, recorded_at);

create table if not exists nutrition_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  date        date not null,
  kcal        integer not null check (kcal between 0 and 10000),
  protein_g   numeric(6,1) not null check (protein_g between 0 and 1000),
  carbs_g     numeric(6,1) not null check (carbs_g between 0 and 2000),
  fat_g       numeric(6,1) not null check (fat_g between 0 and 1000),
  note        text not null default '',
  ${versioned},
  supersedes  uuid references nutrition_days(id)
);
create unique index if not exists nutrition_days_current on nutrition_days (user_id, date) where superseded_at is null;
create index if not exists nutrition_days_asof on nutrition_days (user_id, date, recorded_at);

create table if not exists measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('waist','arm_r','arm_l','chest','thigh','hips','bideltoid','neck')),
  value_cm    numeric(5,1) not null check (value_cm between 10 and 300),
  note        text not null default '',
  ${versioned},
  supersedes  uuid references measurements(id)
);
create unique index if not exists measurements_current on measurements (user_id, date, kind) where superseded_at is null;

create table if not exists photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('front','side','back','meal')),
  mime        text not null check (mime in ('image/jpeg','image/png','image/webp')),
  bytes       bytea not null,
  width       integer,
  height      integer,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists photos_user_date on photos (user_id, date);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_users(id) on delete cascade,
  date         date not null,
  session_key  text not null,
  run_id       uuid,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  note         text not null default '',
  deleted_at   timestamptz
);
create unique index if not exists sessions_one_per_day on sessions (user_id, date) where deleted_at is null;

create table if not exists set_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references app_users(id) on delete cascade,
  session_id         uuid not null references sessions(id) on delete cascade,
  date               date not null,
  slot               text not null,
  exercise_key       text not null,
  track_key          text not null,
  substitute_for     text,
  set_index          integer not null check (set_index between 1 and 20),
  weight_kg          numeric(6,2) check (weight_kg between 0 and 500),
  reps               integer not null check (reps between 0 and 100),
  is_warmup          boolean not null default false,
  planned_weight_kg  numeric(6,2),
  planned_reps       integer,
  ${versioned},
  supersedes         uuid references set_logs(id)
);
create unique index if not exists set_logs_current on set_logs (session_id, slot, set_index) where superseded_at is null;
create index if not exists set_logs_user_date on set_logs (user_id, date);

create table if not exists overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  date        date not null,
  target      text not null,
  field       text not null check (field in ('weight','reps','targets')),
  value       jsonb not null,
  reason      text not null default '',
  change_ref  text,
  ${versioned}
);
create index if not exists overrides_user on overrides (user_id, recorded_at);

create table if not exists nutrition_targets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_users(id) on delete cascade,
  effective_date  date not null,
  kcal            integer not null check (kcal between 800 and 8000),
  protein_g       numeric(6,1) not null,
  carbs_g         numeric(6,1) not null,
  fat_g           numeric(6,1) not null,
  source          text not null check (source in ('plan','coach','override')),
  reason          text not null default '',
  run_id          uuid,
  ${versioned}
);
create index if not exists nutrition_targets_user on nutrition_targets (user_id, effective_date, recorded_at);

create table if not exists settings (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references app_users(id) on delete cascade,
  key      text not null,
  value    jsonb not null,
  ${versioned}
);
create unique index if not exists settings_current on settings (user_id, key) where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Coach
-- ---------------------------------------------------------------------------
create table if not exists coach_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_users(id) on delete cascade,
  run_date        date not null,
  revision        integer not null,
  trigger         text not null check (trigger in ('checkin','cron','manual','view','override','settings','edit')),
  as_of           timestamptz not null,
  rules_version   text not null,
  inputs_digest   text not null,
  output          jsonb not null,
  state           jsonb not null,
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz
);
create unique index if not exists coach_runs_revision on coach_runs (user_id, run_date, revision);
create unique index if not exists coach_runs_current on coach_runs (user_id, run_date) where superseded_at is null;

create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_users(id) on delete cascade,
  kind         text not null check (kind in ('weekly','monthly','replay')),
  period_date  date not null,
  run_id       uuid references coach_runs(id) on delete set null,
  result       jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists reviews_user on reviews (user_id, kind, period_date);

-- Derived cache of per-lift progression state. Every coach run rebuilds it from the log.
create table if not exists lift_state (
  user_id     uuid not null references app_users(id) on delete cascade,
  track_key   text not null,
  state       jsonb not null,
  run_id      uuid,
  updated_at  timestamptz not null default now(),
  primary key (user_id, track_key)
);

-- ---------------------------------------------------------------------------
-- Plain modules
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  title       text not null check (length(title) between 1 and 300),
  notes       text not null default '',
  due_date    date,
  due_time    text check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  priority    text not null default 'none' check (priority in ('high','medium','low','none')),
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (due_time is null or due_date is not null)
);
create index if not exists tasks_user on tasks (user_id, due_date);

create table if not exists habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_users(id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  days         jsonb not null default '[1,2,3,4,5,6,7]',
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create table if not exists habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  habit_id    uuid not null references habits(id) on delete cascade,
  date        date not null,
  done        boolean not null default true,
  updated_at  timestamptz not null default now()
);
create unique index if not exists habit_logs_day on habit_logs (habit_id, date);

create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users(id) on delete cascade,
  title         text not null check (length(title) between 1 and 200),
  category      text not null default 'General',
  target_date   date,
  kind          text not null default 'manual' check (kind in ('manual','auto')),
  metric        text check (metric in ('bench_e1rm','bodyweight_avg')),
  start_value   numeric(7,2),
  target_value  numeric(7,2),
  notes         text not null default '',
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  achieved_at   timestamptz,
  archived_at   timestamptz,
  check (kind = 'manual' or (metric is not null and target_value is not null))
);

create table if not exists goal_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  goal_id     uuid not null references goals(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  sort        integer not null default 0,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists commitments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  date        date not null,
  start_time  text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time    text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location    text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index if not exists commitments_user_date on commitments (user_id, date);

create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  entry_date  date not null,
  body        text not null check (length(body) between 1 and 20000),
  tags        jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists journal_user_date on journal_entries (user_id, entry_date desc);
`;

// On Supabase the tables are reachable through the public Data API with the
// anon key. The app never uses that API: it connects as the table owner from
// the server. Row Level Security with no policies, plus revoked grants, shuts
// the Data API out completely. On plain Postgres (PGlite) the roles don't exist.
// `migrate()` runs this after every migration pass, so new tables are covered too.
export const LOCK_DOWN_SQL = `
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
  end if;
end $$;
`;

export const MIGRATIONS: Migration[] = [{ version: "0001_init", sql: init }];
