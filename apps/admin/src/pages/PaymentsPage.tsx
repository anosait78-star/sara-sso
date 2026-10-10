import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Ban, Download, Plus, Printer, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RecordPaymentDialog, VoidPaymentDialog, type PayTarget } from '@/components/payments/Payments';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import { downloadCsv, egp, PAYMENT_METHODS, PAYMENT_SELECT, PAYMENT_STATUS_TONE, type Payment } from '@/lib/payments';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'receipts' | 'outstanding';
interface Debt extends PayTarget {
  status: string; created_at: string; submitted_at: string | null;
  customer: { id: string; full_name: string; company_name: string | null } | null; service: { name_ar: string; name_en: string | null } | null;
}

/** Payments: receipts recorded by staff (manual — D9) and what customers still owe per request. */
export function PaymentsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('receipts');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [recording, setRecording] = useState<PayTarget | 'new' | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  const receipts = useQuery({
    queryKey: ['payments', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select(PAYMENT_SELECT).order('paid_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as Payment[];
    },
  });
  const debts = useQuery({
    queryKey: ['requests', 'outstanding'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests')
        .select('id, request_no, customer_id, total_amount, paid_amount, status, created_at, submitted_at, customer:customers(id, full_name, company_name), service:services(name_ar, name_en)')
        .is('deleted_at', null).neq('status', 'cancelled').not('total_amount', 'is', null).order('created_at').limit(1000);
      if (error) throw error;
      return (data as unknown as Debt[]).filter((r) => Number(r.total_amount) > Number(r.paid_amount));
    },
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const kpis = useMemo(() => {
    const paid = (receipts.data ?? []).filter((p) => p.status === 'paid');
    return {
      month: paid.filter((p) => new Date(p.paid_at) >= monthStart).reduce((s, p) => s + Number(p.amount), 0),
      count: paid.filter((p) => new Date(p.paid_at) >= monthStart).length,
      outstanding: (debts.data ?? []).reduce((s, r) => s + Number(r.total_amount) - Number(r.paid_amount), 0),
      debtors: new Set((debts.data ?? []).map((r) => r.customer_id)).size,
    };
  }, [receipts.data, debts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = q.trim().toLowerCase();
  const rows = (receipts.data ?? []).filter((p) => (!method || p.method === method) && (!term || [
    p.payment_no, p.reference_no, p.customer?.full_name, p.customer?.company_name, p.request?.request_no,
  ].some((v) => v?.toLowerCase().includes(term))));
  const debtRows = (debts.data ?? []).filter((r) => !term || [r.request_no, r.customer?.full_name, r.customer?.company_name].some((v) => v?.toLowerCase().includes(term)));
  const ageDays = (r: Debt) => Math.floor((Date.now() - new Date(r.submitted_at ?? r.created_at).getTime()) / 86_400_000);

  const exportCsv = () => {
    if (tab === 'receipts') {
      downloadCsv('receipts.csv', [t('payments.receiptNo'), t('payments.date'), t('requests.customer'), t('payments.request'), t('payments.amount'), t('payments.method'), t('requests.status'), t('payments.reference')],
        rows.map((p) => [p.payment_no, p.paid_at.slice(0, 10), p.customer?.full_name, p.request?.request_no, Number(p.amount), t(`payments.methods.${p.method}`), t(`payments.statuses.${p.status}`), p.reference_no]));
    } else {
      downloadCsv('outstanding.csv', [t('payments.request'), t('requests.customer'), t('payments.fee'), t('payments.paid'), t('payments.outstanding'), t('payments.age')],
        debtRows.map((r) => [r.request_no, r.customer?.full_name, Number(r.total_amount), Number(r.paid_amount), Number(r.total_amount) - Number(r.paid_amount), ageDays(r)]));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('payments.title')} actions={<>
        {can('payments', 'export') && <Button onClick={exportCsv}><Download className="size-4" /> {t('reports.exportCsv')}</Button>}
        {can('payments', 'create') && <Button variant="primary" onClick={() => setRecording('new')}><Plus className="size-4" /> {t('payments.record')}</Button>}
      </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t('payments.kpi.month'), egp(kpis.month), 'text-success'],
          [t('payments.kpi.receipts'), String(kpis.count), 'text-navy'],
          [t('payments.kpi.outstanding'), egp(kpis.outstanding), kpis.outstanding ? 'text-danger' : 'text-navy'],
          [t('payments.kpi.debtors'), String(kpis.debtors), 'text-navy'],
        ].map(([k, v, c]) => (
          <Card key={k} className="p-4">
            <div className="text-xs text-ink-2">{k}</div>
            <div className={cn('ltr mt-1 text-start font-latin text-xl font-bold', c)}>{v}</div>
          </Card>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['receipts', 'outstanding'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`payments.tabs.${k}`)}
            <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{k === 'receipts' ? receipts.data?.length ?? 0 : debts.data?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
          <Input className="h-10 ps-9" placeholder={t('payments.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tab === 'receipts' && (
          <Select className="h-10 w-full sm:w-48" value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t('payments.method')}>
            <option value="">{t('payments.allMethods')}</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`payments.methods.${m}`)}</option>)}
          </Select>
        )}
      </div>

      {(tab === 'receipts' ? receipts.isLoading : debts.isLoading) ? <div className="grid place-items-center py-20"><Spinner /></div>
        : tab === 'receipts' ? (rows.length === 0 ? <Card><EmptyState icon={<Wallet className="size-8" />} title={t('payments.none')} /></Card> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('payments.receiptNo')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('payments.request')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('payments.amount')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('payments.method')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('payments.date')}</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-3"><span className="ltr font-latin font-semibold">{p.payment_no}</span>
                      {p.status !== 'paid' && <div><Badge tone={PAYMENT_STATUS_TONE[p.status]}>{t(`payments.statuses.${p.status}`)}</Badge></div>}</td>
                    <td className="px-4 py-3">{p.customer?.company_name || p.customer?.full_name}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{p.request ? <Link to="/requests/$id" params={{ id: p.request.id }} className="ltr font-latin text-brand">{p.request.request_no}</Link> : '—'}</td>
                    <td className="px-4 py-3"><span className={cn('ltr font-latin font-bold', p.status !== 'paid' && 'text-ink-3 line-through')}>{egp(p.amount)}</span></td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{t(`payments.methods.${p.method}`)}</td>
                    <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{fmtDate(p.paid_at, lang, false)}</td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-1">
                        <Link to="/receipt/$id" params={{ id: p.id }} target="_blank" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label={t('payments.receipt')}><Printer className="size-4" /></Link>
                        {can('payments', 'approve') && p.status === 'paid' && (
                          <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => setVoiding(p)} aria-label={t('payments.void')}><Ban className="size-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )) : (debtRows.length === 0 ? <Card><EmptyState icon={<Wallet className="size-8" />} title={t('payments.noDebts')} /></Card> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('payments.request')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('payments.fee')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('payments.paid')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('payments.outstanding')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('payments.age')}</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {debtRows.map((r) => {
                  const age = ageDays(r);
                  return (
                    <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/requests/$id', params: { id: r.id } })}>
                      <td className="px-4 py-3"><div className="ltr text-start font-latin font-semibold">{r.request_no}</div><div className="text-xs text-ink-3">{nameOf(r.service, lang)}</div></td>
                      <td className="px-4 py-3">{r.customer?.company_name || r.customer?.full_name}</td>
                      <td className="hidden px-4 py-3 lg:table-cell"><span className="ltr font-latin">{egp(r.total_amount)}</span></td>
                      <td className="hidden px-4 py-3 lg:table-cell"><span className="ltr font-latin text-success">{egp(r.paid_amount)}</span></td>
                      <td className="px-4 py-3"><span className="ltr font-latin font-bold text-danger">{egp(Number(r.total_amount) - Number(r.paid_amount))}</span></td>
                      <td className="hidden px-4 py-3 md:table-cell"><Badge tone={age > 60 ? 'red' : age > 30 ? 'amber' : 'gray'}>{t('payments.days', { count: age })}</Badge></td>
                      <td className="px-2 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                        {can('payments', 'create') && <Button size="sm" onClick={() => setRecording(r)}><Plus className="size-4" /> {t('payments.collect')}</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))}
      <RecordPaymentDialog open={!!recording} onOpenChange={(v) => !v && setRecording(null)} target={recording && recording !== 'new' ? recording : undefined} />
      <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)} />
    </div>
  );
}
