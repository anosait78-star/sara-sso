-- pgTAP: identity, roles, permissions, RLS and audit (Phase 1)
-- Run with: pnpm db:test   (requires `pnpm db:start` + seed data)
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- impersonation helper -------------------------------------------------
create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- a client-type user for isolation checks
insert into auth.users (instance_id, id, aud, role, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated',
        '201000000099', '{"user_type":"client","full_name":"عميل تجريبي"}', '{}', now(), now());

-- total employees, read with full privileges, used as the expected value below
select set_config('test.emp_count', (select count(*) from public.employees)::text, true);

-- ===================== Super admin (sara) =====================
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;

select ok(app.is_staff(), 'super admin is staff');
select is(app.perm_scope('roles', 'edit'), 'all'::public.permission_scope, 'super admin has roles.edit at all scope');
select is((select count(*) from public.employees)::int, current_setting('test.emp_count')::int, 'super admin sees all employees');
select is((select count(*) from public.get_my_permissions())::int, (select count(*) from public.permissions)::int,
          'super admin gets the full permission catalog');
select throws_ok($$ delete from public.roles where key = 'super_admin' $$, '42501', null, 'system role cannot be deleted');
select throws_ok($$ select public.set_role_permissions((select id from public.roles where key = 'super_admin'), '[]'::jsonb) $$,
                 '42501', null, 'system role permissions cannot be changed');
select throws_ok($$ update public.employees set role_id = (select id from public.roles where key = 'sales')
                    where profile_id = '11111111-1111-4111-8111-111111111111' $$,
                 '42501', null, 'cannot change own role');
select throws_ok($$ update public.employees set status = 'suspended'
                    where profile_id = '11111111-1111-4111-8111-111111111111' $$,
                 '42501', null, 'cannot change own status');

select lives_ok($$ select public.set_role_permissions(
                    (select id from public.roles where key = 'sales'),
                    '[{"module":"leads","action":"view","scope":"own"},{"module":"leads","action":"create","scope":"all"}]'::jsonb) $$,
                'super admin can replace a role permission set');
select is((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.key = 'sales')::int, 2,
          'sales role now has exactly 2 grants');
select ok(exists (select 1 from public.audit_logs where action_key = 'role.permissions_update' and table_name = 'role_permissions'),
          'permission change is audited with action_key');

update public.departments set name_ar = 'العمليات والتشغيل' where name_en = 'Operations';
select is((select changed_fields from public.audit_logs where table_name = 'departments' order by id desc limit 1),
          array['name_ar'], 'audit stores only the changed field');
select is((select actor_name from public.audit_logs where table_name = 'departments' order by id desc limit 1),
          'سارة سليمان', 'audit stores the actor name');
update public.audit_logs set action_key = 'tampered';
select is((select count(*) from public.audit_logs where action_key = 'tampered')::int, 0,
          'audit log rows cannot be updated through the API');

-- ===================== Sales (nourhan) =====================
reset role;
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;

select ok(not app.has_permission('roles', 'edit'), 'sales has no roles.edit');
select throws_ok($$ select public.set_role_permissions((select id from public.roles where key = 'sales'), '[]'::jsonb) $$,
                 '42501', null, 'sales cannot change permissions');
select is((select count(*) from public.employees)::int, 1, 'sales (no employees.view) only sees own employee row');
select is((select count(*) from public.audit_logs)::int, 0, 'sales cannot read the audit log');
update public.roles set name_ar = 'x';
select is((select count(*) from public.roles where name_ar = 'x')::int, 0, 'sales cannot edit roles');

-- ===================== Operations (mohamed) =====================
reset role;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
set local role authenticated;

select is((select count(*) from public.employees)::int, current_setting('test.emp_count')::int, 'operations has employees.view -> sees all');
update public.employees set job_title = 'x' where profile_id = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from public.employees where job_title = 'x')::int, 0, 'operations cannot edit other employees');
select is(app.perm_scope('service_requests', 'edit'), 'department'::public.permission_scope, 'operations edits requests at department scope');

-- ===================== Manager (mona) =====================
reset role;
select pg_temp.login('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select ok(app.has_permission('customers', 'manage_access'), 'manager can manage client app access');
select ok(not app.has_permission('services_config', 'edit'), 'manager cannot edit service configuration');

-- ===================== Suspended (tarek) =====================
reset role;
select pg_temp.login('66666666-6666-4666-8666-666666666666');
set local role authenticated;
select ok(not app.is_staff(), 'suspended employee is not treated as staff');
select is((select count(*) from public.get_my_permissions())::int, 0, 'suspended employee has no permissions');

-- ===================== Client =====================
reset role;
select pg_temp.login('99999999-9999-4999-8999-999999999999');
set local role authenticated;
select is((select count(*) from public.profiles)::int, 1, 'client sees only own profile');
select is((select count(*) from public.roles)::int, 0, 'client cannot read roles');

-- ===================== Anonymous =====================
reset role;
set local role anon;
select is((select count(*) from public.employees)::int, 0, 'anon sees no employees');

-- ===================== Access token hook =====================
reset role;
select is(public.custom_access_token_hook(jsonb_build_object('user_id', '11111111-1111-4111-8111-111111111111', 'claims', '{}'::jsonb))
            -> 'claims' ->> 'role_key', 'super_admin', 'token hook adds role_key');
select is(public.custom_access_token_hook(jsonb_build_object('user_id', '99999999-9999-4999-8999-999999999999', 'claims', '{}'::jsonb))
            -> 'claims' ->> 'user_type', 'client', 'token hook marks clients');

select * from finish();
rollback;
