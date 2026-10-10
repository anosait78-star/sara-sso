-- =====================================================================
-- Phase 6 · Company formation module (PROJECT_PLAN §7.3):
--   company_files (one per company, collects government procedures over time) + company_partners,
--   requests linked to a company file, dynamic field values copied into the file through
--   required_fields.maps_to = 'company_files.<column>', and the file marked established when its
--   formation request completes. The workflow manages the work; the company file holds "the thing".
-- =====================================================================

create type public.company_file_status as enum ('draft', 'in_progress', 'established', 'closed');

insert into public.lookups (type, key, name_ar, name_en, sort_order) values
  ('legal_form', 'llc', 'شركة ذات مسؤولية محدودة', 'Limited liability company (LLC)', 1),
  ('legal_form', 'one_person', 'شركة الشخص الواحد', 'One-person company', 2),
  ('legal_form', 'partnership', 'شركة تضامن', 'General partnership', 3),
  ('legal_form', 'limited_partnership', 'شركة توصية بسيطة', 'Limited partnership', 4),
  ('legal_form', 'joint_stock', 'شركة مساهمة', 'Joint stock company', 5),
  ('legal_form', 'sole_proprietorship', 'منشأة فردية', 'Sole proprietorship', 6);

create sequence public.company_file_no_seq start 1;

create table public.company_files (
  id uuid primary key default gen_random_uuid(),
  file_no text unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  proposed_names text[] not null default '{}',
  approved_name text,
  legal_form text,
  capital numeric(16, 2) check (capital is null or capital >= 0),
  activity text,
  address text,
  city text,
  commercial_register_no text,
  tax_card_no text,
  social_insurance_no text,
  chamber_no text,
  established_on date,
  status public.company_file_status not null default 'draft',
  notes text,
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
comment on table public.company_files is 'A company the office forms or serves; government procedures (requests) link to it over time.';
create index company_files_customer_idx on public.company_files (customer_id) where deleted_at is null;
create index company_files_owner_idx on public.company_files (owner_employee_id);

create table public.company_partners (
  id uuid primary key default gen_random_uuid(),
  company_file_id uuid not null references public.company_files (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) >= 2),
  national_id text check (national_id is null or national_id ~ '^[23][0-9]{13}$'),
  nationality text not null default 'مصري',
  share_percent numeric(5, 2) not null default 0 check (share_percent >= 0 and share_percent <= 100),
  is_manager boolean not null default false,
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  customer_id uuid references public.customers (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_partners_file_idx on public.company_partners (company_file_id, sort_order);

alter table public.service_requests
  add column company_file_id uuid references public.company_files (id) on delete set null;
create index service_requests_company_file_idx on public.service_requests (company_file_id);

create trigger company_files_updated_at before update on public.company_files for each row execute function app.set_updated_at();
create trigger company_partners_updated_at before update on public.company_partners for each row execute function app.set_updated_at();
create trigger audit_company_files after insert or update or delete on public.company_files
  for each row execute function app.audit_row_change('id', 'file_no');
create trigger audit_company_partners after insert or update or delete on public.company_partners
  for each row execute function app.audit_row_change('id', 'full_name');

-- ---------------------------------------------------------------------
-- Defaults, guards, timeline
-- ---------------------------------------------------------------------
create or replace function app.company_file_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.file_no := coalesce(new.file_no, 'CO-' || lpad(nextval('public.company_file_no_seq')::text, 5, '0'));
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.owner_employee_id := coalesce(new.owner_employee_id, app.current_employee_id());
    new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
    return new;
  end if;
  if (select auth.uid()) is not null then
    if new.owner_employee_id is distinct from old.owner_employee_id
       and not app.can('company_formation', 'assign', old.owner_employee_id, old.department_id) then
      raise exception 'assign permission required to change the owner' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null
       and not app.can('company_formation', 'delete', old.owner_employee_id, old.department_id) then
      raise exception 'delete permission required' using errcode = '42501';
    end if;
  end if;
  if new.owner_employee_id is distinct from old.owner_employee_id then
    new.department_id := app.employee_department(new.owner_employee_id);
  end if;
  new.proposed_names := array(select trim(x) from unnest(new.proposed_names) x where trim(x) <> '');
  return new;
end;
$$;
create trigger company_files_defaults before insert or update on public.company_files
  for each row execute function app.company_file_defaults();

create or replace function app.timeline_company_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(new.approved_name, new.proposed_names[1], new.file_no);
begin
  if tg_op = 'INSERT' then
    perform app.log_event(new.customer_id, null, 'company_file.created', 'فُتح ملف شركة: ' || v_name, 'Company file opened: ' || v_name,
      jsonb_build_object('company_file_id', new.id), true);
  elsif new.status is distinct from old.status and new.status = 'established' then
    perform app.log_event(new.customer_id, null, 'company_file.established', 'تم تأسيس الشركة: ' || v_name, 'Company established: ' || v_name,
      jsonb_build_object('company_file_id', new.id), true);
  end if;
  return new;
end;
$$;
create trigger company_files_timeline after insert or update on public.company_files
  for each row execute function app.timeline_company_files();

-- partner shares of one company cannot exceed 100%
create or replace function app.guard_partner_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select coalesce(sum(share_percent), 0) from public.company_partners where company_file_id = new.company_file_id) > 100 then
    raise exception 'partner shares exceed 100%%' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger company_partners_shares after insert or update on public.company_partners
  for each row execute function app.guard_partner_shares();

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
create or replace function app.can_company_file(p_file uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_files f
    where f.id = p_file and f.deleted_at is null
      and (app.can('company_formation', p_action, f.owner_employee_id, f.department_id)
           -- staff working on a linked request can read the file
           or (p_action = 'view' and exists (
                 select 1 from public.service_requests r where r.company_file_id = f.id and app.can_request(r.id, 'view'))))
  )
$$;
grant execute on function app.can_company_file(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- maps_to: request field values -> company file columns
-- ---------------------------------------------------------------------
-- Whitelisted targets only; text lists ("one per line") become proposed_names.
create or replace function app.apply_company_value(p_file uuid, p_target text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text;
  v_text text := p_value #>> '{}';
begin
  if p_file is null or split_part(coalesce(p_target, ''), '.', 1) <> 'company_files' then
    return;
  end if;
  v_col := split_part(p_target, '.', 2);
  if v_col = 'proposed_names' then
    update public.company_files
       set proposed_names = case jsonb_typeof(p_value)
                              when 'array' then array(select jsonb_array_elements_text(p_value))
                              else regexp_split_to_array(coalesce(v_text, ''), E'\\s*[\\n,،]\\s*') end
     where id = p_file;
  elsif v_col = 'capital' then
    update public.company_files set capital = v_text::numeric where id = p_file;
  elsif v_col = 'established_on' then
    update public.company_files set established_on = v_text::date where id = p_file;
  elsif v_col in ('approved_name', 'legal_form', 'activity', 'address', 'city', 'commercial_register_no', 'tax_card_no', 'social_insurance_no', 'chamber_no') then
    execute format('update public.company_files set %I = $1 where id = $2', v_col) using nullif(trim(v_text), ''), p_file;
  end if;
end;
$$;

-- Choice fields carry codes ("trade"); the company file keeps the readable label ("تجارة عامة").
create or replace function app.mapped_display_value(p_field jsonb, p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_field ->> 'field_type' = 'select' then
      to_jsonb(coalesce((select o ->> 'label_ar' from jsonb_array_elements(p_field -> 'options') o where o ->> 'value' = p_value #>> '{}'), p_value #>> '{}'))
    when p_field ->> 'field_type' = 'multiselect' and jsonb_typeof(p_value) = 'array' then
      to_jsonb((select string_agg(coalesce((select o ->> 'label_ar' from jsonb_array_elements(p_field -> 'options') o where o ->> 'value' = x), x), '، ')
                from jsonb_array_elements_text(p_value) x))
    else p_value
  end
$$;

-- Copies every mapped value of a request into its company file.
create or replace function app.sync_request_company_file(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file uuid := (select company_file_id from public.service_requests where id = p_request);
  v record;
begin
  if v_file is null then
    return;
  end if;
  for v in
    select f ->> 'maps_to' as target, app.mapped_display_value(f, rv.value) as value
    from public.request_field_values rv
    join public.service_request_steps s on s.id = rv.request_step_id
    cross join lateral jsonb_array_elements(s.fields_snapshot) f
    where rv.request_id = p_request and f ->> 'field_key' = rv.field_key and coalesce(f ->> 'maps_to', '') like 'company_files.%'
    order by s.sort_order
  loop
    perform app.apply_company_value(v_file, v.target, v.value);
  end loop;
end;
$$;

-- live copy whenever a mapped field of a linked request is saved
create or replace function app.request_value_to_company_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file uuid := (select company_file_id from public.service_requests where id = new.request_id);
  v_field jsonb;
begin
  if v_file is null then
    return new;
  end if;
  select f into v_field
  from public.service_request_steps s, jsonb_array_elements(s.fields_snapshot) f
  where s.id = new.request_step_id and f ->> 'field_key' = new.field_key;
  perform app.apply_company_value(v_file, v_field ->> 'maps_to', app.mapped_display_value(v_field, new.value));
  return new;
end;
$$;
create trigger request_field_values_company_file after insert or update on public.request_field_values
  for each row execute function app.request_value_to_company_file();

-- a completed formation request establishes its company
create or replace function app.company_file_on_request_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_file_id is not null and new.status = 'completed' and old.status is distinct from 'completed'
     and (select module_key from public.services where id = new.service_id) = 'company_formation' then
    update public.company_files
       set status = 'established', established_on = coalesce(established_on, current_date)
     where id = new.company_file_id and status in ('draft', 'in_progress');
  end if;
  return new;
end;
$$;
create trigger service_requests_company_file_done after update on public.service_requests
  for each row execute function app.company_file_on_request_done();

revoke execute on function app.apply_company_value(uuid, text, jsonb), app.sync_request_company_file(uuid)
  from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
-- Opens a company file from a request (same customer, owner = request owner) and copies the mapped values.
create or replace function public.create_company_file_from_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  v_file uuid;
begin
  select * into r from public.service_requests where id = p_request_id and deleted_at is null for update;
  if not found or not app.can_request(p_request_id, 'edit') or not app.has_permission('company_formation', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if r.company_file_id is not null then
    return r.company_file_id;
  end if;
  perform set_config('app.action_key', 'company_file.create_from_request', true);
  insert into public.company_files (customer_id, owner_employee_id, status, legal_form)
  values (r.customer_id, coalesce(r.owner_employee_id, app.current_employee_id()),
          case when r.status in ('completed', 'cancelled') then 'draft'::public.company_file_status else 'in_progress' end,
          case when (select code from public.services where id = r.service_id) = 'CF-LLC' then 'llc' end)
  returning id into v_file;
  update public.service_requests set company_file_id = v_file where id = r.id;
  perform app.sync_request_company_file(r.id);
  perform app.log_request_event(r.id, 'company_file.linked', 'رُبط الطلب بملف الشركة', 'Linked to the company file', jsonb_build_object('company_file_id', v_file));
  return v_file;
end;
$$;

-- Links a request to an existing company file of the same customer (or unlinks with null).
create or replace function public.link_request_company_file(p_request_id uuid, p_company_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where id = p_request_id and deleted_at is null for update;
  if not found or not app.can_request(p_request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_company_file_id is not null then
    if not app.can_company_file(p_company_file_id, 'view') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
    if (select customer_id from public.company_files where id = p_company_file_id) <> r.customer_id then
      raise exception 'the company file belongs to another customer' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('app.action_key', 'company_file.link', true);
  update public.service_requests set company_file_id = p_company_file_id where id = r.id;
  perform app.sync_request_company_file(r.id);
  if p_company_file_id is not null then
    perform app.log_request_event(r.id, 'company_file.linked', 'رُبط الطلب بملف الشركة', 'Linked to the company file', jsonb_build_object('company_file_id', p_company_file_id));
  end if;
end;
$$;

revoke execute on function public.create_company_file_from_request(uuid), public.link_request_company_file(uuid, uuid) from anon, public;
grant execute on function public.create_company_file_from_request(uuid), public.link_request_company_file(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.company_files enable row level security;
alter table public.company_partners enable row level security;

-- inline (not app.can_company_file): INSERT ... RETURNING must see the new row, which a lookup by id cannot yet
create policy company_files_staff_select on public.company_files for select to authenticated
  using (deleted_at is null
         and (app.can('company_formation', 'view', owner_employee_id, department_id)
              or exists (select 1 from public.service_requests r where r.company_file_id = company_files.id and app.can_request(r.id, 'view'))));
create policy company_files_client_select on public.company_files for select to authenticated
  using (deleted_at is null and customer_id = app.current_customer_id());
create policy company_files_insert on public.company_files for insert to authenticated
  with check (app.has_permission('company_formation', 'create') and app.can_customer(customer_id, 'view'));
create policy company_files_update on public.company_files for update to authenticated
  using (app.can('company_formation', 'edit', owner_employee_id, department_id)
         or (deleted_at is null and app.can('company_formation', 'delete', owner_employee_id, department_id)))
  with check (app.is_staff());

create policy company_partners_staff_select on public.company_partners for select to authenticated
  using (app.can_company_file(company_file_id, 'view'));
create policy company_partners_client_select on public.company_partners for select to authenticated
  using (exists (select 1 from public.company_files f where f.id = company_file_id and f.deleted_at is null and f.customer_id = app.current_customer_id()));
create policy company_partners_write on public.company_partners for all to authenticated
  using (app.can_company_file(company_file_id, 'edit')) with check (app.can_company_file(company_file_id, 'edit'));
