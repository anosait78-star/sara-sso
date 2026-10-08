-- =====================================================================
-- Phase 1 · Catalog data: permission catalog, default roles and grants,
-- default departments and settings. Roles/departments stay editable from the UI;
-- the permission catalog is only changed through migrations.
-- =====================================================================

insert into public.permissions (module, action, description_ar, sort_order) values
  ('dashboard', 'view', 'عرض لوحة التحكم', 1),

  ('customers', 'view', 'عرض العملاء', 1),
  ('customers', 'create', 'إضافة عميل', 2),
  ('customers', 'edit', 'تعديل بيانات عميل', 3),
  ('customers', 'delete', 'حذف عميل', 4),
  ('customers', 'assign', 'إسناد عميل لموظف', 6),
  ('customers', 'export', 'تصدير العملاء', 7),
  ('customers', 'manage_access', 'إدارة حساب العميل في التطبيق (إعادة تعيين كلمة السر، الإيقاف، اعتماد الربط)', 8),

  ('leads', 'view', 'عرض العملاء المحتملين', 1),
  ('leads', 'create', 'إضافة عميل محتمل', 2),
  ('leads', 'edit', 'تعديل عميل محتمل', 3),
  ('leads', 'delete', 'حذف عميل محتمل', 4),
  ('leads', 'assign', 'إسناد عميل محتمل', 6),
  ('leads', 'export', 'تصدير العملاء المحتملين', 7),

  ('service_requests', 'view', 'عرض طلبات الخدمات', 1),
  ('service_requests', 'create', 'إنشاء طلب', 2),
  ('service_requests', 'edit', 'تعديل طلب وتنفيذ خطواته', 3),
  ('service_requests', 'delete', 'حذف/إلغاء طلب', 4),
  ('service_requests', 'approve', 'اعتماد الخطوات', 5),
  ('service_requests', 'assign', 'إسناد الطلبات والخطوات', 6),
  ('service_requests', 'export', 'تصدير الطلبات', 7),

  ('tasks', 'view', 'عرض المهام والمتابعات', 1),
  ('tasks', 'create', 'إنشاء مهمة', 2),
  ('tasks', 'edit', 'تعديل مهمة', 3),
  ('tasks', 'delete', 'حذف مهمة', 4),
  ('tasks', 'assign', 'إسناد مهمة', 6),
  ('tasks', 'export', 'تصدير المهام', 7),

  ('documents', 'view', 'عرض المستندات', 1),
  ('documents', 'create', 'رفع مستند', 2),
  ('documents', 'delete', 'حذف مستند', 4),
  ('documents', 'approve', 'قبول/رفض المستندات', 5),

  ('appointments', 'view', 'عرض المواعيد', 1),
  ('appointments', 'create', 'إضافة موعد', 2),
  ('appointments', 'edit', 'تعديل موعد', 3),
  ('appointments', 'delete', 'حذف موعد', 4),
  ('appointments', 'assign', 'إسناد موعد', 6),

  ('payments', 'view', 'عرض المدفوعات', 1),
  ('payments', 'create', 'تسجيل دفعة', 2),
  ('payments', 'edit', 'تعديل دفعة', 3),
  ('payments', 'delete', 'حذف دفعة', 4),
  ('payments', 'approve', 'اعتماد دفعة/استرداد', 5),
  ('payments', 'export', 'تصدير المدفوعات', 7),

  ('properties', 'view', 'عرض العقارات', 1),
  ('properties', 'create', 'إضافة عقار', 2),
  ('properties', 'edit', 'تعديل عقار', 3),
  ('properties', 'delete', 'حذف عقار', 4),
  ('properties', 'assign', 'إسناد عقار', 6),
  ('properties', 'export', 'تصدير العقارات', 7),

  ('insurance', 'view', 'عرض وثائق التأمين', 1),
  ('insurance', 'create', 'إضافة وثيقة', 2),
  ('insurance', 'edit', 'تعديل وثيقة', 3),
  ('insurance', 'delete', 'حذف وثيقة', 4),
  ('insurance', 'assign', 'إسناد وثيقة', 6),
  ('insurance', 'export', 'تصدير الوثائق', 7),

  ('company_formation', 'view', 'عرض ملفات الشركات', 1),
  ('company_formation', 'create', 'إضافة ملف شركة', 2),
  ('company_formation', 'edit', 'تعديل ملف شركة', 3),
  ('company_formation', 'delete', 'حذف ملف شركة', 4),
  ('company_formation', 'assign', 'إسناد ملف شركة', 6),
  ('company_formation', 'export', 'تصدير ملفات الشركات', 7),

  ('loans', 'view', 'عرض طلبات التمويل', 1),
  ('loans', 'create', 'إضافة طلب تمويل', 2),
  ('loans', 'edit', 'تعديل طلب تمويل', 3),
  ('loans', 'delete', 'حذف طلب تمويل', 4),
  ('loans', 'approve', 'اعتماد ملف التمويل', 5),
  ('loans', 'assign', 'إسناد طلب تمويل', 6),
  ('loans', 'export', 'تصدير طلبات التمويل', 7),

  ('reports', 'view', 'عرض التقارير', 1),
  ('reports', 'export', 'تصدير التقارير', 7),

  ('services_config', 'view', 'عرض كتالوج الخدمات والـWorkflow', 1),
  ('services_config', 'create', 'إنشاء خدمة/مسودة Workflow', 2),
  ('services_config', 'edit', 'تعديل خدمة/مسودة Workflow', 3),
  ('services_config', 'delete', 'حذف خدمة/خطوة', 4),
  ('services_config', 'approve', 'نشر إصدار Workflow', 5),

  ('employees', 'view', 'عرض الموظفين والأقسام', 1),
  ('employees', 'create', 'دعوة موظف / إضافة قسم', 2),
  ('employees', 'edit', 'تعديل موظف/قسم وإيقافه', 3),
  ('employees', 'delete', 'حذف قسم', 4),
  ('employees', 'export', 'تصدير الموظفين', 7),

  ('roles', 'view', 'عرض الأدوار والصلاحيات', 1),
  ('roles', 'create', 'إنشاء دور', 2),
  ('roles', 'edit', 'تعديل دور وصلاحياته', 3),
  ('roles', 'delete', 'حذف دور', 4),

  ('settings', 'view', 'عرض الإعدادات', 1),
  ('settings', 'edit', 'تعديل الإعدادات', 3),

  ('audit_logs', 'view', 'عرض سجل التدقيق', 1),
  ('audit_logs', 'export', 'تصدير سجل التدقيق', 7);

-- ---------------------------------------------------------------------
-- Default roles (editable, except the protected super_admin system role)
-- ---------------------------------------------------------------------
insert into public.roles (key, name_ar, name_en, description, is_system) values
  ('super_admin', 'مدير النظام', 'Super Admin', 'كل الصلاحيات — دور نظامي محمي', true),
  ('manager', 'مدير', 'Manager', 'متابعة الفريق والاعتمادات والتقارير', false),
  ('sales', 'مبيعات', 'Sales', 'العملاء المحتملون والمتابعات والعقارات', false),
  ('operations', 'عمليات', 'Operations', 'تنفيذ الطلبات ومراجعة المستندات', false),
  ('accountant', 'محاسب', 'Accountant', 'المدفوعات والمستحقات', false),
  ('employee', 'موظف', 'Employee', 'مهامه والطلبات المسندة إليه', false);

-- helper to grant a list of module.action at a scope
create or replace function app._grant(p_role text, p_scope public.permission_scope, p_items text[])
returns void
language sql
set search_path = ''
as $$
  insert into public.role_permissions (role_id, permission_id, scope)
  select r.id, pm.id, p_scope
  from public.roles r
  join public.permissions pm on (pm.module || '.' || pm.action) = any (p_items)
  where r.key = p_role
  on conflict (role_id, permission_id) do update set scope = excluded.scope
$$;

-- Manager: everything operational at "all", plus approvals; view-only on configuration
select app._grant('manager', 'all', array[
  'dashboard.view',
  'customers.view','customers.create','customers.edit','customers.assign','customers.export','customers.manage_access',
  'leads.view','leads.create','leads.edit','leads.assign','leads.export',
  'service_requests.view','service_requests.create','service_requests.edit','service_requests.approve','service_requests.assign','service_requests.export',
  'tasks.view','tasks.create','tasks.edit','tasks.assign','tasks.export',
  'documents.view','documents.create','documents.approve',
  'appointments.view','appointments.create','appointments.edit','appointments.assign',
  'payments.view','payments.export',
  'properties.view','properties.create','properties.edit','properties.assign','properties.export',
  'insurance.view','insurance.create','insurance.edit','insurance.assign','insurance.export',
  'company_formation.view','company_formation.create','company_formation.edit','company_formation.assign','company_formation.export',
  'loans.view','loans.create','loans.edit','loans.approve','loans.assign','loans.export',
  'reports.view','reports.export',
  'services_config.view',
  'employees.view',
  'roles.view',
  'settings.view',
  'audit_logs.view'
]);

-- Sales: own records
select app._grant('sales', 'own', array[
  'customers.view','customers.edit','leads.view','leads.edit','tasks.view','tasks.edit','appointments.view','appointments.edit',
  'service_requests.view','payments.view','properties.edit'
]);
select app._grant('sales', 'all', array[
  'dashboard.view','customers.create','leads.create','leads.export','tasks.create','appointments.create','appointments.delete',
  'service_requests.create','properties.view','properties.create'
]);

-- Operations: department scope for execution
select app._grant('operations', 'department', array[
  'customers.view','service_requests.view','service_requests.edit','service_requests.assign',
  'tasks.view','tasks.edit','documents.view','appointments.view','appointments.edit',
  'insurance.view','insurance.edit','company_formation.view','company_formation.edit','loans.view','loans.edit','payments.view'
]);
select app._grant('operations', 'all', array[
  'dashboard.view','service_requests.create','tasks.create','tasks.assign','documents.create','documents.approve',
  'appointments.create','insurance.create','company_formation.create','loans.create','employees.view'
]);

-- Accountant
select app._grant('accountant', 'all', array[
  'dashboard.view','customers.view','service_requests.view',
  'payments.view','payments.create','payments.edit','payments.delete','payments.approve','payments.export',
  'reports.view','reports.export','tasks.view','tasks.create'
]);

-- Employee: own work only
select app._grant('employee', 'own', array[
  'customers.view','service_requests.view','service_requests.edit','tasks.view','tasks.edit','documents.view','appointments.view'
]);
select app._grant('employee', 'all', array['dashboard.view','tasks.create','documents.create']);

drop function app._grant(text, public.permission_scope, text[]);

-- ---------------------------------------------------------------------
-- Default departments
-- ---------------------------------------------------------------------
insert into public.departments (name_ar, name_en) values
  ('الإدارة', 'Management'),
  ('المبيعات', 'Sales'),
  ('العمليات', 'Operations'),
  ('المالية', 'Finance'),
  ('خدمة العملاء', 'Customer Service');

-- ---------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('company', jsonb_build_object(
     'name_ar', 'سارة سليمان للخدمات',
     'name_en', 'SSO · Sara Soliman',
     'phone', '',
     'whatsapp', '',
     'email', '',
     'address', '',
     'currency', 'EGP')),
  ('numbering', jsonb_build_object('request_prefix', 'REQ-', 'customer_prefix', 'CUS-', 'payment_prefix', 'PAY-')),
  ('work_week', jsonb_build_object('working_days', jsonb_build_array(0, 1, 2, 3, 4), 'sla_unit', 'business_days')),
  ('insurance_reminders', jsonb_build_object('days_before', jsonb_build_array(30, 15, 7)));

-- ---------------------------------------------------------------------
-- One-time bootstrap for production: promote an existing auth user (created in the
-- Supabase dashboard) to the first super admin. Callable only from SQL (service role / postgres).
-- ---------------------------------------------------------------------
create or replace function app.bootstrap_super_admin(p_email text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_emp uuid;
begin
  if exists (select 1 from public.employees e join public.roles r on r.id = e.role_id where r.key = 'super_admin') then
    raise exception 'a super admin already exists';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'auth user % not found — create it first in Authentication > Users', p_email;
  end if;
  update public.profiles set user_type = 'staff', full_name = p_full_name where id = v_user;
  insert into public.employees (profile_id, role_id, department_id, job_title, status)
  values (v_user, (select id from public.roles where key = 'super_admin'),
          (select id from public.departments where name_en = 'Management'), 'مدير النظام', 'active')
  returning id into v_emp;
  return v_emp;
end;
$$;
revoke execute on function app.bootstrap_super_admin(text, text) from authenticated, anon, public;
