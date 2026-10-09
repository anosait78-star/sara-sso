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

-- ---------------------------------------------------------------------
-- Sample service catalog (Phase 3) — one or more services per business line.
-- Built as Sara (super admin) through the same RPCs the Workflow Builder uses,
-- so versions, audit and locks behave exactly as in production.
-- "تأسيس شركة ذات مسؤولية محدودة" ends with v1 archived and v2 published (7 steps).
--
-- Step JSON: k=step_key, d=duration, u=unit, a=assignee ("request_owner" | "department:<name_en>" | "role:<key>"),
--   appr=approver role, client=client action, vis=client visible, req=required, label=client-facing status,
--   status=sets_request_status, task=auto task, fields=[{k,ar,en,t,by,req,opts:[[value,ar,en]]}], docs=[[type_key, required]]
-- ---------------------------------------------------------------------
do $$
declare
  svc jsonb;
  st jsonb;
  fld jsonb;
  doc jsonb;
  v_service uuid;
  v_wf uuid;
  v_step uuid;
  v_llc uuid;
  i int;
  j int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

  for svc in select * from jsonb_array_elements($json$[
    {"code": "CF-LLC", "cat": "company_formation", "module": "company_formation", "icon": "landmark", "price": 15000, "visible": true,
     "ar": "تأسيس شركة ذات مسؤولية محدودة", "en": "LLC company formation",
     "desc": "تأسيس شركة ذات مسؤولية محدودة بالكامل: حجز الاسم، عقد التأسيس، السجل التجاري، البطاقة الضريبية حتى تسليم الأوراق.",
     "note": "الإصدار الأول",
     "steps": [
       {"k": "collect_data", "ar": "جمع البيانات", "en": "Collect data", "d": 2, "a": "request_owner", "client": true, "label": "تم استلام بياناتك",
        "instr": "ارفع بطاقات الشركاء وعقد المقر وأكمل بيانات الشركة.", "status": "waiting_client",
        "fields": [
          {"k": "proposed_names", "ar": "الأسماء المقترحة للشركة (3)", "en": "Proposed names (3)", "t": "textarea", "by": "client"},
          {"k": "activity", "ar": "النشاط التجاري", "en": "Business activity", "t": "select", "by": "client",
           "opts": [["trade", "تجارة عامة", "General trade"], ["contracting", "مقاولات", "Contracting"], ["it", "برمجيات وتكنولوجيا", "IT"], ["import_export", "استيراد وتصدير", "Import & export"]]},
          {"k": "capital", "ar": "رأس المال", "en": "Capital", "t": "money", "by": "client", "min": 1000},
          {"k": "partners_count", "ar": "عدد الشركاء", "en": "Number of partners", "t": "number", "by": "client", "min": 2, "max": 50}],
        "docs": [["partner_ids", true], ["lease_contract", true], ["utility_bill", false]]},
       {"k": "name_reservation", "ar": "حجز الاسم", "en": "Name reservation", "d": 3, "a": "department:Operations", "label": "تم حجز الاسم التجاري",
        "fields": [{"k": "approved_name", "ar": "الاسم المعتمد", "en": "Approved name", "t": "text", "by": "staff"}],
        "docs": [["name_reservation", true]]},
       {"k": "company_incorporation", "ar": "تأسيس الشركة", "en": "Company incorporation", "d": 5, "a": "department:Operations", "label": "تم توقيع عقد التأسيس",
        "fields": [{"k": "contract_date", "ar": "تاريخ توقيع العقد", "en": "Contract date", "t": "date", "by": "staff"}],
        "docs": [["articles_of_association", true], ["capital_deposit_certificate", true]]},
       {"k": "tax_card", "ar": "البطاقة الضريبية", "en": "Tax card", "d": 4, "a": "department:Operations", "label": "تم استخراج البطاقة الضريبية",
        "fields": [{"k": "tax_card_no", "ar": "رقم البطاقة الضريبية", "en": "Tax card no.", "t": "text", "by": "staff"}],
        "docs": [["tax_card", true]]},
       {"k": "commercial_register", "ar": "السجل التجاري", "en": "Commercial register", "d": 3, "a": "department:Operations", "label": "تم القيد في السجل التجاري",
        "fields": [{"k": "commercial_register_no", "ar": "رقم السجل التجاري", "en": "Commercial register no.", "t": "text", "by": "staff"}],
        "docs": [["commercial_register", true]]},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "client": true, "label": "تم تسليم أوراق الشركة",
        "status": "completed", "instr": "سيتم التواصل معك لتحديد موعد استلام الأوراق الأصلية."}]},

    {"code": "CF-TAX", "cat": "company_formation", "module": "generic", "icon": "file-badge", "price": 2500, "visible": true,
     "ar": "استخراج بطاقة ضريبية", "en": "Tax card issuance",
     "steps": [
       {"k": "collect_data", "ar": "جمع البيانات", "en": "Collect data", "d": 1, "a": "request_owner", "client": true, "label": "تم استلام بياناتك",
        "docs": [["national_id", true], ["commercial_register", true], ["lease_contract", true]]},
       {"k": "document_review", "ar": "مراجعة المستندات", "en": "Document review", "d": 1, "a": "department:Operations", "appr": "manager", "vis": false},
       {"k": "tax_office_submission", "ar": "التقديم لمأمورية الضرائب", "en": "Tax office submission", "d": 5, "a": "department:Operations", "label": "تم التقديم للمأمورية", "task": true},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "label": "البطاقة جاهزة للاستلام", "status": "completed",
        "docs": [["tax_card", true]]}]},

    {"code": "CF-CR", "cat": "company_formation", "module": "generic", "icon": "stamp", "price": 3000, "visible": true,
     "ar": "قيد / تجديد سجل تجاري", "en": "Commercial register — new / renewal",
     "steps": [
       {"k": "collect_data", "ar": "جمع البيانات", "en": "Collect data", "d": 1, "a": "request_owner", "client": true,
        "fields": [{"k": "request_type", "ar": "نوع الطلب", "en": "Request type", "t": "select", "by": "client", "opts": [["new", "قيد جديد", "New"], ["renewal", "تجديد", "Renewal"]]}],
        "docs": [["national_id", true], ["lease_contract", true]]},
       {"k": "chamber_of_commerce", "ar": "الغرفة التجارية", "en": "Chamber of commerce", "d": 2, "a": "department:Operations"},
       {"k": "commercial_register", "ar": "السجل التجاري", "en": "Commercial register", "d": 3, "a": "department:Operations", "label": "تم القيد في السجل",
        "docs": [["commercial_register", true]]},
       {"k": "quality_check", "ar": "مراجعة نهائية", "en": "Final check", "d": 1, "a": "role:manager", "vis": false},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "status": "completed", "label": "تم تسليم المستخرج"}]},

    {"code": "CF-SI", "cat": "company_formation", "module": "generic", "icon": "users", "price": 1800, "visible": false, "active": false,
     "ar": "تسجيل التأمينات الاجتماعية", "en": "Social insurance registration",
     "steps": [
       {"k": "collect_data", "ar": "جمع البيانات", "en": "Collect data", "d": 1, "a": "request_owner",
        "fields": [{"k": "employees_count", "ar": "عدد العاملين", "en": "Employees", "t": "number", "by": "staff", "min": 1}],
        "docs": [["commercial_register", true], ["tax_card", true]]},
       {"k": "social_insurance", "ar": "التأمينات الاجتماعية", "en": "Social insurance", "d": 5, "a": "department:Operations", "docs": [["social_insurance_form_1", true]]},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "status": "completed"}]},

    {"code": "INS-CAR", "cat": "insurance", "module": "insurance", "icon": "car", "price": 500, "visible": true,
     "ar": "تأمين سيارة شامل", "en": "Comprehensive car insurance",
     "steps": [
       {"k": "collect_data", "ar": "بيانات السيارة", "en": "Vehicle data", "d": 1, "a": "request_owner", "client": true, "label": "تم استلام بيانات السيارة",
        "fields": [
          {"k": "car_model", "ar": "الماركة والموديل", "en": "Make & model", "t": "text", "by": "client"},
          {"k": "car_year", "ar": "سنة الصنع", "en": "Year", "t": "number", "by": "client", "min": 1990, "max": 2027},
          {"k": "car_value", "ar": "القيمة التقديرية", "en": "Estimated value", "t": "money", "by": "client"}],
        "docs": [["car_license", true], ["driving_license", true], ["national_id", true]]},
       {"k": "inspection", "ar": "معاينة السيارة", "en": "Vehicle inspection", "d": 2, "a": "department:Operations", "docs": [["car_photos", true]]},
       {"k": "quotes", "ar": "عروض شركات التأمين", "en": "Insurer quotes", "d": 2, "a": "role:sales", "label": "عروض الأسعار جاهزة", "client": true,
        "fields": [{"k": "chosen_company", "ar": "الشركة المختارة", "en": "Chosen insurer", "t": "text", "by": "client"}]},
       {"k": "policy_issuance", "ar": "إصدار الوثيقة", "en": "Policy issuance", "d": 3, "a": "department:Operations", "label": "تم إصدار الوثيقة",
        "fields": [{"k": "policy_no", "ar": "رقم الوثيقة", "en": "Policy no.", "t": "text", "by": "staff"}, {"k": "end_date", "ar": "تاريخ الانتهاء", "en": "End date", "t": "date", "by": "staff"}]},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "status": "completed"}]},

    {"code": "INS-MED", "cat": "insurance", "module": "insurance", "icon": "heart-pulse", "price": 400, "visible": true,
     "ar": "تأمين طبي (أفراد / عائلي)", "en": "Medical insurance (individual / family)",
     "steps": [
       {"k": "collect_data", "ar": "بيانات المؤمَّن عليهم", "en": "Insured persons", "d": 1, "a": "request_owner", "client": true,
        "fields": [{"k": "members", "ar": "عدد الأفراد", "en": "Members", "t": "number", "by": "client", "min": 1, "max": 10},
                   {"k": "plan", "ar": "نوع التغطية", "en": "Plan", "t": "select", "by": "client", "opts": [["basic", "أساسية", "Basic"], ["plus", "متوسطة", "Plus"], ["premium", "شاملة", "Premium"]]}],
        "docs": [["national_id", true], ["medical_report", false]]},
       {"k": "quotes", "ar": "عروض شركات التأمين", "en": "Insurer quotes", "d": 3, "a": "role:sales", "client": true, "label": "عروض الأسعار جاهزة"},
       {"k": "policy_issuance", "ar": "إصدار الوثيقة", "en": "Policy issuance", "d": 5, "a": "department:Operations", "label": "تم إصدار الوثيقة"},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "status": "completed"}]},

    {"code": "INS-RENEW", "cat": "insurance", "module": "insurance", "icon": "refresh-cw", "price": 150, "visible": false,
     "ar": "تجديد وثيقة تأمين", "en": "Policy renewal",
     "steps": [
       {"k": "renewal_contact", "ar": "التواصل مع العميل", "en": "Contact client", "d": 2, "a": "role:sales", "task": true},
       {"k": "policy_issuance", "ar": "إصدار الوثيقة الجديدة", "en": "New policy issuance", "d": 3, "a": "department:Operations", "docs": [["previous_policy", true]]},
       {"k": "delivery", "ar": "التسليم", "en": "Delivery", "d": 1, "a": "department:Customer Service", "status": "completed"}]},

    {"code": "RE-BUY", "cat": "real_estate", "module": "real_estate", "icon": "home", "price": null, "visible": true,
     "ar": "شراء عقار (وساطة)", "en": "Property purchase (brokerage)",
     "steps": [
       {"k": "requirements", "ar": "تحديد المتطلبات", "en": "Requirements", "d": 1, "a": "role:sales", "client": true,
        "fields": [{"k": "property_type", "ar": "نوع العقار", "en": "Property type", "t": "select", "by": "client", "opts": [["apartment", "شقة", "Apartment"], ["villa", "فيلا", "Villa"], ["shop", "محل", "Shop"], ["office", "مكتب", "Office"]]},
                   {"k": "budget", "ar": "الميزانية", "en": "Budget", "t": "money", "by": "client"},
                   {"k": "area", "ar": "المنطقة المفضلة", "en": "Preferred area", "t": "text", "by": "client"}]},
       {"k": "shortlist", "ar": "ترشيح العقارات", "en": "Shortlist", "d": 3, "a": "role:sales", "label": "تم ترشيح عقارات مناسبة"},
       {"k": "visits", "ar": "المعاينات", "en": "Visits", "d": 5, "a": "role:sales", "client": true, "label": "تمت المعاينة"},
       {"k": "negotiation", "ar": "التفاوض", "en": "Negotiation", "d": 5, "a": "role:sales", "req": false},
       {"k": "contract_review", "ar": "مراجعة العقد", "en": "Contract review", "d": 2, "a": "department:Operations", "appr": "manager",
        "docs": [["ownership_contract", true], ["national_id", true]]},
       {"k": "handover", "ar": "التعاقد والتسليم", "en": "Contract & handover", "d": 2, "a": "role:sales", "status": "completed", "label": "تم التعاقد"}]},

    {"code": "RE-RENT", "cat": "real_estate", "module": "real_estate", "icon": "key-round", "price": null, "visible": true,
     "ar": "إيجار عقار", "en": "Property rental",
     "steps": [
       {"k": "requirements", "ar": "تحديد المتطلبات", "en": "Requirements", "d": 1, "a": "role:sales", "client": true,
        "fields": [{"k": "budget", "ar": "الإيجار الشهري المتوقع", "en": "Monthly budget", "t": "money", "by": "client"}]},
       {"k": "shortlist", "ar": "ترشيح العقارات", "en": "Shortlist", "d": 2, "a": "role:sales"},
       {"k": "visits", "ar": "المعاينات", "en": "Visits", "d": 3, "a": "role:sales", "client": true},
       {"k": "lease_contract", "ar": "عقد الإيجار", "en": "Lease contract", "d": 2, "a": "department:Operations", "docs": [["lease_contract", true], ["national_id", true]]},
       {"k": "handover", "ar": "التسليم", "en": "Handover", "d": 1, "a": "role:sales", "status": "completed"}]},

    {"code": "LN-WC", "cat": "loans", "module": "loans", "icon": "banknote", "price": 5000, "visible": true,
     "ar": "قرض رأس مال عامل", "en": "Working capital loan",
     "steps": [
       {"k": "collect_data", "ar": "بيانات النشاط", "en": "Business data", "d": 2, "a": "request_owner", "client": true,
        "fields": [{"k": "requested_amount", "ar": "المبلغ المطلوب", "en": "Requested amount", "t": "money", "by": "client", "min": 50000},
                   {"k": "annual_revenue", "ar": "الإيراد السنوي", "en": "Annual revenue", "t": "money", "by": "client"},
                   {"k": "years_in_business", "ar": "سنوات العمل", "en": "Years in business", "t": "number", "by": "client", "min": 0}],
        "docs": [["commercial_register", true], ["tax_card", true], ["bank_statement", true]]},
       {"k": "financial_analysis", "ar": "التحليل المالي", "en": "Financial analysis", "d": 3, "a": "department:Finance", "vis": false},
       {"k": "file_preparation", "ar": "تجهيز ملف التمويل", "en": "File preparation", "d": 3, "a": "department:Operations", "appr": "manager",
        "docs": [["financial_statements", true], ["feasibility_study", false]]},
       {"k": "submission", "ar": "التقديم لجهات التمويل", "en": "Submission to lenders", "d": 2, "a": "department:Operations", "label": "تم تقديم الملف لجهة التمويل"},
       {"k": "follow_up", "ar": "متابعة قرار الجهة", "en": "Lender decision follow-up", "d": 14, "u": "days", "a": "request_owner", "task": true},
       {"k": "decision", "ar": "إبلاغ العميل بالقرار", "en": "Inform client", "d": 1, "a": "request_owner", "label": "صدر قرار جهة التمويل"},
       {"k": "closing", "ar": "إغلاق الملف", "en": "Closing", "d": 1, "a": "department:Customer Service", "status": "completed"}]},

    {"code": "LN-EQ", "cat": "loans", "module": "loans", "icon": "factory", "price": 7000, "visible": false, "publish": false,
     "ar": "تمويل معدات وآلات", "en": "Equipment financing",
     "steps": [
       {"k": "collect_data", "ar": "بيانات النشاط والمعدات", "en": "Business & equipment data", "d": 2, "a": "request_owner",
        "docs": [["equipment_quotation", true], ["commercial_register", true]]},
       {"k": "file_preparation", "ar": "تجهيز ملف التمويل", "en": "File preparation", "d": 3, "a": "department:Operations"},
       {"k": "submission", "ar": "التقديم لجهات التمويل", "en": "Submission", "d": 2, "a": "department:Operations"}]}
  ]$json$::jsonb) loop

    insert into public.services (category_id, code, name_ar, name_en, description_ar, icon, module_key, default_price, is_client_visible, sort_order)
    values ((select id from public.service_categories where key = svc ->> 'cat'), svc ->> 'code', svc ->> 'ar', svc ->> 'en', svc ->> 'desc',
            svc ->> 'icon', (svc ->> 'module')::public.service_module, (svc ->> 'price')::numeric, coalesce((svc ->> 'visible')::boolean, false),
            (select count(*) from public.services))
    returning id into v_service;
    select id into v_wf from public.service_workflows where service_id = v_service and status = 'draft';

    i := 0;
    for st in select * from jsonb_array_elements(svc -> 'steps') loop
      i := i + 1;
      insert into public.workflow_steps (
        workflow_id, sort_order, step_key, name_ar, name_en, client_instructions, is_required, duration_value, duration_unit,
        assignee_type, assignee_role_id, assignee_department_id, requires_approval, approver_role_id,
        client_action_required, is_client_visible, completion_status_label_ar, sets_request_status, auto_create_task)
      values (
        v_wf, i, st ->> 'k', st ->> 'ar', st ->> 'en', st ->> 'instr', coalesce((st ->> 'req')::boolean, true),
        (st ->> 'd')::int, coalesce(st ->> 'u', 'business_days')::public.duration_unit,
        split_part(st ->> 'a', ':', 1)::public.assignee_type,
        case when split_part(st ->> 'a', ':', 1) = 'role' then (select id from public.roles where key = split_part(st ->> 'a', ':', 2)) end,
        case when split_part(st ->> 'a', ':', 1) = 'department' then (select id from public.departments where name_en = split_part(st ->> 'a', ':', 2)) end,
        st ? 'appr', (select id from public.roles where key = st ->> 'appr'),
        coalesce((st ->> 'client')::boolean, false), coalesce((st ->> 'vis')::boolean, true),
        st ->> 'label', (st ->> 'status')::public.request_status, coalesce((st ->> 'task')::boolean, false))
      returning id into v_step;

      j := 0;
      for fld in select * from jsonb_array_elements(coalesce(st -> 'fields', '[]'::jsonb)) loop
        j := j + 1;
        insert into public.required_fields (workflow_step_id, field_key, label_ar, label_en, field_type, options, validation, is_required, filled_by, sort_order)
        values (v_step, fld ->> 'k', fld ->> 'ar', fld ->> 'en', (fld ->> 't')::public.field_type,
                coalesce((select jsonb_agg(jsonb_build_object('value', o ->> 0, 'label_ar', o ->> 1, 'label_en', o ->> 2))
                          from jsonb_array_elements(fld -> 'opts') o), '[]'::jsonb),
                jsonb_strip_nulls(jsonb_build_object('min', fld -> 'min', 'max', fld -> 'max')),
                coalesce((fld ->> 'req')::boolean, true), (fld ->> 'by')::public.field_filler, j);
      end loop;

      j := 0;
      for doc in select * from jsonb_array_elements(coalesce(st -> 'docs', '[]'::jsonb)) loop
        j := j + 1;
        insert into public.required_documents (workflow_step_id, document_type_id, is_required, sort_order)
        values (v_step, (select id from public.document_types where key = doc ->> 0), (doc ->> 1)::boolean, j);
      end loop;
    end loop;

    if coalesce((svc ->> 'publish')::boolean, true) then
      perform public.publish_workflow(v_wf, coalesce(svc ->> 'note', 'الإصدار الأول'));
      update public.services set is_active = coalesce((svc ->> 'active')::boolean, true) where id = v_service;
    end if;
  end loop;

  -- CF-LLC v2: document review becomes its own step (between data collection and name reservation)
  select id into v_service from public.services where code = 'CF-LLC';
  v_llc := public.create_workflow_draft(v_service);
  v_step := public.insert_workflow_step(v_llc, 2, 'مراجعة المستندات', 'Document review');
  update public.workflow_steps set
    duration_value = 2, duration_unit = 'business_days', assignee_type = 'department',
    assignee_department_id = (select id from public.departments where name_en = 'Operations'),
    requires_approval = true, approver_role_id = (select id from public.roles where key = 'manager'),
    is_client_visible = true, completion_status_label_ar = 'تمت مراجعة مستنداتك',
    description = 'مراجعة مستندات الشركاء والمقر قبل حجز الاسم.'
  where id = v_step;
  perform public.publish_workflow(v_llc, 'فصل مراجعة المستندات في خطوة مستقلة');

  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Sample service requests (Phase 4), run through the same RPCs as the admin UI.
--   REQ-000001  CF-LLC   أحمد        — steps 1–2 done (2 approved), now at "حجز الاسم"
--   REQ-000002  INS-CAR  هالة        — waiting for the client, overdue
--   REQ-000003  LN-WC    شركة النيل  — a document was rejected -> waiting for the client
--   REQ-000004  CF-TAX   أحمد        — completed
-- ---------------------------------------------------------------------
do $$
declare
  c_ahmed uuid := (select id from public.customers where phone = '+201002345678');
  c_nile uuid := (select id from public.customers where phone = '+201228764410');
  c_hala uuid := (select id from public.customers where phone = '+201115550192');
  e_mohamed uuid := (select id from public.employees where profile_id = '33333333-3333-4333-8333-333333333333');
  e_mona uuid := (select id from public.employees where profile_id = '22222222-2222-4222-8222-222222222222');
  e_nourhan uuid := (select id from public.employees where profile_id = '44444444-4444-4444-8444-444444444444');
  r uuid;
  s uuid;
  d record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

  -- 1) LLC formation
  r := public.create_service_request((select id from public.services where code = 'CF-LLC'), c_ahmed, e_mohamed, 'high', 'العميل يفضل التواصل بعد 4 مساءً');
  s := (select current_step_id from public.service_requests where id = r);
  perform public.submit_step_data(s, '{"proposed_names": "النيل للتجارة\nالأهرام للتوريدات\nالدلتا الحديثة", "activity": "trade", "capital": 50000, "partners_count": 3}');
  for d in select id from public.documents where request_step_id = s and is_required loop
    perform public.receive_document(d.id, 'تم استلام الأصل في المكتب');
  end loop;
  perform public.complete_request_step(s, 'البيانات مكتملة');
  s := (select current_step_id from public.service_requests where id = r);
  perform public.complete_request_step(s, 'المستندات سليمة');
  perform public.approve_request_step(s, 'معتمد');

  -- 2) car insurance — waiting for the client, overdue
  r := public.create_service_request((select id from public.services where code = 'INS-CAR'), c_hala, e_nourhan, 'normal', null);
  update public.service_requests set due_at = now() - interval '2 days' where id = r;
  update public.service_request_steps set due_at = now() - interval '3 days', started_at = now() - interval '6 days'
   where id = (select current_step_id from public.service_requests where id = r);

  -- 3) working capital loan — bank statement rejected
  r := public.create_service_request((select id from public.services where code = 'LN-WC'), c_nile, e_mona, 'urgent', 'جهة التمويل المقترحة: بنك مصر');
  s := (select current_step_id from public.service_requests where id = r);
  perform public.submit_step_data(s, '{"requested_amount": 1500000, "annual_revenue": 6000000, "years_in_business": 7}');
  perform public.receive_document((select id from public.documents where request_step_id = s and name_ar = 'مستخرج السجل التجاري'), null);
  perform public.receive_document((select id from public.documents where request_step_id = s and name_ar = 'البطاقة الضريبية'), null);
  perform public.reject_document((select id from public.documents where request_step_id = s and name_ar like 'كشف حساب%'),
                                 (select id from public.rejection_reasons where sort_order = 4), 'الكشف آخر 3 شهور فقط والمطلوب 6');

  -- 4) tax card — completed end to end
  r := public.create_service_request((select id from public.services where code = 'CF-TAX'), c_ahmed, e_mohamed, 'normal', null);
  for i in 1..4 loop
    s := (select current_step_id from public.service_requests where id = r);
    for d in select id from public.documents where request_step_id = s and is_required loop
      perform public.receive_document(d.id, null);
    end loop;
    perform public.complete_request_step(s, null);
    if (select status from public.service_request_steps where id = s) = 'waiting_approval' then
      perform public.approve_request_step(s, null);
    end if;
  end loop;

  perform app.refresh_overdue();
  perform set_config('request.jwt.claims', '', true);
end;
$$;
