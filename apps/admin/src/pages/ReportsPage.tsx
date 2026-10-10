import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlarmClock, Banknote, ChartColumn, ClipboardList, Download, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarList, Columns, Kpi, monthLabel } from '@/components/charts';
import { Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, labelOf, useLang, useLookups } from '@/lib/crm';
import { downloadCsv, egp } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'finance' | 'operations' | 'employees' | 'sales' | 'lines';
const TABS: { key: Tab; icon: typeof Wallet }[] = [
  { key: 'finance', icon: Wallet }, { key: 'operations', icon: ClipboardList }, { key: 'employees', icon: Users },
  { key: 'sales', icon: ChartColumn }, { key: 'lines', icon: ShieldCheck },
];
type Named = { name_ar: string; name_en: string | null };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeOf(preset: string): [string, string] {
  const now = new Date();
  const to = iso(now);
  if (preset === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), to];
  if (preset === 'quarter') return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to];
  if (preset === 'year') return [iso(new Date(now.getFullYear(), 0, 1)), to];
  return [iso(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to];
}

/** Reports (PROJECT_PLAN §18): numbers come from report_* functions, scoped by RLS to what the user may see. */
export function ReportsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('finance');
  const [preset, setPreset] = useState('quarter');
  const [range, setRange] = useState(rangeOf('quarter'));
  const pick = (p: string) => { setPreset(p); if (p !== 'custom') setRange(rangeOf(p)); };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('reports.title')} />
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <Select className="h-10 w-full sm:w-48" value={preset} onChange={(e) => pick(e.target.value)} aria-label={t('reports.period')}>
          {['month', 'quarter', 'year', 'last12', 'custom'].map((p) => <option key={p} value={p}>{t(`reports.presets.${p}`)}</option>)}
        </Select>
        <Input type="date" dir="ltr" className="h-10 w-[calc(50%-6px)] sm:w-44" value={range[0]} onChange={(e) => { setPreset('custom'); setRange([e.target.value, range[1]]); }} aria-label={t('reports.from')} />
        <Input type="date" dir="ltr" className="h-10 w-[calc(50%-6px)] sm:w-44" value={range[1]} onChange={(e) => { setPreset('custom'); setRange([range[0], e.target.value]); }} aria-label={t('reports.to')} />
        <span className="text-xs text-ink-3">{t('reports.scopeNote')}</span>
      </Card>
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            <Icon className="size-4" /> {t(`reports.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'finance' && <Finance from={range[0]} to={range[1]} exportable={can('reports', 'export')} />}
      {tab === 'operations' && <Operations from={range[0]} to={range[1]} exportable={can('reports', 'export')} />}
      {tab === 'employees' && <Employees from={range[0]} to={range[1]} exportable={can('reports', 'export')} />}
      {tab === 'sales' && <Sales from={range[0]} to={range[1]} />}
      {tab === 'lines' && <Lines />}
    </div>
  );
}

function useReport<T>(fn: string, args: Record<string, string> | undefined) {
  return useQuery({
    queryKey: ['reports', fn, args],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(fn as 'report_lines', args as never);
      if (error) throw error;
      return data as unknown as T;
    },
  });
}
const Loading = () => <div className="grid place-items-center py-20"><Spinner /></div>;
const ExportButton = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation();
  return <Button size="sm" onClick={onClick}><Download className="size-4" /> {t('reports.exportCsv')}</Button>;
};

interface FinanceData {
  collected: number; receipts: number; outstanding: number;
  by_method: { key: string; total: number; n: number }[]; by_service: (Named & { total: number; n: number })[];
  by_month: { month: string; total: number }[]; aging: { d0_30: number; d31_60: number; d60_plus: number };
  top_debtors: { customer_id: string; name: string; balance: number; requests: number }[];
}
function Finance({ from, to, exportable }: { from: string; to: string; exportable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useReport<FinanceData>('report_finance', { p_from: from, p_to: to });
  if (!q.data) return <Loading />;
  const d = q.data;
  const nm = (x: Named) => (lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('reports.finance.collected')} value={egp(d.collected)} tone="green" />
        <Kpi label={t('reports.finance.receipts')} value={d.receipts} />
        <Kpi label={t('reports.finance.outstanding')} value={egp(d.outstanding)} tone={d.outstanding ? 'red' : 'navy'} />
        <Kpi label={t('reports.finance.overdue60')} value={egp(d.aging.d60_plus)} tone={d.aging.d60_plus ? 'amber' : 'navy'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('reports.finance.byMonth')} icon={<ChartColumn className="size-4 text-brand" />} />
          {d.by_month.length === 0 ? <EmptyState title={t('reports.noData')} /> : (
            <Columns items={d.by_month.map((m) => ({ label: monthLabel(m.month, lang), values: [Number(m.total)] }))} format={(n) => egp(n)}
              series={[{ name: t('reports.finance.collected'), color: 'var(--color-brand)' }]} />
          )}
        </Card>
        <Card>
          <CardHeader title={t('reports.finance.aging')} icon={<AlarmClock className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} format={(n) => egp(n)} color="bg-danger" items={[
            { label: t('reports.finance.d0_30'), value: Number(d.aging.d0_30) },
            { label: t('reports.finance.d31_60'), value: Number(d.aging.d31_60) },
            { label: t('reports.finance.d60_plus'), value: Number(d.aging.d60_plus) },
          ]} />
        </Card>
        <Card>
          <CardHeader title={t('reports.finance.byService')} icon={<ClipboardList className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} format={(n) => egp(n)} items={d.by_service.map((s) => ({ label: nm(s), value: Number(s.total), sub: `(${s.n})` }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.finance.byMethod')} icon={<Wallet className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} format={(n) => egp(n)} color="bg-sky" items={d.by_method.map((m) => ({ label: t(`payments.methods.${m.key}`), value: Number(m.total), sub: `(${m.n})` }))} />
        </Card>
      </div>
      <Card>
        <CardHeader title={t('reports.finance.topDebtors')} icon={<Users className="size-4 text-brand" />}
          actions={exportable && d.top_debtors.length > 0 && <ExportButton onClick={() => downloadCsv('top-debtors.csv', [t('requests.customer'), t('payments.outstanding'), t('reports.requests')],
            d.top_debtors.map((x) => [x.name, Number(x.balance), x.requests]))} />} />
        {d.top_debtors.length === 0 ? <EmptyState title={t('payments.noDebts')} /> : (
          <ul className="divide-y divide-line">
            {d.top_debtors.map((x) => (
              <li key={x.customer_id}>
                <Link to="/customers/$id" params={{ id: x.customer_id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
                  <span className="flex-1 truncate text-sm font-semibold">{x.name}</span>
                  <span className="text-xs text-ink-3">{t('reports.requestsCount', { count: x.requests })}</span>
                  <span className="ltr font-latin text-sm font-bold text-danger">{egp(x.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface OpsData {
  created: number; completed: number; avg_days: number | null; on_time_pct: number | null; overdue_open: number;
  by_status: { key: string; n: number }[]; by_service: (Named & { n: number; value: number })[];
  overdue_list: { id: string; request_no: string; due_at: string; customer: string; service_ar: string; service_en: string | null; step_ar: string | null; step_en: string | null }[];
  bottlenecks: (Named & { step_key: string; avg_days: number; n: number })[];
}
function Operations({ from, to, exportable }: { from: string; to: string; exportable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useReport<OpsData>('report_operations', { p_from: from, p_to: to });
  if (!q.data) return <Loading />;
  const d = q.data;
  const nm = (ar: string | null, en: string | null) => (lang === 'en' ? en ?? ar : ar) ?? '—';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('reports.ops.created')} value={d.created} tone="brand" />
        <Kpi label={t('reports.ops.completed')} value={d.completed} tone="green" />
        <Kpi label={t('reports.ops.avgDays')} value={d.avg_days ?? '—'} hint={d.on_time_pct != null ? t('reports.ops.onTime', { pct: d.on_time_pct }) : undefined} />
        <Kpi label={t('reports.ops.overdue')} value={d.overdue_open} tone={d.overdue_open ? 'red' : 'navy'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('reports.ops.byService')} icon={<ClipboardList className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} items={d.by_service.map((s) => ({ label: nm(s.name_ar, s.name_en), value: s.n }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.ops.byStatus')} icon={<ChartColumn className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} color="bg-sky" items={d.by_status.map((s) => ({ label: t(`requests.statuses.${s.key}`), value: s.n }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.ops.bottlenecks')} icon={<AlarmClock className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} color="bg-[#e8a317]" format={(n) => t('reports.daysShort', { count: n })}
            items={d.bottlenecks.map((b) => ({ label: nm(b.name_ar, b.name_en), value: Number(b.avg_days), sub: `(${b.n})` }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.ops.overdueList')} icon={<AlarmClock className="size-4 text-danger" />}
            actions={exportable && d.overdue_list.length > 0 && <ExportButton onClick={() => downloadCsv('overdue.csv', [t('payments.request'), t('requests.customer'), t('reports.service'), t('reports.step'), t('reports.dueAt')],
              d.overdue_list.map((r) => [r.request_no, r.customer, nm(r.service_ar, r.service_en), nm(r.step_ar, r.step_en), r.due_at?.slice(0, 10)]))} />} />
          {d.overdue_list.length === 0 ? <EmptyState title={t('reports.ops.noOverdue')} /> : (
            <ul className="divide-y divide-line">
              {d.overdue_list.map((r) => (
                <li key={r.id}>
                  <Link to="/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.customer} · {nm(r.service_ar, r.service_en)}</div>
                      <div className="text-xs text-ink-3"><span className="ltr font-latin">{r.request_no}</span> · {nm(r.step_ar, r.step_en)}</div>
                    </div>
                    <span className="text-xs font-semibold text-danger">{fmtDate(r.due_at, lang, false)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

interface EmpRow {
  id: string; name: string; department_ar: string | null; department_en: string | null; tasks_done: number; tasks_overdue: number;
  steps_done: number; avg_step_days: number | null; documents_reviewed: number; leads_won: number;
}
function Employees({ from, to, exportable }: { from: string; to: string; exportable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useReport<EmpRow[]>('report_employees', { p_from: from, p_to: to });
  if (!q.data) return <Loading />;
  if (q.data.length === 0) return <Card><EmptyState icon={<Users className="size-8" />} title={t('reports.noData')} /></Card>;
  const cols = ['steps_done', 'avg_step_days', 'tasks_done', 'tasks_overdue', 'documents_reviewed', 'leads_won'] as const;
  return (
    <Card className="overflow-x-auto">
      <CardHeader title={t('reports.tabs.employees')} icon={<Users className="size-4 text-brand" />}
        actions={exportable && <ExportButton onClick={() => downloadCsv('employees.csv', [t('reports.emp.name'), ...cols.map((c) => t(`reports.emp.${c}`))],
          q.data!.map((e) => [e.name, ...cols.map((c) => e[c])]))} />} />
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-xs text-ink-2">
            <th className="px-4 py-3 text-start font-semibold">{t('reports.emp.name')}</th>
            {cols.map((c) => <th key={c} className="px-3 py-3 text-center font-semibold">{t(`reports.emp.${c}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {q.data.map((e) => (
            <tr key={e.id} className="border-t border-line">
              <td className="px-4 py-3"><div className="font-semibold">{e.name}</div><div className="text-xs text-ink-3">{(lang === 'en' ? e.department_en : e.department_ar) ?? '—'}</div></td>
              {cols.map((c) => (
                <td key={c} className={cn('px-3 py-3 text-center font-latin', c === 'tasks_overdue' && e[c] ? 'font-bold text-danger' : '')}>{e[c] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

interface SalesData {
  customers_total: number; customers_new: number; leads: number; won: number; lost: number; conversion_pct: number | null;
  customers_by_source: { key: string; n: number }[]; by_stage: (Named & { key: string; n: number })[];
  by_source: { key: string; n: number; won: number }[]; lost_reasons: { key: string; n: number }[];
}
function Sales({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const sources = useLookups('lead_source');
  const reasons = useLookups('lost_reason');
  const q = useReport<SalesData>('report_sales', { p_from: from, p_to: to });
  if (!q.data) return <Loading />;
  const d = q.data;
  const src = (k: string) => (k === 'other' ? t('reports.other') : labelOf(sources.data, k, lang));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('reports.sales.customersNew')} value={d.customers_new} tone="brand" hint={t('reports.sales.ofTotal', { count: d.customers_total })} />
        <Kpi label={t('reports.sales.leads')} value={d.leads} />
        <Kpi label={t('reports.sales.won')} value={d.won} tone="green" hint={t('reports.sales.lost', { count: d.lost })} />
        <Kpi label={t('reports.sales.conversion')} value={d.conversion_pct != null ? `${d.conversion_pct}%` : '—'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('reports.sales.funnel')} icon={<ChartColumn className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} items={d.by_stage.map((s) => ({ label: lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar, value: s.n }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.sales.bySource')} icon={<Users className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} color="bg-sky" items={d.by_source.map((s) => ({ label: src(s.key), value: s.n, sub: t('reports.sales.wonCount', { count: s.won }) }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.sales.lostReasons')} icon={<AlarmClock className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} color="bg-danger" items={d.lost_reasons.map((s) => ({ label: s.key === 'other' ? t('reports.other') : labelOf(reasons.data, s.key, lang), value: s.n }))} />
        </Card>
        <Card>
          <CardHeader title={t('reports.sales.customersBySource')} icon={<Users className="size-4 text-brand" />} />
          <BarList empty={t('reports.noData')} items={d.customers_by_source.map((s) => ({ label: src(s.key), value: s.n }))} />
        </Card>
      </div>
    </div>
  );
}

interface LinesData {
  policies_active: number; expiring_30: number; expiring_60: number; expiring_90: number; expired: number; renewal_pct: number | null;
  policies_by_company: (Named & { n: number })[]; loans: number; loans_requested: number; loans_approved: number; loan_approval_pct: number | null;
  lenders: (Named & { submitted: number; approved: number; rejected: number; offered: number })[];
}
function Lines() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useReport<LinesData>('report_lines', undefined);
  if (!q.data) return <Loading />;
  const d = q.data;
  const nm = (x: Named) => (lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar);
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><ShieldCheck className="size-4 text-brand" /> {t('insurance.title')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('reports.lines.active')} value={d.policies_active} tone="green" />
        <Kpi label={t('reports.lines.expiring')} value={`${d.expiring_30} / ${d.expiring_60} / ${d.expiring_90}`} tone="amber" hint={t('reports.lines.expiringHint')} />
        <Kpi label={t('reports.lines.expired')} value={d.expired} tone={d.expired ? 'red' : 'navy'} />
        <Kpi label={t('reports.lines.renewalRate')} value={d.renewal_pct != null ? `${d.renewal_pct}%` : '—'} />
      </div>
      <Card>
        <CardHeader title={t('reports.lines.byInsurer')} icon={<ShieldCheck className="size-4 text-brand" />} />
        <BarList empty={t('reports.noData')} items={d.policies_by_company.map((c) => ({ label: nm(c), value: c.n }))} />
      </Card>
      <h2 className="flex items-center gap-2 pt-2 text-sm font-bold text-navy"><Banknote className="size-4 text-brand" /> {t('loans.title')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('reports.lines.loans')} value={d.loans} />
        <Kpi label={t('reports.lines.requested')} value={egp(d.loans_requested)} />
        <Kpi label={t('reports.lines.approved')} value={egp(d.loans_approved)} tone="green" />
        <Kpi label={t('reports.lines.approvalRate')} value={d.loan_approval_pct != null ? `${d.loan_approval_pct}%` : '—'} />
      </div>
      <Card className="overflow-x-auto">
        <CardHeader title={t('reports.lines.lenders')} icon={<Banknote className="size-4 text-brand" />} />
        {d.lenders.length === 0 ? <EmptyState title={t('reports.noData')} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-xs text-ink-2">
                <th className="px-4 py-3 text-start font-semibold">{t('loans.lender')}</th>
                <th className="px-3 py-3 text-center font-semibold">{t('reports.lines.submitted')}</th>
                <th className="px-3 py-3 text-center font-semibold">{t('loans.submissionStatuses.approved')}</th>
                <th className="px-3 py-3 text-center font-semibold">{t('loans.submissionStatuses.rejected')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('reports.lines.offered')}</th>
              </tr>
            </thead>
            <tbody>
              {d.lenders.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">{nm(l)}</td>
                  <td className="px-3 py-3 text-center font-latin">{l.submitted}</td>
                  <td className="px-3 py-3 text-center font-latin text-success">{l.approved}</td>
                  <td className="px-3 py-3 text-center font-latin text-danger">{l.rejected}</td>
                  <td className="px-3 py-3"><span className="ltr font-latin">{egp(l.offered)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
