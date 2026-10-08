import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { AppShell, Guard } from './layout/AppShell';
import { AccountPage, NotFoundPage } from './pages/AccountPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { CustomerPage } from './pages/CustomerPage';
import { CustomersPage } from './pages/CustomersPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { LeadPage } from './pages/LeadPage';
import { LeadsPage } from './pages/LeadsPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { LoginPage } from './pages/LoginPage';
import { RolesPage } from './pages/RolesPage';
import { SettingsPage } from './pages/SettingsPage';

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const changePasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/change-password', component: ChangePasswordPage });

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
  appRoute.addChildren([
    page('/', 'dashboard.view', DashboardPage),
    page('/customers', 'customers.view', CustomersPage),
    page('/customers/$id', 'customers.view', CustomerPage),
    page('/leads', 'leads.view', LeadsPage),
    page('/leads/$id', 'leads.view', LeadPage),
    page('/follow-ups', 'tasks.view', FollowUpsPage),
    page('/appointments', 'appointments.view', AppointmentsPage),
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
