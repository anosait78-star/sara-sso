-- =====================================================================
-- Phase 6 · Insurance + commercial loans modules (PROJECT_PLAN §7.3).
-- The office is a paperwork broker only: the insurer issues the policy and the lender decides on
-- the loan. These modules hold "the thing" (the policy / the loan file) next to the workflow that
-- manages "the work", with maps_to copying request field values into them like company files.
--   Insurance: insurance_types, insurance_companies, insurance_policies, policy_renewals,
--              daily pg_cron job for expiry status + renewal reminders (30/15/7 days by default).
--   Loans:     financing_entities, loan_applications, loan_entity_submissions (each lender's decision).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference data (managed from the admin; read by staff and clients)
-- ---------------------------------------------------------------------
create table public.insurance_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name_ar text not null,
  name_en text,
  icon text,
  -- null = use app_settings.insurance_reminders.days_before
  reminder_days int[],
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.insurance_companies (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  name_en text,
  contact_name text,
  phone text,
  email text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.financing_entities (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  name_en text,
  kind text not null default 'bank' check (kind in ('bank', 'non_bank', 'leasing', 'initiative')),
  contact_name text,
  phone text,
  email text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.insurance_types (key, name_ar, name_en, icon, sort_order) values
  ('car', 'تأمين سيارات', 'Motor', 'car', 1),
  ('medical', 'تأمين طبي', 'Medical', 'heart-pulse', 2),
  ('life', 'تأمين حياة', 'Life', 'heart-handshake', 3),
  ('property', 'تأمين ممتلكات', 'Property', 'home', 4),
  ('business', 'تأمين شركات', 'Business', 'building-2', 5),
  ('travel', 'تأمين سفر', 'Travel', 'plane', 6);

insert into public.insurance_companies (name_ar, name_en, sort_order) values
  ('مصر للتأمين', 'Misr Insurance', 1),
  ('أليانز مصر', 'Allianz Egypt', 2),
  ('أكسا مصر', 'AXA Egypt', 3),
  ('جي آي جي مصر', 'GIG Egypt', 4),
  ('المهندس للتأمين', 'Al Mohandes Insurance', 5);

insert into public.financing_entities (name_ar, name_en, kind, sort_order) values
  ('بنك مصر', 'Banque Misr', 'bank', 1),
  ('البنك الأهلي المصري', 'National Bank of Egypt', 'bank', 2),
  ('بنك القاهرة', 'Banque du Caire', 'bank', 3),
  ('جهاز تنمية المشروعات', 'MSMEDA', 'initiative', 4),
  ('كونتكت للتأجير التمويلي', 'Contact Leasing', 'leasing', 5);

insert into public.lookups (type, key, name_ar, name_en, sort_order) values
  ('payment_frequency', 'annual', 'سنوي', 'Annual', 1),
  ('payment_frequency', 'semi_annual', 'نصف سنوي', 'Semi-annual', 2),
  ('payment_frequency', 'quarterly', 'ربع سنوي', 'Quarterly', 3),
  ('payment_frequency', 'monthly', 'شهري', 'Monthly', 4),
  ('financing_type', 'working_capital', 'رأس مال عامل', 'Working capital', 1),
  ('financing_type', 'equipment', 'تمويل معدات وآلات', 'Equipment financing', 2),
  ('financing_type', 'expansion', 'تمويل توسعات', 'Expansion', 3),
  ('financing_type', 'leasing', 'تأجير تمويلي', 'Leasing', 4),
  ('financing_type', 'sme_initiative', 'مبادرة المشروعات الصغيرة', 'SME initiative', 5);

-- ---------------------------------------------------------------------
-- Insurance policies
-- ---------------------------------------------------------------------
create type public.policy_status as enum ('pending', 'active', 'expiring', 'expired', 'renewed', 'cancelled');
create sequence public.policy_file_no_seq start 1;

create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  file_no text unique,
  -- the insurer's policy number (known once issued)
  policy_no text,
  customer_id uuid not null references public.customers (id) on delete restrict,
  insurance_type_id uuid references public.insurance_types (id) on delete set null,
  insurance_company_id uuid references public.insurance_companies (id) on delete set null,
  -- what is insured: "تويوتا كورولا 2022", "الأسرة (4 أفراد)", ...
  subject text,
  start_date date,
  end_date date,
  premium numeric(14, 2) check (premium is null or premium >= 0),
  coverage_amount numeric(16, 2) check (coverage_amount is null or coverage_amount >= 0),
  payment_frequency text,
  status public.policy_status not null default 'pending',
  renewed_from_policy_id uuid references public.insurance_policies (id) on delete set null,
  notes text,
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);
comment on table public.insurance_policies is 'A policy issued by an insurer for a customer; the office prepares, follows up and reminds about renewal.';
create index insurance_policies_customer_idx on public.insurance_policies (customer_id) where deleted_at is null;
create index insurance_policies_end_idx on public.insurance_policies (end_date) where status in ('active', 'expiring') and deleted_at is null;
create index insurance_policies_owner_idx on public.insurance_policies (owner_employee_id);

-- one row per expiry cycle of a policy: reminders sent, follow-up outcome, the renewed policy
create table public.policy_renewals (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'renewed', 'lost')),
  reminded_days int[] not null default '{}',
  task_id uuid references public.tasks (id) on delete set null,
  new_policy_id uuid references public.insurance_policies (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id, due_date)
);
create index policy_renewals_status_idx on public.policy_renewals (status, due_date);

-- ---------------------------------------------------------------------
-- Loan applications
-- ---------------------------------------------------------------------
create type public.loan_status as enum ('draft', 'preparing', 'submitted', 'approved', 'rejected', 'disbursed', 'cancelled');
create type public.submission_status as enum ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn');
create sequence public.loan_file_no_seq start 1;

create table public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  file_no text unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  financing_type text,
  requested_amount numeric(16, 2) check (requested_amount is null or requested_amount > 0),
  purpose text,
  tenor_months int check (tenor_months is null or tenor_months between 1 and 360),
  annual_revenue numeric(16, 2) check (annual_revenue is null or annual_revenue >= 0),
  years_in_business int check (years_in_business is null or years_in_business >= 0),
  employees_count int check (employees_count is null or employees_count >= 0),
  sector text,
  collateral text,
  approved_amount numeric(16, 2) check (approved_amount is null or approved_amount >= 0),
  status public.loan_status not null default 'draft',
  notes text,
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz
);
comment on table public.loan_applications is 'A financing file the office prepares and submits to lenders; the loan itself belongs to the lender.';
create index loan_applications_customer_idx on public.loan_applications (customer_id) where deleted_at is null;
create index loan_applications_owner_idx on public.loan_applications (owner_employee_id);

create table public.loan_entity_submissions (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications (id) on delete cascade,
  financing_entity_id uuid not null references public.financing_entities (id) on delete restrict,
  submitted_on date not null default current_date,
  status public.submission_status not null default 'submitted',
  decision_on date,
  decision_note text,
  offered_amount numeric(16, 2) check (offered_amount is null or offered_amount >= 0),
  offered_rate numeric(6, 3) check (offered_rate is null or offered_rate between 0 and 100),
  offered_tenor_months int check (offered_tenor_months is null or offered_tenor_months between 1 and 360),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_application_id, financing_entity_id)
);
create index loan_submissions_app_idx on public.loan_entity_submissions (loan_application_id);

alter table public.service_requests
  add column insurance_policy_id uuid references public.insurance_policies (id) on delete set null,
  add column loan_application_id uuid references public.loan_applications (id) on delete set null;
create index service_requests_policy_idx on public.service_requests (insurance_policy_id);
create index service_requests_loan_idx on public.service_requests (loan_application_id);

create trigger insurance_policies_updated_at before update on public.insurance_policies for each row execute function app.set_updated_at();
create trigger policy_renewals_updated_at before update on public.policy_renewals for each row execute function app.set_updated_at();
create trigger loan_applications_updated_at before update on public.loan_applications for each row execute function app.set_updated_at();
create trigger loan_submissions_updated_at before update on public.loan_entity_submissions for each row execute function app.set_updated_at();
create trigger audit_insurance_policies after insert or update or delete on public.insurance_policies
  for each row execute function app.audit_row_change('id', 'file_no');
create trigger audit_loan_applications after insert or update or delete on public.loan_applications
  for each row execute function app.audit_row_change('id', 'file_no');
create trigger audit_loan_submissions after insert or update or delete on public.loan_entity_submissions
  for each row execute function app.audit_row_change('id', 'status');

-- ---------------------------------------------------------------------
-- Policy status from dates
-- ---------------------------------------------------------------------
create or replace function app.policy_reminder_days(p_type uuid)
returns int[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select reminder_days from public.insurance_types where id = p_type and cardinality(reminder_days) > 0),
    (select array(select jsonb_array_elements_text(value -> 'days_before')::int) from public.app_settings where key = 'insurance_reminders'),
    array[30, 15, 7])
$$;

-- active / expiring / expired follow the end date; pending, renewed and cancelled are set by people
create or replace function app.policy_date_status(p_status public.policy_status, p_end date, p_type uuid)
returns public.policy_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status not in ('active', 'expiring', 'expired') or p_end is null then p_status
    when p_end < current_date then 'expired'::public.policy_status
    when p_end - current_date <= (select max(d) from unnest(app.policy_reminder_days(p_type)) d) then 'expiring'::public.policy_status
    else 'active'::public.policy_status
  end
$$;

create or replace function app.policy_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.file_no := coalesce(new.file_no, 'POL-' || lpad(nextval('public.policy_file_no_seq')::text, 5, '0'));
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.owner_employee_id := coalesce(new.owner_employee_id, app.current_employee_id());
    new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
  else
    if (select auth.uid()) is not null then
      if new.owner_employee_id is distinct from old.owner_employee_id
         and not app.can('insurance', 'assign', old.owner_employee_id, old.department_id) then
        raise exception 'assign permission required to change the owner' using errcode = '42501';
      end if;
      if new.deleted_at is not null and old.deleted_at is null
         and not app.can('insurance', 'delete', old.owner_employee_id, old.department_id) then
        raise exception 'delete permission required' using errcode = '42501';
      end if;
    end if;
    if new.owner_employee_id is distinct from old.owner_employee_id then
      new.department_id := app.employee_department(new.owner_employee_id);
    end if;
  end if;
  new.policy_no := nullif(trim(new.policy_no), '');
  -- issued = the insurer's number and the end date are known
  if new.status = 'pending' and new.policy_no is not null and new.end_date is not null then
    new.status := 'active';
  end if;
  new.status := app.policy_date_status(new.status, new.end_date, new.insurance_type_id);
  return new;
end;
$$;
create trigger insurance_policies_defaults before insert or update on public.insurance_policies
  for each row execute function app.policy_defaults();

create or replace function app.policy_label(p public.insurance_policies)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' — ', (select name_ar from public.insurance_types where id = p.insurance_type_id), coalesce(p.subject, p.policy_no, p.file_no))
$$;

create or replace function app.timeline_insurance_policies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := app.policy_label(new);
begin
  if tg_op = 'INSERT' then
    perform app.log_event(new.customer_id, null, 'policy.created', 'فُتح ملف وثيقة تأمين: ' || v_label, 'Insurance policy file opened: ' || v_label,
      jsonb_build_object('policy_id', new.id), false);
  elsif new.status is distinct from old.status and new.status = 'active' and old.status = 'pending' then
    perform app.log_event(new.customer_id, null, 'policy.issued',
      'صدرت وثيقة التأمين: ' || v_label || ' — سارية حتى ' || to_char(new.end_date, 'YYYY-MM-DD'),
      'Policy issued: ' || v_label, jsonb_build_object('policy_id', new.id), true);
  elsif new.status is distinct from old.status and new.status = 'expired' then
    perform app.log_event(new.customer_id, null, 'policy.expired', 'انتهت وثيقة التأمين: ' || v_label, 'Policy expired: ' || v_label,
      jsonb_build_object('policy_id', new.id), true);
  end if;
  return new;
end;
$$;
create trigger insurance_policies_timeline after insert or update on public.insurance_policies
  for each row execute function app.timeline_insurance_policies();

-- ---------------------------------------------------------------------
-- Daily job: expiry status + renewal reminders (staff notification, client notification, renewal task)
-- ---------------------------------------------------------------------
create or replace function app.run_policy_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  rn public.policy_renewals;
  v_left int;
  v_crossed int[];
  v_new int[];
  v_task uuid;
  v_label text;
  v_user uuid;
  n int := 0;
begin
  -- dates move, statuses follow
  update public.insurance_policies
     set status = app.policy_date_status(status, end_date, insurance_type_id)
   where deleted_at is null and status in ('active', 'expiring')
     and status is distinct from app.policy_date_status(status, end_date, insurance_type_id);

  for p in
    select ip.*, c.full_name as customer_name
    from public.insurance_policies ip
    join public.customers c on c.id = ip.customer_id
    where ip.deleted_at is null and ip.status = 'expiring' and ip.end_date >= current_date
  loop
    v_left := p.end_date - current_date;
    v_crossed := array(select d from unnest(app.policy_reminder_days(p.insurance_type_id)) d where v_left <= d order by d desc);
    continue when cardinality(v_crossed) = 0;

    insert into public.policy_renewals (policy_id, due_date) values (p.id, p.end_date)
    on conflict (policy_id, due_date) do nothing;
    select * into rn from public.policy_renewals where policy_id = p.id and due_date = p.end_date for update;
    continue when rn.status in ('renewed', 'lost');
    v_new := array(select d from unnest(v_crossed) d where not d = any (rn.reminded_days));
    continue when cardinality(v_new) = 0;

    v_label := concat_ws(' — ', (select name_ar from public.insurance_types where id = p.insurance_type_id), coalesce(p.subject, p.policy_no, p.file_no));
    v_task := rn.task_id;
    if v_task is null then
      insert into public.tasks (kind, title, description, assigned_to, department_id, customer_id, due_at, priority)
      values ('renewal', 'تجديد وثيقة: ' || v_label, 'العميل: ' || p.customer_name || ' · تنتهي ' || to_char(p.end_date, 'YYYY-MM-DD'),
              p.owner_employee_id, p.department_id, p.customer_id, (p.end_date - 1)::timestamptz + time '10:00',
              case when v_left <= 7 then 'high'::public.task_priority else 'normal'::public.task_priority end)
      returning id into v_task;
    elsif v_left <= 7 then
      update public.tasks set priority = 'high' where id = v_task and status in ('todo', 'in_progress');
    end if;
    update public.policy_renewals set reminded_days = reminded_days || v_new, task_id = v_task where id = rn.id;

    v_user := app.employee_user(p.owner_employee_id);
    perform app.notify(v_user, 'policy.renewal_due', 'تجديد وثيقة · ' || p.file_no,
      'وثيقة ' || v_label || ' للعميل ' || p.customer_name || ' تنتهي خلال ' || v_left || ' يوم',
      'insurance_policy', p.id, '/insurance/' || p.id);
    perform app.log_event(p.customer_id, null, 'policy.renewal_due',
      'وثيقة ' || v_label || ' تنتهي في ' || to_char(p.end_date, 'YYYY-MM-DD') || ' — تواصل معنا للتجديد',
      'Your policy ' || coalesce(p.policy_no, p.file_no) || ' expires on ' || to_char(p.end_date, 'YYYY-MM-DD'),
      jsonb_build_object('policy_id', p.id, 'days_left', v_left), true);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function app.run_policy_reminders() from authenticated, anon, public;
select cron.schedule('insurance-policy-reminders', '0 5 * * *', 'select app.run_policy_reminders()');

-- ---------------------------------------------------------------------
-- Loans: defaults, statuses, timeline
-- ---------------------------------------------------------------------
create or replace function app.loan_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.file_no := coalesce(new.file_no, 'LN-' || lpad(nextval('public.loan_file_no_seq')::text, 5, '0'));
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.owner_employee_id := coalesce(new.owner_employee_id, app.current_employee_id());
    new.department_id := coalesce(new.department_id, app.employee_department(new.owner_employee_id));
  else
    if (select auth.uid()) is not null then
      if new.owner_employee_id is distinct from old.owner_employee_id
         and not app.can('loans', 'assign', old.owner_employee_id, old.department_id) then
        raise exception 'assign permission required to change the owner' using errcode = '42501';
      end if;
      if new.deleted_at is not null and old.deleted_at is null
         and not app.can('loans', 'delete', old.owner_employee_id, old.department_id) then
        raise exception 'delete permission required' using errcode = '42501';
      end if;
    end if;
    if new.owner_employee_id is distinct from old.owner_employee_id then
      new.department_id := app.employee_department(new.owner_employee_id);
    end if;
  end if;
  -- approved without an amount: the best approved offer
  if new.status in ('approved', 'disbursed') and new.approved_amount is null and new.id is not null then
    new.approved_amount := (select max(offered_amount) from public.loan_entity_submissions
                            where loan_application_id = new.id and status = 'approved');
  end if;
  return new;
end;
$$;
create trigger loan_applications_defaults before insert or update on public.loan_applications
  for each row execute function app.loan_defaults();

create or replace function app.timeline_loan_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount text := coalesce(to_char(new.requested_amount, 'FM999,999,999,990') || ' ج.م', '');
begin
  if tg_op = 'INSERT' then
    perform app.log_event(new.customer_id, null, 'loan.created', 'فُتح ملف تمويل ' || new.file_no || ' ' || v_amount,
      'Financing file opened ' || new.file_no, jsonb_build_object('loan_application_id', new.id), false);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected', 'disbursed') then
    -- the decision reaches the client once staff record it on the file
    perform app.log_event(new.customer_id, null, 'loan.' || new.status::text,
      case new.status
        when 'approved' then 'تمت الموافقة على طلب التمويل' || coalesce(' بمبلغ ' || to_char(new.approved_amount, 'FM999,999,999,990') || ' ج.م', '')
        when 'rejected' then 'لم تتم الموافقة على طلب التمويل — سيتواصل معك فريقنا للخيارات المتاحة'
        else 'تم صرف التمويل' end,
      'Financing ' || new.status::text, jsonb_build_object('loan_application_id', new.id), true);
  end if;
  return new;
end;
$$;
create trigger loan_applications_timeline after insert or update on public.loan_applications
  for each row execute function app.timeline_loan_applications();

create or replace function app.loan_submission_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.decision_on := coalesce(new.decision_on, current_date);
  elsif new.status not in ('approved', 'rejected') then
    new.decision_on := null;
  end if;
  return new;
end;
$$;
create trigger loan_submissions_defaults before insert or update on public.loan_entity_submissions
  for each row execute function app.loan_submission_defaults();

-- staff-only timeline of each lender + the file moves to "submitted" on its first submission
create or replace function app.loan_submission_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.loan_applications;
  v_entity text := (select name_ar from public.financing_entities where id = new.financing_entity_id);
begin
  select * into v_app from public.loan_applications where id = new.loan_application_id;
  if tg_op = 'INSERT' then
    perform app.log_event(v_app.customer_id, null, 'loan.submitted', 'قُدّم ملف التمويل ' || v_app.file_no || ' إلى ' || v_entity,
      'Financing file submitted to ' || v_entity, jsonb_build_object('loan_application_id', v_app.id), false);
    if v_app.status in ('draft', 'preparing') then
      update public.loan_applications set status = 'submitted' where id = v_app.id;
    end if;
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform app.log_event(v_app.customer_id, null, 'loan.entity_decision',
      v_entity || ': ' || case when new.status = 'approved' then 'موافقة' || coalesce(' بمبلغ ' || to_char(new.offered_amount, 'FM999,999,999,990'), '') else 'رفض' end,
      v_entity || ': ' || new.status::text, jsonb_build_object('loan_application_id', v_app.id), false);
  end if;
  return new;
end;
$$;
create trigger loan_submissions_changed after insert or update on public.loan_entity_submissions
  for each row execute function app.loan_submission_changed();

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
create or replace function app.can_policy(p_policy uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.insurance_policies p
    where p.id = p_policy and p.deleted_at is null
      and (app.can('insurance', p_action, p.owner_employee_id, p.department_id)
           or (p_action = 'view' and exists (
                 select 1 from public.service_requests r where r.insurance_policy_id = p.id and app.can_request(r.id, 'view'))))
  )
$$;

create or replace function app.can_loan(p_loan uuid, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loan_applications l
    where l.id = p_loan and l.deleted_at is null
      and (app.can('loans', p_action, l.owner_employee_id, l.department_id)
           or (p_action = 'view' and exists (
                 select 1 from public.service_requests r where r.loan_application_id = l.id and app.can_request(r.id, 'view'))))
  )
$$;
grant execute on function app.can_policy(uuid, text), app.can_loan(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- maps_to: request field values -> insurance_policies.<column> / loan_applications.<column>
-- ---------------------------------------------------------------------
create or replace function app.apply_policy_value(p_policy uuid, p_target text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := split_part(p_target, '.', 2);
  v_text text := nullif(trim(p_value #>> '{}'), '');
begin
  if p_policy is null or split_part(coalesce(p_target, ''), '.', 1) <> 'insurance_policies' then
    return;
  end if;
  if v_col in ('start_date', 'end_date') then
    execute format('update public.insurance_policies set %I = $1::date where id = $2', v_col) using v_text, p_policy;
  elsif v_col in ('premium', 'coverage_amount') then
    execute format('update public.insurance_policies set %I = $1::numeric where id = $2', v_col) using v_text, p_policy;
  elsif v_col in ('policy_no', 'subject', 'payment_frequency') then
    execute format('update public.insurance_policies set %I = $1 where id = $2', v_col) using v_text, p_policy;
  elsif v_col = 'insurance_company' and v_text is not null then
    -- free text or a select label: matched to the insurer list by name
    update public.insurance_policies
       set insurance_company_id = coalesce(
             (select id from public.insurance_companies c
               where c.name_ar = v_text or lower(c.name_en) = lower(v_text)
                  or c.name_ar ilike '%' || v_text || '%' or v_text ilike '%' || c.name_ar || '%'
               order by (c.name_ar = v_text) desc, length(c.name_ar) desc limit 1),
             insurance_company_id)
     where id = p_policy;
  end if;
end;
$$;

create or replace function app.apply_loan_value(p_loan uuid, p_target text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := split_part(p_target, '.', 2);
  v_text text := nullif(trim(p_value #>> '{}'), '');
begin
  if p_loan is null or split_part(coalesce(p_target, ''), '.', 1) <> 'loan_applications' then
    return;
  end if;
  if v_col in ('requested_amount', 'annual_revenue') then
    execute format('update public.loan_applications set %I = $1::numeric where id = $2', v_col) using v_text, p_loan;
  elsif v_col in ('tenor_months', 'years_in_business', 'employees_count') then
    execute format('update public.loan_applications set %I = round($1::numeric)::int where id = $2', v_col) using v_text, p_loan;
  elsif v_col in ('financing_type', 'purpose', 'sector', 'collateral') then
    execute format('update public.loan_applications set %I = $1 where id = $2', v_col) using v_text, p_loan;
  end if;
end;
$$;

-- every mapped value of a request with a given target table prefix (latest step first wins last)
create or replace function app.request_mapped_values(p_request uuid, p_table text)
returns table (target text, value jsonb, raw jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select f ->> 'maps_to', app.mapped_display_value(f, rv.value), rv.value
  from public.request_field_values rv
  join public.service_request_steps s on s.id = rv.request_step_id
  cross join lateral jsonb_array_elements(s.fields_snapshot) f
  where rv.request_id = p_request and f ->> 'field_key' = rv.field_key and coalesce(f ->> 'maps_to', '') like p_table || '.%'
  order by s.sort_order
$$;

create or replace function app.sync_request_policy(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy uuid := (select insurance_policy_id from public.service_requests where id = p_request);
  v record;
begin
  for v in select * from app.request_mapped_values(p_request, 'insurance_policies') loop
    -- codes (payment_frequency) stay codes; free text keeps its label
    perform app.apply_policy_value(v_policy, v.target, case when v.target = 'insurance_policies.payment_frequency' then v.raw else v.value end);
  end loop;
end;
$$;

create or replace function app.sync_request_loan(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loan uuid := (select loan_application_id from public.service_requests where id = p_request);
  v record;
begin
  for v in select * from app.request_mapped_values(p_request, 'loan_applications') loop
    -- financing_type is a lookup key: keep the code
    perform app.apply_loan_value(v_loan, v.target, case when v.target = 'loan_applications.financing_type' then v.raw else v.value end);
  end loop;
end;
$$;

-- live copy whenever a mapped field of a linked request is saved
create or replace function app.request_value_to_modules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_field jsonb;
  v_target text;
begin
  select insurance_policy_id, loan_application_id into r from public.service_requests where id = new.request_id;
  if r.insurance_policy_id is null and r.loan_application_id is null then
    return new;
  end if;
  select f into v_field
  from public.service_request_steps s, jsonb_array_elements(s.fields_snapshot) f
  where s.id = new.request_step_id and f ->> 'field_key' = new.field_key;
  v_target := v_field ->> 'maps_to';
  if v_target like 'insurance_policies.%' then
    perform app.apply_policy_value(r.insurance_policy_id, v_target,
      case when v_target = 'insurance_policies.payment_frequency' then new.value else app.mapped_display_value(v_field, new.value) end);
  elsif v_target like 'loan_applications.%' then
    perform app.apply_loan_value(r.loan_application_id, v_target,
      case when v_target = 'loan_applications.financing_type' then new.value else app.mapped_display_value(v_field, new.value) end);
  end if;
  return new;
end;
$$;
create trigger request_field_values_modules after insert or update on public.request_field_values
  for each row execute function app.request_value_to_modules();

-- a completed insurance request issues its policy (if the dates are known)
create or replace function app.policy_on_request_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.insurance_policy_id is not null and new.status = 'completed' and old.status is distinct from 'completed' then
    update public.insurance_policies set status = 'active'
     where id = new.insurance_policy_id and status = 'pending' and end_date is not null;
  end if;
  return new;
end;
$$;
create trigger service_requests_policy_done after update on public.service_requests
  for each row execute function app.policy_on_request_done();

revoke execute on function app.apply_policy_value(uuid, text, jsonb), app.apply_loan_value(uuid, text, jsonb),
  app.sync_request_policy(uuid), app.sync_request_loan(uuid), app.request_mapped_values(uuid, text) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- RPCs: open from a request, link a request, renew a policy, follow up a renewal
-- ---------------------------------------------------------------------
create or replace function public.create_policy_from_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  v_type uuid;
  v_id uuid;
begin
  select * into r from public.service_requests where id = p_request_id and deleted_at is null for update;
  if not found or not app.can_request(p_request_id, 'edit') or not app.has_permission('insurance', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if r.insurance_policy_id is not null then
    return r.insurance_policy_id;
  end if;
  v_type := (select id from public.insurance_types where key = case (select code from public.services where id = r.service_id)
                                                                 when 'INS-CAR' then 'car' when 'INS-MED' then 'medical' end);
  perform set_config('app.action_key', 'policy.create_from_request', true);
  insert into public.insurance_policies (customer_id, owner_employee_id, insurance_type_id)
  values (r.customer_id, coalesce(r.owner_employee_id, app.current_employee_id()), v_type)
  returning id into v_id;
  update public.service_requests set insurance_policy_id = v_id where id = r.id;
  perform app.sync_request_policy(r.id);
  perform app.log_request_event(r.id, 'policy.linked', 'رُبط الطلب بملف الوثيقة', 'Linked to the policy file', jsonb_build_object('policy_id', v_id));
  return v_id;
end;
$$;

create or replace function public.link_request_policy(p_request_id uuid, p_policy_id uuid)
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
  if p_policy_id is not null then
    if not app.can_policy(p_policy_id, 'view') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
    if (select customer_id from public.insurance_policies where id = p_policy_id) <> r.customer_id then
      raise exception 'the policy belongs to another customer' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('app.action_key', 'policy.link', true);
  update public.service_requests set insurance_policy_id = p_policy_id where id = r.id;
  perform app.sync_request_policy(r.id);
  if p_policy_id is not null then
    perform app.log_request_event(r.id, 'policy.linked', 'رُبط الطلب بملف الوثيقة', 'Linked to the policy file', jsonb_build_object('policy_id', p_policy_id));
  end if;
end;
$$;

create or replace function public.create_loan_from_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  v_id uuid;
begin
  select * into r from public.service_requests where id = p_request_id and deleted_at is null for update;
  if not found or not app.can_request(p_request_id, 'edit') or not app.has_permission('loans', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if r.loan_application_id is not null then
    return r.loan_application_id;
  end if;
  perform set_config('app.action_key', 'loan.create_from_request', true);
  insert into public.loan_applications (customer_id, owner_employee_id, status, financing_type)
  values (r.customer_id, coalesce(r.owner_employee_id, app.current_employee_id()),
          case when r.status in ('completed', 'cancelled') then 'draft'::public.loan_status else 'preparing' end,
          case (select code from public.services where id = r.service_id) when 'LN-WC' then 'working_capital' when 'LN-EQ' then 'equipment' end)
  returning id into v_id;
  update public.service_requests set loan_application_id = v_id where id = r.id;
  perform app.sync_request_loan(r.id);
  perform app.log_request_event(r.id, 'loan.linked', 'رُبط الطلب بملف التمويل', 'Linked to the financing file', jsonb_build_object('loan_application_id', v_id));
  return v_id;
end;
$$;

create or replace function public.link_request_loan(p_request_id uuid, p_loan_id uuid)
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
  if p_loan_id is not null then
    if not app.can_loan(p_loan_id, 'view') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
    if (select customer_id from public.loan_applications where id = p_loan_id) <> r.customer_id then
      raise exception 'the financing file belongs to another customer' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('app.action_key', 'loan.link', true);
  update public.service_requests set loan_application_id = p_loan_id where id = r.id;
  perform app.sync_request_loan(r.id);
  if p_loan_id is not null then
    perform app.log_request_event(r.id, 'loan.linked', 'رُبط الطلب بملف التمويل', 'Linked to the financing file', jsonb_build_object('loan_application_id', p_loan_id));
  end if;
end;
$$;

-- Renewal: a new pending policy continues the old one (same customer, type, insurer, subject),
-- the old one becomes "renewed", the reminder cycle closes, and optionally an INS-RENEW request opens for the work.
create or replace function public.renew_insurance_policy(p_policy_id uuid, p_open_request boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.insurance_policies;
  v_new uuid;
  v_service uuid := (select id from public.services where code = 'INS-RENEW' and is_active and deleted_at is null);
  v_request uuid;
  v_len interval;
begin
  select * into p from public.insurance_policies where id = p_policy_id and deleted_at is null for update;
  if not found or not app.can_policy(p_policy_id, 'edit') or not app.has_permission('insurance', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p.status not in ('active', 'expiring', 'expired') then
    raise exception 'only an issued policy can be renewed' using errcode = 'P0001';
  end if;
  v_len := case when p.start_date is not null and p.end_date is not null then (p.end_date - p.start_date) * interval '1 day' else interval '1 year' end;
  perform set_config('app.action_key', 'policy.renew', true);
  insert into public.insurance_policies (customer_id, insurance_type_id, insurance_company_id, subject, start_date, end_date,
                                         premium, coverage_amount, payment_frequency, renewed_from_policy_id, owner_employee_id)
  values (p.customer_id, p.insurance_type_id, p.insurance_company_id, p.subject,
          coalesce(p.end_date + 1, current_date), (coalesce(p.end_date + 1, current_date) + v_len)::date,
          p.premium, p.coverage_amount, p.payment_frequency, p.id, p.owner_employee_id)
  returning id into v_new;
  update public.insurance_policies set status = 'renewed' where id = p.id;

  insert into public.policy_renewals (policy_id, due_date, status, new_policy_id)
  values (p.id, coalesce(p.end_date, current_date), 'renewed', v_new)
  on conflict (policy_id, due_date) do update set status = 'renewed', new_policy_id = excluded.new_policy_id;
  update public.tasks set status = 'done', outcome = coalesce(outcome, 'تم التجديد')
   where id in (select task_id from public.policy_renewals where policy_id = p.id) and status in ('todo', 'in_progress');

  if p_open_request and v_service is not null and app.has_permission('service_requests', 'create') then
    v_request := app.create_request(v_service, p.customer_id, coalesce(p.owner_employee_id, app.current_employee_id()), 'normal',
                                    'تجديد الوثيقة ' || coalesce(p.policy_no, p.file_no), 'admin');
    update public.service_requests set insurance_policy_id = v_new where id = v_request;
    perform app.log_request_event(v_request, 'policy.linked', 'رُبط الطلب بملف الوثيقة', 'Linked to the policy file', jsonb_build_object('policy_id', v_new));
  end if;
  perform app.log_event(p.customer_id, null, 'policy.renewal_started', 'بدأ تجديد وثيقة التأمين ' || coalesce(p.policy_no, p.file_no),
    'Policy renewal started', jsonb_build_object('policy_id', p.id, 'new_policy_id', v_new), true);
  return v_new;
end;
$$;

-- Follow-up outcome of a reminder cycle: contacted (still open) or lost (the client will not renew with us).
create or replace function public.update_policy_renewal(p_renewal_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rn public.policy_renewals;
begin
  select * into rn from public.policy_renewals where id = p_renewal_id for update;
  if not found or not app.can_policy(rn.policy_id, 'edit') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'contacted', 'lost') or rn.status = 'renewed' then
    raise exception 'invalid renewal status' using errcode = 'P0001';
  end if;
  update public.policy_renewals set status = p_status, note = coalesce(nullif(trim(p_note), ''), note) where id = rn.id;
  if p_status = 'lost' then
    update public.tasks set status = 'done', outcome = coalesce(nullif(trim(p_note), ''), 'لن يجدد')
     where id = rn.task_id and status in ('todo', 'in_progress');
  end if;
end;
$$;

revoke execute on function public.create_policy_from_request(uuid), public.link_request_policy(uuid, uuid),
  public.create_loan_from_request(uuid), public.link_request_loan(uuid, uuid),
  public.renew_insurance_policy(uuid, boolean), public.update_policy_renewal(uuid, text, text) from anon, public;
grant execute on function public.create_policy_from_request(uuid), public.link_request_policy(uuid, uuid),
  public.create_loan_from_request(uuid), public.link_request_loan(uuid, uuid),
  public.renew_insurance_policy(uuid, boolean), public.update_policy_renewal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.insurance_types enable row level security;
alter table public.insurance_companies enable row level security;
alter table public.financing_entities enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.policy_renewals enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loan_entity_submissions enable row level security;

-- reference lists: everyone signed in reads (clients see the insurer of their policy), settings editors manage
create policy insurance_types_select on public.insurance_types for select to authenticated using (true);
create policy insurance_types_write on public.insurance_types for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));
create policy insurance_companies_select on public.insurance_companies for select to authenticated using (true);
create policy insurance_companies_write on public.insurance_companies for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));
create policy financing_entities_select on public.financing_entities for select to authenticated using (app.is_staff());
create policy financing_entities_write on public.financing_entities for all to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));

-- inline select (see company_files): INSERT ... RETURNING must see the new row
create policy insurance_policies_staff_select on public.insurance_policies for select to authenticated
  using (deleted_at is null
         and (app.can('insurance', 'view', owner_employee_id, department_id)
              or exists (select 1 from public.service_requests r where r.insurance_policy_id = insurance_policies.id and app.can_request(r.id, 'view'))));
create policy insurance_policies_client_select on public.insurance_policies for select to authenticated
  using (deleted_at is null and customer_id = app.current_customer_id());
create policy insurance_policies_insert on public.insurance_policies for insert to authenticated
  with check (app.has_permission('insurance', 'create') and app.can_customer(customer_id, 'view'));
create policy insurance_policies_update on public.insurance_policies for update to authenticated
  using (app.can('insurance', 'edit', owner_employee_id, department_id)
         or (deleted_at is null and app.can('insurance', 'delete', owner_employee_id, department_id)))
  with check (app.is_staff());

-- renewals are written by the job and the RPCs only
create policy policy_renewals_select on public.policy_renewals for select to authenticated
  using (app.can_policy(policy_id, 'view'));

create policy loan_applications_staff_select on public.loan_applications for select to authenticated
  using (deleted_at is null
         and (app.can('loans', 'view', owner_employee_id, department_id)
              or exists (select 1 from public.service_requests r where r.loan_application_id = loan_applications.id and app.can_request(r.id, 'view'))));
create policy loan_applications_client_select on public.loan_applications for select to authenticated
  using (deleted_at is null and customer_id = app.current_customer_id());
create policy loan_applications_insert on public.loan_applications for insert to authenticated
  with check (app.has_permission('loans', 'create') and app.can_customer(customer_id, 'view'));
create policy loan_applications_update on public.loan_applications for update to authenticated
  using (app.can('loans', 'edit', owner_employee_id, department_id)
         or (deleted_at is null and app.can('loans', 'delete', owner_employee_id, department_id)))
  with check (app.is_staff());

-- lender submissions are internal: staff only
create policy loan_submissions_select on public.loan_entity_submissions for select to authenticated
  using (app.can_loan(loan_application_id, 'view'));
create policy loan_submissions_write on public.loan_entity_submissions for all to authenticated
  using (app.can_loan(loan_application_id, 'edit')) with check (app.can_loan(loan_application_id, 'edit'));
