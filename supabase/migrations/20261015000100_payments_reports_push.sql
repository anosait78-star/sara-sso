-- =====================================================================
-- Phase 7 · Payments, reports, push notifications (PROJECT_PLAN §§ 12, 18; decisions D9/D10):
--   * payments are recorded manually by staff (no online gateway); the request keeps
--     paid_amount in sync, outstanding = total_amount - paid_amount; receipts are printable pages.
--   * report_* / dashboard_summary are SECURITY INVOKER: RLS scopes every number to what the caller may see.
--   * push = Expo push only: notifications for client users are queued (push_status = 'pending'),
--     rendered through editable templates and the user's preferences; pg_cron pokes the
--     dispatch-notification Edge Function which sends them through the Expo push API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'wallet', 'cheque');
create type public.payment_status as enum ('paid', 'refunded', 'cancelled');
create sequence public.payment_no_seq start 1;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_request_id uuid references public.service_requests (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  method public.payment_method not null default 'cash',
  status public.payment_status not null default 'paid',
  paid_at timestamptz not null default now(),
  reference_no text,
  notes text,
  void_reason text,
  voided_at timestamptz,
  recorded_by uuid references public.employees (id) on delete set null,
  -- copied from the request (or the customer) so payments follow the same scope rules
  owner_employee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
comment on table public.payments is 'Money received from a customer (service fees). Refunded / cancelled receipts stay for the audit trail.';
create index payments_request_idx on public.payments (service_request_id);
create index payments_customer_idx on public.payments (customer_id, paid_at desc);
create index payments_paid_at_idx on public.payments (paid_at) where status = 'paid';

create trigger payments_updated_at before update on public.payments for each row execute function app.set_updated_at();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function app.audit_row_change('id', 'payment_no');

create or replace function app.payment_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
  v_prefix text := coalesce((select value ->> 'payment_prefix' from public.app_settings where key = 'numbering'), 'PAY-');
begin
  if tg_op = 'INSERT' then
    new.payment_no := coalesce(new.payment_no, v_prefix || lpad(nextval('public.payment_no_seq')::text, 6, '0'));
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.recorded_by := coalesce(new.recorded_by, app.current_employee_id());
    new.status := 'paid';
    if new.service_request_id is not null then
      select * into r from public.service_requests where id = new.service_request_id and deleted_at is null for update;
      if not found then
        raise exception 'request not found' using errcode = 'P0001';
      end if;
      if r.status = 'cancelled' then
        raise exception 'cannot record a payment on a cancelled request' using errcode = 'P0001';
      end if;
      new.customer_id := r.customer_id;
      new.owner_employee_id := r.owner_employee_id;
      new.department_id := r.department_id;
      if r.total_amount is not null and r.paid_amount + new.amount > r.total_amount then
        raise exception 'payment exceeds the outstanding amount' using errcode = 'P0001';
      end if;
    else
      select owner_employee_id, department_id into new.owner_employee_id, new.department_id from public.customers where id = new.customer_id;
    end if;
    return new;
  end if;

  -- a receipt is never rewritten: only its status (with a reason), reference and notes may change
  if new.amount is distinct from old.amount or new.customer_id is distinct from old.customer_id
     or new.service_request_id is distinct from old.service_request_id or new.payment_no is distinct from old.payment_no
     or new.paid_at is distinct from old.paid_at or new.method is distinct from old.method then
    raise exception 'a recorded payment cannot be changed — cancel it and record a new one' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'paid' then
      raise exception 'only a paid receipt can be refunded or cancelled' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and not app.can('payments', 'approve', old.owner_employee_id, old.department_id) then
      raise exception 'approve permission required' using errcode = '42501';
    end if;
    if nullif(trim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'a reason is required' using errcode = 'P0001';
    end if;
    new.voided_at := now();
  end if;
  return new;
end;
$$;
create trigger payments_defaults before insert or update on public.payments
  for each row execute function app.payment_defaults();

-- request.paid_amount = sum of paid receipts; timeline + client notification
create or replace function app.payment_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount text := to_char(new.amount, 'FM999,999,999,990.##') || ' ج.م';
begin
  if new.service_request_id is not null then
    update public.service_requests
       set paid_amount = coalesce((select sum(amount) from public.payments where service_request_id = new.service_request_id and status = 'paid'), 0)
     where id = new.service_request_id;
  end if;
  if tg_op = 'INSERT' then
    if new.service_request_id is not null then
      perform app.log_request_event(new.service_request_id, 'payment.recorded', 'تم استلام دفعة ' || v_amount || ' — إيصال ' || new.payment_no,
        'Payment received: ' || new.amount || ' EGP', jsonb_build_object('payment_id', new.id), true);
    else
      perform app.log_event(new.customer_id, null, 'payment.recorded', 'تم استلام دفعة ' || v_amount || ' — إيصال ' || new.payment_no,
        'Payment received', jsonb_build_object('payment_id', new.id), true);
    end if;
  elsif new.status is distinct from old.status then
    if new.service_request_id is not null then
      perform app.log_request_event(new.service_request_id, 'payment.' || new.status::text,
        case new.status when 'refunded' then 'تم رد الدفعة ' else 'تم إلغاء الإيصال ' end || new.payment_no || ' (' || v_amount || ')',
        'Payment ' || new.status::text, jsonb_build_object('payment_id', new.id, 'reason', new.void_reason), true);
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_changed after insert or update on public.payments
  for each row execute function app.payment_changed();

-- The fee of a request (defaults to the service price): accountants (payments.edit) or managers (service_requests.approve).
create or replace function public.set_request_amount(p_request_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where id = p_request_id and deleted_at is null for update;
  if not found or not app.can_request(p_request_id, 'view')
     or not (app.has_permission('payments', 'edit') or app.can('service_requests', 'approve', r.owner_employee_id, r.department_id)) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount < r.paid_amount then
    raise exception 'the amount is less than what was already paid' using errcode = 'P0001';
  end if;
  perform set_config('app.action_key', 'request.set_amount', true);
  update public.service_requests set total_amount = p_amount where id = r.id;
  perform app.log_request_event(r.id, 'request.amount_set',
    'رسوم الطلب: ' || coalesce(to_char(p_amount, 'FM999,999,999,990.##') || ' ج.م', '—'), 'Request fee set', jsonb_build_object('amount', p_amount), false);
end;
$$;
revoke execute on function public.set_request_amount(uuid, numeric) from anon, public;
grant execute on function public.set_request_amount(uuid, numeric) to authenticated;

alter table public.payments enable row level security;
create policy payments_staff_select on public.payments for select to authenticated
  using (app.can('payments', 'view', owner_employee_id, department_id));
create policy payments_client_select on public.payments for select to authenticated
  using (customer_id = app.current_customer_id());
create policy payments_insert on public.payments for insert to authenticated
  with check (app.has_permission('payments', 'create') and app.can_customer(customer_id, 'view')
              and (service_request_id is null or app.can_request(service_request_id, 'view')));
create policy payments_update on public.payments for update to authenticated
  using (app.can('payments', 'edit', owner_employee_id, department_id) or app.can('payments', 'approve', owner_employee_id, department_id))
  with check (app.is_staff());

-- ---------------------------------------------------------------------
-- Reports (SECURITY INVOKER: RLS applies to every table read below)
-- ---------------------------------------------------------------------
create or replace function public.report_finance(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with paid as (
    select p.*, s.name_ar as service_ar, s.name_en as service_en
    from public.payments p
    left join public.service_requests r on r.id = p.service_request_id
    left join public.services s on s.id = r.service_id
    where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to + 1
  ), open_req as (
    select r.*, r.total_amount - r.paid_amount as balance, c.full_name, c.company_name
    from public.service_requests r join public.customers c on c.id = r.customer_id
    where r.deleted_at is null and r.status <> 'cancelled' and r.total_amount is not null and r.total_amount > r.paid_amount
  )
  select jsonb_build_object(
    'collected', coalesce((select sum(amount) from paid), 0),
    'receipts', (select count(*) from paid),
    'by_method', coalesce((select jsonb_agg(x order by x.total desc) from (select method::text as key, sum(amount) as total, count(*) as n from paid group by method) x), '[]'),
    'by_service', coalesce((select jsonb_agg(x order by x.total desc) from (
        select coalesce(service_ar, '—') as name_ar, service_en as name_en, sum(amount) as total, count(*) as n from paid group by service_ar, service_en) x), '[]'),
    'by_month', coalesce((select jsonb_agg(x order by x.month) from (
        select to_char(date_trunc('month', paid_at), 'YYYY-MM') as month, sum(amount) as total from paid group by 1) x), '[]'),
    'outstanding', coalesce((select sum(balance) from open_req), 0),
    'aging', jsonb_build_object(
        'd0_30', coalesce((select sum(balance) from open_req where coalesce(submitted_at, created_at) > now() - interval '30 days'), 0),
        'd31_60', coalesce((select sum(balance) from open_req where coalesce(submitted_at, created_at) <= now() - interval '30 days'
                                                                 and coalesce(submitted_at, created_at) > now() - interval '60 days'), 0),
        'd60_plus', coalesce((select sum(balance) from open_req where coalesce(submitted_at, created_at) <= now() - interval '60 days'), 0)),
    'top_debtors', coalesce((select jsonb_agg(x order by x.balance desc) from (
        select customer_id, coalesce(company_name, full_name) as name, sum(balance) as balance, count(*) as requests
        from open_req group by customer_id, coalesce(company_name, full_name) order by sum(balance) desc limit 10) x), '[]')
  )
$$;

create or replace function public.report_operations(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with req as (
    select r.*, s.name_ar as service_ar, s.name_en as service_en
    from public.service_requests r join public.services s on s.id = r.service_id
    where r.deleted_at is null and r.created_at >= p_from and r.created_at < p_to + 1
  ), done as (
    select r.* from public.service_requests r
    where r.deleted_at is null and r.status = 'completed' and r.completed_at >= p_from and r.completed_at < p_to + 1
  ), steps as (
    select st.step_key, st.name_ar, st.name_en, extract(epoch from (st.completed_at - st.started_at)) / 86400.0 as days
    from public.service_request_steps st
    join public.service_requests r on r.id = st.request_id and r.deleted_at is null
    where st.status = 'completed' and st.started_at is not null and st.completed_at >= p_from and st.completed_at < p_to + 1
  )
  select jsonb_build_object(
    'created', (select count(*) from req),
    'by_status', coalesce((select jsonb_agg(x) from (select status::text as key, count(*) as n from req group by status) x), '[]'),
    'by_service', coalesce((select jsonb_agg(x order by x.n desc) from (
        select service_ar as name_ar, service_en as name_en, count(*) as n, coalesce(sum(total_amount), 0) as value from req group by service_ar, service_en) x), '[]'),
    'completed', (select count(*) from done),
    'avg_days', (select round(avg(extract(epoch from (completed_at - coalesce(submitted_at, created_at))) / 86400.0)::numeric, 1) from done),
    'on_time_pct', (select round(100.0 * count(*) filter (where due_at is null or completed_at <= due_at) / nullif(count(*), 0)) from done),
    'overdue_open', (select count(*) from public.service_requests where deleted_at is null and is_overdue and status not in ('completed', 'cancelled')),
    'overdue_list', coalesce((select jsonb_agg(x order by x.due_at) from (
        select r.id, r.request_no, r.due_at, c.full_name as customer, s.name_ar as service_ar, s.name_en as service_en,
               st.name_ar as step_ar, st.name_en as step_en
        from public.service_requests r
        join public.customers c on c.id = r.customer_id
        join public.services s on s.id = r.service_id
        left join public.service_request_steps st on st.id = r.current_step_id
        where r.deleted_at is null and r.is_overdue and r.status not in ('completed', 'cancelled')
        order by r.due_at limit 10) x), '[]'),
    'bottlenecks', coalesce((select jsonb_agg(x order by x.avg_days desc) from (
        select step_key, min(name_ar) as name_ar, min(name_en) as name_en, round(avg(days)::numeric, 1) as avg_days, count(*) as n
        from steps group by step_key order by avg(days) desc limit 8) x), '[]')
  )
$$;

create or replace function public.report_employees(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.steps_done desc, x.tasks_done desc), '[]') from (
    select e.id, p.full_name as name, d.name_ar as department_ar, d.name_en as department_en,
      (select count(*) from public.tasks t where t.assigned_to = e.id and t.status = 'done' and t.completed_at >= p_from and t.completed_at < p_to + 1) as tasks_done,
      (select count(*) from public.tasks t where t.assigned_to = e.id and t.status in ('todo', 'in_progress') and t.due_at < now()) as tasks_overdue,
      (select count(*) from public.service_request_steps st where st.completed_by = e.id and st.status = 'completed' and st.completed_at >= p_from and st.completed_at < p_to + 1) as steps_done,
      (select round(avg(extract(epoch from (st.completed_at - st.started_at)) / 86400.0)::numeric, 1) from public.service_request_steps st
        where st.completed_by = e.id and st.status = 'completed' and st.started_at is not null and st.completed_at >= p_from and st.completed_at < p_to + 1) as avg_step_days,
      (select count(*) from public.documents dc where dc.reviewed_by = e.id and dc.reviewed_at >= p_from and dc.reviewed_at < p_to + 1) as documents_reviewed,
      (select count(*) from public.leads l where l.owner_employee_id = e.id and l.converted_at >= p_from and l.converted_at < p_to + 1) as leads_won
    from public.employees e
    join public.profiles p on p.id = e.profile_id
    left join public.departments d on d.id = e.department_id
    where e.status = 'active'
  ) x
$$;

create or replace function public.report_sales(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with l as (
    select l.*, st.key as stage_key, st.name_ar as stage_ar, st.name_en as stage_en, st.stage_category, st.sort_order as stage_order
    from public.leads l join public.lead_stages st on st.id = l.stage_id
    where l.deleted_at is null and l.created_at >= p_from and l.created_at < p_to + 1
  )
  select jsonb_build_object(
    'customers_total', (select count(*) from public.customers where deleted_at is null),
    'customers_new', (select count(*) from public.customers where deleted_at is null and created_at >= p_from and created_at < p_to + 1),
    'customers_by_source', coalesce((select jsonb_agg(x order by x.n desc) from (
        select coalesce(source, 'other') as key, count(*) as n from public.customers
        where deleted_at is null and created_at >= p_from and created_at < p_to + 1 group by 1) x), '[]'),
    'leads', (select count(*) from l),
    'by_stage', coalesce((select jsonb_agg(x order by x.sort_order) from (
        select stage_key as key, stage_ar as name_ar, stage_en as name_en, min(stage_order) as sort_order, count(*) as n from l group by stage_key, stage_ar, stage_en) x), '[]'),
    'by_source', coalesce((select jsonb_agg(x order by x.n desc) from (
        select coalesce(source, 'other') as key, count(*) as n, count(*) filter (where stage_category = 'won') as won from l group by 1) x), '[]'),
    'won', (select count(*) from l where stage_category = 'won'),
    'lost', (select count(*) from l where stage_category = 'lost'),
    'conversion_pct', (select round(100.0 * count(*) filter (where stage_category = 'won') / nullif(count(*) filter (where stage_category in ('won', 'lost')), 0)) from l),
    'lost_reasons', coalesce((select jsonb_agg(x order by x.n desc) from (
        select coalesce(lost_reason, 'other') as key, count(*) as n from l where stage_category = 'lost' group by 1) x), '[]')
  )
$$;

create or replace function public.report_lines()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'policies_active', (select count(*) from public.insurance_policies where deleted_at is null and status in ('active', 'expiring')),
    'expiring_30', (select count(*) from public.insurance_policies where deleted_at is null and status in ('active', 'expiring') and end_date < current_date + 30),
    'expiring_60', (select count(*) from public.insurance_policies where deleted_at is null and status in ('active', 'expiring') and end_date < current_date + 60),
    'expiring_90', (select count(*) from public.insurance_policies where deleted_at is null and status in ('active', 'expiring') and end_date < current_date + 90),
    'expired', (select count(*) from public.insurance_policies where deleted_at is null and status = 'expired'),
    'renewal_pct', (select round(100.0 * count(*) filter (where status = 'renewed') / nullif(count(*) filter (where status in ('renewed', 'lost')), 0)) from public.policy_renewals),
    'policies_by_company', coalesce((select jsonb_agg(x order by x.n desc) from (
        select c.name_ar, c.name_en, count(*) as n from public.insurance_policies p join public.insurance_companies c on c.id = p.insurance_company_id
        where p.deleted_at is null and p.status in ('active', 'expiring') group by c.name_ar, c.name_en) x), '[]'),
    'loans', (select count(*) from public.loan_applications where deleted_at is null),
    'loans_requested', coalesce((select sum(requested_amount) from public.loan_applications where deleted_at is null and status <> 'cancelled'), 0),
    'loans_approved', coalesce((select sum(approved_amount) from public.loan_applications where deleted_at is null and status in ('approved', 'disbursed')), 0),
    'loan_approval_pct', (select round(100.0 * count(*) filter (where status in ('approved', 'disbursed')) / nullif(count(*) filter (where status in ('approved', 'disbursed', 'rejected')), 0))
                          from public.loan_applications where deleted_at is null),
    'lenders', coalesce((select jsonb_agg(x order by x.submitted desc) from (
        select f.name_ar, f.name_en, count(*) as submitted, count(*) filter (where s.status = 'approved') as approved,
               count(*) filter (where s.status = 'rejected') as rejected, coalesce(sum(s.offered_amount) filter (where s.status = 'approved'), 0) as offered
        from public.loan_entity_submissions s join public.financing_entities f on f.id = s.financing_entity_id group by f.name_ar, f.name_en) x), '[]')
  )
$$;

-- Management dashboard: this month vs. the caller's visible data.
create or replace function public.dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'open_requests', (select count(*) from public.service_requests where deleted_at is null and status not in ('completed', 'cancelled')),
    'overdue_requests', (select count(*) from public.service_requests where deleted_at is null and is_overdue and status not in ('completed', 'cancelled')),
    'waiting_client', (select count(*) from public.service_requests where deleted_at is null and status = 'waiting_client'),
    'completed_month', (select count(*) from public.service_requests where deleted_at is null and status = 'completed' and completed_at >= date_trunc('month', now())),
    'new_customers_month', (select count(*) from public.customers where deleted_at is null and created_at >= date_trunc('month', now())),
    'open_leads', (select count(*) from public.leads l join public.lead_stages s on s.id = l.stage_id where l.deleted_at is null and s.stage_category = 'open'),
    'collected_month', coalesce((select sum(amount) from public.payments where status = 'paid' and paid_at >= date_trunc('month', now())), 0),
    'outstanding', coalesce((select sum(total_amount - paid_amount) from public.service_requests
                             where deleted_at is null and status <> 'cancelled' and total_amount > paid_amount), 0),
    'documents_to_review', (select count(*) from public.documents where status in ('uploaded', 'under_review')),
    'expiring_policies', (select count(*) from public.insurance_policies where deleted_at is null and status = 'expiring'),
    'requests_by_status', coalesce((select jsonb_agg(x) from (
        select status::text as key, count(*) as n from public.service_requests where deleted_at is null and status not in ('completed', 'cancelled') group by status) x), '[]'),
    'revenue_6m', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'total', coalesce((select sum(amount) from public.payments where status = 'paid' and paid_at >= m and paid_at < m + interval '1 month'), 0)) order by m)
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m),
    'requests_6m', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'created', (select count(*) from public.service_requests where deleted_at is null and created_at >= m and created_at < m + interval '1 month'),
        'completed', (select count(*) from public.service_requests where deleted_at is null and completed_at >= m and completed_at < m + interval '1 month')) order by m)
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m)
  )
$$;

revoke execute on function public.report_finance(date, date), public.report_operations(date, date), public.report_employees(date, date),
  public.report_sales(date, date), public.report_lines(), public.dashboard_summary() from anon, public;
grant execute on function public.report_finance(date, date), public.report_operations(date, date), public.report_employees(date, date),
  public.report_sales(date, date), public.report_lines(), public.dashboard_summary() to authenticated;

-- ---------------------------------------------------------------------
-- Push notifications: templates, preferences, queue
-- ---------------------------------------------------------------------
create table public.notification_templates (
  event_key text primary key,
  category text not null check (category in ('requests', 'documents', 'payments', 'messages', 'insurance', 'loans', 'general')),
  description_ar text,
  -- {{title}} {{body}} {{app_name}} are replaced when the push is queued
  title_tpl text not null default '{{title}}',
  body_tpl text not null default '{{body}}',
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger notification_templates_updated_at before update on public.notification_templates for each row execute function app.set_updated_at();
create trigger audit_notification_templates after insert or update or delete on public.notification_templates
  for each row execute function app.audit_row_change('event_key', 'event_key');

insert into public.notification_templates (event_key, category, description_ar, title_tpl, body_tpl) values
  ('request.created', 'requests', 'استلام طلب جديد', 'تم استلام طلبك {{title}}', '{{body}}'),
  ('step.started', 'requests', 'بدء خطوة في الطلب', 'تحديث على طلبك {{title}}', '{{body}}'),
  ('step.completed', 'requests', 'انتهاء خطوة في الطلب', 'تحديث على طلبك {{title}}', '{{body}}'),
  ('request.completed', 'requests', 'اكتمال الطلب', 'طلبك {{title}} اكتمل 🎉', '{{body}}'),
  ('request.cancelled', 'requests', 'إلغاء الطلب', 'طلبك {{title}}', '{{body}}'),
  ('document.approved', 'documents', 'قبول مستند', 'تم قبول مستندك', '{{body}}'),
  ('document.rejected', 'documents', 'رفض مستند', 'مستند يحتاج إعادة رفع', '{{body}}'),
  ('message.new', 'messages', 'رسالة جديدة', 'رسالة جديدة من {{app_name}}', '{{body}}'),
  ('payment.recorded', 'payments', 'استلام دفعة', 'تم استلام دفعتك', '{{body}}'),
  ('payment.refunded', 'payments', 'رد دفعة', 'تحديث على مدفوعاتك', '{{body}}'),
  ('payment.cancelled', 'payments', 'إلغاء إيصال', 'تحديث على مدفوعاتك', '{{body}}'),
  ('policy.issued', 'insurance', 'إصدار وثيقة تأمين', 'وثيقتك صدرت', '{{body}}'),
  ('policy.renewal_due', 'insurance', 'تذكير تجديد وثيقة', 'وثيقتك قربت تنتهي', '{{body}}'),
  ('policy.expired', 'insurance', 'انتهاء وثيقة', 'وثيقتك انتهت', '{{body}}'),
  ('loan.approved', 'loans', 'موافقة على التمويل', 'أخبار طلب التمويل', '{{body}}'),
  ('loan.rejected', 'loans', 'رفض التمويل', 'أخبار طلب التمويل', '{{body}}'),
  ('loan.disbursed', 'loans', 'صرف التمويل', 'تم صرف التمويل', '{{body}}'),
  ('company_file.established', 'requests', 'تأسيس الشركة', 'مبروك! شركتك اتأسست', '{{body}}');

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('requests', 'documents', 'payments', 'messages', 'insurance', 'loans', 'general')),
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.notifications
  add column push_status text check (push_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column push_title text,
  add column push_body text,
  add column push_error text,
  add column push_attempted_at timestamptz;
create index notifications_push_pending_idx on public.notifications (created_at) where push_status = 'pending';

create or replace function app.notification_category(p_event text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event like 'document.%' then 'documents'
    when p_event like 'payment.%' then 'payments'
    when p_event like 'message%' then 'messages'
    when p_event like 'policy.%' then 'insurance'
    when p_event like 'loan.%' then 'loans'
    when p_event like 'request.%' or p_event like 'step.%' or p_event like 'company_file.%' then 'requests'
    else 'general' end
$$;

-- Client recipients with a device get a rendered push queued; staff (web admin) and opted-out users are skipped.
create or replace function app.queue_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tpl public.notification_templates;
  v_category text;
  v_app text := coalesce((select value ->> 'name_ar' from public.app_settings where key = 'company'), 'SSO');
begin
  if not exists (select 1 from public.customers where user_id = new.recipient_user_id) then
    return new;
  end if;
  select * into tpl from public.notification_templates where event_key = new.event_key;
  v_category := coalesce(tpl.category, app.notification_category(new.event_key));
  if not exists (select 1 from public.push_tokens where user_id = new.recipient_user_id)
     or (tpl.event_key is not null and not tpl.push_enabled)
     or exists (select 1 from public.notification_preferences where user_id = new.recipient_user_id and category = v_category and not push) then
    new.push_status := 'skipped';
    return new;
  end if;
  new.push_status := 'pending';
  new.push_title := left(replace(replace(replace(coalesce(tpl.title_tpl, '{{title}}'), '{{title}}', coalesce(new.title, '')), '{{body}}', coalesce(new.body, '')), '{{app_name}}', v_app), 120);
  new.push_body := left(replace(replace(replace(coalesce(tpl.body_tpl, '{{body}}'), '{{title}}', coalesce(new.title, '')), '{{body}}', coalesce(new.body, '')), '{{app_name}}', v_app), 400);
  new.channels := array(select distinct x from unnest(new.channels || array['push']) x);
  return new;
end;
$$;
create trigger notifications_queue_push before insert on public.notifications
  for each row execute function app.queue_push();

-- Called by dispatch-notification (service role): claims a batch with the recipients' device tokens.
create or replace function public.claim_push_batch(p_limit int default 100)
returns table (id uuid, title text, body text, link text, entity_type text, entity_id uuid, tokens text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- stuck in "sending" (function crashed) -> try again
  update public.notifications set push_status = 'pending' where push_status = 'sending' and push_attempted_at < now() - interval '10 minutes';
  return query
  with batch as (
    select n.id from public.notifications n where n.push_status = 'pending' order by n.created_at limit p_limit for update skip locked
  ), claimed as (
    update public.notifications n set push_status = 'sending', push_attempted_at = now()
    from batch where n.id = batch.id
    returning n.id, n.recipient_user_id, n.push_title, n.push_body, n.link, n.entity_type, n.entity_id
  )
  select c.id, c.push_title, c.push_body, c.link, c.entity_type, c.entity_id,
         array(select t.token from public.push_tokens t where t.user_id = c.recipient_user_id)
  from claimed c;
end;
$$;

-- p_results: [{ "id": uuid, "status": "sent" | "failed", "error": text, "invalid_tokens": [text] }]
create or replace function public.finish_push_batch(p_results jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set push_status = x.status, push_error = x.error
    from jsonb_to_recordset(p_results) as x(id uuid, status text, error text)
   where n.id = x.id;
  delete from public.push_tokens
   where token in (select jsonb_array_elements_text(r -> 'invalid_tokens') from jsonb_array_elements(p_results) r);
$$;
revoke execute on function public.claim_push_batch(int), public.finish_push_batch(jsonb) from anon, authenticated, public;
grant execute on function public.claim_push_batch(int), public.finish_push_batch(jsonb) to service_role;

-- Every minute: if pushes are waiting, poke the Edge Function (its URL lives in Vault: push_dispatch_url).
create or replace function app.kick_push_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if not exists (select 1 from public.notifications where push_status in ('pending', 'sending')) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  if v_url is null then
    return;
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 20000);
end;
$$;
revoke execute on function app.kick_push_dispatch() from authenticated, anon, public;
select cron.schedule('push-dispatch', '* * * * *', 'select app.kick_push_dispatch()');

alter table public.notification_templates enable row level security;
alter table public.notification_preferences enable row level security;
create policy notification_templates_select on public.notification_templates for select to authenticated using (app.is_staff());
create policy notification_templates_update on public.notification_templates for update to authenticated
  using (app.has_permission('settings', 'edit')) with check (app.has_permission('settings', 'edit'));
create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
