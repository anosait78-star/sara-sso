import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { AppShell, Guard } from './layout/AppShell';
import { AccountPage, NotFoundPage } from './pages/AccountPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { CompanyFilePage } from './pages/CompanyFilePage';
import { InsurancePage } from './pages/InsurancePage';
import { LoanPage } from './pages/LoanPage';
import { LoansPage } from './pages/LoansPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PolicyPage } from './pages/PolicyPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { ReportsPage } from './pages/ReportsPage';
import { CompanyFilesPage } from './pages/CompanyFilesPage';
import { CustomerPage } from './pages/CustomerPage';
import { CustomersPage } from './pages/CustomersPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { LeadPage } from './pages/LeadPage';
import { LeadsPage } from './pages/LeadsPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { LoginPage } from './pages/LoginPage';
import { RequestPage } from './pages/RequestPage';
import { RequestsPage } from './pages/RequestsPage';
import { RolesPage } from './pages/RolesPage';
import { ServicePage } from './pages/ServicePage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { WorkflowIndexPage } from './pages/WorkflowIndexPage';

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const changePasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/change-password', component: ChangePasswordPage });
// printable receipt: own tab, no app shell (RLS decides what can be read)
const receiptRoute = createRoute({ getParentRoute: () => rootRoute, path: '/receipt/$id', component: ReceiptPage });

// Everything below requires an active staff session (checked in AppShell).
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell });

const page = (path: string, perm: string, Component: () => React.JSX.Element) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => (
      <Guard perm={perm}>
        <Component />
      </Guard>
    ),
  });

const routeTree = rootRoute.addChildren([
  loginRoute,
  changePasswordRoute,
  receiptRoute,
  appRoute.addChildren([
    page('/', 'dashboard.view', DashboardPage),
    page('/customers', 'customers.view', CustomersPage),
    page('/customers/$id', 'customers.view', CustomerPage),
    page('/leads', 'leads.view', LeadsPage),
    page('/leads/$id', 'leads.view', LeadPage),
    page('/follow-ups', 'tasks.view', FollowUpsPage),
    page('/appointments', 'appointments.view', AppointmentsPage),
    page('/requests', 'service_requests.view', RequestsPage),
    page('/requests/$id', 'service_requests.view', RequestPage),
    page('/tasks', 'tasks.view', TasksPage),
    page('/documents', 'documents.view', DocumentsPage),
    page('/company-formation', 'company_formation.view', CompanyFilesPage),
    page('/company-formation/$id', 'company_formation.view', CompanyFilePage),
    page('/insurance', 'insurance.view', InsurancePage),
    page('/insurance/$id', 'insurance.view', PolicyPage),
    page('/loans', 'loans.view', LoansPage),
    page('/loans/$id', 'loans.view', LoanPage),
    page('/payments', 'payments.view', PaymentsPage),
    page('/reports', 'reports.view', ReportsPage),
    page('/services', 'services_config.view', ServicesPage),
    page('/services/$id', 'services_config.view', ServicePage),
    page('/services/$id/workflow', 'services_config.view', WorkflowBuilderPage),
    page('/services/$id/workflow/$workflowId', 'services_config.view', WorkflowBuilderPage),
    page('/workflow', 'services_config.view', WorkflowIndexPage),
    page('/employees', 'employees.view', EmployeesPage),
    page('/roles', 'roles.view', RolesPage),
    page('/settings', 'settings.view', SettingsPage),
    page('/audit-log', 'audit_logs.view', AuditLogPage),
    createRoute({ getParentRoute: () => appRoute, path: '/account', component: AccountPage }),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
