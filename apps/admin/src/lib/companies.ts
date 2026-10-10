import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type CompanyStatus = 'draft' | 'in_progress' | 'established' | 'closed';
export const COMPANY_STATUSES: CompanyStatus[] = ['draft', 'in_progress', 'established', 'closed'];
export const COMPANY_STATUS_TONE: Record<CompanyStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  draft: 'gray', in_progress: 'blue', established: 'green', closed: 'red',
};

export interface CompanyFile {
  id: string; file_no: string; customer_id: string; proposed_names: string[]; approved_name: string | null; legal_form: string | null;
  capital: number | null; activity: string | null; address: string | null; city: string | null; commercial_register_no: string | null;
  tax_card_no: string | null; social_insurance_no: string | null; chamber_no: string | null; established_on: string | null;
  status: CompanyStatus; notes: string | null; owner_employee_id: string | null; created_at: string;
  customer?: { id: string; full_name: string; company_name: string | null; customer_no: string | null } | null;
  owner?: { profile: { full_name: string } | null } | null;
  partners?: { count: number }[];
}
export const COMPANY_SELECT =
  '*, customer:customers(id, full_name, company_name, customer_no), owner:employees!company_files_owner_employee_id_fkey(profile:profiles(full_name)), partners:company_partners(count)';

export interface Partner {
  id: string; company_file_id: string; full_name: string; national_id: string | null; nationality: string; share_percent: number;
  is_manager: boolean; phone: string | null; sort_order: number;
}

/** Display name: approved name, else the first proposed name, else the file number. */
export function companyName(f: Pick<CompanyFile, 'approved_name' | 'proposed_names' | 'file_no'> | null | undefined) {
  if (!f) return '—';
  return f.approved_name || f.proposed_names[0] || f.file_no;
}

export function useCompanyFile(id: string | null | undefined) {
  return useQuery({
    queryKey: ['company_files', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('company_files').select(COMPANY_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as CompanyFile | null;
    },
  });
}

export function useCustomerCompanies(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['company_files', 'customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from('company_files').select(COMPANY_SELECT).eq('customer_id', customerId!).is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as CompanyFile[];
    },
  });
}
