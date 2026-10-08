// Permission catalog mirrored from supabase/migrations/*_catalog_roles_permissions.sql.
// The database is the source of truth; this file only drives UI labels and ordering.

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export', 'manage_access'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_MODULES = [
  'dashboard',
  'customers',
  'leads',
  'service_requests',
  'tasks',
  'documents',
  'appointments',
  'payments',
  'properties',
  'insurance',
  'company_formation',
  'loans',
  'reports',
  'services_config',
  'employees',
  'roles',
  'settings',
  'audit_logs',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type PermissionScope = 'own' | 'department' | 'all';

export interface PermissionGrant {
  module: string;
  action: string;
  scope: PermissionScope;
}

export const SCOPE_RANK: Record<PermissionScope, number> = { own: 1, department: 2, all: 3 };

export const MODULE_LABELS: Record<PermissionModule, { ar: string; en: string }> = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  customers: { ar: 'العملاء', en: 'Customers' },
  leads: { ar: 'العملاء المحتملون', en: 'Leads' },
  service_requests: { ar: 'طلبات الخدمات', en: 'Service Requests' },
  tasks: { ar: 'المهام والمتابعات', en: 'Tasks & Follow-ups' },
  documents: { ar: 'المستندات', en: 'Documents' },
  appointments: { ar: 'المواعيد', en: 'Appointments' },
  payments: { ar: 'المدفوعات', en: 'Payments' },
  properties: { ar: 'العقارات', en: 'Properties' },
  insurance: { ar: 'التأمين', en: 'Insurance' },
  company_formation: { ar: 'تأسيس الشركات', en: 'Company Formation' },
  loans: { ar: 'القروض التجارية', en: 'Commercial Loans' },
  reports: { ar: 'التقارير', en: 'Reports' },
  services_config: { ar: 'كتالوج الخدمات والـWorkflow', en: 'Services & Workflow' },
  employees: { ar: 'الموظفون والأقسام', en: 'Employees & Departments' },
  roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  audit_logs: { ar: 'سجل التدقيق', en: 'Audit Log' },
};

export const ACTION_LABELS: Record<PermissionAction, { ar: string; en: string }> = {
  view: { ar: 'عرض', en: 'View' },
  create: { ar: 'إنشاء', en: 'Create' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  assign: { ar: 'إسناد', en: 'Assign' },
  export: { ar: 'تصدير', en: 'Export' },
  manage_access: { ar: 'إدارة الوصول', en: 'Manage access' },
};

export const SCOPE_LABELS: Record<PermissionScope, { ar: string; en: string }> = {
  own: { ar: 'سجلاته', en: 'Own' },
  department: { ar: 'قسمه', en: 'Department' },
  all: { ar: 'الكل', en: 'All' },
};

/** Build a lookup "module.action" -> scope from get_my_permissions() rows. */
export function toPermissionMap(rows: PermissionGrant[]): Map<string, PermissionScope> {
  const map = new Map<string, PermissionScope>();
  for (const r of rows) map.set(`${r.module}.${r.action}`, r.scope);
  return map;
}
