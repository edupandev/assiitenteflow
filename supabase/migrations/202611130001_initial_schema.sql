-- ============================================================================
-- SISTEMA DE GESTÃO INTELIGENTE — SCHEMA INICIAL + RLS + ÍNDICES
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'employee');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.task_origin as enum ('system', 'notion');
create type public.project_status as enum ('active', 'paused', 'archived');
create type public.source_kind as enum ('local', 'github');
create type public.time_record_source as enum ('real', 'manual', 'estimated');
create type public.closing_status as enum ('draft', 'closed', 'reopened');
create type public.integration_provider as enum ('notion', 'github', 'telegram', 'ai');
create type public.integration_status as enum ('connected', 'disconnected', 'error');
create type public.job_status as enum ('pending', 'processing', 'completed', 'failed');

-- ----------------------------------------------------------------------------
-- 2. TRIGGER FUNCTION FOR updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. TABLES
-- ----------------------------------------------------------------------------

-- 3.1 organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Sao_Paulo',
  closing_day integer not null default 23 check (closing_day between 1 and 28),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.2 profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text not null,
  email text not null,
  avatar_url text,
  job_title text,
  role public.user_role not null default 'employee',
  is_active boolean not null default true,
  ai_preferences jsonb not null default '{"max_tokens_per_request": 1200, "tone": "objetivo"}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.3 projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  canonical_origin text, -- evita duplicidade entre pasta local e GitHub
  status public.project_status not null default 'active',
  is_private boolean not null default false,
  last_activity_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, owner_id, slug)
);

-- 3.4 project_sources
create table public.project_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.source_kind not null,
  external_identifier text not null, -- caminho local ou owner/repo
  repo_url text,
  default_branch text default 'main',
  last_commit_sha text,
  readme_hash text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, kind, external_identifier)
);

-- 3.5 project_sync_events
create table public.project_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid references public.project_sources(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null, -- commit, readme_update, file_change, branch_sync
  commit_sha text,
  branch text,
  summary text not null,
  content_hash text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.6 project_summaries (economia de tokens: cache persistente e hash)
create table public.project_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade unique,
  readme_excerpt text,
  persistent_summary text not null,
  context_hash text not null,
  token_estimate integer not null default 0,
  last_processed_event_id uuid references public.project_sync_events(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.7 tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  due_date date,
  origin public.task_origin not null default 'system',
  external_id text, -- Notion page ID
  external_url text,
  sync_hash text,
  is_private boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, origin, external_id)
);

-- 3.8 task_sync_events
create table public.task_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'conflict')),
  status text not null check (status in ('success', 'error', 'resolved')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.9 assistant_conversations
create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Nova conversa',
  rolling_summary text,
  total_tokens_used integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.10 assistant_messages
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.11 work_schedules
create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, -- null = padrão da organização
  name text not null default 'Jornada Padrão 8h',
  entry_time time not null default '08:00:00',
  lunch_out_time time not null default '12:00:00',
  lunch_in_time time not null default '13:00:00',
  exit_time time not null default '17:00:00',
  workdays integer[] not null default '{1,2,3,4,5}', -- 1=Seg .. 5=Sex
  holidays date[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.12 time_records
create table public.time_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  clock_in time,
  lunch_out time,
  lunch_in time,
  clock_out time,
  worked_minutes integer not null default 0,
  source public.time_record_source not null default 'real',
  justification text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  is_holiday boolean not null default false,
  is_day_off boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, work_date)
);

-- 3.13 overtime_rules
create table public.overtime_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, -- null = regra global
  monthly_salary numeric(12,2) not null default 0,
  monthly_divisor integer not null default 220,
  daily_contract_minutes integer not null default 480,
  overtime_50_pct numeric(5,2) not null default 50.00,
  overtime_100_pct numeric(5,2) not null default 100.00,
  custom_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.14 monthly_closings
create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_month text not null, -- YYYY-MM
  period_start date not null,
  period_end date not null,
  status public.closing_status not null default 'draft',
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_reason text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, reference_month)
);

-- 3.15 generated_reports
create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null, -- null = relatório geral
  closing_id uuid references public.monthly_closings(id) on delete set null,
  report_type text not null, -- daily, monthly, productivity, projects, timecard, overtime
  period_start date not null,
  period_end date not null,
  pdf_path text,
  xlsx_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.16 integrations
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, -- null = nível organização
  provider public.integration_provider not null,
  status public.integration_status not null default 'disconnected',
  config jsonb not null default '{}'::jsonb, -- sem segredos em claro no frontend
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.17 telegram_deliveries
create table public.telegram_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid references public.generated_reports(id) on delete set null,
  delivery_type text not null check (delivery_type in ('daily_report', 'monthly_closing', 'alert')),
  chat_id text not null,
  message_id text,
  status text not null check (status in ('pending', 'sent', 'failed')),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.18 audit_logs
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz not null default timezone('utc', now())
);

-- 3.19 sync_devices
create table public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null,
  token_hash text not null unique,
  watched_path text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 3.20 background_jobs
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_type text not null,
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- 4. INDEXES
-- ----------------------------------------------------------------------------
create index idx_profiles_org on public.profiles(organization_id);
create index idx_projects_org_owner on public.projects(organization_id, owner_id);
create index idx_project_sources_project on public.project_sources(project_id);
create index idx_project_sync_events_project on public.project_sync_events(project_id, occurred_at desc);
create index idx_tasks_assignee_status on public.tasks(assignee_id, status, due_date);
create index idx_tasks_org_project on public.tasks(organization_id, project_id);
create index idx_assistant_conv_user on public.assistant_conversations(user_id, updated_at desc);
create index idx_assistant_msg_conv on public.assistant_messages(conversation_id, created_at asc);
create index idx_time_records_user_date on public.time_records(user_id, work_date desc);
create index idx_monthly_closings_org_month on public.monthly_closings(organization_id, reference_month);
create index idx_generated_reports_org_user on public.generated_reports(organization_id, user_id, created_at desc);
create index idx_audit_logs_org_created on public.audit_logs(organization_id, created_at desc);
create index idx_background_jobs_pending on public.background_jobs(status, run_at) where status in ('pending', 'failed');

-- ----------------------------------------------------------------------------
-- 5. UPDATED_AT TRIGGERS
-- ----------------------------------------------------------------------------
create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger trg_project_sources_updated_at before update on public.project_sources for each row execute function public.set_updated_at();
create trigger trg_project_summaries_updated_at before update on public.project_summaries for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger trg_assistant_conv_updated_at before update on public.assistant_conversations for each row execute function public.set_updated_at();
create trigger trg_work_schedules_updated_at before update on public.work_schedules for each row execute function public.set_updated_at();
create trigger trg_time_records_updated_at before update on public.time_records for each row execute function public.set_updated_at();
create trigger trg_overtime_rules_updated_at before update on public.overtime_rules for each row execute function public.set_updated_at();
create trigger trg_monthly_closings_updated_at before update on public.monthly_closings for each row execute function public.set_updated_at();
create trigger trg_integrations_updated_at before update on public.integrations for each row execute function public.set_updated_at();
create trigger trg_sync_devices_updated_at before update on public.sync_devices for each row execute function public.set_updated_at();
create trigger trg_background_jobs_updated_at before update on public.background_jobs for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. AUTH USER SIGNUP TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org_id uuid;
  user_count integer;
  assigned_role public.user_role;
begin
  select id into default_org_id from public.organizations order by created_at asc limit 1;
  if default_org_id is null then
    insert into public.organizations (name, slug)
    values ('Organização Principal', 'principal')
    returning id into default_org_id;
  end if;

  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'employee';
  end if;

  insert into public.profiles (id, organization_id, full_name, email, role)
  values (
    new.id,
    default_org_id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    assigned_role
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. RLS HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_sources enable row level security;
alter table public.project_sync_events enable row level security;
alter table public.project_summaries enable row level security;
alter table public.tasks enable row level security;
alter table public.task_sync_events enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.work_schedules enable row level security;
alter table public.time_records enable row level security;
alter table public.overtime_rules enable row level security;
alter table public.monthly_closings enable row level security;
alter table public.generated_reports enable row level security;
alter table public.integrations enable row level security;
alter table public.telegram_deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_devices enable row level security;
alter table public.background_jobs enable row level security;

-- organizations
create policy "orgs_select_own" on public.organizations
  for select using (id = public.current_user_org_id());
create policy "orgs_update_admin" on public.organizations
  for update using (id = public.current_user_org_id() and public.is_admin());

-- profiles
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (
    id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (
    id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- projects (funcionário vê os seus; admin vê os públicos da org + os seus)
create policy "projects_select" on public.projects
  for select using (
    owner_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin() and is_private = false)
  );
create policy "projects_insert" on public.projects
  for insert with check (
    organization_id = public.current_user_org_id()
    and (owner_id = auth.uid() or public.is_admin())
  );
create policy "projects_update" on public.projects
  for update using (
    owner_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin() and is_private = false)
  );
create policy "projects_delete" on public.projects
  for delete using (
    owner_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- project_sources
create policy "project_sources_select" on public.project_sources
  for select using (user_id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin()));
create policy "project_sources_all_own" on public.project_sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- project_sync_events
create policy "project_sync_events_select" on public.project_sync_events
  for select using (user_id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin()));
create policy "project_sync_events_insert" on public.project_sync_events
  for insert with check (user_id = auth.uid());

-- project_summaries
create policy "project_summaries_select" on public.project_summaries
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_summaries.project_id
      and (p.owner_id = auth.uid() or (p.organization_id = public.current_user_org_id() and public.is_admin() and p.is_private = false))
    )
  );

-- tasks (não misturar tarefas privadas de funcionários com visão geral da equipe)
create policy "tasks_select" on public.tasks
  for select using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin() and is_private = false)
  );
create policy "tasks_insert" on public.tasks
  for insert with check (
    organization_id = public.current_user_org_id()
    and (assignee_id = auth.uid() or public.is_admin())
  );
create policy "tasks_update" on public.tasks
  for update using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin() and is_private = false)
  );
create policy "tasks_delete" on public.tasks
  for delete using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- task_sync_events
create policy "task_sync_events_select" on public.task_sync_events
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_sync_events.task_id
      and (t.assignee_id = auth.uid() or (t.organization_id = public.current_user_org_id() and public.is_admin() and t.is_private = false))
    )
  );

-- assistant_conversations & assistant_messages (estritamente individuais)
create policy "assistant_conv_own" on public.assistant_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "assistant_msg_own" on public.assistant_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- work_schedules
create policy "work_schedules_select" on public.work_schedules
  for select using (
    organization_id = public.current_user_org_id()
    and (user_id is null or user_id = auth.uid() or public.is_admin())
  );
create policy "work_schedules_admin" on public.work_schedules
  for all using (organization_id = public.current_user_org_id() and public.is_admin())
  with check (organization_id = public.current_user_org_id() and public.is_admin());

-- time_records
create policy "time_records_select" on public.time_records
  for select using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );
create policy "time_records_insert_own" on public.time_records
  for insert with check (
    organization_id = public.current_user_org_id()
    and (user_id = auth.uid() or public.is_admin())
  );
create policy "time_records_update" on public.time_records
  for update using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- overtime_rules
create policy "overtime_rules_select" on public.overtime_rules
  for select using (
    organization_id = public.current_user_org_id()
    and (user_id is null or user_id = auth.uid() or public.is_admin())
  );
create policy "overtime_rules_admin" on public.overtime_rules
  for all using (organization_id = public.current_user_org_id() and public.is_admin())
  with check (organization_id = public.current_user_org_id() and public.is_admin());

-- monthly_closings
create policy "monthly_closings_select" on public.monthly_closings
  for select using (organization_id = public.current_user_org_id());
create policy "monthly_closings_admin" on public.monthly_closings
  for all using (organization_id = public.current_user_org_id() and public.is_admin())
  with check (organization_id = public.current_user_org_id() and public.is_admin());

-- generated_reports
create policy "generated_reports_select" on public.generated_reports
  for select using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- integrations
create policy "integrations_select" on public.integrations
  for select using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );
create policy "integrations_manage" on public.integrations
  for all using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  ) with check (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- telegram_deliveries (somente admin)
create policy "telegram_deliveries_admin" on public.telegram_deliveries
  for select using (organization_id = public.current_user_org_id() and public.is_admin());

-- audit_logs (somente admin lê; inserção via server/service_role)
create policy "audit_logs_admin" on public.audit_logs
  for select using (organization_id = public.current_user_org_id() and public.is_admin());

-- sync_devices
create policy "sync_devices_own_or_admin" on public.sync_devices
  for all using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  ) with check (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin())
  );

-- background_jobs (somente admin visualiza fila)
create policy "background_jobs_admin" on public.background_jobs
  for select using (organization_id = public.current_user_org_id() and public.is_admin());
