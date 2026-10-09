import type { DynamicField } from '@sso/shared';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { AssigneeType, DurationUnit, RequestStatus } from './services';

// ---------- Types (mirror supabase/migrations/*_service_requests.sql) ----------
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type StepStatus = 'pending' | 'active' | 'waiting_client' | 'waiting_approval' | 'completed' | 'skipped' | 'returned';
export type DocumentStatus = 'pending' | 'uploaded' | 'under_review' | 'approved' | 'rejected';

export interface RequestRow {
  id: string; request_no: string; customer_id: string; service_id: string; workflow_id: string; status: RequestStatus;
  current_step_id: string | null; owner_employee_id: string | null; department_id: string | null; priority: Priority; source: string;
  notes: string | null; submitted_at: string | null; due_at: string | null; expected_completion_at: string | null; completed_at: string | null;
  cancelled_reason: string | null; hold_reason: string | null; total_amount: number | null; paid_amount: number; is_overdue: boolean; created_at: string;
  customer?: { id: string; full_name: string; company_name: string | null; customer_type: 'individual' | 'company'; phone: string; customer_no: string | null } | null;
  service?: { id: string; code: string; name_ar: string; name_en: string | null; icon: string | null; module_key: string } | null;
  workflow?: { version: number } | null;
  owner?: { profile: { full_name: string } | null } | null;
  current_step?: { id: string; name_ar: string; name_en: string | null; status: StepStatus; due_at: string | null; sort_order: number } | null;
}
export const REQUEST_SELECT =
  '*, customer:customers(id, full_name, company_name, customer_type, phone, customer_no), service:services(id, code, name_ar, name_en, icon, module_key), ' +
  'workflow:service_workflows(version), owner:employees!service_requests_owner_employee_id_fkey(profile:profiles(full_name)), ' +
  'current_step:service_request_steps!service_requests_current_step_fkey(id, name_ar, name_en, status, due_at, sort_order)';

export interface RequestStep {
  id: string; request_id: string; step_key: string; sort_order: number; name_ar: string; name_en: string | null; description: string | null;
  client_instructions: string | null; is_required: boolean; duration_value: number; duration_unit: DurationUnit; assignee_type: AssigneeType;
  requires_approval: boolean; approver_role_id: string | null; client_action_required: boolean; is_client_visible: boolean;
  completion_status_label_ar: string | null; fields_snapshot: DynamicField[]; is_adhoc: boolean; status: StepStatus;
  assigned_employee_id: string | null; assigned_department_id: string | null; started_at: string | null; due_at: string | null;
  completed_at: string | null; approved_at: string | null; return_reason: string | null; skip_reason: string | null; note: string | null;
  assignee?: { profile: { full_name: string } | null } | null;
  department?: { name_ar: string; name_en: string | null } | null;
  approver_role?: { name_ar: string; name_en: string | null } | null;
}
export const STEP_SELECT =
  '*, assignee:employees!service_request_steps_assigned_employee_id_fkey(profile:profiles(full_name)), ' +
  'department:departments!service_request_steps_assigned_department_id_fkey(name_ar, name_en), ' +
  'approver_role:roles!service_request_steps_approver_role_id_fkey(name_ar, name_en)';

export interface RequestDocument {
  id: string; customer_id: string; request_id: string | null; request_step_id: string | null; document_type_id: string; name_ar: string; name_en: string | null;
  is_required: boolean; instructions_ar: string | null; status: DocumentStatus; received_physically: boolean; review_note: string | null;
  rejection_reason_id: string | null; rejection_note: string | null; reviewed_at: string | null; expires_at: string | null;
  reason?: { text_ar: string; text_en: string | null } | null;
  reviewer?: { profile: { full_name: string } | null } | null;
}
export const DOCUMENT_SELECT = '*, reason:rejection_reasons(text_ar, text_en), reviewer:employees!documents_reviewed_by_fkey(profile:profiles(full_name))';

export interface FieldValue { id: string; request_step_id: string; field_key: string; field_type: string; value: unknown; updated_at: string }

// ---------- Display helpers ----------
export const REQUEST_STATUS_TONE: Record<RequestStatus, 'blue' | 'sky' | 'green' | 'amber' | 'red' | 'gray' | 'purple'> = {
  draft: 'gray', submitted: 'sky', in_progress: 'blue', waiting_client: 'amber', on_hold: 'purple', completed: 'green', cancelled: 'red',
};
export const STEP_STATUS_TONE: Record<StepStatus, 'blue' | 'sky' | 'green' | 'amber' | 'red' | 'gray' | 'purple'> = {
  pending: 'gray', active: 'blue', waiting_client: 'amber', waiting_approval: 'purple', completed: 'green', skipped: 'gray', returned: 'red',
};
export const DOC_STATUS_TONE: Record<DocumentStatus, 'blue' | 'sky' | 'green' | 'amber' | 'red' | 'gray' | 'purple'> = {
  pending: 'gray', uploaded: 'sky', under_review: 'amber', approved: 'green', rejected: 'red',
};
export const OPEN_STATUSES: RequestStatus[] = ['submitted', 'in_progress', 'waiting_client', 'on_hold'];
export const ACTIVE_STEP_STATUSES: StepStatus[] = ['active', 'waiting_client', 'returned'];

export function customerTitle(c: RequestRow['customer']) {
  if (!c) return '—';
  return c.customer_type === 'company' && c.company_name ? c.company_name : c.full_name;
}

/** Past due and still open. */
export function isLate(due: string | null | undefined, status?: string) {
  return !!due && new Date(due) < new Date() && !['completed', 'skipped', 'cancelled'].includes(status ?? '');
}

// ---------- Queries ----------
export function useRequest(id: string) {
  return useQuery({
    queryKey: ['requests', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as RequestRow | null;
    },
  });
}

export function useRequestSteps(requestId: string) {
  return useQuery({
    queryKey: ['requests', requestId, 'steps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_request_steps').select(STEP_SELECT).eq('request_id', requestId).order('sort_order');
      if (error) throw error;
      return data as unknown as RequestStep[];
    },
  });
}

export function useRequestDocuments(requestId: string) {
  return useQuery({
    queryKey: ['requests', requestId, 'documents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select(DOCUMENT_SELECT).eq('request_id', requestId).order('created_at');
      if (error) throw error;
      return data as unknown as RequestDocument[];
    },
  });
}

export function useFieldValues(requestId: string) {
  return useQuery({
    queryKey: ['requests', requestId, 'values'],
    queryFn: async () => {
      const { data, error } = await supabase.from('request_field_values').select('id, request_step_id, field_key, field_type, value, updated_at').eq('request_id', requestId);
      if (error) throw error;
      return data as FieldValue[];
    },
  });
}

export function useStepMissing(stepId: string | null | undefined) {
  return useQuery({
    queryKey: ['requests', 'missing', stepId],
    enabled: !!stepId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('request_step_missing', { p_step_id: stepId! });
      if (error) throw error;
      return data as { kind: 'field' | 'document'; item_key: string; name_ar: string; name_en: string | null }[];
    },
  });
}

export function useRejectionReasons() {
  return useQuery({
    queryKey: ['rejection_reasons'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('rejection_reasons').select('id, text_ar, text_en').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as { id: string; text_ar: string; text_en: string | null }[];
    },
  });
}

/** Active services a request can be created for. */
export function useActiveServices() {
  return useQuery({
    queryKey: ['services', 'active'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('id, code, name_ar, name_en, icon, default_price, category_id').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as { id: string; code: string; name_ar: string; name_en: string | null; icon: string | null; default_price: number | null; category_id: string }[];
    },
  });
}
