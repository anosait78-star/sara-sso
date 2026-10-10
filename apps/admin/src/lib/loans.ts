import { useQuery } from '@tanstack/react-query';
import type { RefItem } from './insurance';
import { supabase } from './supabase';

export type LoanStatus = 'draft' | 'preparing' | 'submitted' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';
export const LOAN_STATUSES: LoanStatus[] = ['draft', 'preparing', 'submitted', 'approved', 'rejected', 'disbursed', 'cancelled'];
export const LOAN_STATUS_TONE: Record<LoanStatus, 'gray' | 'blue' | 'sky' | 'green' | 'red' | 'purple'> = {
  draft: 'gray', preparing: 'blue', submitted: 'sky', approved: 'green', rejected: 'red', disbursed: 'purple', cancelled: 'gray',
};

export type SubmissionStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';
export const SUBMISSION_STATUSES: SubmissionStatus[] = ['submitted', 'under_review', 'approved', 'rejected', 'withdrawn'];
export const SUBMISSION_TONE: Record<SubmissionStatus, 'sky' | 'amber' | 'green' | 'red' | 'gray'> = {
  submitted: 'sky', under_review: 'amber', approved: 'green', rejected: 'red', withdrawn: 'gray',
};

export interface FinancingEntity extends RefItem { kind: 'bank' | 'non_bank' | 'leasing' | 'initiative' }

export interface Loan {
  id: string; file_no: string; customer_id: string; financing_type: string | null; requested_amount: number | null; purpose: string | null;
  tenor_months: number | null; annual_revenue: number | null; years_in_business: number | null; employees_count: number | null;
  sector: string | null; collateral: string | null; approved_amount: number | null; status: LoanStatus; notes: string | null;
  owner_employee_id: string | null; created_at: string;
  customer?: { id: string; full_name: string; company_name: string | null; customer_no: string | null } | null;
  owner?: { profile: { full_name: string } | null } | null;
  submissions?: { count: number }[];
}
export const LOAN_SELECT =
  '*, customer:customers(id, full_name, company_name, customer_no), owner:employees!loan_applications_owner_employee_id_fkey(profile:profiles(full_name)), ' +
  'submissions:loan_entity_submissions(count)';

export interface Submission {
  id: string; loan_application_id: string; financing_entity_id: string; submitted_on: string; status: SubmissionStatus;
  decision_on: string | null; decision_note: string | null; offered_amount: number | null; offered_rate: number | null; offered_tenor_months: number | null;
  entity?: { id: string; name_ar: string; name_en: string | null } | null;
}

export function useLoan(id: string | null | undefined) {
  return useQuery({
    queryKey: ['loan_applications', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_applications').select(LOAN_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as Loan | null;
    },
  });
}

export function useCustomerLoans(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['loan_applications', 'customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_applications').select(LOAN_SELECT).eq('customer_id', customerId!).is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Loan[];
    },
  });
}

export function useFinancingEntities() {
  return useQuery({
    queryKey: ['financing_entities'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('financing_entities').select('*').order('sort_order');
      if (error) throw error;
      return data as unknown as FinancingEntity[];
    },
  });
}
