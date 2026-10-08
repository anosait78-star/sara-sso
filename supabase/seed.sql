-- =====================================================================
-- LOCAL DEVELOPMENT SEED ONLY (runs on `supabase db reset`, never in production).
-- Test staff accounts — all share the dev password below.
--
--   Dev password for every seeded account:  SsoDev2026!
--
--   sara@sso.test     Super Admin   (الإدارة)
--   mona@sso.test     Manager       (العمليات)
--   mohamed@sso.test  Operations    (العمليات)
--   nourhan@sso.test  Sales         (المبيعات)
--   heba@sso.test     Accountant    (المالية)
--   tarek@sso.test    Operations    (suspended)
-- =====================================================================

do $$
declare
  s record;
begin
  for s in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'sara@sso.test', 'سارة سليمان', 'super_admin', 'Management', 'المديرة العامة', 'active'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'mona@sso.test', 'منى السيد', 'manager', 'Operations', 'مديرة العمليات', 'active'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'mohamed@sso.test', 'محمد علي', 'operations', 'Operations', 'أخصائي عمليات', 'active'),
      ('44444444-4444-4444-8444-444444444444'::uuid, 'nourhan@sso.test', 'نورهان عادل', 'sales', 'Sales', 'أخصائية مبيعات', 'active'),
      ('55555555-5555-4555-8555-555555555555'::uuid, 'heba@sso.test', 'هبة رضا', 'accountant', 'Finance', 'محاسبة', 'active'),
      ('66666666-6666-4666-8666-666666666666'::uuid, 'tarek@sso.test', 'طارق سامي', 'operations', 'Operations', 'أخصائي عمليات', 'suspended')
    ) as v(id, email, full_name, role_key, dept_en, title, status)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', s.id, 'authenticated', 'authenticated', s.email,
      extensions.crypt('SsoDev2026!', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'user_type', 'staff', 'full_name', s.full_name),
      '{}'::jsonb, now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), s.id, s.id::text,
            jsonb_build_object('sub', s.id::text, 'email', s.email, 'email_verified', true),
            'email', now(), now(), now());
    insert into public.employees (profile_id, role_id, department_id, job_title, status)
    values (s.id, (select id from public.roles where key = s.role_key),
            (select id from public.departments where name_en = s.dept_en), s.title, s.status::public.employee_status);
  end loop;
end;
$$;
