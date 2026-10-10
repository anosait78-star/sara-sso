import { ACTION_LABELS, MODULE_LABELS, PERMISSION_MODULES, SCOPE_LABELS, type PermissionAction, type PermissionModule } from '@sso/shared';
import { Link } from '@tanstack/react-router';
import { Layers } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MyWork } from '@/components/dashboard/MyWork';
import { Overview } from '@/components/dashboard/Overview';
import { Badge, Card, CardHeader } from '@/components/ui';
import { NAV } from '@/layout/nav';
import { useAuth } from '@/lib/auth';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const { staff, permissions, can } = useAuth();

  const byModule = useMemo(() => {
    const map = new Map<string, { action: string; scope: string }[]>();
    for (const [key, scope] of permissions) {
      const [module, action] = key.split('.') as [string, string];
      if (!map.has(module)) map.set(module, []);
      map.get(module)!.push({ action, scope });
    }
    // same order as the navigation / permission catalog
    return new Map([...map].sort(([a], [b]) => PERMISSION_MODULES.indexOf(a as PermissionModule) - PERMISSION_MODULES.indexOf(b as PermissionModule)));
  }, [permissions]);

  const quick = NAV.flatMap((g) => g.items).filter((i) => i.ready && i.to !== '/' && can(...(i.perm.split('.') as [string, string])));
  const roleName = lang === 'en' ? staff?.role_name_en ?? staff?.role_name_ar : staff?.role_name_ar;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-navy md:text-2xl">{t('dashboard.greeting', { name: staff?.full_name.split(' ')[0] ?? '' })}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {t('dashboard.role', { role: roleName })}
          {staff?.department_name_ar ? ` · ${staff.department_name_ar}` : ''}
        </p>
      </div>

      {can('reports', 'view') && <Overview />}

      <MyWork />

      {quick.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((item) => (
            <Link key={item.key} to={item.to} className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 hover:border-brand-200">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                <item.icon className="size-5" />
              </span>
              <span className="text-sm font-semibold text-ink">{t(`nav.${item.key}`)}</span>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader icon={<Layers className="size-4" />} title={t('dashboard.myPermissions')} actions={<span className="text-xs font-medium text-ink-2">{t('dashboard.modulesCount', { count: byModule.size })}</span>} />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {[...byModule.entries()].map(([module, grants]) => (
            <div key={module} className="bg-white p-4">
              <div className="text-sm font-bold text-navy">{MODULE_LABELS[module as PermissionModule]?.[lang] ?? module}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {grants.map((g) => (
                  <Badge key={g.action} tone={g.scope === 'all' ? 'blue' : g.scope === 'department' ? 'sky' : 'gray'} dot={false}>
                    {ACTION_LABELS[g.action as PermissionAction]?.[lang] ?? g.action}
                    {g.scope !== 'all' && <span className="opacity-70">· {SCOPE_LABELS[g.scope as 'own' | 'department'][lang]}</span>}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
