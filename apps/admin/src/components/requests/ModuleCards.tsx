import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Banknote, Link2, Plus, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, labelOf, useLang, useLookups } from '@/lib/crm';
import { money, POLICY_STATUS_TONE, policyTitle, refName, useCustomerPolicies, usePolicy } from '@/lib/insurance';
import { LOAN_STATUS_TONE, useCustomerLoans, useLoan } from '@/lib/loans';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

interface Props { requestId: string; customerId: string; linkedId: string | null; open: boolean }

/** Shared shell: linked file summary, or "open from request" + "link existing". */
function ModuleShell({ title, icon, linked, notLinked, canCreate, onCreate, creating, options, onLink, linking, openText, linkText }: {
  title: string; icon: ReactNode; linked: ReactNode | null; notLinked: string; canCreate: boolean; onCreate: () => void; creating: boolean;
  options: { id: string; label: string }[]; onLink: (id: string) => void; linking: boolean; openText: string; linkText: string;
}) {
  const [pick, setPick] = useState('');
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      {linked ?? (
        <div className="space-y-3 p-4">
          <p className="text-xs text-ink-3">{notLinked}</p>
          {canCreate && <Button size="sm" variant="primary" loading={creating} onClick={onCreate}><Plus className="size-4" /> {openText}</Button>}
          {options.length > 0 && (
            <div className="flex gap-2">
              <Select className="h-9 flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={linkText}>
                <option value="">{linkText}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
              <Button size="sm" disabled={!pick} loading={linking} onClick={() => { onLink(pick); setPick(''); }}><Link2 className="size-4" /></Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function useModuleActions(createFn: string, linkFn: string, linkArg: string, requestId: string, okText: string) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['insurance_policies'] });
    void qc.invalidateQueries({ queryKey: ['loan_applications'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
  };
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(createFn as 'create_policy_from_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(okText); refresh(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const link = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(linkFn as 'link_request_policy', { p_request_id: requestId, [linkArg]: id } as { p_request_id: string; p_policy_id: string });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return { create, link };
}

/** Request page → insurance panel (module_key = insurance, or any request linked to a policy). */
export function PolicyCard({ requestId, customerId, linkedId, open }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const policy = usePolicy(linkedId);
  const others = useCustomerPolicies(linkedId || !open ? null : customerId);
  const { create, link } = useModuleActions('create_policy_from_request', 'link_request_policy', 'p_policy_id', requestId, t('insurance.opened'));
  const p = policy.data;
  return (
    <ModuleShell title={t('insurance.fileCard')} icon={<ShieldCheck className="size-4 text-brand" />}
      notLinked={t('insurance.notLinked')} openText={t('insurance.openFromRequest')} linkText={t('insurance.linkExisting')}
      canCreate={open && can('insurance', 'create')} onCreate={() => create.mutate()} creating={create.isPending}
      options={(others.data ?? []).map((x) => ({ id: x.id, label: `${policyTitle(x, lang)} · ${x.file_no}` }))} onLink={(id) => link.mutate(id)} linking={link.isPending}
      linked={p ? (
        <div className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Link to="/insurance/$id" params={{ id: p.id }} className="flex-1 font-bold text-brand">{policyTitle(p, lang)}</Link>
            <Badge tone={POLICY_STATUS_TONE[p.status]}>{t(`insurance.statuses.${p.status}`)}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-3">{t('insurance.fileNo')}</dt><dd className="ltr text-start font-latin">{p.file_no}</dd>
            <dt className="text-ink-3">{t('insurance.company')}</dt><dd>{refName(p.company, lang) ?? '—'}</dd>
            <dt className="text-ink-3">{t('insurance.policyNo')}</dt><dd className="ltr text-start">{p.policy_no ?? '—'}</dd>
            <dt className="text-ink-3">{t('insurance.endDate')}</dt><dd>{fmtDate(p.end_date, lang, false)}</dd>
          </dl>
          <p className="text-[11px] text-ink-3">{t('insurance.mappedHint')}</p>
        </div>
      ) : null} />
  );
}

/** Request page → loans panel (module_key = loans, or any request linked to a financing file). */
export function LoanCard({ requestId, customerId, linkedId, open }: Props) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const types = useLookups('financing_type');
  const loan = useLoan(linkedId);
  const others = useCustomerLoans(linkedId || !open ? null : customerId);
  const { create, link } = useModuleActions('create_loan_from_request', 'link_request_loan', 'p_loan_id', requestId, t('loans.opened'));
  const l = loan.data;
  return (
    <ModuleShell title={t('loans.fileCard')} icon={<Banknote className="size-4 text-brand" />}
      notLinked={t('loans.notLinked')} openText={t('loans.openFromRequest')} linkText={t('loans.linkExisting')}
      canCreate={open && can('loans', 'create')} onCreate={() => create.mutate()} creating={create.isPending}
      options={(others.data ?? []).map((x) => ({ id: x.id, label: `${x.file_no} · ${money(x.requested_amount)}` }))} onLink={(id) => link.mutate(id)} linking={link.isPending}
      linked={l ? (
        <div className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Link to="/loans/$id" params={{ id: l.id }} className="ltr flex-1 text-start font-latin font-bold text-brand">{l.file_no}</Link>
            <Badge tone={LOAN_STATUS_TONE[l.status]}>{t(`loans.statuses.${l.status}`)}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-3">{t('loans.type')}</dt><dd>{labelOf(types.data, l.financing_type, lang)}</dd>
            <dt className="text-ink-3">{t('loans.requested')}</dt><dd className="ltr text-start">{money(l.requested_amount)}</dd>
            <dt className="text-ink-3">{t('loans.lenders')}</dt><dd>{l.submissions?.[0]?.count ?? 0}</dd>
            <dt className="text-ink-3">{t('loans.approvedAmount')}</dt><dd className="ltr text-start">{money(l.approved_amount)}</dd>
          </dl>
          <p className="text-[11px] text-ink-3">{t('loans.mappedHint')}</p>
        </div>
      ) : null} />
  );
}

/** Customer 360 → policies and financing files. */
export function CustomerPoliciesCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useCustomerPolicies(customerId);
  if (!q.data?.length) return null;
  return (
    <Card>
      <CardHeader title={t('insurance.title')} icon={<ShieldCheck className="size-4 text-brand" />} />
      <ul className="divide-y divide-line">
        {q.data.map((p) => (
          <li key={p.id}>
            <Link to="/insurance/$id" params={{ id: p.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{policyTitle(p, lang)}</span>
                {p.end_date && <span className="block text-xs text-ink-3">{t('insurance.until', { date: fmtDate(p.end_date, lang, false) })}</span>}
              </span>
              <Badge tone={POLICY_STATUS_TONE[p.status]}>{t(`insurance.statuses.${p.status}`)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function CustomerLoansCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const types = useLookups('financing_type');
  const q = useCustomerLoans(customerId);
  if (!q.data?.length) return null;
  return (
    <Card>
      <CardHeader title={t('loans.title')} icon={<Banknote className="size-4 text-brand" />} />
      <ul className="divide-y divide-line">
        {q.data.map((l) => (
          <li key={l.id}>
            <Link to="/loans/$id" params={{ id: l.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{labelOf(types.data, l.financing_type, lang)}</span>
                <span className="ltr block text-start font-latin text-xs text-ink-3">{money(l.requested_amount)}</span>
              </span>
              <Badge tone={LOAN_STATUS_TONE[l.status]}>{t(`loans.statuses.${l.status}`)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
