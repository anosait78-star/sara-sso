import type { Database } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Banknote, Building, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LinkedRequestsCard } from '@/components/requests/LinkedRequests';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { fmtDate, labelOf, useLang, useLookups } from '@/lib/crm';
import { money, refName } from '@/lib/insurance';
import {
  LOAN_STATUS_TONE, LOAN_STATUSES, SUBMISSION_STATUSES, SUBMISSION_TONE, useFinancingEntities, useLoan, type Loan, type LoanStatus, type Submission,
} from '@/lib/loans';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

const KEYS = ['financing_type', 'requested_amount', 'purpose', 'tenor_months', 'annual_revenue', 'years_in_business', 'employees_count', 'sector', 'collateral', 'approved_amount', 'notes'] as const;
type Form = Record<(typeof KEYS)[number], string> & { status: LoanStatus };
const toForm = (l: Loan): Form => ({
  ...Object.fromEntries(KEYS.map((k) => [k, l[k] != null ? String(l[k]) : ''])) as Record<(typeof KEYS)[number], string>, status: l.status,
});
const NUMERIC = new Set(['requested_amount', 'tenor_months', 'annual_revenue', 'years_in_business', 'employees_count', 'approved_amount']);

/** Financing file: business data, the lenders it was submitted to with each decision, and the linked requests. */
export function LoanPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const types = useLookups('financing_type');
  const q = useLoan(id);
  const [f, setF] = useState<Form | null>(null);
  const l = q.data;
  useEffect(() => { if (l) setF(toForm(l)); }, [l]);

  const canEdit = can('loans', 'edit');
  const dirty = !!l && !!f && JSON.stringify(f) !== JSON.stringify(toForm(l));
  const save = useMutation({
    mutationFn: async () => {
      const x = f!;
      const patch: Record<string, string | number | null> = { status: x.status };
      for (const k of KEYS) patch[k] = x[k].trim() === '' ? null : NUMERIC.has(k) ? Number(x[k]) : x[k].trim();
      const { error } = await supabase.from('loan_applications').update(patch as Database['public']['Tables']['loan_applications']['Update']).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['loan_applications'] }); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading || (l && !f)) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!l || !f) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;
  const set = (x: Partial<Form>) => setF((o) => ({ ...o!, ...x }));
  const input = (k: (typeof KEYS)[number], label: string, num?: boolean) => (
    <Field label={label}>
      <Input type={num ? 'number' : 'text'} dir={num ? 'ltr' : undefined} value={f[k]} disabled={!canEdit} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 md:pb-0">
      <Link to="/loans" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('loans.title')}</Link>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand"><Banknote className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-navy">{labelOf(types.data, l.financing_type, lang)} · <span className="ltr font-latin">{money(l.requested_amount)}</span></h1>
            <Badge tone={LOAN_STATUS_TONE[l.status]}>{t(`loans.statuses.${l.status}`)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-2">
            <span className="ltr font-latin">{l.file_no}</span>
            {l.customer && <Link to="/customers/$id" params={{ id: l.customer.id }} className="font-semibold text-brand">{l.customer.company_name || l.customer.full_name}</Link>}
            {l.approved_amount != null && <span className="font-semibold text-success">{t('loans.approvedAmountIs', { amount: money(l.approved_amount) })}</span>}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('loans.data')} icon={<Pencil className="size-4 text-brand" />} />
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <Field label={t('loans.type')}>
                <Select value={f.financing_type} disabled={!canEdit} onChange={(e) => set({ financing_type: e.target.value })}>
                  <option value="">{t('workflow.pick')}</option>
                  {(types.data ?? []).map((x) => <option key={x.key} value={x.key}>{lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar}</option>)}
                </Select>
              </Field>
              {input('requested_amount', t('loans.requested'), true)}
              {input('tenor_months', t('loans.tenor'), true)}
              <Field label={t('requests.status')} hint={t('loans.statusHint')}>
                <Select value={f.status} disabled={!canEdit} onChange={(e) => set({ status: e.target.value as LoanStatus })}>
                  {LOAN_STATUSES.map((s) => <option key={s} value={s}>{t(`loans.statuses.${s}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('loans.purpose')} className="md:col-span-2">
                <Textarea value={f.purpose} disabled={!canEdit} onChange={(e) => set({ purpose: e.target.value })} />
              </Field>
            </div>
            <div className="border-t border-line px-4 pb-1 pt-3 text-xs font-bold text-ink-2">{t('loans.business')}</div>
            <div className="grid gap-4 p-4 pt-2 md:grid-cols-2">
              {input('annual_revenue', t('loans.annualRevenue'), true)}
              {input('years_in_business', t('loans.years'), true)}
              {input('employees_count', t('loans.employees'), true)}
              {input('sector', t('loans.sector'))}
              <Field label={t('loans.collateral')} className="md:col-span-2">
                <Textarea value={f.collateral} disabled={!canEdit} onChange={(e) => set({ collateral: e.target.value })} />
              </Field>
              {input('approved_amount', t('loans.approvedAmount'), true)}
              <Field label={t('requests.notes')} className="md:col-span-2">
                <Textarea value={f.notes} disabled={!canEdit} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
            {canEdit && (
              <div className="fixed inset-x-0 bottom-[68px] z-20 flex gap-2 border-t border-line bg-white px-4 py-3 md:static md:px-4 md:pb-4">
                <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>{t('common.save')}</Button>
                {dirty && <Button onClick={() => setF(toForm(l))}>{t('common.cancel')}</Button>}
              </div>
            )}
            <p className="px-4 pb-4 text-xs text-ink-3">{t('loans.mappedHint')}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <SubmissionsCard loanId={l.id} editable={canEdit} />
          <LinkedRequestsCard link={{ kind: 'loan', id: l.id }} customer={l.customer} title={t('loans.requests')} empty={t('loans.noRequests')} />
        </div>
      </div>
    </div>
  );
}

function SubmissionsCard({ loanId, editable }: { loanId: string; editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Submission> | null>(null);
  const q = useQuery({
    queryKey: ['loan_submissions', loanId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_entity_submissions').select('*, entity:financing_entities(id, name_ar, name_en)')
        .eq('loan_application_id', loanId).order('submitted_on');
      if (error) throw error;
      return data as unknown as Submission[];
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['loan_submissions', loanId] });
    void qc.invalidateQueries({ queryKey: ['loan_applications'] });
  };
  const remove = useMutation({
    mutationFn: async (sid: string) => {
      const { error } = await supabase.from('loan_entity_submissions').delete().eq('id', sid);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader title={t('loans.lenders')} icon={<Building className="size-4 text-brand" />}
        actions={editable && <Button size="sm" onClick={() => setEdit({ status: 'submitted', submitted_on: new Date().toISOString().slice(0, 10) })}><Plus className="size-4" /> {t('loans.addSubmission')}</Button>} />
      {(q.data ?? []).length === 0 ? <EmptyState title={t('loans.noSubmissions')} /> : (
        <ul className="divide-y divide-line">
          {q.data!.map((s) => (
            <li key={s.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{refName(s.entity, lang)}</span>
                  <Badge tone={SUBMISSION_TONE[s.status]}>{t(`loans.submissionStatuses.${s.status}`)}</Badge>
                </div>
                <div className="text-xs text-ink-3">{t('loans.submittedOn', { date: fmtDate(s.submitted_on, lang, false) })}{s.decision_on && ` · ${t('loans.decidedOn', { date: fmtDate(s.decision_on, lang, false) })}`}</div>
                {s.offered_amount != null && (
                  <div className="text-xs font-semibold text-navy">
                    <span className="ltr font-latin">{money(s.offered_amount)}</span>
                    {s.offered_rate != null && <> · {t('loans.rateIs', { rate: Number(s.offered_rate) })}</>}
                    {s.offered_tenor_months != null && <> · {t('loans.tenorIs', { count: s.offered_tenor_months })}</>}
                  </div>
                )}
                {s.decision_note && <div className="text-xs text-ink-2">{s.decision_note}</div>}
              </div>
              {editable && (
                <>
                  <button type="button" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" onClick={() => setEdit(s)} aria-label={t('common.edit')}><Pencil className="size-4" /></button>
                  <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => remove.mutate(s.id)} aria-label={t('common.delete')}><Trash2 className="size-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <SubmissionDialog loanId={loanId} value={edit} used={(q.data ?? []).map((s) => s.financing_entity_id)} onClose={() => setEdit(null)} onDone={refresh} />
    </Card>
  );
}

function SubmissionDialog({ loanId, value, used, onClose, onDone }: {
  loanId: string; value: Partial<Submission> | null; used: string[]; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const entities = useFinancingEntities();
  const [s, setS] = useState<Partial<Submission>>({});
  useEffect(() => { if (value) setS(value); }, [value]);
  const decided = s.status === 'approved' || s.status === 'rejected';
  const save = useMutation({
    mutationFn: async () => {
      const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
      const payload = {
        financing_entity_id: s.financing_entity_id!, status: s.status ?? 'submitted', submitted_on: s.submitted_on || new Date().toISOString().slice(0, 10),
        offered_amount: num(s.offered_amount), offered_rate: num(s.offered_rate), offered_tenor_months: num(s.offered_tenor_months),
        decision_note: s.decision_note?.trim() || null,
      };
      const { error } = s.id
        ? await supabase.from('loan_entity_submissions').update(payload).eq('id', s.id)
        : await supabase.from('loan_entity_submissions').insert({ ...payload, loan_application_id: loanId });
      if (error) throw error;
    },
    onSuccess: () => { onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={!!value} onOpenChange={(v) => !v && onClose()} title={s.id ? t('common.edit') : t('loans.addSubmission')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={!s.financing_entity_id} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('loans.lender')} *`}>
          <Select value={s.financing_entity_id ?? ''} disabled={!!s.id} onChange={(e) => setS({ ...s, financing_entity_id: e.target.value })}>
            <option value="">{t('workflow.pick')}</option>
            {(entities.data ?? []).filter((x) => (x.is_active && !used.includes(x.id)) || x.id === s.financing_entity_id)
              .map((x) => <option key={x.id} value={x.id}>{refName(x, lang)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('requests.status')}>
            <Select value={s.status ?? 'submitted'} onChange={(e) => setS({ ...s, status: e.target.value as Submission['status'] })}>
              {SUBMISSION_STATUSES.map((x) => <option key={x} value={x}>{t(`loans.submissionStatuses.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('loans.submittedOnLabel')}>
            <Input type="date" dir="ltr" value={s.submitted_on ?? ''} onChange={(e) => setS({ ...s, submitted_on: e.target.value })} />
          </Field>
        </div>
        {decided && s.status === 'approved' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('loans.offeredAmount')}><Input type="number" min={0} dir="ltr" value={s.offered_amount ?? ''} onChange={(e) => setS({ ...s, offered_amount: e.target.value as unknown as number })} /></Field>
            <Field label={t('loans.rate')}><Input type="number" min={0} step="0.01" dir="ltr" value={s.offered_rate ?? ''} onChange={(e) => setS({ ...s, offered_rate: e.target.value as unknown as number })} /></Field>
            <Field label={t('loans.tenor')}><Input type="number" min={1} dir="ltr" value={s.offered_tenor_months ?? ''} onChange={(e) => setS({ ...s, offered_tenor_months: e.target.value as unknown as number })} /></Field>
          </div>
        )}
        <Field label={t('loans.decisionNote')}><Textarea value={s.decision_note ?? ''} onChange={(e) => setS({ ...s, decision_note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
