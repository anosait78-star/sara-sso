-- =====================================================================
-- Phase 4 · Service requests: snapshot of the published workflow, step execution
-- (complete / approve / return / skip / ad-hoc / reassign), dynamic field values,
-- document slots (manual "received" in Phase 4 — Storage upload arrives in Phase 5),
-- SLA due dates (working days), overdue flag (pg_cron) and step tasks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.request_step_status as enum ('pending', 'active', 'waiting_client', 'waiting_approval', 'completed', 'skipped', 'returned');
create type public.document_status as enum ('pending', 'uploaded', 'under_review', 'approved', 'rejected');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create sequence public.request_no_seq start 1;

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  workflow_id uuid not null references public.service_workflows (id) on delete restrict,
  status public.request_status not null default 'submitted',
  current_step_id uuid,
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  priority public.task_priority not null default 'normal',
  source text not null default 'admin' check (source in ('admin', 'client_app')),
  notes text,
  submitted_at timestamptz,
  due_at timestamptz,
  expected_completion_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  hold_reason text,
  total_amount numeric(14, 2) check (total_amount is null or total_amount >= 0),
  paid_amount numeric(14, 2) not null default 0,
  is_overdue boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
comment on column public.service_requests.workflow_id is 'Version the request started on — never changes (PROJECT_PLAN §8.2).';
create index service_requests_status_owner_idx on public.service_requests (status, owner_employee_id) where deleted_at is null;
create index service_requests_customer_idx on public.service_requests (customer_id);
create index service_requests_service_idx on public.service_requests (service_id);
create index service_requests_workflow_idx on public.service_requests (workflow_id);
create index service_requests_overdue_idx on public.service_requests (is_overdue) where status not in ('completed', 'cancelled');

create table public.service_request_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  source_step_id uuid references public.workflow_steps (id) on delete set null,
  step_key text not null,
  sort_order int not null,
  -- snapshot of the template step
  name_ar text not null,
  name_en text,
  description text,
  client_instructions text,
  is_required boolean not null default true,
  duration_value int not null default 1,
  duration_unit public.duration_unit not null default 'business_days',
  assignee_type public.assignee_type not null default 'request_owner',
  assignee_role_id uuid references public.roles (id) on delete set null,
  assignee_department_id uuid references public.departments (id) on delete set null,
  assignee_employee_id uuid references public.employees (id) on delete set null,
  requires_approval boolean not null default false,
  approver_role_id uuid references public.roles (id) on delete set null,
  client_action_required boolean not null default false,
  is_client_visible boolean not null default true,
  completion_status_label_ar text,
  completion_status_label_en text,
  sets_request_status public.request_status,
  auto_create_task boolean not null default false,
  fields_snapshot jsonb not null default '[]'::jsonb,
  is_adhoc boolean not null default false,
  -- execution
  status public.request_step_status not null default 'pending',
  assigned_employee_id uuid references public.employees (id) on delete set null,
  assigned_department_id uuid references public.departments (id) on delete set null,
  started_at timestamptz,
  due_at timestamptz,
  submitted_by uuid references public.employees (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.employees (id) on delete set null,
  approved_by uuid references public.employees (id) on delete set null,
  approved_at timestamptz,
  return_reason text,
  skip_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_steps_order_unique unique (request_id, sort_order) deferrable initially deferred
);
comment on column public.service_request_steps.fields_snapshot is 'Field definitions copied from required_fields when the request was created.';
create index service_request_steps_request_idx on public.service_request_steps (request_id, sort_order);
create index service_request_steps_assignee_idx on public.service_request_steps (assigned_employee_id, status);
create index service_request_steps_department_idx on public.service_request_steps (assigned_department_id, status);

alter table public.service_requests
  add constraint service_requests_current_step_fkey foreign key (current_step_id) references public.service_request_steps (id) on delete set null;

create table public.request_field_values (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  request_step_id uuid not null references public.service_request_steps (id) on delete cascade,
  field_key text not null,
  field_type public.field_type not null,
  value jsonb not null,
  filled_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_step_id, field_key)
);
create index request_field_values_request_idx on public.request_field_values (request_id);

create table public.rejection_reasons (
  id uuid primary key default gen_random_uuid(),
  text_ar text not null,
  text_en text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  request_id uuid references public.service_requests (id) on delete cascade,
  request_step_id uuid references public.service_request_steps (id) on delete set null,
  document_type_id uuid not null references public.document_types (id) on delete restrict,
  name_ar text not null,
  name_en text,
  is_required boolean not null default true,
  instructions_ar text,
  max_files int not null default 1,
  status public.document_status not null default 'pending',
  received_physically boolean not null default false,
  review_note text,
  rejection_reason_id uuid references public.rejection_reasons (id) on delete set null,
  rejection_note text,
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_at timestamptz,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.documents.received_physically is 'Phase 4: staff confirmed the original/paper copy at the office (no file uploaded).';
create index documents_customer_idx on public.documents (customer_id);
create index documents_request_idx on public.documents (request_id, request_step_id);
create index documents_review_queue_idx on public.documents (status) where status in ('uploaded', 'under_review');

-- tasks and timeline get a request link
alter table public.tasks
  add column service_request_id uuid references public.service_requests (id) on delete cascade,
  add column request_step_id uuid references public.service_request_steps (id) on delete set null;
create index tasks_request_idx on public.tasks (service_request_id);
create index tasks_request_step_idx on public.tasks (request_step_id);

alter table public.activity_events
  add column service_request_id uuid references public.service_requests (id) on delete cascade;
create index activity_events_request_idx on public.activity_events (service_request_id, occurred_at desc);

-- updated_at
create trigger service_requests_updated_at before update on public.service_requests for each row execute function app.set_updated_at();
create trigger service_request_steps_updated_at before update on public.service_request_steps for each row execute function app.set_updated_at();
create trigger request_field_values_updated_at before update on public.request_field_values for each row execute function app.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- Catalog data
-- ---------------------------------------------------------------------
insert into public.rejection_reasons (text_ar, text_en, sort_order) values
  ('الصورة غير واضحة', 'Image is not clear', 1),
  ('المستند منتهي الصلاحية', 'Document has expired', 2),
  ('الاسم غير مطابق', 'Name does not match', 3),
  ('المستند ناقص (صفحات أو وجه واحد)', 'Document is incomplete', 4),
  ('مستند غير المطلوب', 'Wrong document', 5),
  ('أخرى', 'Other', 99);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- SLA arithmetic. business_days skips non-working days (app_settings.work_week, Cairo time).
-- Official holidays are a later enhancement (PROJECT_PLAN §22).
create or replace function app.add_duration(p_from timestamptz, p_value int, p_unit public.duration_unit)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v timestamptz := p_from;
  n int := 0;
  wd int[];
begin
  if p_unit = 'hours' then
    return p_from + make_interval(hours => p_value);
  elsif p_unit = 'days' then
    return p_from + make_interval(days => p_value);
  end if;
  select array(select jsonb_array_elements_text(value -> 'working_days')::int) into wd
  from public.app_settings where key = 'work_week';
  if wd is null or cardinality(wd) = 0 then
    wd := array[0, 1, 2, 3, 4]; -- Sunday..Thursday
  end if;
  while n < p_value loop
    v := v + interval '1 day';
    if extract(dow from v at time zone 'Africa/Cairo')::int = any (wd) then
      n := n + 1;
    end if;
  end loop;
  return v;
end;
$$;

-- Request visibility: the service_requests scope (own = owner, department = owning department),
-- plus anyone holding the permission who is assigned to one of its steps (personally or via department).
create or replace function app.can_request(p_request uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_requests r
    where r.id = p_request and r.deleted_at is null
      and (
        app.can('service_requests', p_action, r.owner_employee_id, r.department_id)
        or (app.perm_scope('service_requests', p_action) is not null and exists (
              select 1 from public.service_request_steps s
              where s.request_id = r.id
                and (s.assigned_employee_id = app.current_employee_id()
                     or (app.perm_scope('service_requests', p_action) = 'department'
                         and s.assigned_department_id = app.current_department_id()))))
      )
  )
$$;

-- Active employee for a step: the preferred one (request owner) when eligible, otherwise the least loaded.
create or replace function app.pick_employee(p_role uuid, p_department uuid, p_prefer uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.status = 'active' and p.is_active
    and (p_role is null or e.role_id = p_role)
    and (p_department is null or e.department_id = p_department)
  order by (e.id = p_prefer) desc nulls last,
           (select count(*) from public.service_request_steps s
             where s.assigned_employee_id = e.id and s.status in ('active', 'waiting_client', 'waiting_approval', 'returned')),
           e.created_at
  limit 1
$$;

create or replace function app.log_request_event(
  p_request uuid, p_type text, p_ar text, p_en text, p_payload jsonb default '{}'::jsonb, p_client boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  insert into public.activity_events (customer_id, service_request_id, event_type, summary_ar, summary_en, payload, actor_user_id, actor_name, visible_to_client)
  select r.customer_id, r.id, p_type, p_ar, p_en, coalesce(p_payload, '{}'::jsonb), v_uid,
         (select full_name from public.profiles where id = v_uid), p_client
  from public.service_requests r where r.id = p_request;
end;
$$;

-- Missing requirements of a step: required fields without a value, required documents not approved.
create or replace function public.request_step_missing(p_step_id uuid)
returns table (kind text, item_key text, name_ar text, name_en text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'field', f ->> 'field_key', f ->> 'label_ar', f ->> 'label_en'
  from public.service_request_steps s, jsonb_array_elements(s.fields_snapshot) f
  where s.id = p_step_id and app.can_request(s.request_id, 'view')
    and coalesce((f ->> 'is_required')::boolean, false)
    and not exists (select 1 from public.request_field_values v where v.request_step_id = s.id and v.field_key = f ->> 'field_key')
  union all
  select 'document', d.id::text, d.name_ar, d.name_en
  from public.documents d
  join public.service_request_steps s on s.id = d.request_step_id
  where d.request_step_id = p_step_id and app.can_request(s.request_id, 'view')
    and d.is_required and d.status <> 'approved'
$$;

-- ---------------------------------------------------------------------
-- Engine internals (called by the RPCs below; not callable by users)
-- ---------------------------------------------------------------------
create or replace function app.activate_step(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  r public.service_requests;
  v_emp uuid;
  v_dept uuid;
  v_due timestamptz;
begin
  select * into s from public.service_request_steps where id = p_step_id for update;
  select * into r from public.service_requests where id = s.request_id for update;

  if s.assignee_type = 'request_owner' then
    v_emp := r.owner_employee_id;
  elsif s.assignee_type = 'employee' then
    v_emp := s.assignee_employee_id;
  elsif s.assignee_type = 'department' then
    v_dept := s.assignee_department_id;
    v_emp := app.pick_employee(null, v_dept, r.owner_employee_id);
  else
    v_emp := app.pick_employee(s.assignee_role_id, null, r.owner_employee_id);
  end if;
  v_dept := coalesce(v_dept, app.employee_department(v_emp));
  v_due := app.add_duration(now(), s.duration_value, s.duration_unit);

  update public.service_request_steps
     set status = case when s.client_action_required then 'waiting_client'::public.request_step_status else 'active' end,
         started_at = now(), due_at = v_due, assigned_employee_id = v_emp, assigned_department_id = v_dept,
         return_reason = null
   where id = s.id;

  update public.service_requests
     set current_step_id = s.id,
         status = case when status = 'on_hold' then status
                       when s.client_action_required then 'waiting_client'::public.request_status
                       else 'in_progress' end
   where id = r.id;

  if s.auto_create_task and v_emp is not null then
    insert into public.tasks (kind, title, assigned_to, due_at, priority, customer_id, service_request_id, request_step_id)
    values ('step_work', r.request_no || ' · ' || s.name_ar, v_emp, v_due, r.priority, r.customer_id, r.id, s.id);
  end if;

  perform app.log_request_event(r.id, 'step.started',
    'بدأت خطوة "' || s.name_ar || '"' || coalesce(' — المسؤول: ' || app.employee_name(v_emp), ''),
    'Step "' || coalesce(s.name_en, s.name_ar) || '" started',
    jsonb_build_object('step_id', s.id, 'due_at', v_due), s.is_client_visible);
end;
$$;

-- Activates the next pending step, or completes the request when none is left.
create or replace function app.advance_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
  v_no text;
begin
  select id into v_next from public.service_request_steps
  where request_id = p_request_id and status = 'pending' order by sort_order limit 1;
  if v_next is not null then
    perform app.activate_step(v_next);
    return;
  end if;
  update public.service_requests
     set status = 'completed', completed_at = now(), current_step_id = null, is_overdue = false
   where id = p_request_id
  returning request_no into v_no;
  perform app.log_request_event(p_request_id, 'request.completed', 'اكتمل الطلب ' || v_no, 'Request ' || v_no || ' completed', '{}'::jsonb, true);
end;
$$;

-- Marks a step completed, closes its tasks, moves on and applies the step's resulting request status.
create or replace function app.finish_step(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  v_status public.request_status;
begin
  update public.service_request_steps
     set status = 'completed', completed_at = now(), completed_by = coalesce(completed_by, app.current_employee_id())
   where id = p_step_id
  returning * into s;
  update public.tasks set status = 'done', outcome = coalesce(outcome, s.note)
   where request_step_id = p_step_id and status in ('todo', 'in_progress');

  perform app.log_request_event(s.request_id, 'step.completed',
    coalesce(s.completion_status_label_ar, 'اكتملت خطوة "' || s.name_ar || '"'),
    coalesce(s.completion_status_label_en, 'Step "' || coalesce(s.name_en, s.name_ar) || '" completed'),
    jsonb_build_object('step_id', s.id, 'note', s.note), s.is_client_visible);

  perform app.advance_request(s.request_id);

  -- optional status set by the step (completion is decided by the engine, not by the label)
  if s.sets_request_status in ('submitted', 'in_progress', 'waiting_client', 'on_hold') then
    select status into v_status from public.service_requests where id = s.request_id;
    if v_status not in ('completed', 'cancelled') then
      update public.service_requests set status = s.sets_request_status where id = s.request_id;
    end if;
  end if;
end;
$$;

-- Overdue flag for open requests (scheduled with pg_cron below).
create or replace function app.refresh_overdue()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.service_requests
     set is_overdue = (status not in ('completed', 'cancelled') and due_at is not null and due_at < now())
   where deleted_at is null
     and is_overdue is distinct from (status not in ('completed', 'cancelled') and due_at is not null and due_at < now());
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function app.activate_step(uuid), app.advance_request(uuid), app.finish_step(uuid), app.refresh_overdue(),
  app.log_request_event(uuid, text, text, text, jsonb, boolean) from authenticated, anon, public;
grant execute on function app.can_request(uuid, text), app.add_duration(timestamptz, int, public.duration_unit) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Defaults & guards
-- ---------------------------------------------------------------------
create or replace function app.request_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.request_no is null then
      new.request_no := 'REQ-' || lpad(nextval('public.request_no_seq')::text, 6, '0');
    end if;
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
    return new;
  end if;
  if new.owner_employee_id is distinct from old.owner_employee_id then
    if (select auth.uid()) is not null
       and not app.can('service_requests', 'assign', old.owner_employee_id, old.department_id) then
      raise exception 'assign permission required to change the owner' using errcode = '42501';
    end if;
    new.department_id := app.employee_department(new.owner_employee_id);
  end if;
  if new.due_at is distinct from old.due_at or new.status is distinct from old.status then
    new.is_overdue := new.status not in ('completed', 'cancelled') and new.due_at is not null and new.due_at < now();
  end if;
  return new;
end;
$$;
create trigger service_requests_defaults before insert or update on public.service_requests
  for each row execute function app.request_defaults();

-- timeline: owner changes and status changes are readable events
create or replace function app.timeline_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_employee_id is distinct from old.owner_employee_id then
    perform app.log_request_event(new.id, 'request.assigned',
      'أُسند الطلب إلى ' || coalesce(app.employee_name(new.owner_employee_id), '—'),
      'Assigned to ' || coalesce(app.employee_name(new.owner_employee_id), '—'));
  end if;
  if new.status is distinct from old.status and new.status in ('on_hold', 'cancelled') then
    perform app.log_request_event(new.id, 'request.' || new.status::text,
      case new.status when 'on_hold' then 'تم تعليق الطلب' else 'تم إلغاء الطلب' end
        || coalesce(': ' || coalesce(new.hold_reason, new.cancelled_reason), ''),
      'Request ' || new.status::text, jsonb_build_object('from', old.status, 'to', new.status), new.status = 'cancelled');
  end if;
  return new;
end;
$$;
create trigger service_requests_timeline after update on public.service_requests
  for each row execute function app.timeline_requests();

-- audit
create trigger audit_service_requests after insert or update or delete on public.service_requests
  for each row execute function app.audit_row_change('id', 'request_no');
create trigger audit_service_request_steps after insert or update or delete on public.service_request_steps
  for each row execute function app.audit_row_change('id', 'step_key');
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function app.audit_row_change('id', 'name_ar');
create trigger audit_rejection_reasons after insert or update or delete on public.rejection_reasons
  for each row execute function app.audit_row_change('id', 'text_ar');

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Creates a request on the service's published version: number, step snapshot, document slots,
-- expected completion (sum of SLAs) and activation of the first step.
create or replace function public.create_service_request(
  p_service_id uuid,
  p_customer_id uuid,
  p_owner_employee_id uuid default null,
  p_priority public.task_priority default 'normal',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
  v_customer public.customers;
  v_owner uuid := coalesce(p_owner_employee_id, app.current_employee_id());
  v_id uuid;
  v_ws record;
  v_step uuid;
  v_eta timestamptz := now();
begin
  if not app.has_permission('service_requests', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_customer from public.customers where id = p_customer_id and deleted_at is null;
  if not found or not app.can_customer(p_customer_id, 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_owner is distinct from app.current_employee_id() and not app.has_permission('service_requests', 'assign') then
    raise exception 'assign permission required to set another owner' using errcode = '42501';
  end if;
  select * into v_service from public.services where id = p_service_id and deleted_at is null;
  if not found or not v_service.is_active or v_service.current_workflow_id is null then
    raise exception 'service is not active' using errcode = 'P0001';
  end if;

  perform set_config('app.action_key', 'request.create', true);
  insert into public.service_requests (customer_id, service_id, workflow_id, status, owner_employee_id, priority, source, notes, submitted_at, total_amount)
  values (p_customer_id, p_service_id, v_service.current_workflow_id, 'submitted', v_owner, coalesce(p_priority, 'normal'), 'admin',
          nullif(trim(p_notes), ''), now(), v_service.default_price)
  returning id into v_id;

  for v_ws in select * from public.workflow_steps where workflow_id = v_service.current_workflow_id order by sort_order loop
    insert into public.service_request_steps (
      request_id, source_step_id, step_key, sort_order, name_ar, name_en, description, client_instructions, is_required,
      duration_value, duration_unit, assignee_type, assignee_role_id, assignee_department_id, assignee_employee_id,
      requires_approval, approver_role_id, client_action_required, is_client_visible, completion_status_label_ar,
      completion_status_label_en, sets_request_status, auto_create_task, fields_snapshot)
    values (
      v_id, v_ws.id, v_ws.step_key, v_ws.sort_order, v_ws.name_ar, v_ws.name_en, v_ws.description, v_ws.client_instructions, v_ws.is_required,
      v_ws.duration_value, v_ws.duration_unit, v_ws.assignee_type, v_ws.assignee_role_id, v_ws.assignee_department_id, v_ws.assignee_employee_id,
      v_ws.requires_approval, v_ws.approver_role_id, v_ws.client_action_required, v_ws.is_client_visible, v_ws.completion_status_label_ar,
      v_ws.completion_status_label_en, v_ws.sets_request_status, v_ws.auto_create_task,
      (select coalesce(jsonb_agg(to_jsonb(f) - array['id', 'workflow_step_id', 'created_at', 'updated_at'] order by f.sort_order), '[]'::jsonb)
         from public.required_fields f where f.workflow_step_id = v_ws.id))
    returning id into v_step;

    insert into public.documents (customer_id, request_id, request_step_id, document_type_id, name_ar, name_en, is_required, instructions_ar, max_files)
    select p_customer_id, v_id, v_step, rd.document_type_id, dt.name_ar, dt.name_en, rd.is_required, rd.instructions_ar, rd.max_files
    from public.required_documents rd join public.document_types dt on dt.id = rd.document_type_id
    where rd.workflow_step_id = v_ws.id
    order by rd.sort_order;

    v_eta := app.add_duration(v_eta, v_ws.duration_value, v_ws.duration_unit);
  end loop;

  update public.service_requests set expected_completion_at = v_eta, due_at = v_eta where id = v_id;
  perform app.log_request_event(v_id, 'request.created',
    'تم إنشاء طلب ' || v_service.name_ar, 'Request created: ' || coalesce(v_service.name_en, v_service.name_ar),
    jsonb_build_object('service_id', p_service_id), true);
  perform app.advance_request(v_id);
  return v_id;
end;
$$;

-- Saves dynamic field values of a step after validating them against the snapshot.
-- p_values: {"field_key": value, ...}; null / "" / [] clears the value.
create or replace function public.submit_step_data(p_request_step_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  v_req public.service_requests;
  k text;
  v jsonb;
  f jsonb;
  t text;
  rules jsonb;
  n numeric;
begin
  select * into s from public.service_request_steps where id = p_request_step_id;
  if not found or not app.can_request(s.request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_req from public.service_requests where id = s.request_id;
  if v_req.status in ('completed', 'cancelled') or s.status in ('completed', 'skipped') then
    raise exception 'step is closed' using errcode = 'P0001';
  end if;

  for k, v in select * from jsonb_each(coalesce(p_values, '{}'::jsonb)) loop
    f := null; -- SELECT INTO keeps the previous value when no row matches
    select x into f from jsonb_array_elements(s.fields_snapshot) x where x ->> 'field_key' = k;
    if f is null then
      raise exception 'unknown field %', k using errcode = 'P0001';
    end if;
    t := f ->> 'field_type';
    rules := coalesce(f -> 'validation', '{}'::jsonb);

    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      delete from public.request_field_values where request_step_id = s.id and field_key = k;
      continue;
    end if;

    if t in ('number', 'money') then
      begin
        n := (v #>> '{}')::numeric;
      exception when others then
        raise exception 'invalid value for %', k using errcode = '22023';
      end;
      if t = 'money' and n < 0 then raise exception 'invalid value for %', k using errcode = '22023'; end if;
      if rules ? 'min' and n < (rules ->> 'min')::numeric then raise exception 'value of % is below the minimum', k using errcode = '22023'; end if;
      if rules ? 'max' and n > (rules ->> 'max')::numeric then raise exception 'value of % is above the maximum', k using errcode = '22023'; end if;
      v := to_jsonb(n);
    elsif t = 'date' then
      begin
        perform (v #>> '{}')::date;
      exception when others then
        raise exception 'invalid value for %', k using errcode = '22023';
      end;
    elsif t = 'checkbox' then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid value for %', k using errcode = '22023'; end if;
    elsif t = 'select' then
      if not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'value' = v #>> '{}') then
        raise exception 'invalid option for %', k using errcode = '22023';
      end if;
    elsif t = 'multiselect' then
      if jsonb_typeof(v) <> 'array' or exists (
           select 1 from jsonb_array_elements_text(v) x
           where not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'value' = x)) then
        raise exception 'invalid option for %', k using errcode = '22023';
      end if;
    elsif t = 'phone' then
      if (v #>> '{}') !~ '^\+?[0-9]{8,15}$' then raise exception 'invalid phone for %', k using errcode = '22023'; end if;
    elsif t = 'email' then
      if (v #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email for %', k using errcode = '22023'; end if;
    elsif t = 'national_id' then
      if (v #>> '{}') !~ '^[23][0-9]{13}$' then raise exception 'invalid national id for %', k using errcode = '22023'; end if;
    else -- text / textarea
      if jsonb_typeof(v) <> 'string' then v := to_jsonb(v #>> '{}'); end if;
      if rules ? 'min_length' and length(v #>> '{}') < (rules ->> 'min_length')::int then raise exception 'value of % is too short', k using errcode = '22023'; end if;
      if rules ? 'max_length' and length(v #>> '{}') > (rules ->> 'max_length')::int then raise exception 'value of % is too long', k using errcode = '22023'; end if;
      if rules ? 'regex' and (v #>> '{}') !~ (rules ->> 'regex') then raise exception 'value of % has an invalid format', k using errcode = '22023'; end if;
    end if;

    insert into public.request_field_values (request_id, request_step_id, field_key, field_type, value, filled_by_user_id)
    values (s.request_id, s.id, k, t::public.field_type, v, (select auth.uid()))
    on conflict (request_step_id, field_key) do update set value = excluded.value, filled_by_user_id = excluded.filled_by_user_id;
  end loop;
end;
$$;

-- Completes the current step (or sends it for approval). Checks required fields and documents.
create or replace function public.complete_request_step(p_request_step_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  r public.service_requests;
  v_missing int;
begin
  select * into s from public.service_request_steps where id = p_request_step_id for update;
  if not found or not app.can_request(s.request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = s.request_id for update;
  if r.status in ('completed', 'cancelled', 'on_hold') then
    raise exception 'request is not active' using errcode = 'P0001';
  end if;
  if r.current_step_id is distinct from s.id or s.status not in ('active', 'waiting_client', 'returned') then
    raise exception 'step is not the active step' using errcode = 'P0001';
  end if;
  select count(*) into v_missing from public.request_step_missing(s.id);
  if v_missing > 0 then
    raise exception 'step incomplete: % requirement(s) missing', v_missing using errcode = 'P0001';
  end if;

  perform set_config('app.action_key', 'request.step_complete', true);
  update public.service_request_steps
     set note = coalesce(nullif(trim(p_note), ''), note), submitted_by = app.current_employee_id()
   where id = s.id;

  if s.requires_approval then
    update public.service_request_steps set status = 'waiting_approval' where id = s.id;
    if r.status = 'waiting_client' then
      update public.service_requests set status = 'in_progress' where id = r.id;
    end if;
    perform app.log_request_event(r.id, 'step.waiting_approval',
      'خطوة "' || s.name_ar || '" بانتظار الاعتماد', 'Step "' || coalesce(s.name_en, s.name_ar) || '" waiting for approval',
      jsonb_build_object('step_id', s.id));
  else
    perform app.finish_step(s.id);
  end if;
end;
$$;

-- Only an employee with the step's approver role (or a super admin) can approve / return.
create or replace function app.is_step_approver(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_super_admin() or exists (
    select 1 from public.service_request_steps s
    join public.employees e on e.id = app.current_employee_id()
    where s.id = p_step_id and s.approver_role_id = e.role_id
  )
$$;

create or replace function public.approve_request_step(p_request_step_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
begin
  select * into s from public.service_request_steps where id = p_request_step_id for update;
  if not found or not app.is_step_approver(s.id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if s.status <> 'waiting_approval' then
    raise exception 'step is not waiting for approval' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.step_approve', true);
  update public.service_request_steps
     set approved_by = app.current_employee_id(), approved_at = now(), note = coalesce(nullif(trim(p_note), ''), note)
   where id = s.id;
  perform app.log_request_event(s.request_id, 'step.approved',
    'اعتُمدت خطوة "' || s.name_ar || '"', 'Step "' || coalesce(s.name_en, s.name_ar) || '" approved', jsonb_build_object('step_id', s.id));
  perform app.finish_step(s.id);
end;
$$;

create or replace function public.return_request_step(p_request_step_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
begin
  select * into s from public.service_request_steps where id = p_request_step_id for update;
  if not found or not app.is_step_approver(s.id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if s.status <> 'waiting_approval' then
    raise exception 'step is not waiting for approval' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.step_return', true);
  update public.service_request_steps set status = 'returned', return_reason = trim(p_reason) where id = s.id;
  update public.tasks set status = 'todo' where request_step_id = s.id and status = 'done';
  perform app.log_request_event(s.request_id, 'step.returned',
    'أُعيدت خطوة "' || s.name_ar || '": ' || trim(p_reason), 'Step "' || coalesce(s.name_en, s.name_ar) || '" returned',
    jsonb_build_object('step_id', s.id, 'reason', trim(p_reason)));
end;
$$;

-- Optional steps only, with a reason.
create or replace function public.skip_request_step(p_request_step_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  r public.service_requests;
begin
  select * into s from public.service_request_steps where id = p_request_step_id for update;
  if not found or not app.can_request(s.request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = s.request_id for update;
  if s.is_required then
    raise exception 'required steps cannot be skipped' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  if r.status in ('completed', 'cancelled', 'on_hold') or r.current_step_id is distinct from s.id then
    raise exception 'step is not the active step' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.step_skip', true);
  update public.service_request_steps
     set status = 'skipped', skip_reason = trim(p_reason), completed_at = now(), completed_by = app.current_employee_id()
   where id = s.id;
  update public.tasks set status = 'cancelled' where request_step_id = s.id and status in ('todo', 'in_progress');
  perform app.log_request_event(r.id, 'step.skipped',
    'تم تخطي خطوة "' || s.name_ar || '": ' || trim(p_reason), 'Step "' || coalesce(s.name_en, s.name_ar) || '" skipped',
    jsonb_build_object('step_id', s.id, 'reason', trim(p_reason)), s.is_client_visible);
  perform app.advance_request(r.id);
end;
$$;

-- Adds an exceptional step to ONE request after the given step (not before the active step).
-- p_config: {name_ar, name_en, description, duration_value, duration_unit, assignee_type, assignee_role_id,
--            assignee_department_id, assignee_employee_id, requires_approval, approver_role_id, is_client_visible, client_action_required}
create or replace function public.insert_adhoc_step(p_request_id uuid, p_after_step_id uuid, p_config jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  v_after public.service_request_steps;
  v_current_order int;
  v_id uuid;
  v_type public.assignee_type := coalesce(nullif(p_config ->> 'assignee_type', ''), 'request_owner')::public.assignee_type;
begin
  if not app.can_request(p_request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.status in ('completed', 'cancelled') then
    raise exception 'request is closed' using errcode = 'P0001';
  end if;
  select * into v_after from public.service_request_steps where id = p_after_step_id and request_id = p_request_id;
  if not found then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  select sort_order into v_current_order from public.service_request_steps where id = r.current_step_id;
  if v_current_order is not null and v_after.sort_order < v_current_order then
    raise exception 'ad-hoc steps can only be added after the active step' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_config ->> 'name_ar'), '') = '' then
    raise exception 'a step name is required' using errcode = 'P0001';
  end if;

  perform set_config('app.action_key', 'request.adhoc_step', true);
  update public.service_request_steps set sort_order = sort_order + 1
   where request_id = p_request_id and sort_order > v_after.sort_order;
  insert into public.service_request_steps (
    request_id, step_key, sort_order, name_ar, name_en, description, is_required, duration_value, duration_unit,
    assignee_type, assignee_role_id, assignee_department_id, assignee_employee_id, requires_approval, approver_role_id,
    is_client_visible, client_action_required, is_adhoc)
  values (
    p_request_id, 'adhoc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), v_after.sort_order + 1,
    trim(p_config ->> 'name_ar'), nullif(trim(p_config ->> 'name_en'), ''), nullif(trim(p_config ->> 'description'), ''), true,
    greatest(1, coalesce((p_config ->> 'duration_value')::int, 1)), coalesce(nullif(p_config ->> 'duration_unit', ''), 'business_days')::public.duration_unit,
    v_type,
    case when v_type = 'role' then (p_config ->> 'assignee_role_id')::uuid end,
    case when v_type = 'department' then (p_config ->> 'assignee_department_id')::uuid end,
    case when v_type = 'employee' then (p_config ->> 'assignee_employee_id')::uuid end,
    coalesce((p_config ->> 'requires_approval')::boolean, false),
    case when coalesce((p_config ->> 'requires_approval')::boolean, false) then (p_config ->> 'approver_role_id')::uuid end,
    coalesce((p_config ->> 'is_client_visible')::boolean, false),
    coalesce((p_config ->> 'client_action_required')::boolean, false),
    true)
  returning id into v_id;

  if (select requires_approval and approver_role_id is null from public.service_request_steps where id = v_id) then
    raise exception 'an approver role is required' using errcode = 'P0001';
  end if;

  perform app.log_request_event(p_request_id, 'step.adhoc_added',
    'أُضيفت خطوة استثنائية "' || trim(p_config ->> 'name_ar') || '" لهذا الطلب', 'Ad-hoc step added',
    jsonb_build_object('step_id', v_id));
  -- request was waiting for nothing (all steps done) -> continue with the new step
  if r.current_step_id is null and r.status not in ('completed', 'cancelled') then
    perform app.advance_request(p_request_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.reassign_request_step(p_request_step_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
begin
  select * into s from public.service_request_steps where id = p_request_step_id for update;
  if not found or not app.can_request(s.request_id, 'assign') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if s.status in ('completed', 'skipped') then
    raise exception 'step is closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and status = 'active') then
    raise exception 'employee is not active' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.step_reassign', true);
  update public.service_request_steps
     set assigned_employee_id = p_employee_id, assigned_department_id = app.employee_department(p_employee_id)
   where id = s.id;
  update public.tasks set assigned_to = p_employee_id where request_step_id = s.id and status in ('todo', 'in_progress');
  perform app.log_request_event(s.request_id, 'step.reassigned',
    'أُسندت خطوة "' || s.name_ar || '" إلى ' || coalesce(app.employee_name(p_employee_id), '—'),
    'Step "' || coalesce(s.name_en, s.name_ar) || '" reassigned', jsonb_build_object('step_id', s.id, 'employee_id', p_employee_id));
end;
$$;

-- Hold / resume (edit) and cancel (delete permission).
create or replace function public.set_request_hold(p_request_id uuid, p_hold boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  s public.service_request_steps;
begin
  if not app.can_request(p_request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.status in ('completed', 'cancelled') then
    raise exception 'request is closed' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', case when p_hold then 'request.hold' else 'request.resume' end, true);
  if p_hold then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'a reason is required' using errcode = 'P0001';
    end if;
    update public.service_requests set status = 'on_hold', hold_reason = trim(p_reason) where id = r.id;
  elsif r.status = 'on_hold' then
    select * into s from public.service_request_steps where id = r.current_step_id;
    update public.service_requests
       set status = case when s.status = 'waiting_client' then 'waiting_client'::public.request_status else 'in_progress' end,
           hold_reason = null
     where id = r.id;
    perform app.log_request_event(r.id, 'request.resumed', 'تم استئناف الطلب', 'Request resumed');
  end if;
end;
$$;

create or replace function public.cancel_service_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
begin
  if not app.can_request(p_request_id, 'delete') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.status in ('completed', 'cancelled') then
    raise exception 'request is closed' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.cancel', true);
  update public.service_requests
     set status = 'cancelled', cancelled_at = now(), cancelled_reason = trim(p_reason), is_overdue = false
   where id = r.id;
  update public.tasks set status = 'cancelled' where service_request_id = r.id and status in ('todo', 'in_progress');
end;
$$;

-- Phase 4 document handling: confirm a slot as received & approved (paper at the office) or reject it with a reason.
create or replace function public.receive_document(p_document_id uuid, p_note text default null, p_expires_at date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  r public.service_requests;
  s public.service_request_steps;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not app.has_permission('documents', 'approve')
     or not (case when d.request_id is null then app.can_customer(d.customer_id, 'view') else app.can_request(d.request_id, 'view') end) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform set_config('app.action_key', 'document.receive', true);
  update public.documents
     set status = 'approved', received_physically = true, review_note = nullif(trim(p_note), ''),
         rejection_reason_id = null, rejection_note = null, reviewed_by = app.current_employee_id(), reviewed_at = now(),
         expires_at = coalesce(p_expires_at, expires_at)
   where id = d.id;
  if d.request_id is not null then
    select * into r from public.service_requests where id = d.request_id;
    select * into s from public.service_request_steps where id = r.current_step_id;
    -- a rejected document had put the request on the client; the step itself does not wait for the client
    if r.status = 'waiting_client' and s.status in ('active', 'returned') then
      update public.service_requests set status = 'in_progress' where id = r.id;
    end if;
    perform app.log_request_event(r.id, 'document.approved', 'تم استلام واعتماد مستند: ' || d.name_ar,
      'Document approved: ' || coalesce(d.name_en, d.name_ar), jsonb_build_object('document_id', d.id), true);
  end if;
end;
$$;

create or replace function public.reject_document(p_document_id uuid, p_reason_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  r public.service_requests;
  v_reason text;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not app.has_permission('documents', 'approve')
     or not (case when d.request_id is null then app.can_customer(d.customer_id, 'view') else app.can_request(d.request_id, 'view') end) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select text_ar into v_reason from public.rejection_reasons where id = p_reason_id;
  if v_reason is null and coalesce(trim(p_note), '') = '' then
    raise exception 'a rejection reason is required' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'document.reject', true);
  update public.documents
     set status = 'rejected', received_physically = false, rejection_reason_id = p_reason_id, rejection_note = nullif(trim(p_note), ''),
         reviewed_by = app.current_employee_id(), reviewed_at = now()
   where id = d.id;
  if d.request_id is not null then
    select * into r from public.service_requests where id = d.request_id for update;
    if r.status = 'in_progress' and r.current_step_id = d.request_step_id then
      update public.service_requests set status = 'waiting_client' where id = r.id;
    end if;
    perform app.log_request_event(r.id, 'document.rejected',
      'رُفض مستند "' || d.name_ar || '": ' || coalesce(v_reason, '') || coalesce(' — ' || nullif(trim(p_note), ''), ''),
      'Document rejected: ' || coalesce(d.name_en, d.name_ar), jsonb_build_object('document_id', d.id), true);
  end if;
end;
$$;

-- Manual overdue refresh for staff (the scheduler runs it every 15 minutes).
create or replace function public.refresh_overdue_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_staff() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return app.refresh_overdue();
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_service_request(uuid, uuid, uuid, public.task_priority, text)',
    'public.submit_step_data(uuid, jsonb)',
    'public.complete_request_step(uuid, text)',
    'public.approve_request_step(uuid, text)',
    'public.return_request_step(uuid, text)',
    'public.skip_request_step(uuid, text)',
    'public.insert_adhoc_step(uuid, uuid, jsonb)',
    'public.reassign_request_step(uuid, uuid)',
    'public.set_request_hold(uuid, boolean, text)',
    'public.cancel_service_request(uuid, text)',
    'public.receive_document(uuid, text, date)',
    'public.reject_document(uuid, uuid, text)',
    'public.refresh_overdue_requests()',
    'public.request_step_missing(uuid)'
  ] loop
    execute format('revoke execute on function %s from anon, public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
grant execute on function app.is_step_approver(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Scheduler: overdue flag every 15 minutes (pg_cron)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('refresh-overdue-requests', '*/15 * * * *', 'select app.refresh_overdue()');

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.service_requests enable row level security;
alter table public.service_request_steps enable row level security;
alter table public.request_field_values enable row level security;
alter table public.documents enable row level security;
alter table public.rejection_reasons enable row level security;

-- requests: staff by scope/assignment, clients their own. Created and moved only through RPCs.
create policy service_requests_staff_select on public.service_requests for select to authenticated
  using (deleted_at is null and app.can_request(id, 'view'));
create policy service_requests_client_select on public.service_requests for select to authenticated
  using (deleted_at is null and customer_id = app.current_customer_id());
create policy service_requests_update on public.service_requests for update to authenticated
  using (app.can_request(id, 'edit')) with check (app.is_staff());
revoke update on public.service_requests from authenticated;
grant update (priority, owner_employee_id, notes, due_at) on public.service_requests to authenticated;

-- steps: internal steps are never visible to the client
create policy service_request_steps_staff_select on public.service_request_steps for select to authenticated
  using (app.can_request(request_id, 'view'));
create policy service_request_steps_client_select on public.service_request_steps for select to authenticated
  using (is_client_visible and exists (
    select 1 from public.service_requests r where r.id = request_id and r.customer_id = app.current_customer_id() and r.deleted_at is null));

create policy request_field_values_staff_select on public.request_field_values for select to authenticated
  using (app.can_request(request_id, 'view'));
create policy request_field_values_client_select on public.request_field_values for select to authenticated
  using (exists (
    select 1 from public.service_request_steps s join public.service_requests r on r.id = s.request_id
    where s.id = request_step_id and s.is_client_visible and r.customer_id = app.current_customer_id()));

create policy documents_staff_select on public.documents for select to authenticated
  using (app.has_permission('documents', 'view')
         and (case when request_id is null then app.can_customer(customer_id, 'view') else app.can_request(request_id, 'view') end));
create policy documents_client_select on public.documents for select to authenticated
  using (customer_id = app.current_customer_id());

create policy rejection_reasons_select on public.rejection_reasons for select to authenticated using (true);
create policy rejection_reasons_write on public.rejection_reasons for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));

-- timeline: request events are visible to whoever can see the request
drop policy activity_events_staff_select on public.activity_events;
create policy activity_events_staff_select on public.activity_events for select to authenticated
  using ((customer_id is not null and app.can_customer(customer_id, 'view'))
      or (customer_id is null and lead_id is not null and app.can_lead(lead_id, 'view'))
      or (service_request_id is not null and app.can_request(service_request_id, 'view')));

-- tasks linked to a request step stay visible to the request's staff
create policy tasks_request_select on public.tasks for select to authenticated
  using (service_request_id is not null and app.can_request(service_request_id, 'view'));
