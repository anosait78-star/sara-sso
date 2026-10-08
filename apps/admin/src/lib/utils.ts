import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('');
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Maps Postgres/PostgREST errors to a short user-facing key. */
export function errorKey(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const msg = e?.message ?? '';
  // specific database guard messages (see migrations) first
  if (/own role/i.test(msg)) return 'errors.ownRole';
  if (/own status|own active status/i.test(msg)) return 'errors.ownStatus';
  if (/only a super admin/i.test(msg)) return 'errors.superAdminOnly';
  if (/at least one active super admin/i.test(msg)) return 'errors.lastSuperAdmin';
  if (/system role/i.test(msg)) return 'errors.systemRole';
  if (e?.code === '55000' || /cannot be modified/i.test(msg)) return 'errors.workflowLocked';
  if (/draft exists/i.test(msg)) return 'errors.draftExists';
  if (/workflow is not valid/i.test(msg)) return 'errors.workflowInvalid';
  if (/services_active_needs_workflow/i.test(msg)) return 'errors.needsWorkflow';
  if (e?.code === '23503' || /violates foreign key/i.test(msg)) return 'errors.roleInUse';
  if (e?.code === '42501' || /permission denied|row-level security|forbidden/i.test(msg)) return 'errors.forbidden';
  if (e?.code === '23505' || /already (registered|exists)|duplicate/i.test(msg)) return 'errors.duplicate';
  return 'errors.generic';
}
