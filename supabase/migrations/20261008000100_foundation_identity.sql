-- =====================================================================
-- Phase 1 · Foundation: identity, departments, roles & permissions,
-- settings, audit log, helper functions and RLS.
-- =====================================================================

create schema if not exists app;
comment on schema app is 'Internal helper functions (not exposed through the API).';
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_type as enum ('staff', 'client');
create type public.employee_status as enum ('invited', 'active', 'suspended');
create type public.permission_scope as enum ('own', 'department', 'all');

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_type public.user_type not null default 'client',
  full_name text not null default '',
  phone text,
  email text,
  avatar_path text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user (staff or client).';

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null,
  name_en text,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
comment on column public.roles.is_system is 'System roles (super_admin) cannot be deleted or have their permissions changed.';

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  description_ar text,
  sort_order int not null default 0,
  unique (module, action)
);
comment on table public.permissions is 'Permission catalog — maintained through migrations only.';

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  scope public.permission_scope not null default 'all',
  primary key (role_id, permission_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  employee_no text unique,
  role_id uuid not null references public.roles (id) on delete restrict,
  department_id uuid references public.departments (id) on delete set null,
  job_title text,
  status public.employee_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index employees_role_idx on public.employees (role_id);
create index employees_department_idx on public.employees (department_id);

create sequence public.employee_no_seq start 1;
create or replace function app.set_employee_no()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.employee_no is null then
    new.employee_no := 'EMP-' || lpad(nextval('public.employee_no_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_name text,
  actor_type text not null default 'system' check (actor_type in ('staff', 'client', 'system')),
  action text not null check (action in ('insert', 'update', 'delete', 'rpc')),
  action_key text,
  table_name text not null,
  record_id text,
  record_label text,
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  ip_address text,
  user_agent text
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id);

-- updated_at + numbering triggers
create trigger profiles_updated_at before update on public.profiles for each row execute function app.set_updated_at();
create trigger departments_updated_at before update on public.departments for each row execute function app.set_updated_at();
create trigger roles_updated_at before update on public.roles for each row execute function app.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function app.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings for each row execute function app.set_updated_at();
create trigger employees_no before insert on public.employees for each row execute function app.set_employee_no();

-- ---------------------------------------------------------------------
-- New auth user -> profile
-- user_type / full_name come from app_metadata (settable only with the service role).
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, user_type, full_name, phone, email, must_change_password)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'user_type')::public.user_type, 'client'),
    coalesce(new.raw_app_meta_data ->> 'full_name', ''),
    new.phone,
    new.email,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Permission helpers (used by RLS and the API)
-- STABLE + SECURITY DEFINER so they can read the role tables regardless of RLS.
-- ---------------------------------------------------------------------
create or replace function app.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.profile_id = (select auth.uid())
    and e.status = 'active'
    and p.is_active
$$;

create or replace function app.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.department_id from public.employees e
  where e.id = app.current_employee_id()
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.current_employee_id() is not null
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    join public.roles r on r.id = e.role_id
    where e.id = app.current_employee_id() and r.key = 'super_admin'
  )
$$;

-- Returns the caller's scope for module.action, or null when not granted.
create or replace function app.perm_scope(p_module text, p_action text)
returns public.permission_scope
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.is_super_admin() then 'all'::public.permission_scope
    else (
      select rp.scope
      from public.employees e
      join public.role_permissions rp on rp.role_id = e.role_id
      join public.permissions pm on pm.id = rp.permission_id
      where e.id = app.current_employee_id()
        and pm.module = p_module
        and pm.action = p_action
    )
  end
$$;

-- Generic check used by RLS policies.
--   all        -> granted
--   department -> granted when p_department matches the caller's department
--   own        -> granted when p_owner is the caller's employee id
create or replace function app.can(
  p_module text,
  p_action text,
  p_owner uuid default null,
  p_department uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope public.permission_scope := app.perm_scope(p_module, p_action);
begin
  if v_scope is null then
    return false;
  elsif v_scope = 'all' then
    return true;
  elsif v_scope = 'department' then
    return p_department is not null and p_department = app.current_department_id();
  else
    return p_owner is not null and p_owner = app.current_employee_id();
  end if;
end;
$$;

-- Plain "has this permission at any scope" check.
create or replace function app.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.perm_scope(p_module, p_action) is not null
$$;

grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.handle_new_user() from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------
create or replace function public.get_my_permissions()
returns table (module text, action text, scope public.permission_scope)
language sql
stable
security definer
set search_path = ''
as $$
  select pm.module, pm.action,
         case when app.is_super_admin() then 'all'::public.permission_scope else rp.scope end
  from public.permissions pm
  left join public.role_permissions rp
    on rp.permission_id = pm.id
   and rp.role_id = (select e.role_id from public.employees e where e.id = app.current_employee_id())
  where app.is_staff()
    and (app.is_super_admin() or rp.permission_id is not null)
  order by pm.module, pm.sort_order
$$;
revoke execute on function public.get_my_permissions() from anon, public;
grant execute on function public.get_my_permissions() to authenticated;

-- Current staff member summary for the admin shell.
create or replace function public.get_my_staff_context()
returns table (
  employee_id uuid,
  employee_no text,
  full_name text,
  email text,
  locale text,
  must_change_password boolean,
  role_key text,
  role_name_ar text,
  role_name_en text,
  department_id uuid,
  department_name_ar text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.employee_no, p.full_name, p.email, p.locale, p.must_change_password,
         r.key, r.name_ar, r.name_en, d.id, d.name_ar
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  join public.roles r on r.id = e.role_id
  left join public.departments d on d.id = e.department_id
  where e.id = app.current_employee_id()
$$;
revoke execute on function public.get_my_staff_context() from anon, public;
grant execute on function public.get_my_staff_context() to authenticated;

-- Called by the user right after changing a temporary password.
create or replace function public.clear_must_change_password()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = (select auth.uid())
$$;
revoke execute on function public.clear_must_change_password() from anon, public;
grant execute on function public.clear_must_change_password() to authenticated;

-- Replace a role's permission set atomically (used by the Roles & Permissions screen).
create or replace function public.set_role_permissions(p_role_id uuid, p_grants jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.roles;
begin
  if not app.has_permission('roles', 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  if v_role.is_system then
    raise exception 'system role permissions cannot be changed' using errcode = '42501';
  end if;

  perform set_config('app.action_key', 'role.permissions_update', true);

  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (role_id, permission_id, scope)
  select p_role_id, pm.id, coalesce((g ->> 'scope')::public.permission_scope, 'all')
  from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g
  join public.permissions pm on pm.module = g ->> 'module' and pm.action = g ->> 'action';
end;
$$;
revoke execute on function public.set_role_permissions(uuid, jsonb) from anon, public;
grant execute on function public.set_role_permissions(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Custom access token hook: adds user_type / employee claims to the JWT.
-- (The claims are informational for the UI; RLS always re-checks the tables.)
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_user uuid := (event ->> 'user_id')::uuid;
  v_type public.user_type;
  v_emp record;
begin
  select user_type into v_type from public.profiles where id = v_user;
  v_claims := jsonb_set(v_claims, '{user_type}', to_jsonb(coalesce(v_type::text, 'client')));

  select e.id, e.status, r.key as role_key into v_emp
  from public.employees e join public.roles r on r.id = e.role_id
  where e.profile_id = v_user;

  if found then
    v_claims := jsonb_set(v_claims, '{employee_id}', to_jsonb(v_emp.id::text));
    v_claims := jsonb_set(v_claims, '{role_key}', to_jsonb(v_emp.role_key));
    v_claims := jsonb_set(v_claims, '{employee_status}', to_jsonb(v_emp.status::text));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- Integrity guards
-- ---------------------------------------------------------------------
-- System roles cannot be deleted or renamed (key).
create or replace function app.protect_system_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'system role cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_system and (new.key <> old.key or new.is_system <> old.is_system) then
    raise exception 'system role key cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and not old.is_system and new.is_system then
    raise exception 'roles cannot be promoted to system roles' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger roles_protect before update or delete on public.roles
  for each row execute function app.protect_system_roles();

-- Employees: no self role change, only super admins assign/remove super_admin,
-- and at least one active super admin must remain.
create or replace function app.guard_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super uuid := (select id from public.roles where key = 'super_admin');
  v_remaining int;
begin
  -- Service role / migrations (no auth.uid()) are trusted.
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.profile_id <> old.profile_id then
      raise exception 'profile cannot be changed' using errcode = '42501';
    end if;
    if new.role_id <> old.role_id then
      if old.profile_id = (select auth.uid()) then
        raise exception 'you cannot change your own role' using errcode = '42501';
      end if;
      if (new.role_id = v_super or old.role_id = v_super) and not app.is_super_admin() then
        raise exception 'only a super admin can assign or remove the super admin role' using errcode = '42501';
      end if;
    end if;
    if old.profile_id = (select auth.uid()) and new.status <> old.status then
      raise exception 'you cannot change your own status' using errcode = '42501';
    end if;
  end if;

  if (tg_op = 'DELETE' and old.role_id = v_super)
     or (tg_op = 'UPDATE' and old.role_id = v_super and old.status = 'active'
         and (new.role_id <> v_super or new.status <> 'active')) then
    select count(*) into v_remaining from public.employees
    where role_id = v_super and status = 'active' and id <> old.id;
    if v_remaining = 0 then
      raise exception 'at least one active super admin is required' using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
create trigger employees_guard before update or delete on public.employees
  for each row execute function app.guard_employee_changes();

-- ---------------------------------------------------------------------
-- Audit trigger (generic). TG_ARGV[0] = id column, TG_ARGV[1] = label column (optional)
-- ---------------------------------------------------------------------
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_uid uuid := (select auth.uid());
  v_actor_name text;
  v_actor_type text := 'system';
  v_headers jsonb;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k);
    if v_changed is null then
      return new; -- nothing meaningful changed
    end if;
    -- keep only the changed fields
    v_old := (select jsonb_object_agg(k, v_old -> k) from unnest(v_changed) k);
    v_new := (select jsonb_object_agg(k, v_new -> k) from unnest(v_changed) k);
  end if;

  if v_uid is not null then
    select p.full_name, p.user_type::text into v_actor_name, v_actor_type
    from public.profiles p where p.id = v_uid;
    v_actor_type := coalesce(v_actor_type, 'staff');
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  insert into public.audit_logs (
    actor_user_id, actor_name, actor_type, action, action_key, table_name,
    record_id, record_label, old_values, new_values, changed_fields, ip_address, user_agent
  ) values (
    v_uid, v_actor_name, v_actor_type, lower(tg_op),
    nullif(current_setting('app.action_key', true), ''),
    tg_table_name,
    v_row ->> coalesce(tg_argv[0], 'id'),
    case when tg_nargs > 1 then v_row ->> tg_argv[1] end,
    v_old, v_new, v_changed,
    split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    v_headers ->> 'user-agent'
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function app.audit_row_change('id', 'full_name');
create trigger audit_departments after insert or update or delete on public.departments
  for each row execute function app.audit_row_change('id', 'name_ar');
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function app.audit_row_change('id', 'name_ar');
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function app.audit_row_change('role_id');
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function app.audit_row_change('id', 'employee_no');
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function app.audit_row_change('key', 'key');

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: own row, or staff profiles for staff. (Client profiles get policies in Phase 2.)
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_staff on public.profiles for select to authenticated
  using (user_type = 'staff' and app.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_by_admin on public.profiles for update to authenticated
  using (user_type = 'staff' and app.has_permission('employees', 'edit'))
  with check (user_type = 'staff' and app.has_permission('employees', 'edit'));
-- Column privileges: users may only edit their display fields.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, locale, avatar_path, is_active) on public.profiles to authenticated;
-- is_active is only changeable through the admin policy above; block self-deactivation:
create or replace function app.guard_profile_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and new.is_active is distinct from old.is_active then
    raise exception 'you cannot change your own active status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_self_update();

-- departments
create policy departments_select on public.departments for select to authenticated
  using (app.is_staff());
create policy departments_insert on public.departments for insert to authenticated
  with check (app.has_permission('employees', 'create'));
create policy departments_update on public.departments for update to authenticated
  using (app.has_permission('employees', 'edit')) with check (app.has_permission('employees', 'edit'));
create policy departments_delete on public.departments for delete to authenticated
  using (app.has_permission('employees', 'delete'));

-- roles
create policy roles_select on public.roles for select to authenticated using (app.is_staff());
create policy roles_insert on public.roles for insert to authenticated
  with check (app.has_permission('roles', 'create'));
create policy roles_update on public.roles for update to authenticated
  using (app.has_permission('roles', 'edit')) with check (app.has_permission('roles', 'edit'));
create policy roles_delete on public.roles for delete to authenticated
  using (app.has_permission('roles', 'delete'));

-- permissions catalog: read-only for staff
create policy permissions_select on public.permissions for select to authenticated using (app.is_staff());

-- role_permissions: read for staff; writes only through set_role_permissions()
create policy role_permissions_select on public.role_permissions for select to authenticated using (app.is_staff());

-- employees
create policy employees_select on public.employees for select to authenticated
  using (profile_id = (select auth.uid()) or app.can('employees', 'view', id, department_id));
create policy employees_update on public.employees for update to authenticated
  using (app.can('employees', 'edit', id, department_id))
  with check (app.can('employees', 'edit', id, department_id));
-- inserts happen through the invite-employee Edge Function (service role)

-- app settings
create policy app_settings_select on public.app_settings for select to authenticated using (app.is_staff());
create policy app_settings_update on public.app_settings for update to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check (app.has_permission('settings', 'edit'));

-- audit logs: read-only, by permission. No insert/update/delete policies at all.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.has_permission('audit_logs', 'view'));

-- Hook needs to read these tables (it is security definer, owned by postgres).
grant usage on schema public to supabase_auth_admin;
