import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChartColumn, ClipboardList, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarList, Columns, monthLabel } from '@/components/charts';
import { Card, CardHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/crm';
import { egp } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Summary {
  open_requests: number; overdue_requests: number; waiting_client: number; completed_month: number; new_customers_month: number;
  open_leads: number; collected_month: number; outstanding: number; documents_to_review: number; expiring_policies: number;
  requests_by_status: { key: string; n: number }[];
  revenue_6m: { month: string; total: number }[];
  requests_6m: { month: string; created: number; completed: number }[];
}

/** Management overview (reports.view): KPIs + 6-month trends, scoped by RLS like every report. */
export function Overview() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary');
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
  const d = q.data;
  if (!d) return null;
  const kpis: { label: string; value: string | number; to: string; tone?: string; show: boolean }[] = [
    { label: t('dashboard.overview.openRequests'), value: d.open_requests, to: '/requests', show: true },
    { label: t('dashboard.overview.overdue'), value: d.overdue_requests, to: '/requests', tone: d.overdue_requests ? 'text-danger' : '', show: true },
    { label: t('dashboard.overview.waitingClient'), value: d.waiting_client, to: '/requests', tone: 'text-[#b57a00]', show: true },
    { label: t('dashboard.overview.completedMonth'), value: d.completed_month, to: '/requests', tone: 'text-success', show: true },
    { label: t('dashboard.overview.collectedMonth'), value: egp(d.collected_month), to: '/payments', tone: 'text-success', show: can('payments', 'view') },
    { label: t('dashboard.overview.outstanding'), value: egp(d.outstanding), to: '/payments', tone: d.outstanding ? 'text-danger' : '', show: can('payments', 'view') },
    { label: t('dashboard.overview.newCustomers'), value: d.new_customers_month, to: '/customers', show: can('customers', 'view') },
    { label: t('dashboard.overview.openLeads'), value: d.open_leads, to: '/leads', show: can('leads', 'view') },
    { label: t('dashboard.overview.toReview'), value: d.documents_to_review, to: '/documents', tone: d.documents_to_review ? 'text-brand' : '', show: can('documents', 'view') },
    { label: t('dashboard.overview.expiringPolicies'), value: d.expiring_policies, to: '/insurance', tone: d.expiring_policies ? 'text-[#b57a00]' : '', show: can('insurance', 'view') },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.filter((k) => k.show).map((k) => (
          <Link key={k.label} to={k.to} className="rounded-[14px] border border-line bg-white p-4 hover:border-brand-200">
            <div className="text-xs text-ink-2">{k.label}</div>
            <div className={cn('ltr mt-1 text-start font-latin text-xl font-bold text-navy', k.tone)}>{k.value}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {can('payments', 'view') && (
          <Card className="lg:col-span-2">
            <CardHeader title={t('dashboard.overview.revenue')} icon={<Wallet className="size-4 text-brand" />}
              actions={can('reports', 'view') && <Link to="/reports" className="text-xs font-semibold text-brand">{t('dashboard.overview.allReports')}</Link>} />
            <Columns items={d.revenue_6m.map((m) => ({ label: monthLabel(m.month, lang), values: [Number(m.total)] }))} format={(n) => egp(n)}
              series={[{ name: t('dashboard.overview.revenue'), color: 'var(--color-brand)' }]} />
          </Card>
        )}
        <Card className={cn(!can('payments', 'view') && 'lg:col-span-2')}>
          <CardHeader title={t('dashboard.overview.byStatus')} icon={<ClipboardList className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} color="bg-sky" items={d.requests_by_status.map((s) => ({ label: t(`requests.statuses.${s.key}`), value: s.n }))} />
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title={t('dashboard.overview.requestsTrend')} icon={<ChartColumn className="size-4 text-brand" />} />
          <Columns items={d.requests_6m.map((m) => ({ label: monthLabel(m.month, lang), values: [m.created, m.completed] }))}
            series={[{ name: t('dashboard.overview.created'), color: 'var(--color-brand)' }, { name: t('dashboard.overview.completed'), color: 'var(--color-success)' }]} />
        </Card>
      </div>
    </div>
  );
}
