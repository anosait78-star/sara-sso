import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@/components/ui';
import { egp, PAYMENT_SELECT, type Payment } from '@/lib/payments';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';

interface Company { name_ar?: string; name_en?: string; phone?: string; address?: string; email?: string }

/** Printable receipt (D9 = manual payments; receipt = browser print / save as PDF). Opens in its own tab, outside the app shell. */
export function ReceiptPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const q = useQuery({
    queryKey: ['payments', 'receipt', id],
    queryFn: async () => {
      const [p, c] = await Promise.all([
        supabase.from('payments').select(PAYMENT_SELECT).eq('id', id).maybeSingle(),
        supabase.from('app_settings').select('value').eq('key', 'company').maybeSingle(),
      ]);
      if (p.error) throw p.error;
      return { payment: p.data as unknown as Payment | null, company: (c.data?.value ?? {}) as Company };
    },
  });
  useEffect(() => { document.title = q.data?.payment ? `${t('payments.receipt')} ${q.data.payment.payment_no}` : 'SSO'; }, [q.data, t]);

  if (q.isLoading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  const p = q.data?.payment;
  if (!p) return <div className="grid min-h-screen place-items-center p-6 text-sm text-ink-2">{t('forbidden.body')}</div>;
  const co = q.data!.company;
  const date = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(p.paid_at));
  const balance = p.request?.total_amount != null ? Number(p.request.total_amount) - Number(p.request.paid_amount) : null;
  const rows: [string, React.ReactNode][] = [
    [t('payments.receivedFrom'), <span className="font-bold">{p.customer?.company_name || p.customer?.full_name}{p.customer?.customer_no && <span className="font-normal text-ink-3"> · <span className="ltr font-latin">{p.customer.customer_no}</span></span>}</span>],
    [t('payments.forService'), p.request ? <>{nameOf(p.request.service, lang)} · <span className="ltr font-latin">{p.request.request_no}</span></> : t('payments.general')],
    [t('payments.method'), t(`payments.methods.${p.method}`) + (p.reference_no ? ` · ${p.reference_no}` : '')],
    [t('payments.date'), date],
  ];
  if (p.notes) rows.push([t('payments.notes'), p.notes]);
  if (p.request?.total_amount != null) {
    rows.push([t('payments.fee'), <span className="ltr font-latin">{egp(p.request.total_amount)}</span>]);
    rows.push([t('payments.outstandingAfter'), <span className="ltr font-latin">{egp(balance)}</span>]);
  }

  return (
    <div className="min-h-screen bg-canvas py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-end gap-2 px-4 print:hidden">
        <Button variant="primary" onClick={() => window.print()}><Printer className="size-4" /> {t('payments.print')}</Button>
      </div>
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        {p.status !== 'paid' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-xl border-4 border-danger px-6 py-2 text-4xl font-black text-danger opacity-30">{t(`payments.statuses.${p.status}`)}</span>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <img src="/logo.png" alt="SSO" className="h-14" />
            <div className="mt-2 text-sm font-bold text-navy">{lang === 'en' ? co.name_en || co.name_ar : co.name_ar}</div>
            <div className="text-xs text-ink-2">{[co.address, co.phone, co.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="text-end">
            <div className="text-xl font-bold text-navy">{t('payments.receiptTitle')}</div>
            <div className="ltr mt-1 font-latin text-sm font-semibold text-ink-2">{p.payment_no}</div>
          </div>
        </div>
        <div className="my-6 rounded-xl bg-brand-50 px-5 py-4 text-center print:border print:border-line">
          <div className="text-xs text-ink-2">{t('payments.amountReceived')}</div>
          <div className="ltr mt-1 font-latin text-3xl font-bold text-navy">{egp(p.amount)}</div>
        </div>
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k, v], i) => (
            <div key={i} className="flex gap-4 py-2.5">
              <dt className="w-36 shrink-0 text-ink-3">{k}</dt>
              <dd className="flex-1">{v}</dd>
            </div>
          ))}
        </dl>
        {p.void_reason && <p className="mt-4 rounded-lg bg-[#fce8e8] px-3 py-2 text-xs text-danger">{t('payments.reason')}: {p.void_reason}</p>}
        <div className="mt-10 flex items-end justify-between text-xs text-ink-2">
          <div>{t('payments.recordedBy')}: <span className="font-semibold text-ink">{p.recorder?.profile?.full_name ?? '—'}</span></div>
          <div className="w-40 border-t border-ink-3 pt-1 text-center">{t('payments.signature')}</div>
        </div>
        <p className="mt-6 text-center text-[11px] text-ink-3">{t('payments.receiptNote')}</p>
      </div>
    </div>
  );
}
