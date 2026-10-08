-- =====================================================================
-- Phase 3 · Service catalog + dynamic workflow engine (definition side).
--   service_categories → services → service_workflows (versions) → workflow_steps
--   → required_fields / required_documents (→ document_types catalog)
-- Only draft versions are editable; published/archived versions are locked by triggers.
-- Request execution (service_requests + snapshots) arrives in Phase 4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.service_module as enum ('generic', 'real_estate', 'insurance', 'company_formation', 'loans');
create type public.workflow_status as enum ('draft', 'published', 'archived');
create type public.duration_unit as enum ('hours', 'days', 'business_days');
create type public.assignee_type as enum ('role', 'department', 'employee', 'request_owner');
create type public.field_type as enum ('text', 'textarea', 'number', 'money', 'date', 'select', 'multiselect', 'checkbox', 'phone', 'email', 'national_id');
create type public.field_filler as enum ('client', 'staff');
-- System request statuses (PROJECT_PLAN §8.5). Used now by workflow_steps.sets_request_status,
-- and by service_requests in Phase 4.
create type public.request_status as enum ('draft', 'submitted', 'in_progress', 'waiting_client', 'on_hold', 'completed', 'cancelled');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]*$'),
  name_ar text not null check (length(trim(name_ar)) > 1),
  name_en text,
  description_ar text,
  description_en text,
  icon text,
  module_key public.service_module not null default 'generic',
  is_active boolean not null default false,
  is_client_visible boolean not null default false,
  allow_client_request boolean not null default true,
  default_price numeric(14, 2) check (default_price is null or default_price >= 0),
  currency text not null default 'EGP',
  current_workflow_id uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  -- a service can only take new requests when it has a published workflow
  constraint services_active_needs_workflow check (not is_active or current_workflow_id is not null)
);
comment on column public.services.module_key is 'Which specialised panel the request page shows (generic = workflow + dynamic fields only).';
comment on column public.services.current_workflow_id is 'The published workflow version — set only by publish_workflow().';
create unique index services_code_uidx on public.services (code) where deleted_at is null;
create index services_category_idx on public.services (category_id) where deleted_at is null;

create table public.service_workflows (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  version int not null check (version > 0),
  status public.workflow_status not null default 'draft',
  change_note text,
  based_on_workflow_id uuid references public.service_workflows (id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (service_id, version)
);
-- one published and at most one draft version per service
create unique index service_workflows_one_published on public.service_workflows (service_id) where status = 'published';
create unique index service_workflows_one_draft on public.service_workflows (service_id) where status = 'draft';

alter table public.services
  add constraint services_current_workflow_fkey foreign key (current_workflow_id) references public.service_workflows (id) on delete restrict;

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.service_workflows (id) on delete cascade,
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]*$'),
  sort_order int not null,
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text,
  description text,
  client_instructions text,
  is_required boolean not null default true,
  duration_value int not null default 1 check (duration_value > 0),
  duration_unit public.duration_unit not null default 'business_days', -- matches app_settings.work_week.sla_unit
  assignee_type public.assignee_type not null default 'request_owner',
  assignee_role_id uuid references public.roles (id) on delete restrict,
  assignee_department_id uuid references public.departments (id) on delete restrict,
  assignee_employee_id uuid references public.employees (id) on delete restrict,
  requires_approval boolean not null default false,
  approver_role_id uuid references public.roles (id) on delete restrict,
  client_action_required boolean not null default false,
  is_client_visible boolean not null default true,
  completion_status_label_ar text,
  completion_status_label_en text,
  sets_request_status public.request_status,
  auto_create_task boolean not null default false,
  conditions jsonb, -- reserved for branching (PROJECT_PLAN §8.7) — not evaluated in the MVP
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, step_key),
  -- deferrable so a single statement can shift/reorder steps
  constraint workflow_steps_order_unique unique (workflow_id, sort_order) deferrable initially deferred
);
comment on column public.workflow_steps.step_key is 'Stable key across versions (reports + diff). Generated from name_en when empty.';

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text,
  description_ar text,
  allowed_mime text[] not null default array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
  max_size_mb int not null default 10 check (max_size_mb between 1 and 50),
  has_expiry boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.required_fields (
  id uuid primary key default gen_random_uuid(),
  workflow_step_id uuid not null references public.workflow_steps (id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]*$'),
  label_ar text not null check (length(trim(label_ar)) > 0),
  label_en text,
  field_type public.field_type not null default 'text',
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  validation jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  is_required boolean not null default true,
  filled_by public.field_filler not null default 'client',
  help_text text,
  sort_order int not null default 0,
  maps_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_step_id, field_key)
);
comment on column public.required_fields.options is 'select/multiselect: [{"value":"x","label_ar":"…","label_en":"…"}]';
comment on column public.required_fields.validation is '{"min":…,"max":…,"min_length":…,"max_length":…,"regex":"…"}';
comment on column public.required_fields.maps_to is 'Optional target in a business-line module, e.g. company_files.capital (Phase 6).';

create table public.required_documents (
  id uuid primary key default gen_random_uuid(),
  workflow_step_id uuid not null references public.workflow_steps (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id) on delete restrict,
  is_required boolean not null default true,
  instructions_ar text,
  instructions_en text,
  max_files int not null default 1 check (max_files between 1 and 20),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_step_id, document_type_id)
);

create index workflow_steps_workflow_idx on public.workflow_steps (workflow_id, sort_order);
create index required_fields_step_idx on public.required_fields (workflow_step_id, sort_order);
create index required_documents_step_idx on public.required_documents (workflow_step_id, sort_order);
create index required_documents_type_idx on public.required_documents (document_type_id);

-- updated_at
create trigger service_categories_updated_at before update on public.service_categories for each row execute function app.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function app.set_updated_at();
create trigger service_workflows_updated_at before update on public.service_workflows for each row execute function app.set_updated_at();
create trigger workflow_steps_updated_at before update on public.workflow_steps for each row execute function app.set_updated_at();
create trigger document_types_updated_at before update on public.document_types for each row execute function app.set_updated_at();
create trigger required_fields_updated_at before update on public.required_fields for each row execute function app.set_updated_at();
create trigger required_documents_updated_at before update on public.required_documents for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- "Tax Card" -> "tax_card"; falls back to p_fallback when nothing latin remains.
create or replace function app.slug_key(p_text text, p_fallback text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when s = '' then p_fallback
    when s ~ '^[a-z]' then left(s, 48)
    else p_fallback || '_' || left(s, 40)
  end
  from (select trim(both '_' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'g')) as s) x
$$;

-- Running (not completed / cancelled) requests on a workflow version.
-- service_requests is created in Phase 4; until then the answer is always 0.
create or replace function app.running_requests(p_workflow_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v int := 0;
begin
  if p_workflow_id is null or to_regclass('public.service_requests') is null then
    return 0;
  end if;
  execute 'select count(*)::int from public.service_requests where workflow_id = $1 and status not in (''completed'', ''cancelled'')'
    into v using p_workflow_id;
  return v;
end;
$$;
revoke execute on function app.running_requests(uuid) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- Defaults (keys, ordering, assignment normalisation)
-- ---------------------------------------------------------------------
create or replace function app.workflow_step_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
  n int := 1;
begin
  -- keep only the assignee id that matches the assignee type
  if new.assignee_type <> 'role' then new.assignee_role_id := null; end if;
  if new.assignee_type <> 'department' then new.assignee_department_id := null; end if;
  if new.assignee_type <> 'employee' then new.assignee_employee_id := null; end if;
  if not new.requires_approval then new.approver_role_id := null; end if;
  new.name_ar := trim(new.name_ar);

  if coalesce(new.step_key, '') = '' then
    v_base := app.slug_key(new.name_en, 'step');
    v_key := v_base;
    while exists (select 1 from public.workflow_steps
                  where workflow_id = new.workflow_id and step_key = v_key and id <> new.id) loop
      n := n + 1;
      v_key := v_base || '_' || n;
    end loop;
    new.step_key := v_key;
  end if;

  if new.sort_order is null then
    new.sort_order := coalesce((select max(sort_order) from public.workflow_steps where workflow_id = new.workflow_id), 0) + 1;
  end if;
  return new;
end;
$$;
create trigger workflow_steps_defaults before insert or update on public.workflow_steps
  for each row execute function app.workflow_step_defaults();

create or replace function app.required_field_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
  n int := 1;
begin
  new.label_ar := trim(new.label_ar);
  if coalesce(new.field_key, '') = '' then
    v_base := app.slug_key(new.label_en, 'field');
    v_key := v_base;
    while exists (select 1 from public.required_fields
                  where workflow_step_id = new.workflow_step_id and field_key = v_key and id <> new.id) loop
      n := n + 1;
      v_key := v_base || '_' || n;
    end loop;
    new.field_key := v_key;
  end if;
  if new.field_type not in ('select', 'multiselect') then
    new.options := '[]'::jsonb;
  end if;
  return new;
end;
$$;
create trigger required_fields_defaults before insert or update on public.required_fields
  for each row execute function app.required_field_defaults();

-- ---------------------------------------------------------------------
-- Locks: only draft versions are editable
-- ---------------------------------------------------------------------
-- Steps / fields / documents: the parent version must be a draft (before and after the change).
-- Nested ifs: PL/pgSQL does not short-circuit, so each table's columns are read only on that table.
create or replace function app.guard_workflow_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_wf uuid;
  v_old_wf uuid;
  v_status public.workflow_status;
begin
  if tg_table_name = 'workflow_steps' then
    if tg_op <> 'DELETE' then v_new_wf := new.workflow_id; end if;
    if tg_op <> 'INSERT' then v_old_wf := old.workflow_id; end if;
  else
    if tg_op <> 'DELETE' then
      v_new_wf := (select workflow_id from public.workflow_steps where id = new.workflow_step_id);
    end if;
    if tg_op <> 'INSERT' then
      v_old_wf := (select workflow_id from public.workflow_steps where id = old.workflow_step_id);
    end if;
  end if;

  if tg_op = 'UPDATE' and v_new_wf is distinct from v_old_wf then
    raise exception 'workflow content cannot be moved between versions' using errcode = '55000';
  end if;

  -- parent already gone (cascade from a deleted draft) -> nothing to protect
  select status into v_status from public.service_workflows where id = coalesce(v_new_wf, v_old_wf);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'workflow version is % and cannot be modified — create a new draft', v_status
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger workflow_steps_lock before insert or update or delete on public.workflow_steps
  for each row execute function app.guard_workflow_content();
create trigger required_fields_lock before insert or update or delete on public.required_fields
  for each row execute function app.guard_workflow_content();
create trigger required_documents_lock before insert or update or delete on public.required_documents
  for each row execute function app.guard_workflow_content();

-- Versions: created as drafts, published/archived only through publish_workflow(), never deleted once published.
create or replace function app.guard_workflow_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publishing boolean := coalesce(current_setting('app.action_key', true), '') = 'workflow.publish';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'new workflow versions start as drafts' using errcode = '55000';
    end if;
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft versions can be deleted' using errcode = '55000';
    end if;
    return old;
  end if;

  if new.service_id <> old.service_id or new.version <> old.version
     or new.based_on_workflow_id is distinct from old.based_on_workflow_id then
    raise exception 'workflow version identity cannot be changed' using errcode = '55000';
  end if;

  if new.status is distinct from old.status then
    if not v_publishing then
      raise exception 'version status changes only through publish_workflow()' using errcode = '55000';
    end if;
    if not ((old.status = 'draft' and new.status = 'published') or (old.status = 'published' and new.status = 'archived')) then
      raise exception 'invalid version transition % -> %', old.status, new.status using errcode = '55000';
    end if;
  elsif old.status <> 'draft' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'workflow version is % and cannot be modified', old.status using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger service_workflows_lock before insert or update or delete on public.service_workflows
  for each row execute function app.guard_workflow_version();

-- Services: current_workflow_id is owned by publish_workflow(); soft delete needs "delete".
create or replace function app.guard_service_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.current_workflow_id := null;
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    return new;
  end if;
  if new.current_workflow_id is distinct from old.current_workflow_id
     and coalesce(current_setting('app.action_key', true), '') <> 'workflow.publish' then
    raise exception 'the current workflow changes only by publishing a version' using errcode = '55000';
  end if;
  if (select auth.uid()) is not null and new.deleted_at is not null and old.deleted_at is null
     and not app.has_permission('services_config', 'delete') then
    raise exception 'delete permission required' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.is_active := false;
  end if;
  return new;
end;
$$;
create trigger services_guard before insert or update on public.services
  for each row execute function app.guard_service_changes();

-- A new service starts with an empty v1 draft.
create or replace function app.service_initial_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_workflows (service_id, version, status, change_note)
  values (new.id, 1, 'draft', null);
  return new;
end;
$$;
create trigger services_initial_draft after insert on public.services
  for each row execute function app.service_initial_draft();

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
create trigger audit_service_categories after insert or update or delete on public.service_categories
  for each row execute function app.audit_row_change('id', 'key');
create trigger audit_services after insert or update or delete on public.services
  for each row execute function app.audit_row_change('id', 'code');
create trigger audit_service_workflows after insert or update or delete on public.service_workflows
  for each row execute function app.audit_row_change('id', 'version');
create trigger audit_workflow_steps after insert or update or delete on public.workflow_steps
  for each row execute function app.audit_row_change('id', 'step_key');
create trigger audit_required_fields after insert or update or delete on public.required_fields
  for each row execute function app.audit_row_change('id', 'field_key');
create trigger audit_required_documents after insert or update or delete on public.required_documents
  for each row execute function app.audit_row_change('id');
create trigger audit_document_types after insert or update or delete on public.document_types
  for each row execute function app.audit_row_change('id', 'key');

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Copies a version (steps + fields + documents) into a new draft of the same service.
create or replace function public.clone_workflow_as_draft(p_workflow_id uuid, p_change_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.service_workflows;
  v_new uuid;
  v_draft uuid;
  v_step record;
  v_new_step uuid;
begin
  if not app.has_permission('services_config', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_src from public.service_workflows where id = p_workflow_id;
  if not found then
    raise exception 'workflow not found' using errcode = 'P0002';
  end if;
  -- serialise version numbering per service
  perform 1 from public.services where id = v_src.service_id for update;
  select id into v_draft from public.service_workflows where service_id = v_src.service_id and status = 'draft';
  if v_draft is not null then
    raise exception 'draft exists:%', v_draft using errcode = 'P0001';
  end if;

  perform set_config('app.action_key', 'workflow.clone', true);
  insert into public.service_workflows (service_id, version, status, change_note, based_on_workflow_id)
  values (v_src.service_id,
          (select max(version) + 1 from public.service_workflows where service_id = v_src.service_id),
          'draft', p_change_note, v_src.id)
  returning id into v_new;

  for v_step in select * from public.workflow_steps where workflow_id = v_src.id order by sort_order loop
    insert into public.workflow_steps (
      workflow_id, step_key, sort_order, name_ar, name_en, description, client_instructions, is_required,
      duration_value, duration_unit, assignee_type, assignee_role_id, assignee_department_id, assignee_employee_id,
      requires_approval, approver_role_id, client_action_required, is_client_visible,
      completion_status_label_ar, completion_status_label_en, sets_request_status, auto_create_task, conditions)
    values (
      v_new, v_step.step_key, v_step.sort_order, v_step.name_ar, v_step.name_en, v_step.description, v_step.client_instructions, v_step.is_required,
      v_step.duration_value, v_step.duration_unit, v_step.assignee_type, v_step.assignee_role_id, v_step.assignee_department_id, v_step.assignee_employee_id,
      v_step.requires_approval, v_step.approver_role_id, v_step.client_action_required, v_step.is_client_visible,
      v_step.completion_status_label_ar, v_step.completion_status_label_en, v_step.sets_request_status, v_step.auto_create_task, v_step.conditions)
    returning id into v_new_step;

    insert into public.required_fields (workflow_step_id, field_key, label_ar, label_en, field_type, options, validation,
                                        is_required, filled_by, help_text, sort_order, maps_to)
    select v_new_step, field_key, label_ar, label_en, field_type, options, validation, is_required, filled_by, help_text, sort_order, maps_to
    from public.required_fields where workflow_step_id = v_step.id;

    insert into public.required_documents (workflow_step_id, document_type_id, is_required, instructions_ar, instructions_en, max_files, sort_order)
    select v_new_step, document_type_id, is_required, instructions_ar, instructions_en, max_files, sort_order
    from public.required_documents where workflow_step_id = v_step.id;
  end loop;
  return v_new;
end;
$$;

-- Opens a draft for a service: a copy of the published version, or an empty one if nothing was published yet.
create or replace function public.create_workflow_draft(p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published uuid;
  v_draft uuid;
begin
  if not app.has_permission('services_config', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform 1 from public.services where id = p_service_id and deleted_at is null for update;
  if not found then
    raise exception 'service not found' using errcode = 'P0002';
  end if;
  select id into v_draft from public.service_workflows where service_id = p_service_id and status = 'draft';
  if v_draft is not null then
    return v_draft;
  end if;
  select id into v_published from public.service_workflows where service_id = p_service_id and status = 'published';
  if v_published is not null then
    return public.clone_workflow_as_draft(v_published);
  end if;
  insert into public.service_workflows (service_id, version, status)
  values (p_service_id, coalesce((select max(version) from public.service_workflows where service_id = p_service_id), 0) + 1, 'draft')
  returning id into v_draft;
  return v_draft;
end;
$$;

-- Inserts a step at a 1-based position (shifting the following steps). Returns the new step id.
create or replace function public.insert_workflow_step(
  p_workflow_id uuid,
  p_position int,
  p_name_ar text,
  p_name_en text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_pos int;
  v_id uuid;
begin
  if not app.has_permission('services_config', 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform 1 from public.service_workflows where id = p_workflow_id for update;
  if not found then
    raise exception 'workflow not found' using errcode = 'P0002';
  end if;
  perform app.renumber_steps(p_workflow_id);
  select count(*) into v_count from public.workflow_steps where workflow_id = p_workflow_id;
  v_pos := greatest(1, least(coalesce(p_position, v_count + 1), v_count + 1));

  update public.workflow_steps set sort_order = sort_order + 1
  where workflow_id = p_workflow_id and sort_order >= v_pos;
  insert into public.workflow_steps (workflow_id, sort_order, name_ar, name_en)
  values (p_workflow_id, v_pos, p_name_ar, nullif(trim(p_name_en), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Makes sort_order contiguous (1..n) keeping the current order. Internal.
create or replace function app.renumber_steps(p_workflow_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.workflow_steps s set sort_order = o.rn
  from (select id, row_number() over (order by sort_order, created_at) as rn
        from public.workflow_steps where workflow_id = p_workflow_id) o
  where s.id = o.id and s.sort_order <> o.rn
$$;
revoke execute on function app.renumber_steps(uuid) from authenticated, anon, public;

-- Sets the order of all steps of a draft. p_step_ids must contain every step exactly once.
create or replace function public.reorder_workflow_steps(p_workflow_id uuid, p_step_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('services_config', 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform 1 from public.service_workflows where id = p_workflow_id for update;
  if not found then
    raise exception 'workflow not found' using errcode = 'P0002';
  end if;
  if coalesce(cardinality(p_step_ids), 0) <> (select count(*) from public.workflow_steps where workflow_id = p_workflow_id)
     or (select count(distinct x) from unnest(p_step_ids) x) <> cardinality(p_step_ids)
     or exists (select 1 from unnest(p_step_ids) x
                where not exists (select 1 from public.workflow_steps s where s.id = x and s.workflow_id = p_workflow_id)) then
    raise exception 'the new order must list every step of the version exactly once' using errcode = 'P0001';
  end if;
  update public.workflow_steps s set sort_order = o.ord
  from unnest(p_step_ids) with ordinality as o(id, ord)
  where s.id = o.id and s.sort_order <> o.ord;
end;
$$;

-- Removes a step from a draft and closes the gap.
create or replace function public.delete_workflow_step(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wf uuid;
begin
  if not app.has_permission('services_config', 'delete') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select workflow_id into v_wf from public.workflow_steps where id = p_step_id;
  if v_wf is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  delete from public.workflow_steps where id = p_step_id;
  perform app.renumber_steps(v_wf);
end;
$$;

-- Problems that block publishing. Empty result = valid.
create or replace function public.validate_workflow(p_workflow_id uuid)
returns table (step_id uuid, step_key text, step_name text, issue text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not app.has_permission('services_config', 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  select null::uuid, null::text, null::text, 'no_steps'::text, null::text
  where not exists (select 1 from public.workflow_steps where workflow_id = p_workflow_id)
  union all
  select s.id, s.step_key, s.name_ar, 'assignee_missing', s.assignee_type::text
  from public.workflow_steps s
  where s.workflow_id = p_workflow_id
    and ((s.assignee_type = 'role' and s.assignee_role_id is null)
      or (s.assignee_type = 'department' and s.assignee_department_id is null)
      or (s.assignee_type = 'employee' and s.assignee_employee_id is null))
  union all
  select s.id, s.step_key, s.name_ar, 'assignee_inactive', s.assignee_type::text
  from public.workflow_steps s
  left join public.employees e on e.id = s.assignee_employee_id
  left join public.departments d on d.id = s.assignee_department_id
  where s.workflow_id = p_workflow_id
    and ((s.assignee_type = 'employee' and e.status is distinct from 'active')
      or (s.assignee_type = 'department' and d.is_active is false))
    and coalesce(s.assignee_employee_id, s.assignee_department_id) is not null
  union all
  select s.id, s.step_key, s.name_ar, 'approver_missing', null
  from public.workflow_steps s
  where s.workflow_id = p_workflow_id and s.requires_approval and s.approver_role_id is null
  union all
  select s.id, s.step_key, s.name_ar, 'hidden_client_step', null
  from public.workflow_steps s
  where s.workflow_id = p_workflow_id and s.client_action_required and not s.is_client_visible
  union all
  select s.id, s.step_key, s.name_ar, 'options_missing', f.field_key
  from public.workflow_steps s
  join public.required_fields f on f.workflow_step_id = s.id
  where s.workflow_id = p_workflow_id and f.field_type in ('select', 'multiselect') and jsonb_array_length(f.options) = 0
  union all
  select s.id, s.step_key, s.name_ar, 'inactive_document_type', dt.key
  from public.workflow_steps s
  join public.required_documents rd on rd.workflow_step_id = s.id
  join public.document_types dt on dt.id = rd.document_type_id
  where s.workflow_id = p_workflow_id and not dt.is_active;
end;
$$;

-- Number of running requests on a version (for the "N requests stay on vX" warning).
create or replace function public.workflow_running_requests(p_workflow_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('services_config', 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return app.running_requests(p_workflow_id);
end;
$$;

-- Publishes a draft: validates, archives the previous published version, points the service at the new one.
-- Returns {workflow_id, version, previous_workflow_id, previous_version, running_on_previous, note}.
create or replace function public.publish_workflow(p_workflow_id uuid, p_change_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wf public.service_workflows;
  v_prev public.service_workflows;
  v_issues int;
  v_running int := 0;
begin
  if not app.has_permission('services_config', 'approve') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_wf from public.service_workflows where id = p_workflow_id;
  if not found then
    raise exception 'workflow not found' using errcode = 'P0002';
  end if;
  perform 1 from public.services where id = v_wf.service_id for update;
  select * into v_wf from public.service_workflows where id = p_workflow_id for update;
  if v_wf.status <> 'draft' then
    raise exception 'only a draft can be published' using errcode = 'P0001';
  end if;

  select count(*) into v_issues from public.validate_workflow(p_workflow_id);
  if v_issues > 0 then
    raise exception 'workflow is not valid (% issues)', v_issues using errcode = 'P0001', hint = 'call validate_workflow()';
  end if;

  perform set_config('app.action_key', 'workflow.publish', true);

  select * into v_prev from public.service_workflows where service_id = v_wf.service_id and status = 'published' for update;
  if found then
    v_running := app.running_requests(v_prev.id);
    update public.service_workflows set status = 'archived', archived_at = now() where id = v_prev.id;
  end if;

  update public.service_workflows
     set status = 'published', published_at = now(), published_by = (select auth.uid()),
         change_note = coalesce(nullif(trim(p_change_note), ''), change_note)
   where id = p_workflow_id;
  update public.services set current_workflow_id = p_workflow_id where id = v_wf.service_id;

  perform set_config('app.action_key', '', true);

  return jsonb_build_object(
    'workflow_id', p_workflow_id,
    'version', v_wf.version,
    'previous_workflow_id', v_prev.id,
    'previous_version', v_prev.version,
    'running_on_previous', v_running,
    'note', case when to_regclass('public.service_requests') is null
                 then 'service_requests does not exist yet (Phase 4) — running count is 0' end
  );
end;
$$;

-- Differences between two versions, matched by step_key / field_key / document type.
-- change: step_added | step_removed | step_moved | step_changed | field_added | field_removed | field_changed
--         | document_added | document_removed | document_changed
create or replace function public.workflow_diff(p_from uuid, p_to uuid)
returns table (change text, step_key text, step_name_ar text, step_name_en text, item_key text, item_name_ar text, item_name_en text, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_step_ignore text[] := array['id', 'workflow_id', 'sort_order', 'created_at', 'updated_at', 'pos'];
  c_item_ignore text[] := array['id', 'workflow_step_id', 'created_at', 'updated_at', 'step_key'];
begin
  if not app.has_permission('services_config', 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  with a as (
    select s.*, row_number() over (order by s.sort_order)::int as pos from public.workflow_steps s where s.workflow_id = p_from
  ), b as (
    select s.*, row_number() over (order by s.sort_order)::int as pos from public.workflow_steps s where s.workflow_id = p_to
  ), fa as (
    select a.step_key, f.* from a join public.required_fields f on f.workflow_step_id = a.id
  ), fb as (
    select b.step_key, f.* from b join public.required_fields f on f.workflow_step_id = b.id
  ), da as (
    select a.step_key, d.*, dt.key as type_key, dt.name_ar as type_ar, dt.name_en as type_en
    from a join public.required_documents d on d.workflow_step_id = a.id join public.document_types dt on dt.id = d.document_type_id
  ), db as (
    select b.step_key, d.*, dt.key as type_key, dt.name_ar as type_ar, dt.name_en as type_en
    from b join public.required_documents d on d.workflow_step_id = b.id join public.document_types dt on dt.id = d.document_type_id
  ), changes as (
    select 1 as grp, b.pos as ord, 'step_added' as change, b.step_key, b.name_ar, b.name_en,
           null::text as item_key, null::text as item_ar, null::text as item_en,
           jsonb_build_object('position', b.pos) as detail
    from b where not exists (select 1 from a where a.step_key = b.step_key)
    union all
    select 1, a.pos, 'step_removed', a.step_key, a.name_ar, a.name_en, null, null, null, jsonb_build_object('position', a.pos)
    from a where not exists (select 1 from b where b.step_key = a.step_key)
    union all
    -- "moved" = relative order among the steps present in both versions changed
    -- (steps that only shift because another step was added/removed are not reported)
    select 1, b.pos, 'step_moved', b.step_key, b.name_ar, b.name_en, null, null, null, jsonb_build_object('from', a.pos, 'to', b.pos)
    from (select a.*, row_number() over (order by a.pos) as cr from a where exists (select 1 from b where b.step_key = a.step_key)) a
    join (select b.*, row_number() over (order by b.pos) as cr from b where exists (select 1 from a where a.step_key = b.step_key)) b
      on b.step_key = a.step_key
    where a.cr <> b.cr
    union all
    select 1, b.pos, 'step_changed', b.step_key, b.name_ar, b.name_en, null, null, null,
           jsonb_build_object('fields', (select jsonb_agg(k order by k)
                                         from jsonb_object_keys(to_jsonb(b) - c_step_ignore) k
                                         where (to_jsonb(b) -> k) is distinct from (to_jsonb(a) -> k)))
    from a join b on b.step_key = a.step_key
    where (to_jsonb(a) - c_step_ignore) <> (to_jsonb(b) - c_step_ignore)
    union all
    select 2, coalesce(b.pos, 0), 'field_added', fb.step_key, b.name_ar, b.name_en, fb.field_key, fb.label_ar, fb.label_en,
           jsonb_build_object('field_type', fb.field_type)
    from fb join b on b.step_key = fb.step_key
    where not exists (select 1 from fa where fa.step_key = fb.step_key and fa.field_key = fb.field_key)
    union all
    select 2, coalesce(a.pos, 0), 'field_removed', fa.step_key, a.name_ar, a.name_en, fa.field_key, fa.label_ar, fa.label_en, '{}'::jsonb
    from fa join a on a.step_key = fa.step_key
    where not exists (select 1 from fb where fb.step_key = fa.step_key and fb.field_key = fa.field_key)
    union all
    select 2, b.pos, 'field_changed', fb.step_key, b.name_ar, b.name_en, fb.field_key, fb.label_ar, fb.label_en,
           jsonb_build_object('fields', (select jsonb_agg(k order by k)
                                         from jsonb_object_keys(to_jsonb(fb) - c_item_ignore) k
                                         where (to_jsonb(fb) -> k) is distinct from (to_jsonb(fa) -> k)))
    from fa join fb on fb.step_key = fa.step_key and fb.field_key = fa.field_key join b on b.step_key = fb.step_key
    where (to_jsonb(fa) - c_item_ignore) <> (to_jsonb(fb) - c_item_ignore)
    union all
    select 3, b.pos, 'document_added', db.step_key, b.name_ar, b.name_en, db.type_key, db.type_ar, db.type_en,
           jsonb_build_object('is_required', db.is_required)
    from db join b on b.step_key = db.step_key
    where not exists (select 1 from da where da.step_key = db.step_key and da.document_type_id = db.document_type_id)
    union all
    select 3, a.pos, 'document_removed', da.step_key, a.name_ar, a.name_en, da.type_key, da.type_ar, da.type_en, '{}'::jsonb
    from da join a on a.step_key = da.step_key
    where not exists (select 1 from db where db.step_key = da.step_key and db.document_type_id = da.document_type_id)
    union all
    select 3, b.pos, 'document_changed', db.step_key, b.name_ar, b.name_en, db.type_key, db.type_ar, db.type_en,
           jsonb_build_object('fields', (select jsonb_agg(k order by k)
                                         from jsonb_object_keys(to_jsonb(db) - c_item_ignore - array['type_key', 'type_ar', 'type_en', 'sort_order']) k
                                         where (to_jsonb(db) -> k) is distinct from (to_jsonb(da) -> k)))
    from da join db on db.step_key = da.step_key and db.document_type_id = da.document_type_id join b on b.step_key = db.step_key
    where (to_jsonb(da) - c_item_ignore - array['type_key', 'type_ar', 'type_en', 'sort_order'])
       <> (to_jsonb(db) - c_item_ignore - array['type_key', 'type_ar', 'type_en', 'sort_order'])
  )
  select c.change, c.step_key, c.name_ar, c.name_en, c.item_key, c.item_ar, c.item_en, c.detail
  from changes c
  order by c.ord, c.grp, c.change, c.item_key;
end;
$$;

revoke execute on function public.clone_workflow_as_draft(uuid, text) from anon, public;
revoke execute on function public.create_workflow_draft(uuid) from anon, public;
revoke execute on function public.insert_workflow_step(uuid, int, text, text) from anon, public;
revoke execute on function public.reorder_workflow_steps(uuid, uuid[]) from anon, public;
revoke execute on function public.delete_workflow_step(uuid) from anon, public;
revoke execute on function public.validate_workflow(uuid) from anon, public;
revoke execute on function public.workflow_running_requests(uuid) from anon, public;
revoke execute on function public.publish_workflow(uuid, text) from anon, public;
revoke execute on function public.workflow_diff(uuid, uuid) from anon, public;
grant execute on function public.clone_workflow_as_draft(uuid, text) to authenticated;
grant execute on function public.create_workflow_draft(uuid) to authenticated;
grant execute on function public.insert_workflow_step(uuid, int, text, text) to authenticated;
grant execute on function public.reorder_workflow_steps(uuid, uuid[]) to authenticated;
grant execute on function public.delete_workflow_step(uuid) to authenticated;
grant execute on function public.validate_workflow(uuid) to authenticated;
grant execute on function public.workflow_running_requests(uuid) to authenticated;
grant execute on function public.publish_workflow(uuid, text) to authenticated;
grant execute on function public.workflow_diff(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_workflows enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.document_types enable row level security;
alter table public.required_fields enable row level security;
alter table public.required_documents enable row level security;

-- categories: staff read all; clients read active ones (client app, Phase 5)
create policy service_categories_select on public.service_categories for select to authenticated
  using (app.is_staff() or is_active);
create policy service_categories_insert on public.service_categories for insert to authenticated
  with check (app.has_permission('services_config', 'create'));
create policy service_categories_update on public.service_categories for update to authenticated
  using (app.has_permission('services_config', 'edit')) with check (app.has_permission('services_config', 'edit'));
create policy service_categories_delete on public.service_categories for delete to authenticated
  using (app.has_permission('services_config', 'delete'));

-- services: staff read all (request creation needs them); clients read active, client-visible ones
create policy services_staff_select on public.services for select to authenticated
  using (deleted_at is null and app.is_staff());
create policy services_client_select on public.services for select to authenticated
  using (deleted_at is null and is_active and is_client_visible);
create policy services_insert on public.services for insert to authenticated
  with check (app.has_permission('services_config', 'create'));
create policy services_update on public.services for update to authenticated
  using (deleted_at is null and (app.has_permission('services_config', 'edit') or app.has_permission('services_config', 'delete')))
  with check (app.is_staff());

-- versions: read for staff; created by RPC; only the change note of a draft is editable directly
create policy service_workflows_select on public.service_workflows for select to authenticated using (app.is_staff());
create policy service_workflows_update on public.service_workflows for update to authenticated
  using (status = 'draft' and app.has_permission('services_config', 'edit'))
  with check (status = 'draft' and app.has_permission('services_config', 'edit'));
create policy service_workflows_delete on public.service_workflows for delete to authenticated
  using (status = 'draft' and app.has_permission('services_config', 'edit'));
revoke update on public.service_workflows from authenticated;
grant update (change_note) on public.service_workflows to authenticated;

-- steps: read for staff; settings editable directly (draft lock in trigger); insert/delete/reorder via RPC
create policy workflow_steps_select on public.workflow_steps for select to authenticated using (app.is_staff());
create policy workflow_steps_update on public.workflow_steps for update to authenticated
  using (app.has_permission('services_config', 'edit')) with check (app.has_permission('services_config', 'edit'));
-- position and parent change only through the RPCs
revoke update on public.workflow_steps from authenticated;
grant update (step_key, name_ar, name_en, description, client_instructions, is_required, duration_value, duration_unit,
  assignee_type, assignee_role_id, assignee_department_id, assignee_employee_id, requires_approval, approver_role_id,
  client_action_required, is_client_visible, completion_status_label_ar, completion_status_label_en,
  sets_request_status, auto_create_task) on public.workflow_steps to authenticated;

-- fields & documents of a step: edited directly (draft lock in trigger)
create policy required_fields_select on public.required_fields for select to authenticated using (app.is_staff());
create policy required_fields_write on public.required_fields for all to authenticated
  using (app.has_permission('services_config', 'edit')) with check (app.has_permission('services_config', 'edit'));
create policy required_documents_select on public.required_documents for select to authenticated using (app.is_staff());
create policy required_documents_write on public.required_documents for all to authenticated
  using (app.has_permission('services_config', 'edit')) with check (app.has_permission('services_config', 'edit'));

-- document type catalog: everyone signed in reads active types (names shown in the client app)
create policy document_types_select on public.document_types for select to authenticated
  using (app.is_staff() or is_active);
create policy document_types_insert on public.document_types for insert to authenticated
  with check (app.has_permission('services_config', 'edit'));
create policy document_types_update on public.document_types for update to authenticated
  using (app.has_permission('services_config', 'edit')) with check (app.has_permission('services_config', 'edit'));
create policy document_types_delete on public.document_types for delete to authenticated
  using (app.has_permission('services_config', 'delete'));

-- ---------------------------------------------------------------------
-- Catalog data: the four business lines and the document type catalog
-- (services and their workflows are business data — samples live in seed.sql)
-- ---------------------------------------------------------------------
insert into public.service_categories (key, name_ar, name_en, icon, sort_order) values
  ('company_formation', 'تأسيس الشركات والأوراق الحكومية', 'Company formation & government papers', 'landmark', 1),
  ('insurance', 'التأمين', 'Insurance', 'shield-check', 2),
  ('real_estate', 'التسويق العقاري', 'Real estate', 'building-2', 3),
  ('loans', 'القروض التجارية', 'Commercial loans', 'banknote', 4);

insert into public.document_types (key, name_ar, name_en, has_expiry, max_size_mb, allowed_mime, sort_order) values
  ('national_id', 'بطاقة الرقم القومي', 'National ID', true, 5, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], 1),
  ('passport', 'جواز السفر', 'Passport', true, 5, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], 2),
  ('partner_ids', 'البطاقات الشخصية للشركاء', 'Partners'' IDs', true, 10, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], 3),
  ('personal_photo', 'صورة شخصية', 'Personal photo', false, 5, array['image/jpeg', 'image/png', 'image/heic'], 4),
  ('power_of_attorney', 'توكيل رسمي', 'Power of attorney', false, 10, array['application/pdf', 'image/jpeg', 'image/png'], 5),
  ('lease_contract', 'عقد إيجار المقر', 'Premises lease contract', true, 10, array['application/pdf', 'image/jpeg', 'image/png'], 6),
  ('ownership_contract', 'عقد التمليك', 'Ownership contract', false, 10, array['application/pdf', 'image/jpeg', 'image/png'], 7),
  ('utility_bill', 'فاتورة مرافق حديثة', 'Recent utility bill', false, 5, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'], 8),
  ('articles_of_association', 'عقد تأسيس الشركة', 'Articles of association', false, 20, array['application/pdf'], 9),
  ('name_reservation', 'شهادة حجز الاسم التجاري', 'Trade name reservation', true, 5, array['application/pdf', 'image/jpeg', 'image/png'], 10),
  ('capital_deposit_certificate', 'شهادة إيداع رأس المال', 'Capital deposit certificate', false, 5, array['application/pdf', 'image/jpeg', 'image/png'], 11),
  ('commercial_register', 'مستخرج السجل التجاري', 'Commercial register extract', true, 10, array['application/pdf', 'image/jpeg', 'image/png'], 12),
  ('tax_card', 'البطاقة الضريبية', 'Tax card', true, 5, array['application/pdf', 'image/jpeg', 'image/png'], 13),
  ('social_insurance_form_1', 'نموذج 1 تأمينات اجتماعية', 'Social insurance form 1', false, 5, array['application/pdf', 'image/jpeg', 'image/png'], 14),
  ('car_license', 'رخصة السيارة', 'Vehicle license', true, 5, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], 15),
  ('driving_license', 'رخصة القيادة', 'Driving license', true, 5, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf'], 16),
  ('car_photos', 'صور السيارة', 'Vehicle photos', false, 20, array['image/jpeg', 'image/png', 'image/heic'], 17),
  ('medical_report', 'تقرير طبي', 'Medical report', false, 10, array['application/pdf', 'image/jpeg', 'image/png'], 18),
  ('previous_policy', 'الوثيقة السابقة', 'Previous policy', true, 10, array['application/pdf', 'image/jpeg', 'image/png'], 19),
  ('property_photos', 'صور العقار', 'Property photos', false, 20, array['image/jpeg', 'image/png', 'image/heic'], 20),
  ('bank_statement', 'كشف حساب بنكي (6 أشهر)', 'Bank statement (6 months)', false, 20, array['application/pdf'], 21),
  ('financial_statements', 'قوائم مالية معتمدة', 'Audited financial statements', false, 20, array['application/pdf'], 22),
  ('feasibility_study', 'دراسة جدوى', 'Feasibility study', false, 20, array['application/pdf'], 23),
  ('equipment_quotation', 'عرض سعر المعدات', 'Equipment quotation', false, 10, array['application/pdf', 'image/jpeg', 'image/png'], 24),
  ('other', 'مستند آخر', 'Other document', false, 10, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'], 99);
