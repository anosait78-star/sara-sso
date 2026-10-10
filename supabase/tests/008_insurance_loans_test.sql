-- pgTAP: Phase 6 — insurance policies (status from dates, maps_to, renewal reminders, renewal) and
-- loan applications (maps_to, lender submissions, decision), scope and client read-only access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select set_config('test.ahmed', (select id::text from public.customers where phone = '+201002345678'), true);
select set_config('test.nile', (select id::text from public.customers where phone = '+201228764410'), true);
select set_config('test.car', (select id::text from public.insurance_policies where policy_no = 'MI-2025-118734'), true);
select set_config('test.loan', (select id::text from public.loan_applications where file_no = 'LN-00001'), true);

-- ===================== seed state =====================
select is((select status from public.insurance_policies where id = current_setting('test.car')::uuid), 'expiring'::public.policy_status, 'policy ending in 12 days is expiring');
select is((select status from public.insurance_policies where policy_no = 'AXA-BUS-7731'), 'expired'::public.policy_status, 'policy past its end date is expired');
select is((select status from public.insurance_policies where policy_no = 'ALZ-MED-55102'), 'active'::public.policy_status, 'policy far from its end date is active');
select is((select reminded_days from public.policy_renewals where policy_id = current_setting('test.car')::uuid), array[30, 15], 'reminder job records the crossed thresholds');
select ok(exists (select 1 from public.tasks t join public.policy_renewals r on r.task_id = t.id where r.policy_id = current_setting('test.car')::uuid and t.kind = 'renewal'),
          'reminder job opens a renewal task');
select is((select count(*) from public.notifications where event_key = 'policy.renewal_due')::int, 2, 'staff owner and client are notified');
select is(app.run_policy_reminders(), 0, 'running the job again sends nothing new');
select is((select status from public.loan_applications where id = current_setting('test.loan')::uuid), 'submitted'::public.loan_status, 'loan file moves to submitted with its first lender');
select is((select requested_amount from public.loan_applications where id = current_setting('test.loan')::uuid), 1500000::numeric(16, 2), 'requested amount copied from the request');
select is((select financing_type from public.loan_applications where id = current_setting('test.loan')::uuid), 'working_capital', 'LN-WC sets the financing type');

-- ===================== insurance request -> policy file =====================
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('test.r', public.create_service_request((select id from public.services where code = 'INS-CAR'), current_setting('test.nile')::uuid)::text, true);
select set_config('test.s1', (select current_step_id::text from public.service_requests where id = current_setting('test.r')::uuid), true);
select public.submit_step_data(current_setting('test.s1')::uuid, '{"car_model": "تويوتا كورولا 2023", "car_year": 2023, "car_value": 1200000}');
select set_config('test.p', public.create_policy_from_request(current_setting('test.r')::uuid)::text, true);
select is((select subject from public.insurance_policies where id = current_setting('test.p')::uuid), 'تويوتا كورولا 2023', 'subject copied from the request');
select is((select status from public.insurance_policies where id = current_setting('test.p')::uuid), 'pending'::public.policy_status, 'new policy file is pending');
select is((select key from public.insurance_types t join public.insurance_policies p on p.insurance_type_id = t.id where p.id = current_setting('test.p')::uuid), 'car', 'car service sets the type');
select ok((select file_no ~ '^POL-\d{5}$' from public.insurance_policies where id = current_setting('test.p')::uuid), 'file number POL-XXXXX');
select lives_ok($$ insert into public.insurance_policies (customer_id, subject) values (current_setting('test.nile')::uuid, 'مباشر') returning id $$,
                'staff can create a policy and read it back (insert … returning)');

-- live copy of the insurer and the issuance values
reset role;
update public.service_request_steps set status = 'active' where request_id = current_setting('test.r')::uuid and step_key in ('quotes', 'policy_issuance');
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select public.submit_step_data((select id from public.service_request_steps where request_id = current_setting('test.r')::uuid and step_key = 'quotes'), '{"chosen_company": "أليانز"}');
select is((select c.name_ar from public.insurance_companies c join public.insurance_policies p on p.insurance_company_id = c.id where p.id = current_setting('test.p')::uuid),
          'أليانز مصر', 'insurer matched by name');
select public.submit_step_data((select id from public.service_request_steps where request_id = current_setting('test.r')::uuid and step_key = 'policy_issuance'),
  json_build_object('policy_no', 'ALZ-CAR-9001', 'start_date', current_date, 'end_date', current_date + 364)::jsonb);
select is((select status from public.insurance_policies where id = current_setting('test.p')::uuid), 'active'::public.policy_status, 'policy number + end date = issued (active)');
select ok(exists (select 1 from public.activity_events where event_type = 'policy.issued' and customer_id = current_setting('test.nile')::uuid and visible_to_client),
          'issuance reaches the client timeline');
select throws_ok($$ select public.link_request_policy(current_setting('test.r')::uuid, current_setting('test.car')::uuid) $$,
                 'P0001', 'the policy belongs to another customer', 'cannot link a policy of another customer');

-- renewal
select set_config('test.new', public.renew_insurance_policy(current_setting('test.car')::uuid)::text, true);
select is((select status from public.insurance_policies where id = current_setting('test.car')::uuid), 'renewed'::public.policy_status, 'old policy marked renewed');
select is((select renewed_from_policy_id from public.insurance_policies where id = current_setting('test.new')::uuid), current_setting('test.car')::uuid, 'new policy continues the old one');
select is((select start_date - (select end_date from public.insurance_policies where id = current_setting('test.car')::uuid) from public.insurance_policies where id = current_setting('test.new')::uuid),
          1, 'new policy starts the day after the old one ends');
select is((select status from public.policy_renewals where policy_id = current_setting('test.car')::uuid), 'renewed', 'renewal cycle closed');
select is((select t.status from public.tasks t join public.policy_renewals r on r.task_id = t.id where r.policy_id = current_setting('test.car')::uuid), 'done'::public.task_status, 'renewal task done');
select ok(exists (select 1 from public.service_requests r join public.services s on s.id = r.service_id where s.code = 'INS-RENEW' and r.insurance_policy_id = current_setting('test.new')::uuid),
          'a renewal request opens for the work');

-- ===================== loans =====================
select throws_ok($$ insert into public.loan_entity_submissions (loan_application_id, financing_entity_id) values (current_setting('test.loan')::uuid, (select id from public.financing_entities where name_ar = 'بنك مصر')) $$,
                 '23505', null, 'one submission per lender');
update public.loan_applications set status = 'approved' where id = current_setting('test.loan')::uuid;
select is((select approved_amount from public.loan_applications where id = current_setting('test.loan')::uuid), 1200000::numeric(16, 2), 'approval takes the best approved offer');
select ok(exists (select 1 from public.activity_events where event_type = 'loan.approved' and visible_to_client), 'the decision reaches the client');

-- ===================== scope =====================
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is((select count(*) from public.insurance_policies)::int, 2, 'sales sees only policies of its own linked requests (pending file + renewal)');
select is((select count(*) from public.loan_applications)::int, 0, 'sales has no loans permission');

-- ===================== client: read only, no lender details =====================
reset role;
select pg_temp.login('c1c1c1c1-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.insurance_policies)::int, 3, 'client sees own policies (incl. the renewal)');
select is((select count(*) from public.loan_entity_submissions)::int, 0, 'client cannot see lender submissions');
update public.insurance_policies set premium = 1 where id = current_setting('test.car')::uuid;
select isnt((select premium from public.insurance_policies where id = current_setting('test.car')::uuid), 1::numeric(14, 2), 'client cannot edit a policy');

select * from finish();
rollback;
