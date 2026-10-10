import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BellRing, ChevronLeft, Plus, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import {
  daysLeft, POLICY_SELECT, POLICY_STATUS_TONE, POLICY_STATUSES, policyTitle, refName, useInsuranceCompanies, useInsuranceTypes,
  type Policy, type PolicyStatus,
} from '@/lib/insurance';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { CustomerPicker, type CustomerPick } from './RequestsPage';

/** Insurance policies the office prepared and follows up (the insurer issues them), with expiry and renewal at a glance. */
export function InsurancePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PolicyStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['insurance_policies', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_policies').select(POLICY_SELECT).is('deleted_at', null)
        .order('end_date', { ascending: true, nullsFirst: false }).limit(1000);
      if (error) throw error;
      return data as unknown as Policy[];
    },
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.data?.length ?? 0 };
    for (const p of list.data ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [list.data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((p) => (tab === 'all' || p.status === tab) && (!term || [
      p.file_no, p.policy_no, p.subject, p.customer?.full_name, p.customer?.company_name, p.company?.name_ar, p.type?.name_ar,
    ].some((v) => v?.toLowerCase().includes(term))));
  }, [list.data, tab, q]);

  const due = (p: Policy) => {
    const d = daysLeft(p.end_date);
    if (d == null || !['active', 'expiring', 'expired'].includes(p.status)) return null;
    return <span className={cn('text-xs font-semibold', d < 0 ? 'text-danger' : p.status === 'expiring' ? 'text-[#b57a00]' : 'text-ink-3')}>
      {d < 0 ? t('insurance.expiredAgo', { count: -d }) : t('insurance.daysLeft', { count: d })}
    </span>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('insurance.title')} actions={can('insurance', 'create') && (
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('insurance.new')}</Button>
      )} />
      {(counts.expiring ?? 0) > 0 && (
        <button type="button" onClick={() => setTab('expiring')}
          className="flex w-full items-center gap-3 rounded-xl border border-[#f5d58a] bg-[#fdf3dc] px-4 py-3 text-start text-sm font-semibold text-[#8a5c00]">
          <BellRing className="size-5 shrink-0" /> {t('insurance.expiringBanner', { count: counts.expiring })}
        </button>
      )}
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['all', ...POLICY_STATUSES] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {k === 'all' ? t('common.all') : t(`insurance.statuses.${k}`)}
            <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
        <Input className="h-10 ps-9" placeholder={t('insurance.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
        <Card><EmptyState icon={<ShieldCheck className="size-8" />} title={t('insurance.empty')} /></Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('insurance.policy')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('insurance.company')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('insurance.policyNo')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('insurance.endDate')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/insurance/$id', params: { id: p.id } })}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{policyTitle(p, lang)}</div>
                      <div className="ltr text-start font-latin text-xs text-ink-3">{p.file_no}</div>
                    </td>
                    <td className="px-4 py-3">{p.customer?.full_name}</td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{refName(p.company, lang) ?? '—'}</td>
                    <td className="hidden px-4 py-3 xl:table-cell"><span className="ltr">{p.policy_no ?? '—'}</span></td>
                    <td className="px-4 py-3">
                      <div>{fmtDate(p.end_date, lang, false)}</div>
                      {due(p)}
                    </td>
                    <td className="px-4 py-3"><Badge tone={POLICY_STATUS_TONE[p.status]}>{t(`insurance.statuses.${p.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((p) => (
              <Link key={p.id} to="/insurance/$id" params={{ id: p.id }} className="block">
                <Card className="flex items-center gap-3 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><ShieldCheck className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{policyTitle(p, lang)}</div>
                    <div className="truncate text-xs text-ink-2">{p.customer?.full_name} · <span className="ltr font-latin">{p.file_no}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-2"><Badge tone={POLICY_STATUS_TONE[p.status]}>{t(`insurance.statuses.${p.status}`)}</Badge>{due(p)}</div>
                  </div>
                  <ChevronLeft className="size-5 text-ink-3 ltr:rotate-180" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      <NewPolicyDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

export function NewPolicyDrawer({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer?: CustomerPick }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const types = useInsuranceTypes();
  const companies = useInsuranceCompanies();
  const empty = { type: '', company: '', subject: '', policy_no: '', start: '', end: '', premium: '' };
  const [pick, setPick] = useState<CustomerPick | null>(customer ?? null);
  const [f, setF] = useState(empty);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('insurance_policies').insert({
        customer_id: pick!.id, insurance_type_id: f.type || null, insurance_company_id: f.company || null, subject: f.subject.trim() || null,
        policy_no: f.policy_no.trim() || null, start_date: f.start || null, end_date: f.end || null, premium: f.premium ? Number(f.premium) : null,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['insurance_policies'] });
      onOpenChange(false);
      void navigate({ to: '/insurance/$id', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const datesOk = !f.start || !f.end || f.end >= f.start;
  return (
    <Drawer open={open} onOpenChange={(v) => { if (v) { setPick(customer ?? null); setF(empty); } onOpenChange(v); }}
      title={t('insurance.new')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={!pick || !datesOk} onClick={() => save.mutate()}>{t('common.create')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('requests.customer')} *`}><CustomerPicker value={pick} onChange={setPick} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('insurance.type')}>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">{t('workflow.pick')}</option>
              {(types.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{refName(x, lang)}</option>)}
            </Select>
          </Field>
          <Field label={t('insurance.company')}>
            <Select value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })}>
              <option value="">{t('workflow.pick')}</option>
              {(companies.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{refName(x, lang)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('insurance.subject')} hint={t('insurance.subjectHint')}><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label={t('insurance.policyNo')} hint={t('insurance.policyNoHint')}><Input dir="ltr" value={f.policy_no} onChange={(e) => setF({ ...f, policy_no: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('insurance.startDate')}><Input type="date" dir="ltr" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label={t('insurance.endDate')} error={!datesOk ? t('insurance.datesInvalid') : undefined}>
            <Input type="date" dir="ltr" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </Field>
        </div>
        <Field label={t('insurance.premium')}><Input type="number" min={0} dir="ltr" value={f.premium} onChange={(e) => setF({ ...f, premium: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}
