-- pgTAP: profile sync with Supabase Auth metadata (regression for invited staff showing as clients)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Auth inserts the user first with empty app_metadata...
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
        'new.staff@sso.test', '{}', '{}', now(), now());
select is((select user_type::text from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'client',
          'before metadata is written the profile defaults to client');

-- ...then writes app_metadata in a separate update.
update auth.users
   set raw_app_meta_data = '{"user_type":"staff","full_name":"موظف جديد","must_change_password":true}'
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is((select user_type::text from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'staff', 'profile becomes staff');
select is((select full_name from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'موظف جديد', 'profile gets the name');
select ok((select must_change_password from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'temporary password flag is set');

-- the user clears the flag after changing the password; it must not come back
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.clear_must_change_password();
reset role;
select ok(not (select must_change_password from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
          'flag stays cleared after the metadata update');

select * from finish();
rollback;
