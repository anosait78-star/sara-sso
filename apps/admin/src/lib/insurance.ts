import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type PolicyStatus = 'pending' | 'active' | 'expiring' | 'expired' | 'renewed' | 'cancelled';
export const POLICY_STATUSES: PolicyStatus[] = ['pending', 'active', 'expiring', 'expired', 'renewed', 'cancelled'];
export const POLICY_STATUS_TONE: Record<PolicyStatus, 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple'> = {
  pending: 'blue', active: 'green', expiring: 'amber', expired: 'red', renewed: 'purple', cancelled: 'gray',
};
/** Statuses a person may pick; active / expiring / expired follow the end date in the database. */
export const POLICY_MANUAL_STATUSES: PolicyStatus[] = ['pending', 'active', 'cancelled'];

export interface RefItem { id: string; name_ar: string; name_en: string | null; is_active: boolean; sort_order: number }
export interface InsuranceType extends RefItem { key: string; icon: string | null; reminder_days: number[] | null }

export interface Policy {
  id: string; file_no: string; policy_no: string | null; customer_id: string; insurance_type_id: string | null; insurance_company_id: string | null;
  subject: string | null; start_date: string | null; end_date: string | null; premium: number | null; coverage_amount: number | null;
  payment_frequency: string | null; status: PolicyStatus; renewed_from_policy_id: string | null; notes: string | null;
  owner_employee_id: string | null; created_at: string;
  customer?: { id: string; full_name: string; company_name: string | null; customer_no: string | null } | null;
  type?: { id: string; key: string; name_ar: string; name_en: string | null } | null;
  company?: { id: string; name_ar: string; name_en: string | null } | null;
  owner?: { profile: { full_name: string } | null } | null;
}
export const POLICY_SELECT =
  '*, customer:customers(id, full_name, company_name, customer_no), type:insurance_types(id, key, name_ar, name_en), company:insurance_companies(id, name_ar, name_en), ' +
  'owner:employees!insurance_policies_owner_employee_id_fkey(profile:profiles(full_name))';

export interface Renewal {
  id: string; policy_id: string; due_date: string; status: 'pending' | 'contacted' | 'renewed' | 'lost'; reminded_days: number[];
  task_id: string | null; new_policy_id: string | null; note: string | null; created_at: string;
}

const nameIn = (x: { name_ar: string; name_en: string | null } | null | undefined, lang: 'ar' | 'en') => (x ? (lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar) : null);

/** "تأمين سيارات — هيونداي إلنترا 2021" */
export function policyTitle(p: Pick<Policy, 'subject' | 'policy_no' | 'file_no' | 'type'> | null | undefined, lang: 'ar' | 'en') {
  if (!p) return '—';
  return [nameIn(p.type, lang), p.subject || p.policy_no].filter(Boolean).join(' — ') || p.file_no;
}
export const refName = nameIn;

/** Whole days from today to the date (negative = past). */
export function daysLeft(date: string | null | undefined) {
  if (!date) return null;
  const today = new Date();
  const d = new Date(`${date}T00:00:00`);
  return Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
}

export const money = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('en')} EGP`);

export function usePolicy(id: string | null | undefined) {
  return useQuery({
    queryKey: ['insurance_policies', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_policies').select(POLICY_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as Policy | null;
    },
  });
}

export function useCustomerPolicies(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['insurance_policies', 'customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_policies').select(POLICY_SELECT).eq('customer_id', customerId!).is('deleted_at', null)
        .order('end_date', { ascending: false, nullsFirst: true });
      if (error) throw error;
      return data as unknown as Policy[];
    },
  });
}

export function useInsuranceTypes() {
  return useQuery({
    queryKey: ['insurance_types'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_types').select('*').order('sort_order');
      if (error) throw error;
      return data as unknown as InsuranceType[];
    },
  });
}

export function useInsuranceCompanies() {
  return useQuery({
    queryKey: ['insurance_companies'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_companies').select('*').order('sort_order');
      if (error) throw error;
      return data as unknown as RefItem[];
    },
  });
}
