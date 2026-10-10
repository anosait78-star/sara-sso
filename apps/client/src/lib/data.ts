import type { DynamicField } from '@sso/shared';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type RequestStatus = 'draft' | 'submitted' | 'in_progress' | 'waiting_client' | 'on_hold' | 'completed' | 'cancelled';
export type StepStatus = 'pending' | 'active' | 'waiting_client' | 'waiting_approval' | 'completed' | 'skipped' | 'returned';
export type DocStatus = 'pending' | 'uploaded' | 'under_review' | 'approved' | 'rejected';

export interface ClientRequest {
  id: string; request_no: string; status: RequestStatus; due_at: string | null; created_at: string; completed_at: string | null;
  cancelled_reason: string | null; current_step_id: string | null;
  service: { id: string; name_ar: string; name_en: string | null; icon: string | null } | null;
}
export const REQUEST_SELECT = 'id, request_no, status, due_at, created_at, completed_at, cancelled_reason, current_step_id, service:services(id, name_ar, name_en, icon)';

/** Client view of a step (RLS returns client-visible steps only). */
export interface ClientStep {
  id: string; request_id: string; sort_order: number; name_ar: string; name_en: string | null; client_instructions: string | null;
  status: StepStatus; due_at: string | null; completed_at: string | null; client_action_required: boolean;
  completion_status_label_ar: string | null; completion_status_label_en: string | null; fields_snapshot: DynamicField[];
}
export const STEP_SELECT = 'id, request_id, sort_order, name_ar, name_en, client_instructions, status, due_at, completed_at, client_action_required, completion_status_label_ar, completion_status_label_en, fields_snapshot';

export interface ClientDocument {
  id: string; customer_id: string; request_id: string | null; request_step_id: string | null; name_ar: string; name_en: string | null; is_required: boolean;
  instructions_ar: string | null; status: DocStatus; rejection_note: string | null; review_note: string | null; reused_from_document_id: string | null;
  document_type_id: string; reason: { text_ar: string; text_en: string | null } | null;
  type: { allowed_mime: string[]; max_size_mb: number } | null;
}
export const DOC_SELECT = 'id, customer_id, request_id, request_step_id, name_ar, name_en, is_required, instructions_ar, status, rejection_note, review_note, reused_from_document_id, document_type_id, reason:rejection_reasons(text_ar, text_en), type:document_types(allowed_mime, max_size_mb)';

export const STATUS_TONE: Record<RequestStatus, 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'> = {
  draft: 'gray', submitted: 'blue', in_progress: 'blue', waiting_client: 'amber', on_hold: 'purple', completed: 'green', cancelled: 'red',
};
export const DOC_TONE: Record<DocStatus, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  pending: 'amber', uploaded: 'blue', under_review: 'blue', approved: 'green', rejected: 'red',
};
export const OPEN: RequestStatus[] = ['submitted', 'in_progress', 'waiting_client', 'on_hold'];

export function useMyRequests() {
  return useQuery({
    queryKey: ['requests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ClientRequest[];
    },
  });
}

/** Steps of all my requests (for progress bars and "needed from you"). */
export function useMySteps() {
  return useQuery({
    queryKey: ['steps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_request_steps').select(STEP_SELECT).order('sort_order');
      if (error) throw error;
      return data as unknown as ClientStep[];
    },
  });
}

export function useMyDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select(DOC_SELECT).order('created_at');
      if (error) throw error;
      return data as unknown as ClientDocument[];
    },
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id, event_key, title, body, link, read_at, created_at')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as { id: string; event_key: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[];
    },
  });
}

export function progressOf(steps: ClientStep[]) {
  const done = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  return { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 };
}

export function nameOf(o: { name_ar: string; name_en?: string | null } | null | undefined, locale: 'ar' | 'en') {
  if (!o) return '—';
  return locale === 'en' ? o.name_en || o.name_ar : o.name_ar;
}

export function fmtDate(iso: string | null | undefined, locale: 'ar' | 'en', withTime = false) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
    .format(new Date(iso));
}
