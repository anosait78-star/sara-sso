import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Banknote, ChevronLeft, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { labelOf, useLang, useLookups } from '@/lib/crm';
import { money } from '@/lib/insurance';
import { LOAN_SELECT, LOAN_STATUS_TONE, LOAN_STATUSES, type Loan, type LoanStatus } from '@/lib/loans';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { CustomerPicker, type CustomerPick } from './RequestsPage';

/** Financing files the office prepares and submits to lenders (the lender owns the loan and its decision). */
export function LoansPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const types = useLookups('financing_type');
  const [tab, setTab] = useState<LoanStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['loan_applications', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_applications').select(LOAN_SELECT).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as Loan[];
    },
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.data?.length ?? 0 };
    for (const l of list.data ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [list.data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((l) => (tab === 'all' || l.status === tab) && (!term || [
      l.file_no, l.purpose, l.sector, l.customer?.full_name, l.customer?.company_name,
    ].some((v) => v?.toLowerCase().includes(term))));
  }, [list.data, tab, q]);
  const who = (l: Loan) => l.customer?.company_name || l.customer?.full_name;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('loans.title')} actions={can('loans', 'create') && (
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('loans.new')}</Button>
      )} />
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['all', ...LOAN_STATUSES] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {k === 'all' ? t('common.all') : t(`loans.statuses.${k}`)}
            <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
        <Input className="h-10 ps-9" placeholder={t('loans.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
        <Card><EmptyState icon={<Banknote className="size-8" />} title={t('loans.empty')} /></Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('loans.type')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('loans.requested')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('loans.lenders')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.status')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('crm.owner')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/loans/$id', params: { id: l.id } })}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{who(l)}</div>
                      <div className="ltr text-start font-latin text-xs text-ink-3">{l.file_no}</div>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{labelOf(types.data, l.financing_type, lang)}</td>
                    <td className="px-4 py-3"><span className="ltr font-latin">{money(l.requested_amount)}</span></td>
                    <td className="hidden px-4 py-3 xl:table-cell">{l.submissions?.[0]?.count ?? 0}</td>
                    <td className="px-4 py-3"><Badge tone={LOAN_STATUS_TONE[l.status]}>{t(`loans.statuses.${l.status}`)}</Badge></td>
                    <td className="hidden px-4 py-3 lg:table-cell">{l.owner?.profile?.full_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((l) => (
              <Link key={l.id} to="/loans/$id" params={{ id: l.id }} className="block">
                <Card className="flex items-center gap-3 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Banknote className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{who(l)}</div>
                    <div className="truncate text-xs text-ink-2"><span className="ltr font-latin">{money(l.requested_amount)}</span> · <span className="ltr font-latin">{l.file_no}</span></div>
                    <div className="mt-1"><Badge tone={LOAN_STATUS_TONE[l.status]}>{t(`loans.statuses.${l.status}`)}</Badge></div>
                  </div>
                  <ChevronLeft className="size-5 text-ink-3 ltr:rotate-180" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      <NewLoanDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

export function NewLoanDrawer({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer?: CustomerPick }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const types = useLookups('financing_type');
  const empty = { type: 'working_capital', amount: '', tenor: '', purpose: '' };
  const [pick, setPick] = useState<CustomerPick | null>(customer ?? null);
  const [f, setF] = useState(empty);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('loan_applications').insert({
        customer_id: pick!.id, financing_type: f.type || null, requested_amount: f.amount ? Number(f.amount) : null,
        tenor_months: f.tenor ? Number(f.tenor) : null, purpose: f.purpose.trim() || null, status: 'preparing',
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['loan_applications'] });
      onOpenChange(false);
      void navigate({ to: '/loans/$id', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Drawer open={open} onOpenChange={(v) => { if (v) { setPick(customer ?? null); setF(empty); } onOpenChange(v); }}
      title={t('loans.new')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={!pick} onClick={() => save.mutate()}>{t('common.create')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('requests.customer')} *`}><CustomerPicker value={pick} onChange={setPick} /></Field>
        <Field label={t('loans.type')}>
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="">{t('workflow.pick')}</option>
            {(types.data ?? []).map((x) => <option key={x.key} value={x.key}>{lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('loans.requested')}><Input type="number" min={0} dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label={t('loans.tenor')}><Input type="number" min={1} max={360} dir="ltr" value={f.tenor} onChange={(e) => setF({ ...f, tenor: e.target.value })} /></Field>
        </div>
        <Field label={t('loans.purpose')}><Textarea value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}
