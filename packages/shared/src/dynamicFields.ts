// Dynamic step fields shared by the admin and client apps.
// Mirrors the server-side checks in public.submit_step_data() — the database stays the source of truth.

export type DynamicFieldType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'phone' | 'email' | 'national_id';

export interface DynamicFieldOption { value: string; label_ar: string; label_en?: string | null }

/** A field definition as stored in service_request_steps.fields_snapshot. */
export interface DynamicField {
  field_key: string;
  label_ar: string;
  label_en?: string | null;
  field_type: DynamicFieldType;
  options?: DynamicFieldOption[];
  validation?: { min?: number; max?: number; min_length?: number; max_length?: number; regex?: string };
  is_required: boolean;
  filled_by: 'client' | 'staff';
  help_text?: string | null;
  sort_order?: number;
}

export type DynamicValue = string | number | boolean | string[] | null;

export type DynamicFieldError =
  | 'required' | 'not_a_number' | 'below_min' | 'above_max' | 'too_short' | 'too_long' | 'invalid_format'
  | 'invalid_option' | 'invalid_date' | 'invalid_phone' | 'invalid_email' | 'invalid_national_id';

export function isEmptyValue(v: DynamicValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

/** Returns an error code for one value, or null when valid. Empty values only fail when required. */
export function validateDynamicValue(field: DynamicField, value: DynamicValue | undefined): DynamicFieldError | null {
  if (isEmptyValue(value)) return field.is_required ? 'required' : null;
  const rules = field.validation ?? {};
  const str = typeof value === 'string' ? value.trim() : String(value);
  switch (field.field_type) {
    case 'number':
    case 'money': {
      const n = typeof value === 'number' ? value : Number(str);
      if (!Number.isFinite(n) || (field.field_type === 'money' && n < 0)) return 'not_a_number';
      if (rules.min !== undefined && n < rules.min) return 'below_min';
      if (rules.max !== undefined && n > rules.max) return 'above_max';
      return null;
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(Date.parse(str)) ? null : 'invalid_date';
    case 'checkbox':
      return typeof value === 'boolean' ? null : 'invalid_option';
    case 'select':
      return (field.options ?? []).some((o) => o.value === str) ? null : 'invalid_option';
    case 'multiselect':
      return Array.isArray(value) && value.every((x) => (field.options ?? []).some((o) => o.value === x)) ? null : 'invalid_option';
    case 'phone':
      return /^\+?[0-9]{8,15}$/.test(str.replace(/[\s-]/g, '')) ? null : 'invalid_phone';
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str) ? null : 'invalid_email';
    case 'national_id':
      return /^[23][0-9]{13}$/.test(str) ? null : 'invalid_national_id';
    default: {
      if (rules.min_length !== undefined && str.length < rules.min_length) return 'too_short';
      if (rules.max_length !== undefined && str.length > rules.max_length) return 'too_long';
      if (rules.regex) {
        try {
          if (!new RegExp(rules.regex).test(str)) return 'invalid_format';
        } catch {
          /* an invalid pattern is reported by the server */
        }
      }
      return null;
    }
  }
}

/** Normalises a form value to what submit_step_data() expects (numbers as numbers, phones without spaces). */
export function toSubmitValue(field: DynamicField, value: DynamicValue | undefined): DynamicValue {
  if (isEmptyValue(value)) return null;
  if (field.field_type === 'number' || field.field_type === 'money') return typeof value === 'number' ? value : Number(String(value).trim());
  if (field.field_type === 'phone') return String(value).replace(/[\s-]/g, '');
  if (typeof value === 'string') return value.trim();
  return value ?? null;
}
