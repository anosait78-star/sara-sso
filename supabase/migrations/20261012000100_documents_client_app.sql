-- =====================================================================
-- Phase 5 · Documents (Supabase Storage) + client app backend:
--   private bucket customer-documents (+ storage RLS), document_files versions, upload registration,
--   review (approve / reject / request a new copy), reuse of approved documents (D12),
--   client registration & account linking, client request creation and step data,
--   request messages, in-app notifications and push tokens.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Client identity: a suspended app account behaves like no account
-- ---------------------------------------------------------------------
create or replace function app.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.customers
  where user_id = (select auth.uid()) and deleted_at is null
    and status in ('active', 'self_registered') and app_access = 'active'
$$;

create or replace function app.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Documents: file versions, reuse, settings
-- ---------------------------------------------------------------------
alter table public.document_types add column reusable boolean not null default false;
comment on column public.document_types.reusable is 'Approved, non-expired copies are reused automatically in new requests (PROJECT_PLAN D12).';
update public.document_types set reusable = true
 where key in ('national_id', 'passport', 'personal_photo', 'driving_license', 'commercial_register', 'tax_card');

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_no int not null,
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  uploader_type text not null check (uploader_type in ('client', 'staff')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);
create index document_files_document_idx on public.document_files (document_id, version_no desc);

alter table public.documents
  add column current_file_id uuid references public.document_files (id) on delete set null,
  add column reused_from_document_id uuid references public.documents (id) on delete set null;

create trigger audit_document_files after insert or update or delete on public.document_files
  for each row execute function app.audit_row_change('id', 'storage_path');

-- default department for requests coming from the client app
insert into public.app_settings (key, value)
select 'client_requests', jsonb_build_object('default_department_id', id)
from public.departments where name_en = 'Customer Service'
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Storage: private bucket, path {customer_id}/{request_id|general}/{document_id}/v{n}-{uuid}.{ext}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-documents', 'customer-documents', false, 52428800,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

-- staff/clients who may read a document slot (and its files)
create or replace function app.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and (d.customer_id = app.current_customer_id()
           or (app.has_permission('documents', 'view')
               and (case when d.request_id is null then app.can_customer(d.customer_id, 'view') else app.can_request(d.request_id, 'view') end)))
  )
$$;

-- who may upload a new version: the owning client (not after approval, request still open) or staff with documents.create
create or replace function app.can_upload_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    left join public.service_requests r on r.id = d.request_id
    where d.id = p_document_id
      and (r.id is null or r.status not in ('completed', 'cancelled'))
      and ((d.customer_id = app.current_customer_id() and d.status <> 'approved')
           or (app.has_permission('documents', 'create')
               and (case when d.request_id is null then app.can_customer(d.customer_id, 'view') else app.can_request(d.request_id, 'view') end)))
  )
$$;

create or replace function app.document_path_prefix(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.customer_id::text || '/' || coalesce(d.request_id::text, 'general') || '/' || d.id::text || '/'
  from public.documents d where d.id = p_document_id
$$;

grant execute on function app.can_read_document(uuid), app.can_upload_document(uuid), app.document_path_prefix(uuid), app.try_uuid(text)
  to authenticated, service_role;

create policy "customer-documents insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and app.can_upload_document(app.try_uuid(split_part(name, '/', 3)))
    and starts_with(name, app.document_path_prefix(app.try_uuid(split_part(name, '/', 3))))
  );
create policy "customer-documents select" on storage.objects for select to authenticated
  using (bucket_id = 'customer-documents' and app.can_read_document(app.try_uuid(split_part(name, '/', 3))));
-- no update / delete policies: every upload is a new version and old versions are kept

-- ---------------------------------------------------------------------
-- Notifications (in-app; push dispatch arrives with Phase 7) and push tokens
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  link text,
  read_at timestamptz,
  channels text[] not null default array['in_app'],
  delivery_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, read_at, created_at desc);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create or replace function app.notify(
  p_user uuid, p_event text, p_title text, p_body text, p_entity_type text default null, p_entity_id uuid default null, p_link text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- nobody to tell, or the actor would be notified about their own action
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (recipient_user_id, event_key, title, body, entity_type, entity_id, link)
  values (p_user, p_event, p_title, p_body, p_entity_type, p_entity_id, p_link);
end;
$$;

create or replace function app.employee_user(p_employee uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile_id from public.employees where id = p_employee and status = 'active'
$$;

-- Everything the client may see on the request timeline is also an in-app notification for the client.
create or replace function app.notify_client_on_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_no text;
begin
  if not new.visible_to_client or new.customer_id is null then
    return new;
  end if;
  select c.user_id into v_user from public.customers c where c.id = new.customer_id and c.app_access = 'active';
  if new.service_request_id is not null then
    select request_no into v_no from public.service_requests where id = new.service_request_id;
  end if;
  perform app.notify(v_user, coalesce(new.event_type, 'update'), coalesce(v_no, 'SSO'), new.summary_ar,
                     case when new.service_request_id is not null then 'service_request' end, new.service_request_id,
                     case when new.service_request_id is not null then '/requests/' || new.service_request_id end);
  return new;
end;
$$;
create trigger activity_events_notify_client after insert on public.activity_events
  for each row execute function app.notify_client_on_event();

-- ---------------------------------------------------------------------
-- Request messages (per request, or a general inquiry without a request)
-- ---------------------------------------------------------------------
create table public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  sender_user_id uuid references auth.users (id) on delete set null,
  sender_type text not null check (sender_type in ('client', 'staff')),
  sender_name text,
  body text not null check (length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
comment on column public.request_messages.read_at is 'When the other side (staff for client messages, client for staff messages) read it.';
create index request_messages_request_idx on public.request_messages (request_id, created_at);
create index request_messages_customer_idx on public.request_messages (customer_id, created_at);

-- ---------------------------------------------------------------------
-- Client registration & account linking
-- ---------------------------------------------------------------------
create table public.account_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  matched_customer_id uuid not null references public.customers (id) on delete cascade,
  full_name text not null,
  national_id text not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index account_link_requests_status_idx on public.account_link_requests (status, created_at);
create trigger audit_account_link_requests after insert or update or delete on public.account_link_requests
  for each row execute function app.audit_row_change('id', 'phone');

-- 'registered' (phone / national id already has an app account) | 'match' (admin-created customer, needs linking) | 'new'
create or replace function public.check_client_registration(p_phone text, p_national_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.customers c where c.deleted_at is null and c.user_id is not null
                 and (c.phone = p_phone or c.national_id = p_national_id))
      or exists (select 1 from public.account_link_requests l where l.status <> 'rejected'
                 and (l.phone = p_phone or l.national_id = p_national_id))
      then 'registered'
    when exists (select 1 from public.customers c where c.deleted_at is null and c.user_id is null
                 and (c.phone = p_phone or c.national_id = p_national_id))
      then 'match'
    else 'new'
  end
$$;

-- Called by the client-register Edge Function (service role) right after creating the auth user.
create or replace function public.register_client_account(p_user_id uuid, p_full_name text, p_national_id text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check text := public.check_client_registration(p_phone, p_national_id);
  v_match uuid;
  v_customer uuid;
  v_dept uuid := app.try_uuid((select value ->> 'default_department_id' from public.app_settings where key = 'client_requests'));
begin
  if v_check = 'registered' then
    raise exception 'already registered' using errcode = '23505';
  end if;
  update public.profiles set user_type = 'client', full_name = p_full_name, phone = p_phone where id = p_user_id;
  perform set_config('app.action_key', 'client.register', true);

  if v_check = 'match' then
    select id into v_match from public.customers
    where deleted_at is null and user_id is null and (phone = p_phone or national_id = p_national_id)
    order by (national_id = p_national_id) desc nulls last limit 1;
    insert into public.account_link_requests (user_id, matched_customer_id, full_name, national_id, phone)
    values (p_user_id, v_match, p_full_name, p_national_id, p_phone);
    -- the matched customer's data stays hidden until an employee approves the link
    return jsonb_build_object('status', 'pending_link');
  end if;

  insert into public.customers (customer_type, full_name, national_id, phone, user_id, source, status, app_access, department_id)
  values ('individual', p_full_name, p_national_id, p_phone, p_user_id, 'client_app', 'self_registered', 'active', v_dept)
  returning id into v_customer;
  perform app.log_event(v_customer, null, 'customer.registered', 'سجل العميل من التطبيق', 'Registered from the client app');
  return jsonb_build_object('status', 'registered', 'customer_id', v_customer);
end;
$$;

revoke execute on function public.check_client_registration(text, text) from public, anon, authenticated;
revoke execute on function public.register_client_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.check_client_registration(text, text), public.register_client_account(uuid, text, text, text) to service_role;

-- What the client app needs right after sign-in.
create or replace function public.my_account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_type', p.user_type,
    'full_name', p.full_name,
    'must_change_password', p.must_change_password,
    'customer_id', c.id,
    'customer_no', c.customer_no,
    'customer_status', c.status,
    'app_access', c.app_access,
    'link_status', (select l.status from public.account_link_requests l where l.user_id = p.id)
  )
  from public.profiles p
  left join public.customers c on c.user_id = p.id and c.deleted_at is null
  where p.id = (select auth.uid())
$$;

-- Public company contact (login screen "forgot password" + app support buttons).
create or replace function public.get_company_contact()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name_ar', value ->> 'name_ar', 'name_en', value ->> 'name_en', 'phone', value ->> 'phone',
                            'whatsapp', value ->> 'whatsapp', 'email', value ->> 'email', 'address', value ->> 'address')
  from public.app_settings where key = 'company'
$$;
grant execute on function public.get_company_contact() to anon, authenticated;

create or replace function public.approve_account_link(p_link_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.account_link_requests;
  c public.customers;
begin
  if not app.has_permission('customers', 'manage_access') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into l from public.account_link_requests where id = p_link_id for update;
  if not found or l.status <> 'pending' then
    raise exception 'link request is not pending' using errcode = 'P0001';
  end if;
  select * into c from public.customers where id = l.matched_customer_id for update;
  if c.user_id is not null then
    raise exception 'customer already has an app account' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'customer.link_approve', true);
  update public.customers
     set user_id = l.user_id, app_access = 'active', national_id = coalesce(national_id, l.national_id)
   where id = c.id;
  update public.account_link_requests
     set status = 'approved', review_note = nullif(trim(p_note), ''), reviewed_by = app.current_employee_id(), reviewed_at = now()
   where id = l.id;
  perform app.log_event(c.id, null, 'customer.app_linked', 'تم ربط حساب التطبيق بالعميل', 'App account linked', '{}'::jsonb, true);
end;
$$;

create or replace function public.reject_account_link(p_link_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('customers', 'manage_access') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'customer.link_reject', true);
  update public.account_link_requests
     set status = 'rejected', review_note = trim(p_reason), reviewed_by = app.current_employee_id(), reviewed_at = now()
   where id = p_link_id and status = 'pending';
  if not found then
    raise exception 'link request is not pending' using errcode = 'P0001';
  end if;
end;
$$;

-- Audit entry for a password reset done by the client-access Edge Function (the password itself is never stored).
create or replace function public.log_client_access_change(p_customer_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not app.has_permission('customers', 'manage_access') or not app.can_customer(p_customer_id, 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_action not in ('password_reset', 'suspend', 'activate') then
    raise exception 'unknown action' using errcode = 'P0001';
  end if;
  insert into public.audit_logs (actor_user_id, actor_name, actor_type, action, action_key, table_name, record_id, record_label)
  select v_uid, (select full_name from public.profiles where id = v_uid), 'staff', 'rpc', 'customer.' || p_action, 'customers', c.id::text, c.customer_no
  from public.customers c where c.id = p_customer_id;
  if p_action = 'password_reset' then
    perform app.log_event(p_customer_id, null, 'customer.password_reset', 'أُعيد تعيين كلمة سر حساب التطبيق', 'App password reset');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Request creation (shared core) — staff RPC and client RPC
-- ---------------------------------------------------------------------
create or replace function app.create_request(
  p_service_id uuid, p_customer_id uuid, p_owner uuid, p_priority public.task_priority, p_notes text, p_source text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
  v_id uuid;
  v_ws record;
  v_step uuid;
  v_eta timestamptz := now();
begin
  select * into v_service from public.services where id = p_service_id and deleted_at is null;
  if not found or not v_service.is_active or v_service.current_workflow_id is null then
    raise exception 'service is not active' using errcode = 'P0001';
  end if;

  perform set_config('app.action_key', 'request.create', true);
  insert into public.service_requests (customer_id, service_id, workflow_id, status, owner_employee_id, priority, source, notes, submitted_at, total_amount)
  values (p_customer_id, p_service_id, v_service.current_workflow_id, 'submitted', p_owner, coalesce(p_priority, 'normal'), p_source,
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

    -- document slots; reusable types take the customer's latest approved, non-expired copy (D12)
    insert into public.documents (customer_id, request_id, request_step_id, document_type_id, name_ar, name_en, is_required, instructions_ar, max_files,
                                  status, current_file_id, reused_from_document_id, received_physically, review_note, reviewed_at, expires_at)
    select p_customer_id, v_id, v_step, rd.document_type_id, dt.name_ar, dt.name_en, rd.is_required, rd.instructions_ar, rd.max_files,
           case when src.id is not null then 'approved'::public.document_status else 'pending' end,
           src.current_file_id, src.id, coalesce(src.received_physically, false),
           case when src.id is not null then 'أُعيد استخدام نسخة معتمدة سابقة' end, src.reviewed_at, src.expires_at
    from public.required_documents rd
    join public.document_types dt on dt.id = rd.document_type_id
    left join lateral (
      select d.* from public.documents d
      where dt.reusable and d.customer_id = p_customer_id and d.document_type_id = rd.document_type_id
        and d.status = 'approved' and d.reused_from_document_id is null
        and (d.expires_at is null or d.expires_at >= current_date)
      order by d.reviewed_at desc nulls last
      limit 1
    ) src on true
    where rd.workflow_step_id = v_ws.id
    order by rd.sort_order;

    v_eta := app.add_duration(v_eta, v_ws.duration_value, v_ws.duration_unit);
  end loop;

  update public.service_requests set expected_completion_at = v_eta, due_at = v_eta where id = v_id;
  perform app.log_request_event(v_id, 'request.created',
    'تم إنشاء طلب ' || v_service.name_ar, 'Request created: ' || coalesce(v_service.name_en, v_service.name_ar),
    jsonb_build_object('service_id', p_service_id, 'source', p_source), true);
  perform app.advance_request(v_id);
  return v_id;
end;
$$;

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
  v_owner uuid := coalesce(p_owner_employee_id, app.current_employee_id());
begin
  if not app.has_permission('service_requests', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and deleted_at is null) or not app.can_customer(p_customer_id, 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_owner is distinct from app.current_employee_id() and not app.has_permission('service_requests', 'assign') then
    raise exception 'assign permission required to set another owner' using errcode = '42501';
  end if;
  return app.create_request(p_service_id, p_customer_id, v_owner, p_priority, p_notes, 'admin');
end;
$$;


-- The client orders a client-visible service. Owner: the customer's account manager when active,
-- otherwise the least-loaded employee of the default department for client requests.
create or replace function public.client_create_request(p_service_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_service public.services;
  v_owner uuid;
  v_dept uuid := app.try_uuid((select value ->> 'default_department_id' from public.app_settings where key = 'client_requests'));
  v_id uuid;
begin
  select * into v_customer from public.customers where id = app.current_customer_id();
  if not found then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_service from public.services where id = p_service_id and deleted_at is null;
  if not found or not v_service.is_active or not v_service.is_client_visible or not v_service.allow_client_request then
    raise exception 'service is not available' using errcode = 'P0001';
  end if;

  if app.employee_user(v_customer.owner_employee_id) is not null then
    v_owner := v_customer.owner_employee_id;
  else
    v_owner := coalesce(app.pick_employee(null, v_dept, null), app.pick_employee(null, null, null));
  end if;

  v_id := app.create_request(p_service_id, v_customer.id, v_owner, 'normal', p_notes, 'client_app');
  perform app.notify(app.employee_user(v_owner), 'admin.request.new',
    (select request_no from public.service_requests where id = v_id),
    'طلب جديد من التطبيق: ' || v_service.name_ar || ' — ' || v_customer.full_name,
    'service_request', v_id, '/requests/' || v_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Step data: shared validation, staff path and client path
-- ---------------------------------------------------------------------
create or replace function app.save_step_values(p_step public.service_request_steps, p_values jsonb, p_client_only boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  f jsonb;
  t text;
  rules jsonb;
  n numeric;
begin
  for k, v in select * from jsonb_each(coalesce(p_values, '{}'::jsonb)) loop
    f := null; -- SELECT INTO keeps the previous value when no row matches
    select x into f from jsonb_array_elements(p_step.fields_snapshot) x where x ->> 'field_key' = k;
    if f is null then
      raise exception 'unknown field %', k using errcode = 'P0001';
    end if;
    if p_client_only and f ->> 'filled_by' <> 'client' then
      raise exception 'field % is filled by staff', k using errcode = '42501';
    end if;
    t := f ->> 'field_type';
    rules := coalesce(f -> 'validation', '{}'::jsonb);

    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
      delete from public.request_field_values where request_step_id = p_step.id and field_key = k;
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
    values (p_step.request_id, p_step.id, k, t::public.field_type, v, (select auth.uid()))
    on conflict (request_step_id, field_key) do update set value = excluded.value, filled_by_user_id = excluded.filled_by_user_id;
  end loop;
end;
$$;
revoke execute on function app.save_step_values(public.service_request_steps, jsonb, boolean) from authenticated, anon, public;

create or replace function public.submit_step_data(p_request_step_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  v_status public.request_status;
begin
  select * into s from public.service_request_steps where id = p_request_step_id;
  if not found or not app.can_request(s.request_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select status into v_status from public.service_requests where id = s.request_id;
  if v_status in ('completed', 'cancelled') or s.status in ('completed', 'skipped') then
    raise exception 'step is closed' using errcode = 'P0001';
  end if;
  perform app.save_step_values(s, p_values, false);
end;
$$;

-- The client's own request, the current client-visible step, fields filled by the client only.
create or replace function app.client_current_step(p_request_step_id uuid)
returns public.service_request_steps
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps;
  r public.service_requests;
begin
  select * into s from public.service_request_steps where id = p_request_step_id;
  select * into r from public.service_requests where id = s.request_id;
  if s.id is null or r.customer_id is distinct from app.current_customer_id() or not s.is_client_visible then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if r.status in ('completed', 'cancelled', 'on_hold') or r.current_step_id is distinct from s.id
     or s.status not in ('active', 'waiting_client', 'returned') then
    raise exception 'step is not the active step' using errcode = 'P0001';
  end if;
  return s;
end;
$$;
revoke execute on function app.client_current_step(uuid) from authenticated, anon, public;

create or replace function public.client_submit_step_data(p_request_step_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.save_step_values(app.client_current_step(p_request_step_id), p_values, true);
end;
$$;

-- The client finished their part (data + uploads): the step goes back to the staff.
create or replace function public.client_submit_step(p_request_step_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.service_request_steps := app.client_current_step(p_request_step_id);
  v_missing int;
begin
  if s.status <> 'waiting_client' then
    raise exception 'nothing is waiting for the client' using errcode = 'P0001';
  end if;
  select count(*) into v_missing from (
    select 1 from jsonb_array_elements(s.fields_snapshot) f
    where f ->> 'filled_by' = 'client' and coalesce((f ->> 'is_required')::boolean, false)
      and not exists (select 1 from public.request_field_values v where v.request_step_id = s.id and v.field_key = f ->> 'field_key')
    union all
    select 1 from public.documents d where d.request_step_id = s.id and d.is_required and d.status in ('pending', 'rejected')
  ) m;
  if v_missing > 0 then
    raise exception 'step incomplete: % requirement(s) missing', v_missing using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.client_submit', true);
  update public.service_request_steps set status = 'active' where id = s.id;
  update public.service_requests set status = 'in_progress' where id = s.request_id and status = 'waiting_client';
  perform app.log_request_event(s.request_id, 'step.client_submitted',
    'أرسلت البيانات والمستندات المطلوبة في خطوة "' || s.name_ar || '" — جارٍ المراجعة',
    'Client submitted step "' || coalesce(s.name_en, s.name_ar) || '"', jsonb_build_object('step_id', s.id), true);
  perform app.notify(app.employee_user(s.assigned_employee_id), 'admin.step.client_submitted',
    (select request_no from public.service_requests where id = s.request_id),
    'العميل أرسل المطلوب في خطوة "' || s.name_ar || '"', 'service_request', s.request_id, '/requests/' || s.request_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Step activation: same as Phase 4 + notification to the assignee
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
    case when s.client_action_required then 'مطلوب منك: ' || s.name_ar
         else 'بدأت خطوة "' || s.name_ar || '"' end,
    'Step "' || coalesce(s.name_en, s.name_ar) || '" started',
    jsonb_build_object('step_id', s.id, 'due_at', v_due), s.is_client_visible);
  perform app.notify(app.employee_user(v_emp), 'admin.step.assigned', r.request_no,
    'أُسندت إليك خطوة "' || s.name_ar || '"', 'service_request', r.id, '/requests/' || r.id);
end;
$$;
revoke execute on function app.activate_step(uuid) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- Documents: upload registration and review
-- ---------------------------------------------------------------------
create or replace function public.register_document_upload(
  p_document_id uuid, p_path text, p_original_name text, p_mime text, p_size bigint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  dt public.document_types;
  r public.service_requests;
  s public.service_request_steps;
  v_is_client boolean;
  v_file uuid;
  v_version int;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or not app.can_upload_document(p_document_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_is_client := d.customer_id = app.current_customer_id();
  select * into dt from public.document_types where id = d.document_type_id;
  if not starts_with(p_path, app.document_path_prefix(d.id)) then
    raise exception 'invalid storage path' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'customer-documents' and o.name = p_path) then
    raise exception 'file not found in storage' using errcode = 'P0002';
  end if;
  if not (lower(p_mime) = any (dt.allowed_mime)) then
    raise exception 'file type not allowed' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > dt.max_size_mb::bigint * 1024 * 1024 then
    raise exception 'file is too large' using errcode = '22023';
  end if;

  perform set_config('app.action_key', 'document.upload', true);
  select coalesce(max(version_no), 0) + 1 into v_version from public.document_files where document_id = d.id;
  insert into public.document_files (document_id, version_no, storage_path, original_name, mime_type, size_bytes, uploaded_by, uploader_type)
  values (d.id, v_version, p_path, left(p_original_name, 200), lower(p_mime), p_size, (select auth.uid()), case when v_is_client then 'client' else 'staff' end)
  returning id into v_file;
  update public.documents
     set status = 'uploaded', current_file_id = v_file, received_physically = false, reused_from_document_id = null,
         reviewed_by = null, reviewed_at = null
   where id = d.id;

  if d.request_id is not null then
    select * into r from public.service_requests where id = d.request_id;
    select * into s from public.service_request_steps where id = d.request_step_id;
    -- a rejected document had put the request on the client; resume once nothing is rejected on the active step
    if r.status = 'waiting_client' and r.current_step_id = d.request_step_id and s.status in ('active', 'returned')
       and not exists (select 1 from public.documents x where x.request_step_id = d.request_step_id and x.status = 'rejected') then
      update public.service_requests set status = 'in_progress' where id = r.id;
    end if;
    perform app.log_request_event(r.id, 'document.uploaded', 'تم رفع مستند: ' || d.name_ar || ' (نسخة ' || v_version || ')',
      'Document uploaded: ' || coalesce(d.name_en, d.name_ar), jsonb_build_object('document_id', d.id, 'file_id', v_file), true);
    if v_is_client then
      perform app.notify(app.employee_user(coalesce(s.assigned_employee_id, r.owner_employee_id)), 'admin.document.uploaded', r.request_no,
        'رفع العميل مستند "' || d.name_ar || '" — يحتاج مراجعة', 'service_request', r.id, '/requests/' || r.id);
    end if;
  end if;
  return v_file;
end;
$$;

create or replace function public.start_document_review(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('documents', 'approve') or not app.can_read_document(p_document_id) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.documents set status = 'under_review' where id = p_document_id and status = 'uploaded';
end;
$$;

-- approve: with an uploaded file -> the file is approved; without a file -> received at the office (Phase 4 behaviour)
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
  perform set_config('app.action_key', 'document.approve', true);
  if d.current_file_id is not null then
    update public.document_files set review_status = 'approved', review_note = nullif(trim(p_note), '') where id = d.current_file_id;
  end if;
  update public.documents
     set status = 'approved', received_physically = (d.current_file_id is null), review_note = nullif(trim(p_note), ''),
         rejection_reason_id = null, rejection_note = null, reviewed_by = app.current_employee_id(), reviewed_at = now(),
         expires_at = coalesce(p_expires_at, expires_at)
   where id = d.id;
  if d.request_id is not null then
    select * into r from public.service_requests where id = d.request_id;
    select * into s from public.service_request_steps where id = r.current_step_id;
    if r.status = 'waiting_client' and s.status in ('active', 'returned')
       and not exists (select 1 from public.documents x where x.request_step_id = r.current_step_id and x.status = 'rejected') then
      update public.service_requests set status = 'in_progress' where id = r.id;
    end if;
    perform app.log_request_event(r.id, 'document.approved',
      case when d.current_file_id is null then 'تم استلام واعتماد مستند: ' else 'تم اعتماد مستند: ' end || d.name_ar,
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
  if d.current_file_id is not null then
    update public.document_files
       set review_status = 'rejected', review_note = concat_ws(' — ', v_reason, nullif(trim(p_note), ''))
     where id = d.current_file_id;
  end if;
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

-- A reused / approved copy is not good enough for this request: ask the client for a fresh one.
create or replace function public.request_new_document_copy(p_document_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  r public.service_requests;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or d.request_id is null or not app.has_permission('documents', 'approve') or not app.can_request(d.request_id, 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'document.new_copy', true);
  update public.documents
     set status = 'pending', current_file_id = null, reused_from_document_id = null, received_physically = false,
         review_note = trim(p_note), reviewed_by = app.current_employee_id(), reviewed_at = now()
   where id = d.id;
  select * into r from public.service_requests where id = d.request_id for update;
  if r.status = 'in_progress' and r.current_step_id = d.request_step_id then
    update public.service_requests set status = 'waiting_client' where id = r.id;
  end if;
  perform app.log_request_event(r.id, 'document.new_copy', 'مطلوب نسخة جديدة من: ' || d.name_ar || ' — ' || trim(p_note),
    'A new copy is required: ' || coalesce(d.name_en, d.name_ar), jsonb_build_object('document_id', d.id), true);
end;
$$;

-- ---------------------------------------------------------------------
-- Messages, notifications, push tokens
-- ---------------------------------------------------------------------
create or replace function public.send_request_message(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_client uuid := app.current_customer_id();
  r public.service_requests;
  v_customer uuid;
  v_id uuid;
  v_name text := (select full_name from public.profiles where id = v_uid);
  v_dept uuid;
  v_user uuid;
  v_label text;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'message is empty' using errcode = 'P0001';
  end if;
  if p_request_id is not null then
    select * into r from public.service_requests where id = p_request_id and deleted_at is null;
    if not found then raise exception 'permission denied' using errcode = '42501'; end if;
    v_label := r.request_no;
  end if;

  if v_client is not null then
    -- client: own request, or a general inquiry
    if p_request_id is not null and r.customer_id <> v_client then
      raise exception 'permission denied' using errcode = '42501';
    end if;
    v_customer := v_client;
    insert into public.request_messages (request_id, customer_id, sender_user_id, sender_type, sender_name, body)
    values (p_request_id, v_customer, v_uid, 'client', v_name, trim(p_body)) returning id into v_id;
    if p_request_id is not null then
      perform app.notify(app.employee_user(r.owner_employee_id), 'message.new', r.request_no, v_name || ': ' || left(trim(p_body), 140),
                         'service_request', r.id, '/requests/' || r.id);
    else
      -- general inquiry -> task for customer service
      v_dept := app.try_uuid((select value ->> 'default_department_id' from public.app_settings where key = 'client_requests'));
      insert into public.tasks (kind, title, description, assigned_to, department_id, customer_id, priority)
      values ('inquiry', 'استفسار من التطبيق: ' || v_name, trim(p_body),
              coalesce((select owner_employee_id from public.customers where id = v_customer and app.employee_user(owner_employee_id) is not null),
                       app.pick_employee(null, v_dept, null)),
              v_dept, v_customer, 'normal');
    end if;
    return v_id;
  end if;

  -- staff: only on requests they can work on
  if p_request_id is null or not app.can_request(p_request_id, 'view') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  insert into public.request_messages (request_id, customer_id, sender_user_id, sender_type, sender_name, body)
  values (p_request_id, r.customer_id, v_uid, 'staff', v_name, trim(p_body)) returning id into v_id;
  select user_id into v_user from public.customers where id = r.customer_id and app_access = 'active';
  perform app.notify(v_user, 'message.new', r.request_no, 'رسالة جديدة بخصوص طلبك ' || r.request_no, 'service_request', r.id, '/requests/' || r.id);
  return v_id;
end;
$$;

-- Marks the other side's messages as read (per request, or the general inquiry thread when null).
create or replace function public.mark_messages_read(p_request_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := app.current_customer_id();
begin
  if v_client is not null then
    update public.request_messages set read_at = now()
     where customer_id = v_client and sender_type = 'staff' and read_at is null and request_id is not distinct from p_request_id;
  elsif p_request_id is not null and app.can_request(p_request_id, 'view') then
    update public.request_messages set read_at = now()
     where request_id = p_request_id and sender_type = 'client' and read_at is null;
  end if;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where recipient_user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids))
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_tokens (user_id, token, platform)
  select (select auth.uid()), p_token, p_platform
  where (select auth.uid()) is not null
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now()
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_account_status()',
    'public.approve_account_link(uuid, text)',
    'public.reject_account_link(uuid, text)',
    'public.log_client_access_change(uuid, text)',
    'public.client_create_request(uuid, text)',
    'public.client_submit_step_data(uuid, jsonb)',
    'public.client_submit_step(uuid)',
    'public.register_document_upload(uuid, text, text, text, bigint)',
    'public.start_document_review(uuid)',
    'public.request_new_document_copy(uuid, text)',
    'public.send_request_message(uuid, text)',
    'public.mark_messages_read(uuid)',
    'public.mark_notifications_read(uuid[])',
    'public.register_push_token(text, text)'
  ] loop
    execute format('revoke execute on function %s from anon, public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
revoke execute on function app.notify(uuid, text, text, text, text, uuid, text), app.create_request(uuid, uuid, uuid, public.task_priority, text, text)
  from authenticated, anon, public;
grant execute on function app.employee_user(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.document_files enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.request_messages enable row level security;
alter table public.account_link_requests enable row level security;

create policy document_files_select on public.document_files for select to authenticated
  using (app.can_read_document(document_id));

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy push_tokens_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy request_messages_client_select on public.request_messages for select to authenticated
  using (customer_id = app.current_customer_id());
create policy request_messages_staff_select on public.request_messages for select to authenticated
  using ((request_id is not null and app.can_request(request_id, 'view'))
      or (request_id is null and app.can_customer(customer_id, 'view')));

create policy account_link_requests_select on public.account_link_requests for select to authenticated
  using (app.has_permission('customers', 'manage_access') or user_id = (select auth.uid()));

-- the client app shows the published steps & required documents of a service before ordering it
create or replace function app.is_public_workflow(p_workflow uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_workflows w join public.services s on s.id = w.service_id
    where w.id = p_workflow and w.status = 'published' and s.deleted_at is null and s.is_active and s.is_client_visible
  )
$$;
grant execute on function app.is_public_workflow(uuid) to authenticated, service_role;

create policy service_workflows_client_select on public.service_workflows for select to authenticated
  using (app.is_public_workflow(id));
create policy workflow_steps_client_select on public.workflow_steps for select to authenticated
  using (is_client_visible and app.is_public_workflow(workflow_id));
create policy required_documents_client_select on public.required_documents for select to authenticated
  using (exists (select 1 from public.workflow_steps s where s.id = workflow_step_id and s.is_client_visible and app.is_public_workflow(s.workflow_id)));

-- ---------------------------------------------------------------------
-- Realtime (notifications + messages); ignored where the publication does not exist
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications, public.request_messages;
exception when undefined_object then
  null;
end;
$$;
