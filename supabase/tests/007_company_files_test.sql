-- pgTAP: Phase 6 — company files: opening from a request, maps_to copy (initial + live), partners,
-- linking rules, establishment on completion, scope and client read-only access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select set_config('test.ahmed', (select id::text from public.customers where phone = '+201002345678'), true);
select set_config('test.nile', (select id::text from public.customers where phone = '+201228764410'), true);
select set_config('test.seed_file', (select id::text from public.company_files where customer_id = current_setting('test.ahmed')::uuid limit 1), true);

-- ===================== seed state =====================
select ok(current_setting('test.seed_file') <> '', 'seed has a company file for Ahmed');
select is((select capital from public.company_files where id = current_setting('test.seed_file')::uuid), 50000::numeric(16, 2), 'capital copied from the request (maps_to)');
select is((select activity from public.company_files where id = current_setting('test.seed_file')::uuid), 'تجارة عامة', 'activity copied as the readable option label');
select is((select cardinality(proposed_names) from public.company_files where id = current_setting('test.seed_file')::uuid), 3, 'proposed names split one per line');
select is((select legal_form from public.company_files where id = current_setting('test.seed_file')::uuid), 'llc', 'LLC service sets the legal form');
select ok((select file_no ~ '^CO-\d{5}$' from public.company_files where id = current_setting('test.seed_file')::uuid), 'file number CO-XXXXX');

-- ===================== super admin: new LLC request -> company file =====================
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('test.r', public.create_service_request((select id from public.services where code = 'CF-LLC'), current_setting('test.nile')::uuid)::text, true);
select set_config('test.s1', (select current_step_id::text from public.service_requests where id = current_setting('test.r')::uuid), true);
select public.submit_step_data(current_setting('test.s1')::uuid, '{"proposed_names": "النيل للتوريدات، النيل جروب", "capital": 250000}');
select set_config('test.file', public.create_company_file_from_request(current_setting('test.r')::uuid)::text, true);
select is((select company_file_id from public.service_requests where id = current_setting('test.r')::uuid), current_setting('test.file')::uuid, 'request linked to the new file');
select is((select capital from public.company_files where id = current_setting('test.file')::uuid), 250000::numeric(16, 2), 'existing values copied when the file is opened');
select is((select status from public.company_files where id = current_setting('test.file')::uuid), 'in_progress'::public.company_file_status, 'file of a running request is in progress');
select is(public.create_company_file_from_request(current_setting('test.r')::uuid), current_setting('test.file')::uuid, 'opening twice returns the same file');

-- staff creates a file directly (INSERT ... RETURNING, as the admin UI does)
select lives_ok($$ insert into public.company_files (customer_id, proposed_names) values (current_setting('test.nile')::uuid, array['اسم مباشر']) returning id $$,
                'staff can create a file and read it back (insert … returning)');

-- live copy: saving a mapped field updates the file
select public.submit_step_data(current_setting('test.s1')::uuid, '{"activity": "import_export"}');
select is((select activity from public.company_files where id = current_setting('test.file')::uuid), 'استيراد وتصدير', 'saving a mapped field updates the file');

-- partners
insert into public.company_partners (company_file_id, full_name, share_percent, is_manager) values (current_setting('test.file')::uuid, 'شريف نبيل عبد الله حسن', 70, true);
select throws_ok($$ insert into public.company_partners (company_file_id, full_name, share_percent) values (current_setting('test.file')::uuid, 'شريك زائد', 40) $$,
                 'P0001', null, 'partner shares cannot exceed 100%');
select throws_ok($$ insert into public.company_partners (company_file_id, full_name, national_id) values (current_setting('test.file')::uuid, 'شريك', '123') $$,
                 '23514', null, 'partner national id is validated');

-- linking rules
select throws_ok($$ select public.link_request_company_file(current_setting('test.r')::uuid, current_setting('test.seed_file')::uuid) $$,
                 'P0001', 'the company file belongs to another customer', 'cannot link a file of another customer');

-- completing the formation request establishes the company
reset role;
select set_config('request.jwt.claims', '', true);
update public.service_requests set status = 'completed', completed_at = now() where id = current_setting('test.r')::uuid;
select is((select status from public.company_files where id = current_setting('test.file')::uuid), 'established'::public.company_file_status, 'completed formation request establishes the company');
select ok((select established_on is not null from public.company_files where id = current_setting('test.file')::uuid), 'establishment date set');
select ok(exists (select 1 from public.activity_events where event_type = 'company_file.established' and customer_id = current_setting('test.nile')::uuid),
          'establishment appears on the customer timeline');

-- ===================== scope =====================
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is((select count(*) from public.company_files)::int, 0, 'sales has no company formation permission');

select pg_temp.login('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select ok((select count(*) from public.company_files where id = current_setting('test.seed_file')::uuid) = 1,
          'operations sees the file (department scope / linked request)');

-- ===================== client: read only =====================
reset role;
select pg_temp.login('c1c1c1c1-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.company_files)::int, 1, 'client sees only own company file');
select is((select count(*) from public.company_partners)::int, 2, 'and its partners');
update public.company_files set approved_name = 'تعديل من العميل' where id = current_setting('test.seed_file')::uuid;
select isnt((select approved_name from public.company_files where id = current_setting('test.seed_file')::uuid), 'تعديل من العميل', 'client cannot edit the file');

select * from finish();
rollback;
