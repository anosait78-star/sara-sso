-- pgTAP: CRM (Phase 2) — scope-based visibility, stage rules, conversion, timeline, client isolation
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- expected totals read with full privileges
select set_config('test.customers', (select count(*) from public.customers where deleted_at is null)::text, true);
select set_config('test.leads', (select count(*) from public.leads where deleted_at is null)::text, true);
select set_config('test.sales_leads', (select count(*) from public.leads l join public.employees e on e.id = l.owner_employee_id
                                        where e.profile_id = '44444444-4444-4444-8444-444444444444' and l.deleted_at is null)::text, true);

-- ===================== Sales (nourhan) — "own" scope =====================
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;

select is((select count(*) from public.leads)::int, current_setting('test.sales_leads')::int, 'sales sees only own leads');
select is((select count(*) from public.leads where full_name = 'مصنع الأمل للبلاستيك')::int, 0, 'sales cannot see a lead owned by operations');
select is((select count(*) from public.customers)::int, 1, 'sales sees only own customer');
select is((select count(*) from public.global_search('مصنع')), 0::bigint, 'global search respects RLS');
select ok((select count(*) from public.global_search('كريم')) >= 1, 'global search finds own lead');

-- create a customer: owner defaults to the creator so it stays visible
insert into public.customers (full_name, phone) values ('عميل جديد من المبيعات', '+201000000777');
select is((select count(*) from public.customers where phone = '+201000000777')::int, 1, 'new customer defaults to creator as owner');
select ok((select customer_no from public.customers where phone = '+201000000777') like 'CUS-%', 'customer number generated');

select throws_ok($$ update public.customers set owner_employee_id = (select id from public.employees where profile_id = '33333333-3333-4333-8333-333333333333')
                    where phone = '+201000000777' $$, '42501', null, 'sales cannot reassign a customer');
select throws_ok($$ update public.customers set deleted_at = now() where phone = '+201000000777' $$, '42501', null, 'sales cannot delete a customer');
select throws_ok($$ update public.customers set app_access = 'active' where phone = '+201000000777' $$, '42501', null, 'app access needs manage_access');

-- stage rules
select throws_ok($$ select public.change_lead_stage((select id from public.leads where full_name = 'رانيا شوقي'), (select id from public.lead_stages where key = 'postponed')) $$,
                 'P0001', 'a follow-up date is required for this stage', 'postponed requires a date');
select throws_ok($$ select public.change_lead_stage((select id from public.leads where full_name = 'رانيا شوقي'), (select id from public.lead_stages where key = 'not_interested')) $$,
                 'P0001', 'a reason is required for this stage', 'not interested requires a reason');
select throws_ok($$ select public.change_lead_stage((select id from public.leads where full_name = 'رانيا شوقي'), (select id from public.lead_stages where key = 'converted')) $$,
                 'P0001', null, 'converted stage only through conversion');
select lives_ok($$ select public.change_lead_stage((select id from public.leads where full_name = 'رانيا شوقي'), (select id from public.lead_stages where key = 'postponed'),
                    'طلبت التواصل بعد أسبوعين', now() + interval '14 days') $$, 'postpone with a date works');
select is((select count(*) from public.tasks t join public.leads l on l.id = t.lead_id
           where l.full_name = 'رانيا شوقي' and t.kind = 'follow_up' and t.status = 'todo')::int, 1, 'postponing creates a follow-up');
select ok((select next_follow_up_at from public.leads where full_name = 'رانيا شوقي') is not null, 'lead next follow-up is synced');

-- activity on a new lead moves it to "contacted"
select lives_ok($$ select public.log_lead_activity((select id from public.leads where full_name = 'سلمى رأفت'), 'call', 'تم الاتصال وأبدت اهتمامًا') $$, 'log a call');
select is((select s.key from public.leads l join public.lead_stages s on s.id = l.stage_id where l.full_name = 'سلمى رأفت'), 'contacted', 'first call moves new lead to contacted');

-- conversion
select throws_ok($$ select public.convert_lead_to_customer((select id from public.leads where full_name = 'مصنع الأمل للبلاستيك')) $$,
                 '42501', null, 'cannot convert a lead you cannot see');
select lives_ok($$ select public.convert_lead_to_customer((select id from public.leads where full_name = 'كريم فؤاد السيد')) $$, 'convert own lead');
select is((select count(*) from public.customers where phone = '+201097712210')::int, 1, 'customer created from lead data');
select ok((select converted_customer_id is not null from public.leads where full_name = 'كريم فؤاد السيد'), 'lead marked converted');
select ok(exists (select 1 from public.tasks t join public.customers c on c.id = t.customer_id where c.phone = '+201097712210'),
          'lead follow-ups are linked to the new customer');
select ok(exists (select 1 from public.activity_events a join public.customers c on c.id = a.customer_id
                  where c.phone = '+201097712210' and a.event_type = 'lead.created'), 'lead history appears on the customer timeline');

-- ===================== Operations (mohamed) — department scope, no lead permissions =====================
reset role;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select is((select count(*) from public.leads)::int, 0, 'operations has no lead permissions');

-- ===================== Client linked to a customer =====================
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
        '201002345678@clients.sso.internal', '{"user_type":"client"}', '{}', now(), now());
select set_config('request.jwt.claims', '', true); -- act as the system for test setup
update public.customers set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', app_access = 'active' where phone = '+201002345678';
select pg_temp.login('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*) from public.notes)::int, 0, 'client cannot see internal notes');
select is((select count(*) from public.activity_events where not visible_to_client)::int, 0, 'client sees only client-visible timeline events');

-- ===================== Security: locked helper stays locked =====================
reset role;
select ok(not has_function_privilege('authenticated', 'app.bootstrap_super_admin(text, text)', 'execute'), 'bootstrap_super_admin is not callable by users');

select * from finish();
rollback;
