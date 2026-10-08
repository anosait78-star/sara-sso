import { useQuery } from '@tanstack/react-query';
import {
  Banknote, Building2, Car, Factory, FileBadge, FileText, HeartPulse, Home, KeyRound, Landmark, Layers, RefreshCw,
  ShieldCheck, Stamp, Users, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// ---------- Types (mirror supabase/migrations/*_services_workflow.sql) ----------
export type ServiceModule = 'generic' | 'real_estate' | 'insurance' | 'company_formation' | 'loans';
export type WorkflowStatus = 'draft' | 'published' | 'archived';
export type DurationUnit = 'hours' | 'days' | 'business_days';
export type AssigneeType = 'role' | 'department' | 'employee' | 'request_owner';
export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'phone' | 'email' | 'national_id';
export type RequestStatus = 'draft' | 'submitted' | 'in_progress' | 'waiting_client' | 'on_hold' | 'completed' | 'cancelled';

export const SERVICE_MODULES: ServiceModule[] = ['generic', 'company_formation', 'insurance', 'real_estate', 'loans'];
export const DURATION_UNITS: DurationUnit[] = ['business_days', 'days', 'hours'];
export const ASSIGNEE_TYPES: AssigneeType[] = ['request_owner', 'department', 'role', 'employee'];
export const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'money', 'date', 'select', 'multiselect', 'checkbox', 'phone', 'email', 'national_id'];
export const REQUEST_STATUSES: RequestStatus[] = ['submitted', 'in_progress', 'waiting_client', 'on_hold', 'completed'];

export interface Category { id: string; key: string; name_ar: string; name_en: string | null; icon: string | null; sort_order: number; is_active: boolean }

export interface WorkflowVersion {
  id: string; service_id: string; version: number; status: WorkflowStatus; change_note: string | null;
  based_on_workflow_id: string | null; published_at: string | null; archived_at: string | null; created_at: string;
  steps?: { count: number }[];
}

export interface Service {
  id: string; category_id: string; code: string; name_ar: string; name_en: string | null; description_ar: string | null; description_en: string | null;
  icon: string | null; module_key: ServiceModule; is_active: boolean; is_client_visible: boolean; allow_client_request: boolean;
  default_price: number | null; currency: string; current_workflow_id: string | null; sort_order: number; created_at: string;
  category?: Category | null;
  versions?: WorkflowVersion[];
}
export const SERVICE_SELECT = '*, category:service_categories(*), versions:service_workflows!service_workflows_service_id_fkey(id, version, status, change_note, based_on_workflow_id, published_at, archived_at, created_at, service_id, steps:workflow_steps(count))';

export interface FieldOption { value: string; label_ar: string; label_en?: string | null }
export interface RequiredField {
  id: string; workflow_step_id: string; field_key: string; label_ar: string; label_en: string | null; field_type: FieldType;
  options: FieldOption[]; validation: { min?: number; max?: number; min_length?: number; max_length?: number; regex?: string };
  is_required: boolean; filled_by: 'client' | 'staff'; help_text: string | null; sort_order: number; maps_to: string | null;
}
export interface DocType {
  id: string; key: string; name_ar: string; name_en: string | null; allowed_mime: string[]; max_size_mb: number; has_expiry: boolean; is_active: boolean; sort_order: number;
}
export interface RequiredDocument {
  id: string; workflow_step_id: string; document_type_id: string; is_required: boolean; instructions_ar: string | null; instructions_en: string | null;
  max_files: number; sort_order: number; type?: DocType | null;
}
export interface Step {
  id: string; workflow_id: string; step_key: string; sort_order: number; name_ar: string; name_en: string | null; description: string | null;
  client_instructions: string | null; is_required: boolean; duration_value: number; duration_unit: DurationUnit; assignee_type: AssigneeType;
  assignee_role_id: string | null; assignee_department_id: string | null; assignee_employee_id: string | null; requires_approval: boolean;
  approver_role_id: string | null; client_action_required: boolean; is_client_visible: boolean; completion_status_label_ar: string | null;
  completion_status_label_en: string | null; sets_request_status: RequestStatus | null; auto_create_task: boolean;
  fields: RequiredField[]; docs: RequiredDocument[];
}
/** Columns of workflow_steps that the API may update (column-level grant). */
export const EDITABLE_STEP_COLUMNS = [
  'step_key', 'name_ar', 'name_en', 'description', 'client_instructions', 'is_required', 'duration_value', 'duration_unit',
  'assignee_type', 'assignee_role_id', 'assignee_department_id', 'assignee_employee_id', 'requires_approval', 'approver_role_id',
  'client_action_required', 'is_client_visible', 'completion_status_label_ar', 'completion_status_label_en', 'sets_request_status', 'auto_create_task',
] as const;
export type StepPatch = Partial<Pick<Step, (typeof EDITABLE_STEP_COLUMNS)[number]>>;

export interface DiffRow {
  change: 'step_added' | 'step_removed' | 'step_moved' | 'step_changed' | 'field_added' | 'field_removed' | 'field_changed' | 'document_added' | 'document_removed' | 'document_changed';
  step_key: string; step_name_ar: string | null; step_name_en: string | null; item_key: string | null; item_name_ar: string | null; item_name_en: string | null;
  detail: { position?: number; from?: number; to?: number; fields?: string[]; field_type?: string; is_required?: boolean };
}
export interface ValidationIssue { step_id: string | null; step_key: string | null; step_name: string | null; issue: string; detail: string | null }

export interface Option { id: string; key?: string; name_ar: string; name_en: string | null }

// ---------- Icons ----------
const ICONS: Record<string, LucideIcon> = {
  landmark: Landmark, 'shield-check': ShieldCheck, 'building-2': Building2, banknote: Banknote, 'file-badge': FileBadge, stamp: Stamp,
  users: Users, car: Car, 'heart-pulse': HeartPulse, 'refresh-cw': RefreshCw, home: Home, 'key-round': KeyRound, factory: Factory, 'file-text': FileText,
};
export const ICON_NAMES = Object.keys(ICONS);
export function iconOf(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Layers;
}

// ---------- Queries ----------
export function useCategories() {
  return useQuery({
    queryKey: ['service_categories'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_categories').select('*').order('sort_order');
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useDocTypes() {
  return useQuery({
    queryKey: ['document_types'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('document_types').select('*').order('sort_order');
      if (error) throw error;
      return data as DocType[];
    },
  });
}

export function useRoleOptions() {
  return useQuery({
    queryKey: ['roles', 'options'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, key, name_ar, name_en').order('created_at');
      if (error) throw error;
      return data as Option[];
    },
  });
}

export function useDepartmentOptions() {
  return useQuery({
    queryKey: ['departments', 'options'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name_ar, name_en').eq('is_active', true).order('created_at');
      if (error) throw error;
      return data as Option[];
    },
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: ['services', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select(SERVICE_SELECT).eq('id', id).maybeSingle();
      if (error) throw error;
      const s = data as unknown as Service | null;
      if (s?.versions) s.versions.sort((a, b) => b.version - a.version);
      return s;
    },
  });
}

export function useWorkflowSteps(workflowId: string | null | undefined) {
  return useQuery({
    queryKey: ['workflow_steps', workflowId],
    enabled: !!workflowId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_steps')
        .select('*, fields:required_fields(*), docs:required_documents(*, type:document_types(*))')
        .eq('workflow_id', workflowId!)
        .order('sort_order')
        .order('sort_order', { referencedTable: 'required_fields' })
        .order('sort_order', { referencedTable: 'required_documents' });
      if (error) throw error;
      return data as unknown as Step[];
    },
  });
}

export function useWorkflowDiff(from: string | null | undefined, to: string | null | undefined) {
  return useQuery({
    queryKey: ['workflow_diff', from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workflow_diff', { p_from: from!, p_to: to! });
      if (error) throw error;
      return data as unknown as DiffRow[];
    },
  });
}

// ---------- Helpers ----------
export function nameOf(o: { name_ar: string; name_en?: string | null } | null | undefined, lang: 'ar' | 'en') {
  if (!o) return '—';
  return lang === 'en' ? o.name_en || o.name_ar : o.name_ar;
}

/** Rough total in working days (hours → 1/8 day) used for "expected duration". */
export function totalDays(steps: Pick<Step, 'duration_value' | 'duration_unit'>[]) {
  return Math.ceil(steps.reduce((sum, s) => sum + (s.duration_unit === 'hours' ? s.duration_value / 8 : s.duration_value), 0));
}

export function publishedVersion(s: Service | null | undefined) {
  return s?.versions?.find((v) => v.status === 'published') ?? null;
}
export function draftVersion(s: Service | null | undefined) {
  return s?.versions?.find((v) => v.status === 'draft') ?? null;
}

/** "Social insurance" -> "social_insurance" (same rule as app.slug_key in the database). */
export function slugKey(text: string, fallback: string) {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) return fallback;
  return /^[a-z]/.test(s) ? s.slice(0, 48) : `${fallback}_${s.slice(0, 40)}`;
}

/** Tracks a CSS media query (used to switch the builder layout). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
