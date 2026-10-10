import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Copy, KeyRound, Link2, Lock, Smartphone, Unlock, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Field, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { displayPhone, fmtDate, useLang } from '@/lib/crm';
import { invokeFunction, supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

interface LinkRequest {
  id: string; user_id: string; matched_customer_id: string; full_name: string; national_id: string; phone: string; status: string; created_at: string;
  customer?: { id: string; full_name: string; national_id: string | null; phone: string; customer_no: string | null } | null;
}

/** Customer 360 → app account: state, temporary password (shown once), suspend / activate (customers.manage_access). */
export function ClientAccessCard({ customer }: { customer: { id: string; user_id: string | null; app_access: 'none' | 'active' | 'suspended' } }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [temp, setTemp] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'reset_password' | 'suspend' | 'activate'>(null);
  const manage = can('customers', 'manage_access');

  const act = useMutation({
    mutationFn: (action: 'reset_password' | 'suspend' | 'activate') =>
      invokeFunction<{ temp_password?: string }>('client-access', { customer_id: customer.id, action }),
    onSuccess: (res) => {
      setConfirm(null);
      if (res.temp_password) setTemp(res.temp_password);
      else toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e) => { setConfirm(null); toast.error(t(errorKey(e))); },
  });

  return (
    <Card>
      <CardHeader icon={<Smartphone className="size-4" />} title={t('clientAccess.title')} />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1 text-ink-2">{t('customers.appAccess')}</span>
          <Badge tone={customer.app_access === 'active' ? 'green' : customer.app_access === 'suspended' ? 'red' : 'gray'}>
            {t(`customers.appAccessStates.${customer.app_access}`)}
          </Badge>
        </div>
        {!customer.user_id && <p className="text-xs text-ink-3">{t('clientAccess.noAccount')}</p>}
        {manage && customer.user_id && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setConfirm('reset_password')}><KeyRound className="size-4" /> {t('clientAccess.reset')}</Button>
            {customer.app_access === 'active'
              ? <Button size="sm" variant="danger" onClick={() => setConfirm('suspend')}><Lock className="size-4" /> {t('clientAccess.suspend')}</Button>
              : <Button size="sm" variant="success" onClick={() => setConfirm('activate')}><Unlock className="size-4" /> {t('clientAccess.activate')}</Button>}
          </div>
        )}
        {manage && customer.user_id && <p className="text-xs text-ink-3">{t('clientAccess.resetHint')}</p>}
      </div>
      <ConfirmDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm ? t(`clientAccess.confirm.${confirm}`) : ''} confirmLabel={t('common.yes')} cancelLabel={t('common.cancel')}
        danger={confirm === 'suspend'} loading={act.isPending} onConfirm={() => confirm && act.mutate(confirm)} />
      <Modal open={!!temp} onOpenChange={(v) => !v && setTemp(null)} title={t('clientAccess.tempTitle')} icon={<KeyRound className="size-5 text-brand" />}
        footer={<Button variant="primary" onClick={() => setTemp(null)}>{t('common.close')}</Button>}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
            <span className="ltr flex-1 font-latin text-lg font-bold tracking-wider text-navy">{temp}</span>
            <Button size="sm" onClick={() => { void navigator.clipboard.writeText(temp ?? ''); toast.success(t('common.copied')); }}><Copy className="size-4" /> {t('common.copy')}</Button>
          </div>
          <p className="text-sm text-ink-2">{t('clientAccess.tempHint')}</p>
        </div>
      </Modal>
    </Card>
  );
}

/** Pending link requests (app sign-ups matching an existing customer) — never linked automatically (PROJECT_PLAN §5.2). */
export function LinkRequestsCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<LinkRequest | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['account_link_requests'],
    enabled: can('customers', 'manage_access'),
    queryFn: async () => {
      const { data, error } = await supabase.from('account_link_requests')
        .select('*, customer:customers!account_link_requests_matched_customer_id_fkey(id, full_name, national_id, phone, customer_no)')
        .eq('status', 'pending').order('created_at');
      if (error) throw error;
      return data as unknown as LinkRequest[];
    },
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['account_link_requests'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
  };
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('approve_account_link', { p_link_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('clientAccess.linked')); done(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reject_account_link', { p_link_id: rejecting!.id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { setRejecting(null); setReason(''); done(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  if (!q.data?.length) return null;
  const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim() === b.trim();

  return (
    <Card className="border-[#f2dca3]">
      <CardHeader icon={<Link2 className="size-4 text-warning" />} title={`${t('clientAccess.linkTitle')} (${q.data.length})`} />
      <ul className="divide-y divide-line">
        {q.data.map((l) => (
          <li key={l.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
            <div className="text-sm">
              <div className="text-xs font-bold text-ink-3">{t('clientAccess.fromApp')}</div>
              <div className="font-semibold">{l.full_name}</div>
              <div className="ltr text-start text-xs text-ink-2">{displayPhone(l.phone)} · {l.national_id}</div>
              <div className="text-[11px] text-ink-3">{fmtDate(l.created_at, lang)}</div>
            </div>
            <div className="text-sm">
              <div className="text-xs font-bold text-ink-3">{t('clientAccess.existing')}</div>
              {l.customer ? (
                <>
                  <Link to="/customers/$id" params={{ id: l.customer.id }} className="font-semibold text-brand">{l.customer.full_name}</Link>
                  <div className="ltr text-start text-xs">
                    <span className={same(l.customer.phone, l.phone) ? 'text-success' : 'text-danger'}>{displayPhone(l.customer.phone)}</span> ·{' '}
                    <span className={same(l.customer.national_id, l.national_id) ? 'text-success' : 'text-danger'}>{l.customer.national_id ?? '—'}</span>
                  </div>
                </>
              ) : '—'}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="success" loading={approve.isPending} onClick={() => approve.mutate(l.id)}><Check className="size-4" /> {t('clientAccess.approve')}</Button>
              <Button size="sm" variant="danger" onClick={() => setRejecting(l)}><X className="size-4" /> {t('requests.reject')}</Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-4 pb-3 text-xs text-ink-3">{t('clientAccess.linkHint')}</p>
      <Modal open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)} title={t('requests.reject')}
        footer={<><Button variant="danger" loading={reject.isPending} disabled={!reason.trim()} onClick={() => reject.mutate()}>{t('requests.reject')}</Button><Button onClick={() => setRejecting(null)}>{t('common.cancel')}</Button></>}>
        <Field label={`${t('requests.reason')} *`}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}
