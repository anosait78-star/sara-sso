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

-- ---------------------------------------------------------------------
-- Sample CRM data (Phase 2) — owners: nourhan (sales), mohamed/mona (operations)
-- ---------------------------------------------------------------------
do $$
declare
  e_nourhan uuid := (select id from public.employees where profile_id = '44444444-4444-4444-8444-444444444444');
  e_mohamed uuid := (select id from public.employees where profile_id = '33333333-3333-4333-8333-333333333333');
  e_mona uuid := (select id from public.employees where profile_id = '22222222-2222-4222-8222-222222222222');
  st record;
  c1 uuid; c2 uuid; c3 uuid; l1 uuid; l2 uuid;
begin
  insert into public.customers (customer_type, full_name, national_id, phone, email, city, owner_employee_id, source)
  values ('individual', 'أحمد محمد عبدالله السيد', '29003141201234', '+201002345678', 'ahmed.m@example.com', 'القاهرة الجديدة', e_mohamed, 'facebook')
  returning id into c1;
  insert into public.customers (customer_type, full_name, company_name, commercial_register_no, phone, city, owner_employee_id, source)
  values ('company', 'شريف نبيل', 'شركة النيل للتوريدات', '184522', '+201228764410', 'المعادي', e_mona, 'referral')
  returning id into c2;
  insert into public.customers (customer_type, full_name, phone, city, owner_employee_id, source)
  values ('individual', 'هالة يوسف إبراهيم', '+201115550192', 'مدينة نصر', e_nourhan, 'whatsapp')
  returning id into c3;
  insert into public.customer_contacts (customer_id, name, role, phone) values (c2, 'مروة سامي', 'مسؤولة الحسابات', '+201001112233');

  insert into public.notes (customer_id, body, author_employee_id) values (c1, 'يفضل التواصل بعد الساعة 4 مساءً.', e_mohamed);
  insert into public.tasks (kind, title, assigned_to, due_at, priority, customer_id)
  values ('follow_up', 'متابعة: تجديد تأمين السيارة', e_nourhan, now() + interval '2 days', 'high', c3),
         ('follow_up', 'متابعة: أوراق السجل التجاري', e_mohamed, now() - interval '1 day', 'urgent', c1);
  insert into public.appointments (type, title, starts_at, ends_at, location, customer_id, employee_id)
  values ('gov_visit', 'زيارة مكتب السجل التجاري', date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 11 hours', 'مصلحة السجل التجاري — التجمع', c1, e_mohamed);

  for st in select * from (values
    ('ياسر عبدالحميد', '+201091112233', 'company_formation', 'تأسيس شركة تضامن', 'facebook', 'new'),
    ('سلمى رأفت', '+201002223344', 'insurance', 'تأمين طبي عائلي', 'referral', 'new'),
    ('كريم فؤاد السيد', '+201097712210', 'real_estate', 'شقة 3 غرف — التجمع الخامس', 'exhibition', 'contacted'),
    ('رانيا شوقي', '+201223334455', 'insurance', 'تأمين سيارة', 'whatsapp', 'interested'),
    ('عمر الشريف', '+201114445566', 'real_estate', 'فيلا — الشيخ زايد', 'exhibition', 'offer_sent'),
    ('ليلى منصور', '+201005556677', 'company_formation', 'تأسيس شركة فردية', 'facebook', 'waiting_decision')
  ) as v(name, phone, line, details, source, stage)
  loop
    insert into public.leads (full_name, phone, interest_line, interest_details, source, stage_id, owner_employee_id)
    values (st.name, st.phone, st.line, st.details, st.source, (select id from public.lead_stages where key = st.stage), e_nourhan)
    returning id into l1;
    if st.stage = 'contacted' then
      insert into public.tasks (kind, title, assigned_to, due_at, priority, lead_id)
      values ('follow_up', 'متابعة: إرسال 3 عروض مطابقة', e_nourhan, now() - interval '20 hours', 'high', l1);
      insert into public.lead_activities (lead_id, type, summary, actor_employee_id)
      values (l1, 'call', 'مهتم بالدور المتوسط، يفضل الاستلام 2027', e_nourhan);
    end if;
  end loop;

  -- a lead owned by operations (not visible to sales with "own" scope)
  insert into public.leads (full_name, phone, interest_line, interest_details, source, owner_employee_id)
  values ('مصنع الأمل للبلاستيك', '+201559023381', 'loans', 'قرض رأس مال عامل 1.5M', 'website', e_mohamed)
  returning id into l2;
end;
$$;
