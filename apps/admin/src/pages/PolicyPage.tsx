import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeftRight, BellRing, ChevronRight, Pencil, PhoneCall, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LinkedRequestsCard } from '@/components/requests/LinkedRequests';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang, useLookups } from '@/lib/crm';
import {
  daysLeft, POLICY_MANUAL_STATUSES, POLICY_STATUS_TONE, policyTitle, refName, useInsuranceCompanies, useInsuranceTypes, usePolicy,
  type Policy, type PolicyStatus, type Renewal,
} from '@/lib/insurance';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Form = Record<'type' | 'company' | 'subject' | 'policy_no' | 'start_date' | 'end_date' | 'premium' | 'coverage_amount' | 'payment_frequency' | 'notes', string> & { status: PolicyStatus };
const toForm = (p: Policy): Form => ({
  type: p.insurance_type_id ?? '', company: p.insurance_company_id ?? '', subject: p.subject ?? '', policy_no: p.policy_no ?? '',
  start_date: p.start_date ?? '', end_date: p.end_date ?? '', premium: p.premium != null ? String(p.premium) : '',
  coverage_amount: p.coverage_amount != null ? String(p.coverage_amount) : '', payment_frequency: p.payment_frequency ?? '', notes: p.notes ?? '', status: p.status,
});
const RENEWAL_TONE = { pending: 'amber', contacted: 'sky', renewed: 'green', lost: 'red' } as const;

/** Policy file: insurer data, dates, premium, renewal reminders/outcomes and the linked requests. */
export function PolicyPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const types = useInsuranceTypes();
  const companies = useInsuranceCompanies();
  const freqs = useLookups('payment_frequency');
  const q = usePolicy(id);
  const [f, setF] = useState<Form | null>(null);
  const p = q.data;
  useEffect(() => { if (p) setF(toForm(p)); }, [p]);

  const canEdit = can('insurance', 'edit');
  const dirty = !!p && !!f && JSON.stringify(f) !== JSON.stringify(toForm(p));
  const datesOk = !f?.start_date || !f?.end_date || f.end_date >= f.start_date;
  const save = useMutation({
    mutationFn: async () => {
      const x = f!;
      const { error } = await supabase.from('insurance_policies').update({
        insurance_type_id: x.type || null, insurance_company_id: x.company || null, subject: x.subject.trim() || null, policy_no: x.policy_no.trim() || null,
        start_date: x.start_date || null, end_date: x.end_date || null, premium: x.premium === '' ? null : Number(x.premium),
        coverage_amount: x.coverage_amount === '' ? null : Number(x.coverage_amount), payment_frequency: x.payment_frequency || null,
        notes: x.notes.trim() || null, status: x.status,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['insurance_policies'] }); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading || (p && !f)) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!p || !f) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;
  const set = (x: Partial<Form>) => setF((o) => ({ ...o!, ...x }));
  const input = (k: keyof Form, label: string, ltr?: boolean, type = 'text', hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type={type} dir={ltr ? 'ltr' : undefined} value={f[k]} disabled={!canEdit} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
    </Field>
  );
  const left = daysLeft(p.end_date);
  const statusOptions = POLICY_MANUAL_STATUSES.includes(p.status) ? POLICY_MANUAL_STATUSES : [p.status, ...POLICY_MANUAL_STATUSES];

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 md:pb-0">
      <Link to="/insurance" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('insurance.title')}</Link>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand"><ShieldCheck className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-navy">{policyTitle(p, lang)}</h1>
            <Badge tone={POLICY_STATUS_TONE[p.status]}>{t(`insurance.statuses.${p.status}`)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-2">
            <span className="ltr font-latin">{p.file_no}</span>
            {p.customer && <Link to="/customers/$id" params={{ id: p.customer.id }} className="font-semibold text-brand">{p.customer.full_name}</Link>}
            {p.company && <span>{refName(p.company, lang)}</span>}
            {left != null && ['active', 'expiring', 'expired'].includes(p.status) && (
              <span className={cn('font-semibold', left < 0 ? 'text-danger' : p.status === 'expiring' ? 'text-[#b57a00]' : '')}>
                {left < 0 ? t('insurance.expiredAgo', { count: -left }) : t('insurance.daysLeft', { count: left })}
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('insurance.data')} icon={<Pencil className="size-4 text-brand" />} />
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <Field label={t('insurance.type')}>
                <Select value={f.type} disabled={!canEdit} onChange={(e) => set({ type: e.target.value })}>
                  <option value="">{t('workflow.pick')}</option>
                  {(types.data ?? []).filter((x) => x.is_active || x.id === f.type).map((x) => <option key={x.id} value={x.id}>{refName(x, lang)}</option>)}
                </Select>
              </Field>
              <Field label={t('insurance.company')}>
                <Select value={f.company} disabled={!canEdit} onChange={(e) => set({ company: e.target.value })}>
                  <option value="">{t('workflow.pick')}</option>
                  {(companies.data ?? []).filter((x) => x.is_active || x.id === f.company).map((x) => <option key={x.id} value={x.id}>{refName(x, lang)}</option>)}
                </Select>
              </Field>
              {input('subject', t('insurance.subject'), false, 'text', t('insurance.subjectHint'))}
              {input('policy_no', t('insurance.policyNo'), true, 'text', t('insurance.policyNoHint'))}
              {input('start_date', t('insurance.startDate'), true, 'date')}
              <Field label={t('insurance.endDate')} error={!datesOk ? t('insurance.datesInvalid') : undefined}>
                <Input type="date" dir="ltr" value={f.end_date} disabled={!canEdit} onChange={(e) => set({ end_date: e.target.value })} />
              </Field>
              {input('premium', t('insurance.premium'), true, 'number')}
              {input('coverage_amount', t('insurance.coverage'), true, 'number')}
              <Field label={t('insurance.paymentFrequency')}>
                <Select value={f.payment_frequency} disabled={!canEdit} onChange={(e) => set({ payment_frequency: e.target.value })}>
                  <option value="">{t('workflow.pick')}</option>
                  {(freqs.data ?? []).map((x) => <option key={x.key} value={x.key}>{lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar}</option>)}
                </Select>
              </Field>
              <Field label={t('requests.status')} hint={t('insurance.statusHint')}>
                <Select value={f.status} disabled={!canEdit} onChange={(e) => set({ status: e.target.value as PolicyStatus })}>
                  {statusOptions.map((s) => <option key={s} value={s}>{t(`insurance.statuses.${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('requests.notes')} className="md:col-span-2">
                <Textarea value={f.notes} disabled={!canEdit} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
            {canEdit && (
              <div className="fixed inset-x-0 bottom-[68px] z-20 flex gap-2 border-t border-line bg-white px-4 py-3 md:static md:px-4 md:pb-4">
                <Button variant="primary" loading={save.isPending} disabled={!dirty || !datesOk} onClick={() => save.mutate()}>{t('common.save')}</Button>
                {dirty && <Button onClick={() => setF(toForm(p))}>{t('common.cancel')}</Button>}
              </div>
            )}
            <p className="px-4 pb-4 text-xs text-ink-3">{t('insurance.mappedHint')}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <RenewalCard policy={p} editable={canEdit} />
          <LinkedRequestsCard link={{ kind: 'policy', id: p.id }} customer={p.customer} title={t('insurance.requests')} empty={t('insurance.noRequests')} />
        </div>
      </div>
    </div>
  );
}

function RenewalCard({ policy, editable }: { policy: Policy; editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [lost, setLost] = useState<Renewal | null>(null);
  const [note, setNote] = useState('');
  const renewals = useQuery({
    queryKey: ['policy_renewals', policy.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('policy_renewals').select('*').eq('policy_id', policy.id).order('due_date', { ascending: false });
      if (error) throw error;
      return data as unknown as Renewal[];
    },
  });
  const chain = useQuery({
    queryKey: ['insurance_policies', 'chain', policy.id],
    queryFn: async () => {
      const ids = [policy.renewed_from_policy_id].filter(Boolean) as string[];
      const [next, prev] = await Promise.all([
        supabase.from('insurance_policies').select('id, file_no, policy_no, end_date').eq('renewed_from_policy_id', policy.id).is('deleted_at', null),
        ids.length ? supabase.from('insurance_policies').select('id, file_no, policy_no, end_date').in('id', ids) : Promise.resolve({ data: [], error: null }),
      ]);
      if (next.error) throw next.error;
      return { next: next.data ?? [], prev: (prev.data ?? []) as { id: string; file_no: string; policy_no: string | null; end_date: string | null }[] };
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['policy_renewals', policy.id] });
    void qc.invalidateQueries({ queryKey: ['insurance_policies'] });
    void qc.invalidateQueries({ queryKey: ['requests'] });
  };
  const renew = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('renew_insurance_policy', { p_policy_id: policy.id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => { toast.success(t('insurance.renewed')); refresh(); void navigate({ to: '/insurance/$id', params: { id: newId } }); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const update = useMutation({
    mutationFn: async ({ r, status, note }: { r: Renewal; status: 'contacted' | 'lost'; note?: string }) => {
      const { error } = await supabase.rpc('update_policy_renewal', { p_renewal_id: r.id, p_status: status, p_note: note });
      if (error) throw error;
    },
    onSuccess: () => { setLost(null); setNote(''); refresh(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const renewable = ['active', 'expiring', 'expired'].includes(policy.status) && editable && can('insurance', 'create');

  return (
    <Card>
      <CardHeader title={t('insurance.renewal')} icon={<RefreshCw className="size-4 text-brand" />}
        actions={renewable && <Button size="sm" variant="primary" loading={renew.isPending} onClick={() => renew.mutate()}><RefreshCw className="size-4" /> {t('insurance.renew')}</Button>} />
      {(chain.data?.prev.length || chain.data?.next.length) ? (
        <div className="space-y-1 border-b border-line px-4 py-3 text-xs">
          {chain.data!.prev.map((x) => (
            <Link key={x.id} to="/insurance/$id" params={{ id: x.id }} className="flex items-center gap-2 font-semibold text-brand">
              <ArrowLeftRight className="size-3.5" /> {t('insurance.renewedFrom')} <span className="ltr font-latin">{x.policy_no ?? x.file_no}</span>
            </Link>
          ))}
          {chain.data!.next.map((x) => (
            <Link key={x.id} to="/insurance/$id" params={{ id: x.id }} className="flex items-center gap-2 font-semibold text-brand">
              <ArrowLeftRight className="size-3.5" /> {t('insurance.renewedInto')} <span className="ltr font-latin">{x.policy_no ?? x.file_no}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {(renewals.data ?? []).length === 0 ? <EmptyState title={t('insurance.noReminders')} /> : (
        <ul className="divide-y divide-line">
          {renewals.data!.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <BellRing className="size-4 text-[#b57a00]" />
                <span className="flex-1 text-sm font-semibold">{t('insurance.cycle', { date: fmtDate(r.due_date, lang, false) })}</span>
                <Badge tone={RENEWAL_TONE[r.status]}>{t(`insurance.renewalStatuses.${r.status}`)}</Badge>
              </div>
              {r.reminded_days.length > 0 && <div className="text-xs text-ink-2">{t('insurance.remindersSent', { days: r.reminded_days.join('، ') })}</div>}
              {r.note && <div className="text-xs text-ink-2">{r.note}</div>}
              {editable && (r.status === 'pending' || r.status === 'contacted') && (
                <div className="flex flex-wrap gap-2">
                  {r.status === 'pending' && (
                    <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ r, status: 'contacted' })}><PhoneCall className="size-4" /> {t('insurance.markContacted')}</Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => { setNote(''); setLost(r); }}><XCircle className="size-4" /> {t('insurance.markLost')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!lost} onOpenChange={(v) => !v && setLost(null)} title={t('insurance.markLost')}
        footer={<><Button variant="danger" loading={update.isPending} onClick={() => lost && update.mutate({ r: lost, status: 'lost', note })}>{t('common.save')}</Button><Button onClick={() => setLost(null)}>{t('common.cancel')}</Button></>}>
        <Field label={t('insurance.lostReason')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}
