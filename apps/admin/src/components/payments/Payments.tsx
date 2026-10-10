import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Ban, Pencil, Plus, Printer, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import { egp, PAYMENT_METHODS, PAYMENT_STATUS_TONE, useCustomerPayments, useRequestPayments, type Payment, type PaymentMethod } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { CustomerPicker, type CustomerPick } from '@/pages/RequestsPage';

export interface PayTarget { id: string; request_no: string; customer_id: string; total_amount: number | null; paid_amount: number }

const today = () => new Date().toISOString().slice(0, 10);
const errorText = (t: (k: string) => string, e: unknown) => {
  const m = (e as Error).message ?? '';
  if (/exceeds the outstanding/.test(m)) return t('payments.errors.overpay');
  if (/less than what was already paid/.test(m)) return t('payments.errors.belowPaid');
  if (/cancelled request/.test(m)) return t('payments.errors.cancelledRequest');
  return t(errorKey(e));
};

function useRefreshPayments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

/** Records a receipt for a request (or, from the payments page, for a customer and one of the customer's requests). */
export function RecordPaymentDialog({ open, onOpenChange, target, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; target?: PayTarget; onDone?: (paymentId: string) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const refresh = useRefreshPayments();
  const [customer, setCustomer] = useState<CustomerPick | null>(null);
  const [requestId, setRequestId] = useState('');
  const [f, setF] = useState({ amount: '', method: 'cash' as PaymentMethod, date: today(), reference: '', notes: '' });

  const openRequests = useQuery({
    queryKey: ['requests', 'payable', customer?.id],
    enabled: open && !target && !!customer,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select('id, request_no, customer_id, total_amount, paid_amount, service:services(name_ar, name_en)')
        .eq('customer_id', customer!.id).is('deleted_at', null).neq('status', 'cancelled').order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as (PayTarget & { service: { name_ar: string; name_en: string | null } | null })[];
    },
  });
  const req = target ?? openRequests.data?.find((r) => r.id === requestId);
  const balance = req?.total_amount != null ? Number(req.total_amount) - Number(req.paid_amount) : null;
  useEffect(() => {
    if (open) {
      setCustomer(null);
      setRequestId('');
      setF({ amount: target?.total_amount != null ? String(Number(target.total_amount) - Number(target.paid_amount)) : '', method: 'cash', date: today(), reference: '', notes: '' });
    }
  }, [open, target]);
  useEffect(() => { if (!target && balance != null) setF((x) => ({ ...x, amount: String(balance) })); }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = Number(f.amount);
  const tooMuch = balance != null && amount > balance;
  const save = useMutation({
    mutationFn: async () => {
      const paidAt = f.date === today() ? new Date().toISOString() : `${f.date}T12:00:00`;
      const { data, error } = await supabase.from('payments').insert({
        customer_id: req?.customer_id ?? customer!.id, service_request_id: req?.id ?? null, amount, method: f.method, paid_at: paidAt,
        reference_no: f.reference.trim() || null, notes: f.notes.trim() || null,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { toast.success(t('payments.recorded')); refresh(); onOpenChange(false); onDone?.(id); },
    onError: (e) => toast.error(errorText(t, e)),
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('payments.record')}
      footer={<>
        <Button variant="primary" loading={save.isPending} disabled={!(amount > 0) || tooMuch || (!target && !customer)} onClick={() => save.mutate()}>{t('payments.save')}</Button>
        <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      </>}>
      <div className="space-y-4">
        {target ? (
          <div className="rounded-xl bg-canvas px-3 py-2 text-xs text-ink-2">
            <span className="ltr font-latin font-semibold text-ink">{target.request_no}</span> · {t('payments.balanceIs', { amount: egp(balance) })}
          </div>
        ) : (
          <>
            <Field label={`${t('requests.customer')} *`}><CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setRequestId(''); }} /></Field>
            {customer && (
              <Field label={t('payments.request')} hint={req && balance != null ? t('payments.balanceIs', { amount: egp(balance) }) : undefined}>
                <Select value={requestId} onChange={(e) => setRequestId(e.target.value)}>
                  <option value="">{t('payments.noRequest')}</option>
                  {(openRequests.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.request_no} · {lang === 'en' ? r.service?.name_en ?? r.service?.name_ar : r.service?.name_ar}
                      {r.total_amount != null ? ` · ${egp(Number(r.total_amount) - Number(r.paid_amount))}` : ''}</option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t('payments.amount')} *`} error={tooMuch ? t('payments.errors.overpay') : undefined}>
            <Input type="number" min={0} step="0.01" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label={t('payments.method')}>
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`payments.methods.${m}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('payments.date')}><Input type="date" dir="ltr" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t('payments.reference')}><Input dir="ltr" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <Field label={t('requests.notes')}><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** Refund / cancel a receipt (payments.approve), with a mandatory reason. */
export function VoidPaymentDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { t } = useTranslation();
  const refresh = useRefreshPayments();
  const [status, setStatus] = useState<'cancelled' | 'refunded'>('cancelled');
  const [reason, setReason] = useState('');
  useEffect(() => { if (payment) { setStatus('cancelled'); setReason(''); } }, [payment]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payments').update({ status, void_reason: reason.trim() }).eq('id', payment!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); refresh(); onClose(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  return (
    <Modal open={!!payment} onOpenChange={(v) => !v && onClose()} title={t('payments.void')}
      footer={<><Button variant="danger" loading={save.isPending} disabled={reason.trim().length < 3} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-canvas px-3 py-2 text-xs text-ink-2"><span className="ltr font-latin font-semibold text-ink">{payment?.payment_no}</span> · {egp(payment?.amount)}</div>
        <Field label={t('payments.voidAs')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as 'cancelled' | 'refunded')}>
            <option value="cancelled">{t('payments.statuses.cancelled')} — {t('payments.cancelHint')}</option>
            <option value="refunded">{t('payments.statuses.refunded')} — {t('payments.refundHint')}</option>
          </Select>
        </Field>
        <Field label={`${t('payments.reason')} *`}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function SetAmountDialog({ target, onClose }: { target: PayTarget | null; onClose: () => void }) {
  const { t } = useTranslation();
  const refresh = useRefreshPayments();
  const [amount, setAmount] = useState('');
  useEffect(() => { if (target) setAmount(target.total_amount != null ? String(target.total_amount) : ''); }, [target]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_request_amount', { p_request_id: target!.id, p_amount: amount === '' ? (null as unknown as number) : Number(amount) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); refresh(); onClose(); },
    onError: (e) => toast.error(errorText(t, e)),
  });
  return (
    <Modal open={!!target} onOpenChange={(v) => !v && onClose()} title={t('payments.setFee')}
      footer={<><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <Field label={t('payments.fee')} hint={t('payments.feeHint')}>
        <Input type="number" min={0} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function PaymentRow({ p, onVoid, showRequest }: { p: Payment; onVoid?: (p: Payment) => void; showRequest?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('ltr font-latin text-sm font-bold', p.status === 'paid' ? 'text-navy' : 'text-ink-3 line-through')}>{egp(p.amount)}</span>
          {p.status !== 'paid' && <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{t(`payments.statuses.${p.status}`)}</Badge>}
        </div>
        <div className="text-xs text-ink-3">
          <span className="ltr font-latin">{p.payment_no}</span> · {t(`payments.methods.${p.method}`)} · {fmtDate(p.paid_at, lang, false)}
          {showRequest && p.request && <> · <span className="ltr font-latin">{p.request.request_no}</span></>}
        </div>
        {p.void_reason && <div className="text-xs text-danger">{p.void_reason}</div>}
      </div>
      <Link to="/receipt/$id" params={{ id: p.id }} target="_blank" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label={t('payments.receipt')}><Printer className="size-4" /></Link>
      {onVoid && p.status === 'paid' && (
        <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => onVoid(p)} aria-label={t('payments.void')}><Ban className="size-4" /></button>
      )}
    </li>
  );
}

/** Request page → fee, paid, outstanding and receipts. */
export function RequestPaymentsCard({ request, open }: { request: PayTarget; open: boolean }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const q = useRequestPayments(request.id);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [fee, setFee] = useState<PayTarget | null>(null);
  if (!can('payments', 'view') && !can('payments', 'create')) return null;
  const total = request.total_amount != null ? Number(request.total_amount) : null;
  const paid = Number(request.paid_amount);
  const balance = total != null ? total - paid : null;
  const canFee = can('payments', 'edit') || can('service_requests', 'approve');
  return (
    <Card>
      <CardHeader title={t('payments.title')} icon={<Wallet className="size-4 text-brand" />}
        actions={can('payments', 'create') && open !== false && (balance == null || balance > 0) && (
          <Button size="sm" variant="primary" onClick={() => setRecording(true)}><Plus className="size-4" /> {t('payments.record')}</Button>
        )} />
      <div className="grid grid-cols-3 gap-px bg-line text-center">
        {[[t('payments.fee'), total], [t('payments.paid'), paid], [t('payments.outstanding'), balance]].map(([k, v], i) => (
          <div key={i} className="bg-white px-2 py-3">
            <div className="text-[11px] text-ink-3">{k}</div>
            <div className={cn('ltr font-latin text-sm font-bold', i === 2 && balance ? 'text-danger' : i === 1 ? 'text-success' : 'text-navy')}>{egp(v as number | null)}</div>
          </div>
        ))}
      </div>
      {canFee && (
        <button type="button" onClick={() => setFee(request)} className="flex w-full items-center gap-1.5 border-t border-line px-4 py-2 text-xs font-semibold text-brand hover:bg-[#f9fbfe]">
          <Pencil className="size-3.5" /> {t('payments.setFee')}
        </button>
      )}
      {(q.data ?? []).length === 0 ? <EmptyState title={t('payments.none')} /> : (
        <ul className="divide-y divide-line border-t border-line">
          {q.data!.map((p) => <PaymentRow key={p.id} p={p} onVoid={can('payments', 'approve') ? setVoiding : undefined} />)}
        </ul>
      )}
      <RecordPaymentDialog open={recording} onOpenChange={setRecording} target={request} />
      <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)} />
      <SetAmountDialog target={fee} onClose={() => setFee(null)} />
    </Card>
  );
}

/** Customer 360 → paid / outstanding across requests and the latest receipts. */
export function CustomerPaymentsCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const q = useCustomerPayments(can('payments', 'view') ? customerId : null);
  const balance = useQuery({
    queryKey: ['requests', 'balance', customerId],
    enabled: can('payments', 'view'),
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select('total_amount, paid_amount').eq('customer_id', customerId).is('deleted_at', null).neq('status', 'cancelled');
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Math.max(0, Number(r.total_amount ?? 0) - Number(r.paid_amount)), 0);
    },
  });
  if (!can('payments', 'view') || (!q.data?.length && !balance.data)) return null;
  const paid = (q.data ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  return (
    <Card>
      <CardHeader title={t('payments.title')} icon={<Wallet className="size-4 text-brand" />} />
      <div className="grid grid-cols-2 gap-px bg-line text-center">
        <div className="bg-white px-2 py-3"><div className="text-[11px] text-ink-3">{t('payments.paid')}</div><div className="ltr font-latin text-sm font-bold text-success">{egp(paid)}</div></div>
        <div className="bg-white px-2 py-3"><div className="text-[11px] text-ink-3">{t('payments.outstanding')}</div><div className={cn('ltr font-latin text-sm font-bold', balance.data ? 'text-danger' : 'text-navy')}>{egp(balance.data ?? 0)}</div></div>
      </div>
      {(q.data ?? []).length > 0 && <ul className="divide-y divide-line border-t border-line">{q.data!.slice(0, 5).map((p) => <PaymentRow key={p.id} p={p} showRequest />)}</ul>}
    </Card>
  );
}
