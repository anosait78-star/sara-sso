-- =====================================================================
-- Phase 2 · CRM: customers, leads pipeline, activities, notes,
-- follow-ups (tasks), appointments, lookups and the unified timeline.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.customer_type as enum ('individual', 'company');
create type public.customer_status as enum ('self_registered', 'pending_link', 'active', 'inactive');
create type public.app_access as enum ('none', 'active', 'suspended');
create type public.stage_category as enum ('open', 'won', 'lost', 'on_hold');
create type public.lead_activity_type as enum ('created', 'call', 'meeting', 'whatsapp', 'email', 'note', 'stage_change', 'converted');
create type public.task_kind as enum ('task', 'follow_up', 'call', 'inquiry', 'renewal', 'step_work');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
create type public.appointment_type as enum ('meeting', 'call', 'property_visit', 'gov_visit', 'other');
create type public.appointment_status as enum ('scheduled', 'done', 'cancelled', 'no_show');

-- ---------------------------------------------------------------------
-- Lookups (reference values managed from settings)
-- ---------------------------------------------------------------------
create table public.lookups (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null,
  name_en text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (type, key)
);

insert into public.lookups (type, key, name_ar, name_en, sort_order) values
  ('lead_source', 'facebook', 'فيسبوك', 'Facebook', 1),
  ('lead_source', 'instagram', 'إنستجرام', 'Instagram', 2),
  ('lead_source', 'website', 'الموقع الإلكتروني', 'Website', 3),
  ('lead_source', 'whatsapp', 'واتساب', 'WhatsApp', 4),
  ('lead_source', 'referral', 'إحالة من عميل', 'Referral', 5),
  ('lead_source', 'exhibition', 'معرض', 'Exhibition', 6),
  ('lead_source', 'walk_in', 'زيارة للمكتب', 'Walk-in', 7),
  ('lead_source', 'phone', 'اتصال هاتفي', 'Phone call', 8),
  ('lead_source', 'other', 'أخرى', 'Other', 99),
  ('lost_reason', 'price', 'السعر أعلى من الميزانية', 'Price too high', 1),
  ('lost_reason', 'competitor', 'اختار منافسًا', 'Chose a competitor', 2),
  ('lost_reason', 'no_need', 'لم يعد يحتاج الخدمة', 'No longer needed', 3),
  ('lost_reason', 'not_reachable', 'تعذر التواصل نهائيًا', 'Unreachable', 4),
  ('lost_reason', 'documents', 'لا يملك المستندات المطلوبة', 'Missing documents', 5),
  ('lost_reason', 'other', 'أخرى', 'Other', 99),
  ('interest_line', 'real_estate', 'التسويق العقاري', 'Real estate', 1),
  ('interest_line', 'insurance', 'التأمين', 'Insurance', 2),
  ('interest_line', 'company_formation', 'تأسيس الشركات والأوراق الحكومية', 'Company formation', 3),
  ('interest_line', 'loans', 'القروض التجارية', 'Commercial loans', 4),
  ('interest_line', 'other', 'أخرى', 'Other', 99);

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create sequence public.customer_no_seq start 1;
create sequence public.lead_no_seq start 1;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_no text unique,
  customer_type public.customer_type not null default 'individual',
  full_name text not null check (length(trim(full_name)) >= 2),
  company_name text,
  national_id text check (national_id is null or national_id ~ '^\d{14}$'),
  commercial_register_no text,
  tax_no text,
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  alt_phone text check (alt_phone is null or alt_phone ~ '^\+[0-9]{8,15}$'),
  email text,
  address text,
  city text,
  birth_date date,
  user_id uuid unique references public.profiles (id) on delete set null,
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  source text,
  converted_from_lead_id uuid,
  status public.customer_status not null default 'active',
  app_access public.app_access not null default 'none',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create unique index customers_phone_uidx on public.customers (phone) where deleted_at is null;
create unique index customers_national_id_uidx on public.customers (national_id) where national_id is not null and deleted_at is null;
create index customers_owner_idx on public.customers (owner_employee_id);
create index customers_department_idx on public.customers (department_id);
create index customers_status_idx on public.customers (status) where deleted_at is null;
create index customers_search_idx on public.customers using gin ((full_name || ' ' || coalesce(company_name, '') || ' ' || phone || ' ' || coalesce(customer_no, '')) extensions.gin_trgm_ops);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  role text,
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  email text,
  created_at timestamptz not null default now()
);
create index customer_contacts_customer_idx on public.customer_contacts (customer_id);

-- ---------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------
create table public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null,
  name_en text,
  stage_category public.stage_category not null,
  requires text not null default 'none' check (requires in ('none', 'follow_up_date', 'reason')),
  sort_order int not null default 0,
  color text not null default '#8FBDF9',
  is_pipeline boolean not null default true,
  is_active boolean not null default true
);
comment on column public.lead_stages.is_pipeline is 'true = shown as a Kanban column; false = side state (postponed, lost, unreachable).';

insert into public.lead_stages (key, name_ar, name_en, stage_category, requires, sort_order, color, is_pipeline) values
  ('new', 'جديد', 'New', 'open', 'none', 1, '#8FBDF9', true),
  ('contacted', 'تم التواصل', 'Contacted', 'open', 'none', 2, '#22A0F5', true),
  ('interested', 'مهتم', 'Interested', 'open', 'none', 3, '#0057E6', true),
  ('offer_sent', 'تم إرسال عرض', 'Offer sent', 'open', 'none', 4, '#0B3F99', true),
  ('waiting_decision', 'بانتظار القرار', 'Waiting for decision', 'open', 'none', 5, '#6B45D9', true),
  ('converted', 'تحول لعميل', 'Converted', 'won', 'none', 6, '#12A150', true),
  ('postponed', 'مؤجل', 'Postponed', 'on_hold', 'follow_up_date', 7, '#E8A317', false),
  ('not_interested', 'غير مهتم', 'Not interested', 'lost', 'reason', 8, '#D93B3B', false),
  ('could_not_contact', 'لم يتم الوصول', 'Could not contact', 'on_hold', 'none', 9, '#8A98AE', false);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_no text unique,
  full_name text not null check (length(trim(full_name)) >= 2),
  company_name text,
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  email text,
  interest_line text,
  interest_details text,
  budget numeric(14, 2),
  source text,
  stage_id uuid not null references public.lead_stages (id),
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  next_follow_up_at timestamptz,
  postponed_until date,
  lost_reason text,
  lost_note text,
  converted_customer_id uuid references public.customers (id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  check (phone is not null or email is not null)
);
create index leads_stage_idx on public.leads (stage_id) where deleted_at is null;
create index leads_owner_idx on public.leads (owner_employee_id);
create index leads_phone_idx on public.leads (phone);
create index leads_search_idx on public.leads using gin ((full_name || ' ' || coalesce(company_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(lead_no, '')) extensions.gin_trgm_ops);

alter table public.customers
  add constraint customers_converted_from_lead_fkey foreign key (converted_from_lead_id) references public.leads (id) on delete set null;

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  type public.lead_activity_type not null,
  from_stage_id uuid references public.lead_stages (id),
  to_stage_id uuid references public.lead_stages (id),
  summary text,
  occurred_at timestamptz not null default now(),
  actor_employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Notes, tasks (incl. follow-ups), appointments
-- ---------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  visibility text not null default 'internal' check (visibility in ('internal', 'client')),
  author_employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(customer_id, lead_id) = 1)
);
create index notes_customer_idx on public.notes (customer_id, created_at desc);
create index notes_lead_idx on public.notes (lead_id, created_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  kind public.task_kind not null default 'task',
  title text not null check (length(trim(title)) > 0),
  description text,
  assigned_to uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  outcome text,
  completed_at timestamptz,
  completed_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index tasks_assignee_idx on public.tasks (assigned_to, status, due_at);
create index tasks_customer_idx on public.tasks (customer_id);
create index tasks_lead_idx on public.tasks (lead_id);
create index tasks_open_due_idx on public.tasks (due_at) where status in ('todo', 'in_progress');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  type public.appointment_type not null default 'meeting',
  title text not null check (length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  status public.appointment_status not null default 'scheduled',
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check (ends_at is null or ends_at > starts_at)
);
create index appointments_employee_idx on public.appointments (employee_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id);
create index appointments_lead_idx on public.appointments (lead_id);

-- ---------------------------------------------------------------------
-- Timeline (readable activity stream for customers and leads)
-- ---------------------------------------------------------------------
create table public.activity_events (
  id bigint generated always as identity primary key,
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  event_type text not null,
  summary_ar text not null,
  summary_en text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  actor_name text,
  visible_to_client boolean not null default false,
  occurred_at timestamptz not null default now()
);
create index activity_events_customer_idx on public.activity_events (customer_id, occurred_at desc);
create index activity_events_lead_idx on public.activity_events (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- updated_at, numbering, defaults
-- ---------------------------------------------------------------------
create trigger customers_updated_at before update on public.customers for each row execute function app.set_updated_at();
create trigger leads_updated_at before update on public.leads for each row execute function app.set_updated_at();
create trigger notes_updated_at before update on public.notes for each row execute function app.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function app.set_updated_at();
create trigger appointments_updated_at before update on public.appointments for each row execute function app.set_updated_at();

create or replace function app.employee_department(p_employee uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select department_id from public.employees where id = p_employee
$$;

-- Records created by staff default to the creator as owner, and the owner's department.
create or replace function app.crm_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := app.current_employee_id();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    if tg_table_name = 'customers' then
      if new.customer_no is null then
        new.customer_no := 'CUS-' || lpad(nextval('public.customer_no_seq')::text, 5, '0');
      end if;
      new.owner_employee_id := coalesce(new.owner_employee_id, v_me);
      new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
    elsif tg_table_name = 'leads' then
      if new.lead_no is null then
        new.lead_no := 'LEAD-' || lpad(nextval('public.lead_no_seq')::text, 5, '0');
      end if;
      new.owner_employee_id := coalesce(new.owner_employee_id, v_me);
      new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
      if new.stage_id is null then
        new.stage_id := (select id from public.lead_stages where key = 'new');
      end if;
    elsif tg_table_name = 'tasks' then
      new.assigned_to := coalesce(new.assigned_to, v_me);
      new.department_id := coalesce(new.department_id, app.employee_department(new.assigned_to));
    elsif tg_table_name = 'appointments' then
      new.employee_id := coalesce(new.employee_id, v_me);
      new.department_id := coalesce(new.department_id, app.employee_department(new.employee_id));
    end if;
  elsif tg_op = 'UPDATE' then
    -- keep department in sync when the owner/assignee changes
    -- (nested ifs: PL/pgSQL does not short-circuit, so a column is only read on its own table)
    if tg_table_name in ('customers', 'leads') then
      if new.owner_employee_id is distinct from old.owner_employee_id then
        new.department_id := app.employee_department(new.owner_employee_id);
      end if;
    elsif tg_table_name = 'tasks' then
      if new.assigned_to is distinct from old.assigned_to then
        new.department_id := app.employee_department(new.assigned_to);
      end if;
    elsif tg_table_name = 'appointments' then
      if new.employee_id is distinct from old.employee_id then
        new.department_id := app.employee_department(new.employee_id);
      end if;
    end if;
    if tg_table_name = 'tasks' then
      if new.status = 'done' and old.status <> 'done' then
        new.completed_at := now();
        new.completed_by := v_me;
      elsif new.status <> 'done' then
        new.completed_at := null;
        new.completed_by := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_defaults before insert or update on public.customers for each row execute function app.crm_defaults();
create trigger leads_defaults before insert or update on public.leads for each row execute function app.crm_defaults();
create trigger tasks_defaults before insert or update on public.tasks for each row execute function app.crm_defaults();
create trigger appointments_defaults before insert or update on public.appointments for each row execute function app.crm_defaults();

-- ---------------------------------------------------------------------
-- Visibility helpers (used by child-table policies)
-- ---------------------------------------------------------------------
create or replace function app.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.customers
  where user_id = (select auth.uid()) and deleted_at is null and status in ('active', 'self_registered')
$$;

create or replace function app.can_customer(p_customer uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer and c.deleted_at is null
      and app.can('customers', p_action, c.owner_employee_id, c.department_id)
  )
$$;

create or replace function app.can_lead(p_lead uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead and l.deleted_at is null
      and app.can('leads', p_action, l.owner_employee_id, l.department_id)
  )
$$;


-- ---------------------------------------------------------------------
-- Guards: reassignment needs "assign", soft delete needs "delete"
-- ---------------------------------------------------------------------
create or replace function app.guard_crm_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module text := case tg_table_name when 'customers' then 'customers' when 'leads' then 'leads' end;
begin
  if (select auth.uid()) is null then
    return new; -- service role / internal RPC context
  end if;
  if new.owner_employee_id is distinct from old.owner_employee_id
     and not app.can(v_module, 'assign', old.owner_employee_id, old.department_id) then
    raise exception 'assign permission required to change the owner' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null
     and not app.can(v_module, 'delete', old.owner_employee_id, old.department_id) then
    raise exception 'delete permission required' using errcode = '42501';
  end if;
  if tg_table_name = 'customers' then
    if (new.user_id is distinct from old.user_id or new.app_access is distinct from old.app_access
        or (new.status is distinct from old.status and 'pending_link' in (new.status::text, old.status::text)))
       and not app.has_permission('customers', 'manage_access') then
      raise exception 'manage_access permission required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_guard before update on public.customers for each row execute function app.guard_crm_changes();
create trigger leads_guard before update on public.leads for each row execute function app.guard_crm_changes();

-- ---------------------------------------------------------------------
-- Timeline events (triggers)
-- ---------------------------------------------------------------------
create or replace function app.log_event(
  p_customer uuid, p_lead uuid, p_type text, p_ar text, p_en text,
  p_payload jsonb default '{}'::jsonb, p_client boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  insert into public.activity_events (customer_id, lead_id, event_type, summary_ar, summary_en, payload, actor_user_id, actor_name, visible_to_client)
  values (p_customer, p_lead, p_type, p_ar, p_en, coalesce(p_payload, '{}'::jsonb), v_uid,
          (select full_name from public.profiles where id = v_uid), p_client);
end;
$$;
revoke execute on function app.log_event(uuid, uuid, text, text, text, jsonb, boolean) from authenticated, anon, public;

create or replace function app.employee_name(p_employee uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name from public.employees e join public.profiles p on p.id = e.profile_id where e.id = p_employee
$$;

create or replace function app.timeline_customers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.converted_from_lead_id is null then
      perform app.log_event(new.id, null, 'customer.created',
        'أُضيف العميل ' || new.customer_no, 'Customer ' || new.customer_no || ' created');
    end if;
  else
    if new.owner_employee_id is distinct from old.owner_employee_id then
      perform app.log_event(new.id, null, 'customer.assigned',
        'أُسند العميل إلى ' || coalesce(app.employee_name(new.owner_employee_id), '—'),
        'Assigned to ' || coalesce(app.employee_name(new.owner_employee_id), '—'));
    end if;
    if new.status is distinct from old.status then
      perform app.log_event(new.id, null, 'customer.status_changed',
        'تغيرت حالة العميل إلى ' || new.status::text, 'Status changed to ' || new.status::text,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_timeline after insert or update on public.customers for each row execute function app.timeline_customers();

create or replace function app.timeline_leads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_event(null, new.id, 'lead.created', 'أُنشئ العميل المحتمل ' || new.lead_no, 'Lead ' || new.lead_no || ' created');
    insert into public.lead_activities (lead_id, type, to_stage_id, summary, actor_employee_id)
    values (new.id, 'created', new.stage_id, null, app.current_employee_id());
  elsif new.owner_employee_id is distinct from old.owner_employee_id then
    perform app.log_event(null, new.id, 'lead.assigned',
      'أُسند إلى ' || coalesce(app.employee_name(new.owner_employee_id), '—'),
      'Assigned to ' || coalesce(app.employee_name(new.owner_employee_id), '—'));
  end if;
  return new;
end;
$$;
create trigger leads_timeline after insert or update on public.leads for each row execute function app.timeline_leads();

create or replace function app.timeline_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.log_event(new.customer_id, new.lead_id, 'note.added',
    'ملاحظة: ' || left(new.body, 140), 'Note: ' || left(new.body, 140),
    jsonb_build_object('note_id', new.id), new.visibility = 'client');
  return new;
end;
$$;
create trigger notes_timeline after insert on public.notes for each row execute function app.timeline_notes();

create or replace function app.timeline_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is null and new.lead_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.kind = 'follow_up' then
    perform app.log_event(new.customer_id, new.lead_id, 'followup.scheduled',
      'متابعة مجدولة: ' || new.title, 'Follow-up scheduled: ' || new.title,
      jsonb_build_object('task_id', new.id, 'due_at', new.due_at));
  elsif tg_op = 'UPDATE' and new.status = 'done' and old.status <> 'done' then
    perform app.log_event(new.customer_id, new.lead_id,
      case when new.kind = 'follow_up' then 'followup.completed' else 'task.completed' end,
      'تمت: ' || new.title || coalesce(' — ' || new.outcome, ''),
      'Done: ' || new.title || coalesce(' — ' || new.outcome, ''),
      jsonb_build_object('task_id', new.id));
  end if;
  return new;
end;
$$;
create trigger tasks_timeline after insert or update on public.tasks for each row execute function app.timeline_tasks();

create or replace function app.timeline_appointments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_event(new.customer_id, new.lead_id, 'appointment.scheduled',
      'موعد: ' || new.title || ' — ' || to_char(new.starts_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
      'Appointment: ' || new.title,
      jsonb_build_object('appointment_id', new.id, 'starts_at', new.starts_at), true);
  elsif new.status is distinct from old.status then
    perform app.log_event(new.customer_id, new.lead_id, 'appointment.' || new.status::text,
      'الموعد "' || new.title || '": ' || case new.status when 'done' then 'تم' when 'cancelled' then 'أُلغي' when 'no_show' then 'لم يحضر' else 'مجدول' end
        || coalesce(' — ' || new.outcome, ''),
      'Appointment "' || new.title || '": ' || new.status::text,
      jsonb_build_object('appointment_id', new.id), new.status in ('cancelled'));
  end if;
  return new;
end;
$$;
create trigger appointments_timeline after insert or update on public.appointments for each row execute function app.timeline_appointments();

-- keep leads.next_follow_up_at = earliest open follow-up
create or replace function app.sync_lead_next_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  if v_lead is not null then
    update public.leads set next_follow_up_at = (
      select min(due_at) from public.tasks
      where lead_id = v_lead and kind = 'follow_up' and status in ('todo', 'in_progress')
    ) where id = v_lead;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger tasks_sync_lead after insert or update or delete on public.tasks for each row execute function app.sync_lead_next_follow_up();

-- audit for sensitive CRM tables
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function app.audit_row_change('id', 'customer_no');
create trigger audit_leads after insert or update or delete on public.leads
  for each row execute function app.audit_row_change('id', 'lead_no');
create trigger audit_lookups after insert or update or delete on public.lookups
  for each row execute function app.audit_row_change('id', 'key');
create trigger audit_lead_stages after insert or update or delete on public.lead_stages
  for each row execute function app.audit_row_change('id', 'key');

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Moves a lead to another stage, enforcing stage requirements.
create or replace function public.change_lead_stage(
  p_lead_id uuid,
  p_stage_id uuid,
  p_note text default null,
  p_follow_up_at timestamptz default null,
  p_lost_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_from public.lead_stages;
  v_to public.lead_stages;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if not found or not app.can('leads', 'edit', v_lead.owner_employee_id, v_lead.department_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_lead.converted_customer_id is not null then
    raise exception 'lead already converted' using errcode = 'P0001';
  end if;
  select * into v_to from public.lead_stages where id = p_stage_id and is_active;
  if not found then raise exception 'unknown stage' using errcode = 'P0002'; end if;
  if v_to.stage_category = 'won' then
    raise exception 'use convert_lead_to_customer to convert a lead' using errcode = 'P0001';
  end if;
  if v_to.requires = 'follow_up_date' and p_follow_up_at is null then
    raise exception 'a follow-up date is required for this stage' using errcode = 'P0001';
  end if;
  if v_to.requires = 'reason' and coalesce(p_lost_reason, '') = '' then
    raise exception 'a reason is required for this stage' using errcode = 'P0001';
  end if;
  select * into v_from from public.lead_stages where id = v_lead.stage_id;

  update public.leads set
    stage_id = v_to.id,
    postponed_until = case when v_to.requires = 'follow_up_date' then p_follow_up_at::date else null end,
    lost_reason = case when v_to.stage_category = 'lost' then p_lost_reason else null end,
    lost_note = case when v_to.stage_category = 'lost' then p_note else null end
  where id = p_lead_id;

  insert into public.lead_activities (lead_id, type, from_stage_id, to_stage_id, summary, actor_employee_id)
  values (p_lead_id, 'stage_change', v_from.id, v_to.id, p_note, app.current_employee_id());

  perform app.log_event(null, p_lead_id, 'lead.stage_changed',
    'تغيرت المرحلة من "' || v_from.name_ar || '" إلى "' || v_to.name_ar || '"',
    'Stage changed from "' || coalesce(v_from.name_en, v_from.key) || '" to "' || coalesce(v_to.name_en, v_to.key) || '"',
    jsonb_build_object('from', v_from.key, 'to', v_to.key, 'reason', p_lost_reason));

  if p_follow_up_at is not null then
    insert into public.tasks (kind, title, assigned_to, due_at, lead_id)
    values ('follow_up', 'متابعة: ' || v_lead.full_name, coalesce(v_lead.owner_employee_id, app.current_employee_id()), p_follow_up_at, p_lead_id);
  end if;
  -- closing a lead cancels its open follow-ups
  if v_to.stage_category = 'lost' then
    update public.tasks set status = 'cancelled' where lead_id = p_lead_id and status in ('todo', 'in_progress');
  end if;
end;
$$;

-- Logs a contact activity and optionally schedules the next follow-up.
create or replace function public.log_lead_activity(
  p_lead_id uuid,
  p_type public.lead_activity_type,
  p_summary text,
  p_next_follow_up_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_id uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null;
  if not found or not app.can('leads', 'edit', v_lead.owner_employee_id, v_lead.department_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_type not in ('call', 'meeting', 'whatsapp', 'email', 'note') then
    raise exception 'invalid activity type' using errcode = 'P0001';
  end if;
  insert into public.lead_activities (lead_id, type, summary, actor_employee_id)
  values (p_lead_id, p_type, p_summary, app.current_employee_id())
  returning id into v_id;

  perform app.log_event(null, p_lead_id, 'lead.activity',
    case p_type when 'call' then 'مكالمة' when 'meeting' then 'اجتماع' when 'whatsapp' then 'واتساب' when 'email' then 'بريد' else 'ملاحظة' end
      || coalesce(': ' || left(p_summary, 140), ''),
    p_type::text || coalesce(': ' || left(p_summary, 140), ''),
    jsonb_build_object('activity_id', v_id, 'type', p_type));

  -- the contact happened: complete overdue/today follow-ups of this lead
  update public.tasks set status = 'done', outcome = coalesce(outcome, left(p_summary, 200))
  where lead_id = p_lead_id and kind = 'follow_up' and status in ('todo', 'in_progress') and due_at <= now() + interval '12 hours';

  if p_next_follow_up_at is not null then
    insert into public.tasks (kind, title, assigned_to, due_at, lead_id)
    values ('follow_up', 'متابعة: ' || v_lead.full_name, coalesce(v_lead.owner_employee_id, app.current_employee_id()), p_next_follow_up_at, p_lead_id);
  end if;

  -- first contact moves a "new" lead to "contacted"
  if (select key from public.lead_stages where id = v_lead.stage_id) = 'new' and p_type <> 'note' then
    update public.leads set stage_id = (select id from public.lead_stages where key = 'contacted') where id = p_lead_id;
    insert into public.lead_activities (lead_id, type, from_stage_id, to_stage_id, actor_employee_id)
    values (p_lead_id, 'stage_change', v_lead.stage_id, (select id from public.lead_stages where key = 'contacted'), app.current_employee_id());
  end if;
  return v_id;
end;
$$;

-- Converts a lead into a customer without re-entering data.
-- If a customer with the same phone exists, raises 'duplicate customer:<id>' unless p_merge_into is given.
create or replace function public.convert_lead_to_customer(
  p_lead_id uuid,
  p_customer_type public.customer_type default 'individual',
  p_national_id text default null,
  p_merge_into uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_customer uuid;
  v_existing uuid;
  v_won uuid := (select id from public.lead_stages where key = 'converted');
  v_from uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found or not app.can('leads', 'edit', v_lead.owner_employee_id, v_lead.department_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not app.has_permission('customers', 'create') and p_merge_into is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_lead.converted_customer_id is not null then
    return v_lead.converted_customer_id;
  end if;
  if v_lead.phone is null then
    raise exception 'phone is required to convert a lead' using errcode = 'P0001';
  end if;

  select id into v_existing from public.customers where phone = v_lead.phone and deleted_at is null;
  if p_merge_into is not null then
    if not app.can_customer(p_merge_into, 'edit') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
    v_customer := p_merge_into;
  elsif v_existing is not null then
    raise exception 'duplicate customer:%', v_existing using errcode = 'P0001';
  else
    insert into public.customers (customer_type, full_name, company_name, national_id, phone, email,
                                  owner_employee_id, source, converted_from_lead_id, status)
    values (p_customer_type, v_lead.full_name, v_lead.company_name, nullif(p_national_id, ''), v_lead.phone, v_lead.email,
            v_lead.owner_employee_id, coalesce(v_lead.source, 'lead_conversion'), v_lead.id, 'active')
    returning id into v_customer;
  end if;

  v_from := v_lead.stage_id;
  update public.leads set stage_id = v_won, converted_customer_id = v_customer, converted_at = now() where id = p_lead_id;
  insert into public.lead_activities (lead_id, type, from_stage_id, to_stage_id, summary, actor_employee_id)
  values (p_lead_id, 'converted', v_from, v_won, null, app.current_employee_id());

  -- carry the lead's open follow-ups, appointments and notes over to the customer (linked, not copied)
  update public.tasks set customer_id = v_customer where lead_id = p_lead_id;
  update public.appointments set customer_id = v_customer where lead_id = p_lead_id;
  -- earlier lead events become part of the customer's timeline
  update public.activity_events set customer_id = v_customer where lead_id = p_lead_id and customer_id is null;

  perform app.log_event(v_customer, p_lead_id, 'lead.converted',
    'تحول من عميل محتمل (' || v_lead.lead_no || ') إلى عميل',
    'Converted from lead ' || v_lead.lead_no);
  return v_customer;
end;
$$;

-- Global search across customers and leads (RLS applies: security invoker).
create or replace function public.global_search(p_query text)
returns table (kind text, id uuid, number text, title text, subtitle text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select '%' || trim(p_query) || '%' as pat, regexp_replace(p_query, '\D', '', 'g') as digits)
  (select 'customer', c.id, c.customer_no, c.full_name, c.phone
     from public.customers c, q
    where c.deleted_at is null and length(trim(p_query)) >= 2
      and (c.full_name ilike q.pat or c.company_name ilike q.pat or c.customer_no ilike q.pat
           or c.national_id = trim(p_query)
           or (length(q.digits) >= 4 and c.phone like '%' || ltrim(q.digits, '0') || '%'))
    order by c.full_name limit 8)
  union all
  (select 'lead', l.id, l.lead_no, l.full_name, coalesce(l.phone, l.email)
     from public.leads l, q
    where l.deleted_at is null and l.converted_customer_id is null and length(trim(p_query)) >= 2
      and (l.full_name ilike q.pat or l.company_name ilike q.pat or l.lead_no ilike q.pat
           or (length(q.digits) >= 4 and l.phone like '%' || ltrim(q.digits, '0') || '%'))
    order by l.full_name limit 8)
$$;

revoke execute on function public.change_lead_stage(uuid, uuid, text, timestamptz, text) from anon, public;
revoke execute on function public.log_lead_activity(uuid, public.lead_activity_type, text, timestamptz) from anon, public;
revoke execute on function public.convert_lead_to_customer(uuid, public.customer_type, text, uuid) from anon, public;
revoke execute on function public.global_search(text) from anon, public;
grant execute on function public.change_lead_stage(uuid, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.log_lead_activity(uuid, public.lead_activity_type, text, timestamptz) to authenticated;
grant execute on function public.convert_lead_to_customer(uuid, public.customer_type, text, uuid) to authenticated;
grant execute on function public.global_search(text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.lookups enable row level security;
alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.lead_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.appointments enable row level security;
alter table public.activity_events enable row level security;

-- lookups & stages: read for staff, edit via settings
create policy lookups_select on public.lookups for select to authenticated using (app.is_staff());
create policy lookups_write on public.lookups for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));
create policy lead_stages_select on public.lead_stages for select to authenticated using (app.is_staff());
create policy lead_stages_write on public.lead_stages for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));

-- customers
create policy customers_staff_select on public.customers for select to authenticated
  using (deleted_at is null and app.can('customers', 'view', owner_employee_id, department_id));
create policy customers_client_select on public.customers for select to authenticated
  using (deleted_at is null and user_id = (select auth.uid()));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.has_permission('customers', 'create'));
create policy customers_update on public.customers for update to authenticated
  using (app.can('customers', 'edit', owner_employee_id, department_id)
         or (deleted_at is null and app.can('customers', 'delete', owner_employee_id, department_id)))
  with check (app.is_staff());

-- customer contacts follow their customer
create policy customer_contacts_select on public.customer_contacts for select to authenticated
  using (app.can_customer(customer_id, 'view') or customer_id = app.current_customer_id());
create policy customer_contacts_write on public.customer_contacts for all to authenticated
  using (app.can_customer(customer_id, 'edit')) with check (app.can_customer(customer_id, 'edit'));

-- leads (staff only)
create policy leads_select on public.leads for select to authenticated
  using (deleted_at is null and app.can('leads', 'view', owner_employee_id, department_id));
create policy leads_insert on public.leads for insert to authenticated
  with check (app.has_permission('leads', 'create'));
create policy leads_update on public.leads for update to authenticated
  using (app.can('leads', 'edit', owner_employee_id, department_id)
         or (deleted_at is null and app.can('leads', 'delete', owner_employee_id, department_id)))
  with check (app.is_staff());

create policy lead_activities_select on public.lead_activities for select to authenticated
  using (app.can_lead(lead_id, 'view'));
-- lead activities are written through RPCs only

-- notes
create policy notes_staff_select on public.notes for select to authenticated
  using ((customer_id is not null and app.can_customer(customer_id, 'view'))
      or (lead_id is not null and app.can_lead(lead_id, 'view')));
create policy notes_client_select on public.notes for select to authenticated
  using (visibility = 'client' and customer_id = app.current_customer_id());
create policy notes_insert on public.notes for insert to authenticated
  with check (author_employee_id = app.current_employee_id()
    and ((customer_id is not null and app.can_customer(customer_id, 'view'))
      or (lead_id is not null and app.can_lead(lead_id, 'view'))));
create policy notes_update on public.notes for update to authenticated
  using (author_employee_id = app.current_employee_id()) with check (author_employee_id = app.current_employee_id());
create policy notes_delete on public.notes for delete to authenticated
  using (author_employee_id = app.current_employee_id());

-- tasks (follow-ups)
create policy tasks_select on public.tasks for select to authenticated
  using (app.can('tasks', 'view', assigned_to, department_id) or assigned_to = app.current_employee_id());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.has_permission('tasks', 'create')
    and (assigned_to is null or assigned_to = app.current_employee_id() or app.has_permission('tasks', 'assign'))
    and (customer_id is null or app.can_customer(customer_id, 'view'))
    and (lead_id is null or app.can_lead(lead_id, 'view')));
create policy tasks_update on public.tasks for update to authenticated
  using (app.can('tasks', 'edit', assigned_to, department_id) or assigned_to = app.current_employee_id())
  with check (app.is_staff());
create policy tasks_delete on public.tasks for delete to authenticated
  using (app.can('tasks', 'delete', assigned_to, department_id));

-- appointments
create policy appointments_select on public.appointments for select to authenticated
  using (app.can('appointments', 'view', employee_id, department_id) or employee_id = app.current_employee_id());
create policy appointments_client_select on public.appointments for select to authenticated
  using (customer_id is not null and customer_id = app.current_customer_id());
create policy appointments_insert on public.appointments for insert to authenticated
  with check (app.has_permission('appointments', 'create')
    and (employee_id is null or employee_id = app.current_employee_id() or app.has_permission('appointments', 'assign'))
    and (customer_id is null or app.can_customer(customer_id, 'view'))
    and (lead_id is null or app.can_lead(lead_id, 'view')));
create policy appointments_update on public.appointments for update to authenticated
  using (app.can('appointments', 'edit', employee_id, department_id) or employee_id = app.current_employee_id())
  with check (app.is_staff());
create policy appointments_delete on public.appointments for delete to authenticated
  using (app.can('appointments', 'delete', employee_id, department_id));

-- timeline: read only
create policy activity_events_staff_select on public.activity_events for select to authenticated
  using ((customer_id is not null and app.can_customer(customer_id, 'view'))
      or (customer_id is null and lead_id is not null and app.can_lead(lead_id, 'view')));
create policy activity_events_client_select on public.activity_events for select to authenticated
  using (visible_to_client and customer_id = app.current_customer_id());

-- Re-assignment for tasks/appointments to someone else needs "assign"
create or replace function app.guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module text := tg_table_name;
  v_new uuid;
  v_old uuid;
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_table_name = 'tasks' then v_new := new.assigned_to; v_old := old.assigned_to;
  else v_new := new.employee_id; v_old := old.employee_id; end if;
  if v_new is distinct from v_old and v_new is distinct from app.current_employee_id()
     and not app.has_permission(v_module, 'assign') then
    raise exception 'assign permission required' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_guard before update on public.tasks for each row execute function app.guard_assignment();
create trigger appointments_guard before update on public.appointments for each row execute function app.guard_assignment();

revoke execute on function app.log_event(uuid, uuid, text, text, text, jsonb, boolean) from authenticated, anon, public;

-- Helpers used inside RLS policies must be executable by signed-in users.
-- (No blanket grant on schema app: that would re-open locked functions such as bootstrap_super_admin.)
grant execute on function app.employee_department(uuid), app.current_customer_id(), app.can_customer(uuid, text),
  app.can_lead(uuid, text), app.employee_name(uuid) to authenticated, service_role;
