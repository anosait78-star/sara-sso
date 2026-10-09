-- pgTAP: service requests (Phase 4) — snapshot, step execution, approval, documents, ad-hoc steps,
-- versions isolation, scope visibility and client isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ids and expected values read with full privileges (no session claims yet)
select set_config('test.llc', (select id::text from public.services where code = 'CF-LLC'), true);
select set_config('test.llc_wf', (select current_workflow_id::text from public.services where code = 'CF-LLC'), true);
select set_config('test.ahmed', (select id::text from public.customers where phone = '+201002345678'), true);
select set_config('test.hala', (select id::text from public.customers where phone = '+201115550192'), true);
select set_config('test.wf_steps', (select count(*) from public.workflow_steps where workflow_id = current_setting('test.llc_wf')::uuid)::text, true);
select set_config('test.wf_docs', (select count(*) from public.required_documents d join public.workflow_steps s on s.id = d.workflow_step_id
                                   where s.workflow_id = current_setting('test.llc_wf')::uuid)::text, true);
select set_config('test.mohamed', (select id::text from public.employees where profile_id = '33333333-3333-4333-8333-333333333333'), true);

-- ===================== Super admin creates a request =====================
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;

select throws_ok($$ select public.create_service_request((select id from public.services where code = 'LN-EQ'), current_setting('test.ahmed')::uuid) $$,
                 'P0001', 'service is not active', 'inactive service cannot take requests');

select set_config('test.r', public.create_service_request(current_setting('test.llc')::uuid, current_setting('test.ahmed')::uuid,
                                                          current_setting('test.mohamed')::uuid, 'high')::text, true);
select ok((select request_no ~ '^REQ-\d{6}$' from public.service_requests where id = current_setting('test.r')::uuid), 'request number REQ-XXXXXX');
select is((select workflow_id from public.service_requests where id = current_setting('test.r')::uuid), current_setting('test.llc_wf')::uuid,
          'request is bound to the published version');
select is((select count(*) from public.service_request_steps where request_id = current_setting('test.r')::uuid)::int,
          current_setting('test.wf_steps')::int, 'all steps are copied to the request');
select is((select count(*) from public.documents where request_id = current_setting('test.r')::uuid)::int,
          current_setting('test.wf_docs')::int, 'a document slot per required document');
select is((select jsonb_array_length(fields_snapshot) from public.service_request_steps
           where request_id = current_setting('test.r')::uuid and step_key = 'collect_data'), 4, 'field definitions are snapshotted');
select ok((select expected_completion_at > now() + interval '15 days' from public.service_requests where id = current_setting('test.r')::uuid),
          'expected completion = sum of step SLAs');

select set_config('test.s1', (select current_step_id::text from public.service_requests where id = current_setting('test.r')::uuid), true);
select is((select step_key from public.service_request_steps where id = current_setting('test.s1')::uuid), 'collect_data', 'first step is active');
select is((select status from public.service_request_steps where id = current_setting('test.s1')::uuid), 'waiting_client'::public.request_step_status,
          'client step waits for the client');
select is((select status from public.service_requests where id = current_setting('test.r')::uuid), 'waiting_client'::public.request_status,
          'request status follows the step');
select is((select assigned_employee_id from public.service_request_steps where id = current_setting('test.s1')::uuid),
          current_setting('test.mohamed')::uuid, 'request_owner step is assigned to the owner');
select ok((select due_at is not null from public.service_request_steps where id = current_setting('test.s1')::uuid), 'SLA due date is set');

-- completion rules
select throws_ok($$ select public.complete_request_step(current_setting('test.s1')::uuid) $$, 'P0001', null, 'cannot complete with missing data');
select throws_ok($$ select public.submit_step_data(current_setting('test.s1')::uuid, '{"activity": "not_an_option"}') $$, '22023', null, 'select value must be an option');
select throws_ok($$ select public.submit_step_data(current_setting('test.s1')::uuid, '{"capital": 10}') $$, '22023', null, 'number below the minimum is rejected');
select throws_ok($$ select public.submit_step_data(current_setting('test.s1')::uuid, '{"unknown": 1}') $$, 'P0001', null, 'unknown field is rejected');
select lives_ok($$ select public.submit_step_data(current_setting('test.s1')::uuid,
                   '{"proposed_names": "أ\nب\nج", "activity": "trade", "capital": 50000, "partners_count": 3}') $$, 'valid data is saved');
select is((select count(*) from public.request_step_missing(current_setting('test.s1')::uuid) where kind = 'document')::int, 2,
          'two required documents are still missing');
select throws_ok($$ select public.complete_request_step(current_setting('test.s1')::uuid) $$, 'P0001', null, 'cannot complete with documents not approved');
select throws_ok($$ select public.reject_document((select id from public.documents where request_step_id = current_setting('test.s1')::uuid and is_required limit 1), null, '') $$,
                 'P0001', 'a rejection reason is required', 'rejecting a document needs a reason');
select lives_ok($$ select public.receive_document(id, 'استلام أصل') from public.documents where request_step_id = current_setting('test.s1')::uuid and is_required $$,
                'documents received and approved');
select lives_ok($$ select public.complete_request_step(current_setting('test.s1')::uuid, 'تم') $$, 'step completes when everything is there');

-- step 2 needs approval by the manager role
select set_config('test.s2', (select current_step_id::text from public.service_requests where id = current_setting('test.r')::uuid), true);
select is((select step_key from public.service_request_steps where id = current_setting('test.s2')::uuid), 'document_review', 'next step activated');
select ok((select assigned_department_id = (select id from public.departments where name_en = 'Operations')
           from public.service_request_steps where id = current_setting('test.s2')::uuid), 'department step is assigned inside the department');
select lives_ok($$ select public.complete_request_step(current_setting('test.s2')::uuid) $$, 'submit step for approval');
select is((select status from public.service_request_steps where id = current_setting('test.s2')::uuid), 'waiting_approval'::public.request_step_status,
          'approval steps wait for the approver');

-- ===================== Operations (mohamed): owner, but not the approver role =====================
reset role;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select ok((select count(*) from public.service_requests where id = current_setting('test.r')::uuid) = 1, 'owner sees the request');
select throws_ok($$ select public.approve_request_step(current_setting('test.s2')::uuid) $$, '42501', null, 'only the approver role can approve');

-- ===================== Manager (mona): approver role =====================
reset role;
select pg_temp.login('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok($$ select public.return_request_step(current_setting('test.s2')::uuid, '') $$, 'P0001', null, 'return needs a reason');
select lives_ok($$ select public.return_request_step(current_setting('test.s2')::uuid, 'ينقص توقيع الشريك الثاني') $$, 'approver returns the step');
select is((select status from public.service_request_steps where id = current_setting('test.s2')::uuid), 'returned'::public.request_step_status, 'step is returned');
select lives_ok($$ select public.complete_request_step(current_setting('test.s2')::uuid) $$, 'resubmitted after the fix');
select lives_ok($$ select public.approve_request_step(current_setting('test.s2')::uuid, 'معتمد') $$, 'approver approves');
select is((select s.step_key from public.service_requests r join public.service_request_steps s on s.id = r.current_step_id
           where r.id = current_setting('test.r')::uuid), 'name_reservation', 'approval moves the request on');

-- ===================== Super admin: ad-hoc step, skip rules, versions isolation =====================
reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select throws_ok($$ select public.skip_request_step((select current_step_id from public.service_requests where id = current_setting('test.r')::uuid), 'سبب') $$,
                 'P0001', 'required steps cannot be skipped', 'required steps cannot be skipped');
select throws_ok($$ select public.insert_adhoc_step(current_setting('test.r')::uuid, current_setting('test.s1')::uuid, '{"name_ar": "خطوة"}') $$,
                 'P0001', null, 'ad-hoc steps cannot go before the active step');
select lives_ok($$ select public.insert_adhoc_step(current_setting('test.r')::uuid,
                   (select current_step_id from public.service_requests where id = current_setting('test.r')::uuid),
                   '{"name_ar": "توثيق توكيل إضافي", "duration_value": 2}') $$, 'ad-hoc step added for this request');
select is((select count(*) from public.service_request_steps where request_id = current_setting('test.r')::uuid)::int,
          current_setting('test.wf_steps')::int + 1, 'the request has one more step');
select is((select count(*) from public.workflow_steps where workflow_id = current_setting('test.llc_wf')::uuid)::int,
          current_setting('test.wf_steps')::int, 'the service template is unchanged');

-- publish a new version: the running request keeps its steps and version
select set_config('test.draft', public.create_workflow_draft(current_setting('test.llc')::uuid)::text, true);
select public.insert_workflow_step(current_setting('test.draft')::uuid, 1, 'خطوة جديدة في الإصدار التالي');
select ok((public.publish_workflow(current_setting('test.draft')::uuid) ->> 'running_on_previous')::int >= 1, 'publish counts the running request');
select is((select count(*) from public.service_request_steps where request_id = current_setting('test.r')::uuid)::int,
          current_setting('test.wf_steps')::int + 1, 'running request steps are unchanged after publishing');
select is((select workflow_id from public.service_requests where id = current_setting('test.r')::uuid), current_setting('test.llc_wf')::uuid,
          'running request stays on its version');

-- ===================== Sales (nourhan, own scope) =====================
reset role;
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is((select count(*) from public.service_requests where id = current_setting('test.r')::uuid)::int, 0, 'sales cannot see a request she does not own');
select is((select count(*) from public.service_request_steps where request_id = current_setting('test.r')::uuid)::int, 0, 'nor its steps');

-- ===================== Client isolation =====================
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated',
        '201115550192@clients.sso.internal', '{"user_type":"client"}', '{}', now(), now());
select set_config('request.jwt.claims', '', true);
update public.customers set user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', app_access = 'active' where id = current_setting('test.hala')::uuid;
select pg_temp.login('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
set local role authenticated;
select ok((select count(*) from public.service_requests) >= 1 and not exists (select 1 from public.service_requests where customer_id <> current_setting('test.hala')::uuid),
          'client sees only own requests');
select is((select count(*) from public.documents where customer_id <> current_setting('test.hala')::uuid)::int, 0, 'client sees no other customer documents');

-- ===================== overdue flag =====================
reset role;
select set_config('request.jwt.claims', '', true);
update public.service_requests set due_at = now() - interval '1 day' where id = current_setting('test.r')::uuid;
select ok((select is_overdue from public.service_requests where id = current_setting('test.r')::uuid), 'past due date marks the request overdue');

select * from finish();
rollback;
