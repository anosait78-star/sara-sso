import { isEmptyValue, toSubmitValue, validateDynamicValue, type DynamicField, type DynamicFieldError, type DynamicValue } from '@sso/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { useLang } from '@/lib/crm';
import { cn } from '@/lib/utils';

type Values = Record<string, DynamicValue>;

/**
 * Renders the dynamic fields of a request step (from fields_snapshot) and validates them with the
 * shared rules before calling onSubmit with {field_key: value} — the server re-validates everything.
 */
export function DynamicForm({ fields, initial, readOnly, saving, onSubmit }: {
  fields: DynamicField[]; initial: Values; readOnly?: boolean; saving?: boolean; onSubmit: (values: Values) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [values, setValues] = useState<Values>(initial);
  const [tried, setTried] = useState(false);
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setValues(JSON.parse(initialKey) as Values);
    setTried(false);
  }, [initialKey]);

  const sorted = useMemo(() => [...fields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [fields]);
  // saving partial data is allowed: required fields are only enforced when completing the step
  const errors = useMemo(() => {
    const e: Record<string, DynamicFieldError> = {};
    for (const f of sorted) {
      const err = validateDynamicValue({ ...f, is_required: false }, values[f.field_key]);
      if (err) e[f.field_key] = err;
    }
    return e;
  }, [sorted, values]);
  const dirty = JSON.stringify(values) !== initialKey;

  if (sorted.length === 0) return null;
  const set = (k: string, v: DynamicValue) => setValues((o) => ({ ...o, [k]: v }));

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    const out: Values = {};
    for (const f of sorted) {
      const before = (JSON.parse(initialKey) as Values)[f.field_key];
      if (JSON.stringify(values[f.field_key] ?? null) !== JSON.stringify(before ?? null)) out[f.field_key] = toSubmitValue(f, values[f.field_key]);
    }
    onSubmit(out);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sorted.map((f) => {
          const label = (lang === 'en' ? f.label_en : null) || f.label_ar;
          const err = tried ? errors[f.field_key] : undefined;
          const wide = f.field_type === 'textarea' || f.field_type === 'multiselect';
          return (
            <Field
              key={f.field_key}
              className={cn(wide && 'md:col-span-2')}
              label={`${label}${f.is_required ? ' *' : ''}`}
              hint={f.help_text ?? undefined}
              error={err && t(`dynamic.errors.${err}`, { min: f.validation?.min, max: f.validation?.max })}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><Control field={f} value={values[f.field_key]} onChange={(v) => set(f.field_key, v)} disabled={readOnly} lang={lang} /></div>
                <Badge tone={f.filled_by === 'client' ? 'amber' : 'purple'} dot={false} className="mt-2.5 shrink-0">
                  {f.filled_by === 'client' ? t('workflow.filledByClientBadge') : t('workflow.filledByStaffBadge')}
                </Badge>
              </div>
            </Field>
          );
        })}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={submit}>{t('requests.saveData')}</Button>
          {dirty && <Button onClick={() => setValues(JSON.parse(initialKey) as Values)}>{t('common.cancel')}</Button>}
        </div>
      )}
    </div>
  );
}

function Control({ field, value, onChange, disabled, lang }: { field: DynamicField; value: DynamicValue | undefined; onChange: (v: DynamicValue) => void; disabled?: boolean; lang: 'ar' | 'en' }) {
  const { t } = useTranslation();
  const str = value === null || value === undefined ? '' : String(value);
  const optLabel = (o: { label_ar: string; label_en?: string | null }) => (lang === 'en' ? o.label_en || o.label_ar : o.label_ar);
  switch (field.field_type) {
    case 'textarea':
      return <Textarea value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
    case 'money':
      return (
        <div className="relative">
          <Input type="number" dir="ltr" value={str} disabled={disabled} min={field.validation?.min} max={field.validation?.max}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
          {field.field_type === 'money' && <span className="pointer-events-none absolute inset-y-0 end-3 my-auto h-fit text-xs text-ink-3">EGP</span>}
        </div>
      );
    case 'date':
      return <Input type="date" dir="ltr" value={str} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case 'select':
      return (
        <Select value={str} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('workflow.pick')}</option>
          {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{optLabel(o)}</option>)}
        </Select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button" disabled={disabled}
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={cn('h-9 rounded-full border px-3 text-sm font-semibold disabled:opacity-60', on ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-white text-ink-2')}>
                {optLabel(o)}
              </button>
            );
          })}
        </div>
      );
    }
    case 'checkbox':
      return <div className="flex h-11 items-center"><Switch checked={value === true} disabled={disabled} onChange={(v) => onChange(v)} label={field.label_ar} /></div>;
    case 'phone':
    case 'email':
    case 'national_id':
      return <Input dir="ltr" inputMode={field.field_type === 'email' ? 'email' : 'numeric'} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input value={str} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Read-only display of a stored value. */
export function formatFieldValue(field: DynamicField | undefined, value: unknown, lang: 'ar' | 'en', yesNo: [string, string]): string {
  if (value === null || value === undefined || isEmptyValue(value as DynamicValue)) return '—';
  if (!field) return String(value);
  const label = (v: string) => {
    const o = field.options?.find((x) => x.value === v);
    return o ? (lang === 'en' ? o.label_en || o.label_ar : o.label_ar) : v;
  };
  switch (field.field_type) {
    case 'select': return label(String(value));
    case 'multiselect': return (value as string[]).map(label).join('، ');
    case 'checkbox': return value ? yesNo[0] : yesNo[1];
    case 'money': return `${Number(value).toLocaleString('en')} EGP`;
    case 'number': return Number(value).toLocaleString('en');
    default: return String(value);
  }
}
