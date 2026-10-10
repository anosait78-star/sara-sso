-- pgTAP: Phase 5 — client registration & linking, client requests, storage uploads, document review,
-- reuse of approved documents (D12), messages, notifications and account suspension.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.auth_user(p_uid uuid, p_phone text, p_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_uid, 'authenticated', 'authenticated',
          ltrim(p_phone, '+') || '@clients.sso.internal', json_build_object('user_type', 'client', 'full_name', p_name)::jsonb, '{}', now(), now());
$$;

-- ===================== Registration (service role, as the client-register Edge Function) =====================
select pg_temp.auth_user('d1d1d1d1-0000-4000-8000-000000000001', '+201234567890', 'مريم أحمد محمود علي');
set local role service_role;
select is(public.check_client_registration('+201234567890', '29501011234567'), 'new', 'a new phone / national id can register');
select is(public.check_client_registration('+201228764410', '28801011234567'), 'match', 'phone of a staff-created customer needs linking');
select is(public.register_client_account('d1d1d1d1-0000-4000-8000-000000000001', 'مريم أحمد محمود علي', '29501011234567', '+201234567890') ->> 'status',
          'registered', 'new client gets a self-registered customer');
select is(public.check_client_registration('+201234567890', '29999999999999'), 'registered', 'the same phone cannot register twice');
reset role;
select is((select status from public.customers where phone = '+201234567890'), 'self_registered'::public.customer_status, 'customer status self_registered');
select is((select source from public.customers where phone = '+201234567890'), 'client_app', 'customer source client_app');
select ok(not has_function_privilege('authenticated', 'public.register_client_account(uuid, text, text, text)', 'execute'),
          'register_client_account is not callable by app users');

-- matching an existing customer creates a pending link only
select pg_temp.auth_user('d1d1d1d1-0000-4000-8000-000000000002', '+201228764410', 'شريف نبيل عبد الله حسن');
set local role service_role;
select is(public.register_client_account('d1d1d1d1-0000-4000-8000-000000000002', 'شريف نبيل عبد الله حسن', '28801011234567', '+201228764410') ->> 'status',
          'pending_link', 'match -> pending link request');
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000002');
set local role authenticated;
select is((public.my_account_status() ->> 'link_status'), 'pending', 'account status shows the pending link');
select is((select count(*) from public.customers)::int, 0, 'pending account cannot see the matched customer');
select is((select count(*) from public.service_requests)::int, 0, 'nor its requests');

-- staff approves the link
reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select lives_ok($$ select public.approve_account_link((select id from public.account_link_requests where user_id = 'd1d1d1d1-0000-4000-8000-000000000002')) $$,
                'manager of access approves the link');
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*) from public.customers)::int, 1, 'linked account now sees its customer');
select ok((select count(*) from public.service_requests) >= 1, 'and the customer requests');

-- ===================== Client requests =====================
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select public.client_create_request((select id from public.services where code = 'INS-RENEW')) $$,
                 'P0001', 'service is not available', 'internal services cannot be ordered from the app');
select set_config('test.r', public.client_create_request((select id from public.services where code = 'INS-CAR'), 'سيارة عائلية')::text, true);
select is((select source from public.service_requests where id = current_setting('test.r')::uuid), 'client_app', 'request source client_app');
select ok((select owner_employee_id is not null from public.service_requests where id = current_setting('test.r')::uuid), 'an owner is assigned automatically');
select is((select status from public.service_requests where id = current_setting('test.r')::uuid), 'waiting_client'::public.request_status,
          'first step waits for the client');
select set_config('test.s1', (select current_step_id::text from public.service_requests where id = current_setting('test.r')::uuid), true);
select lives_ok($$ select public.client_submit_step_data(current_setting('test.s1')::uuid, '{"car_model": "Toyota Corolla", "car_year": 2022, "car_value": 900000}') $$,
                'client fills the client fields');
select throws_ok($$ select public.client_submit_step_data(current_setting('test.s1')::uuid, '{"car_year": 1800}') $$, '22023', null, 'client data is validated');
select throws_ok($$ select public.client_submit_step(current_setting('test.s1')::uuid) $$, 'P0001', null, 'cannot submit before uploading required documents');

-- ===================== Storage + upload registration =====================
select set_config('test.doc', (select d.id::text from public.documents d where d.request_step_id = current_setting('test.s1')::uuid and d.name_ar = 'بطاقة الرقم القومي'), true);
select set_config('test.path', app.document_path_prefix(current_setting('test.doc')::uuid) || 'v1-a.jpg', true);
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('customer-documents', current_setting('test.path'), auth.uid()) $$,
                'client uploads into its own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
                    values ('customer-documents', (select id::text from public.customers where phone = '+201002345678') || '/general/' || current_setting('test.doc') || '/x.jpg', auth.uid()) $$,
                 '42501', null, 'client cannot upload into another customer folder');
select throws_ok($$ select public.register_document_upload(current_setting('test.doc')::uuid, current_setting('test.path'), 'id.exe', 'application/x-msdownload', 1000) $$,
                 '22023', 'file type not allowed', 'mime type is checked');
select throws_ok($$ select public.register_document_upload(current_setting('test.doc')::uuid, current_setting('test.path'), 'id.jpg', 'image/jpeg', 50 * 1024 * 1024) $$,
                 '22023', 'file is too large', 'size is checked');
select lives_ok($$ select public.register_document_upload(current_setting('test.doc')::uuid, current_setting('test.path'), 'id.jpg', 'image/jpeg', 120000) $$,
                'upload registered');
select is((select status from public.documents where id = current_setting('test.doc')::uuid), 'uploaded'::public.document_status, 'document is uploaded');

-- the other required documents of the step
insert into storage.objects (bucket_id, name, owner)
select 'customer-documents', app.document_path_prefix(d.id) || 'v1-b.jpg', auth.uid()
from public.documents d where d.request_step_id = current_setting('test.s1')::uuid and d.is_required and d.status = 'pending';
select public.register_document_upload(d.id, app.document_path_prefix(d.id) || 'v1-b.jpg', 'b.jpg', 'image/jpeg', 90000)
from public.documents d where d.request_step_id = current_setting('test.s1')::uuid and d.is_required and d.status = 'pending';
select lives_ok($$ select public.client_submit_step(current_setting('test.s1')::uuid) $$, 'client submits the step');
select is((select status from public.service_requests where id = current_setting('test.r')::uuid), 'in_progress'::public.request_status,
          'request goes back to the staff');

-- ===================== Staff review: reject -> re-upload -> approve =====================
reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select ok((select count(*) from storage.objects where name = current_setting('test.path')) = 1, 'staff can read the uploaded object');
select lives_ok($$ select public.reject_document(current_setting('test.doc')::uuid, (select id from public.rejection_reasons where sort_order = 1), 'الصورة مقصوصة') $$,
                'staff rejects the document');
select is((select status from public.service_requests where id = current_setting('test.r')::uuid), 'waiting_client'::public.request_status,
          'rejection puts the request on the client');

reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000001');
set local role authenticated;
select ok(exists (select 1 from public.notifications where body like 'رُفض مستند%'), 'client is notified about the rejection');
insert into storage.objects (bucket_id, name, owner) values ('customer-documents', app.document_path_prefix(current_setting('test.doc')::uuid) || 'v2-a.jpg', auth.uid());
select lives_ok($$ select public.register_document_upload(current_setting('test.doc')::uuid, app.document_path_prefix(current_setting('test.doc')::uuid) || 'v2-a.jpg', 'id2.jpg', 'image/jpeg', 130000) $$,
                'client uploads a new version');
select is((select count(*) from public.document_files where document_id = current_setting('test.doc')::uuid)::int, 2, 'the rejected version is kept');
select is((select review_status from public.document_files where document_id = current_setting('test.doc')::uuid and version_no = 1), 'rejected', 'v1 stays rejected');
select is((select status from public.service_requests where id = current_setting('test.r')::uuid), 'in_progress'::public.request_status,
          're-upload resumes the request');

reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select lives_ok($$ select public.receive_document(current_setting('test.doc')::uuid, 'واضحة', (current_date + 365)) $$, 'staff approves the new version');
select is((select received_physically from public.documents where id = current_setting('test.doc')::uuid), false, 'an uploaded file is not marked as paper receipt');

-- ===================== Reuse of approved documents (D12) =====================
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('test.r2', public.client_create_request((select id from public.services where code = 'INS-MED'))::text, true);
select is((select status from public.documents where request_id = current_setting('test.r2')::uuid and name_ar = 'بطاقة الرقم القومي'),
          'approved'::public.document_status, 'approved national id is reused in the next request');
select is((select status from public.documents where request_id = current_setting('test.r2')::uuid and name_ar = 'تقرير طبي'),
          'pending'::public.document_status, 'non-reusable documents still need uploading');

-- ===================== Messages & notifications =====================
select lives_ok($$ select public.send_request_message(current_setting('test.r')::uuid, 'متى يتم إصدار الوثيقة؟') $$, 'client sends a message');
reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select lives_ok($$ select public.send_request_message(current_setting('test.r')::uuid, 'خلال يومين بإذن الله') $$, 'staff replies');
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.request_messages where request_id = current_setting('test.r')::uuid)::int, 2, 'client sees the thread');
select ok(exists (select 1 from public.notifications where event_key = 'message.new'), 'client is notified about the reply');

-- another client sees nothing of it
reset role;
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*) from public.request_messages where request_id = current_setting('test.r')::uuid)::int, 0, 'other clients see no messages');
select is((select count(*) from public.notifications where recipient_user_id = 'd1d1d1d1-0000-4000-8000-000000000001')::int, 0, 'nor notifications');
select is((select count(*) from storage.objects where name = current_setting('test.path'))::int, 0, 'nor files');

-- ===================== Suspension =====================
reset role;
select set_config('request.jwt.claims', '', true);
update public.customers set app_access = 'suspended' where phone = '+201234567890';
select pg_temp.login('d1d1d1d1-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.service_requests)::int, 0, 'a suspended account sees nothing');

select * from finish();
rollback;
