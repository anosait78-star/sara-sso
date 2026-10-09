import {
  Banknote, Building2, CalendarDays, ChartColumn, ClipboardList, FileText, IdCard, KeyRound, Landmark, Layers,
  LayoutDashboard, PhoneCall, ScrollText, Settings, ShieldCheck, SquareCheckBig, UserPlus, Users, Wallet, Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  /** "module.action" needed to see the item */
  perm: string;
  /** false = module arrives in a later phase (hidden from navigation) */
  ready: boolean;
}
export interface NavGroup {
  key: string | null;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { key: null, items: [{ key: 'dashboard', to: '/', icon: LayoutDashboard, perm: 'dashboard.view', ready: true }] },
  {
    key: 'crm',
    items: [
      { key: 'customers', to: '/customers', icon: Users, perm: 'customers.view', ready: true },
      { key: 'leads', to: '/leads', icon: UserPlus, perm: 'leads.view', ready: true },
      { key: 'followups', to: '/follow-ups', icon: PhoneCall, perm: 'tasks.view', ready: true },
      { key: 'appointments', to: '/appointments', icon: CalendarDays, perm: 'appointments.view', ready: true },
    ],
  },
  {
    key: 'operations',
    items: [
      { key: 'requests', to: '/requests', icon: ClipboardList, perm: 'service_requests.view', ready: true },
      { key: 'tasks', to: '/tasks', icon: SquareCheckBig, perm: 'tasks.view', ready: true },
      { key: 'documents', to: '/documents', icon: FileText, perm: 'documents.view', ready: false },
    ],
  },
  {
    key: 'lines',
    items: [
      { key: 'realEstate', to: '/real-estate', icon: Building2, perm: 'properties.view', ready: false },
      { key: 'insurance', to: '/insurance', icon: ShieldCheck, perm: 'insurance.view', ready: false },
      { key: 'formation', to: '/company-formation', icon: Landmark, perm: 'company_formation.view', ready: false },
      { key: 'loans', to: '/loans', icon: Banknote, perm: 'loans.view', ready: false },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'payments', to: '/payments', icon: Wallet, perm: 'payments.view', ready: false },
      { key: 'reports', to: '/reports', icon: ChartColumn, perm: 'reports.view', ready: false },
    ],
  },
  {
    key: 'config',
    items: [
      { key: 'services', to: '/services', icon: Layers, perm: 'services_config.view', ready: true },
      { key: 'workflow', to: '/workflow', icon: Workflow, perm: 'services_config.view', ready: true },
      { key: 'employees', to: '/employees', icon: IdCard, perm: 'employees.view', ready: true },
      { key: 'roles', to: '/roles', icon: KeyRound, perm: 'roles.view', ready: true },
      { key: 'auditLog', to: '/audit-log', icon: ScrollText, perm: 'audit_logs.view', ready: true },
      { key: 'settings', to: '/settings', icon: Settings, perm: 'settings.view', ready: true },
    ],
  },
];

/** Groups filtered to items the user may see and that are implemented. */
export function visibleNav(can: (perm: string) => boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.ready && can(i.perm)) })).filter((g) => g.items.length > 0);
}
