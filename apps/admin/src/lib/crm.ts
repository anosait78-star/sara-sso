import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

export interface Lookup { id: string; type: string; key: string; name_ar: string; name_en: string | null; sort_order: number; is_active: boolean }
export interface Stage { id: string; key: string; name_ar: string; name_en: string | null; stage_category: 'open' | 'won' | 'lost' | 'on_hold'; requires: 'none' | 'follow_up_date' | 'reason'; sort_order: number; color: string; is_pipeline: boolean }
export interface EmployeeOption { id: string; name: string; department_id: string | null }

export function useLang(): 'ar' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language === 'en' ? 'en' : 'ar';
}

export function useLookups(type: string) {
  return useQuery({
    queryKey: ['lookups', type],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('lookups').select('*').eq('type', type).eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as Lookup[];
    },
  });
}

export function useStages() {
  return useQuery({
    queryKey: ['lead_stages'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_stages').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as Stage[];
    },
  });
}

/** Active employees the current user can see (RLS); used for owner / assignee pickers. */
export function useEmployeeOptions() {
  return useQuery({
    queryKey: ['employees', 'options'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, department_id, status, profile:profiles(full_name)')
        .eq('status', 'active')
        .order('created_at');
      if (error) throw error;
      return (data as unknown as { id: string; department_id: string | null; profile: { full_name: string } | null }[]).map(
        (e): EmployeeOption => ({ id: e.id, name: e.profile?.full_name ?? '—', department_id: e.department_id }),
      );
    },
  });
}

export function labelOf(items: { key: string; name_ar: string; name_en: string | null }[] | undefined, key: string | null | undefined, lang: 'ar' | 'en') {
  if (!key) return '—';
  const it = items?.find((i) => i.key === key);
  return it ? (lang === 'en' ? it.name_en ?? it.name_ar : it.name_ar) : key;
}

export function fmtDate(iso: string | null | undefined, lang: string, withTime = true) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));
}

/** Relative day bucket used by follow-up lists. */
export function dueBucket(iso: string | null): 'overdue' | 'today' | 'upcoming' | 'noDate' {
  if (!iso) return 'noDate';
  const d = new Date(iso);
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (d < now) return 'overdue';
  if (d <= endOfToday) return 'today';
  return 'upcoming';
}

/** datetime-local input value <-> ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function telHref(phone: string | null | undefined) {
  return phone ? `tel:${phone}` : undefined;
}
export function waHref(phone: string | null | undefined) {
  return phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : undefined;
}
/** +201002345678 -> 0100 234 5678 for display */
export function displayPhone(phone: string | null | undefined) {
  if (!phone) return '—';
  if (!/^\+201\d{9}$/.test(phone)) return phone;
  const local = `0${phone.slice(3)}`; // 01002345678
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
