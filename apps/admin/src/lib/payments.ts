import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'wallet' | 'cheque';
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'card', 'wallet', 'cheque'];
export type PaymentStatus = 'paid' | 'refunded' | 'cancelled';
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, 'green' | 'amber' | 'red'> = { paid: 'green', refunded: 'amber', cancelled: 'red' };

export interface Payment {
  id: string; payment_no: string; customer_id: string; service_request_id: string | null; amount: number; currency: string;
  method: PaymentMethod; status: PaymentStatus; paid_at: string; reference_no: string | null; notes: string | null;
  void_reason: string | null; voided_at: string | null; created_at: string;
  customer?: { id: string; full_name: string; company_name: string | null; customer_no: string | null; phone: string | null } | null;
  request?: { id: string; request_no: string; total_amount: number | null; paid_amount: number; service: { name_ar: string; name_en: string | null } | null } | null;
  recorder?: { profile: { full_name: string } | null } | null;
}
export const PAYMENT_SELECT =
  '*, customer:customers(id, full_name, company_name, customer_no, phone), ' +
  'request:service_requests(id, request_no, total_amount, paid_amount, service:services(name_ar, name_en)), ' +
  'recorder:employees!payments_recorded_by_fkey(profile:profiles(full_name))';

export const egp = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('en', { maximumFractionDigits: 2 })} EGP`);

export function useRequestPayments(requestId: string | null | undefined) {
  return useQuery({
    queryKey: ['payments', 'request', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select(PAYMENT_SELECT).eq('service_request_id', requestId!).order('paid_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Payment[];
    },
  });
}

export function useCustomerPayments(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['payments', 'customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from('payments').select(PAYMENT_SELECT).eq('customer_id', customerId!).order('paid_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Payment[];
    },
  });
}

/** Downloads rows as a UTF-8 CSV (with BOM so Excel shows Arabic correctly). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
