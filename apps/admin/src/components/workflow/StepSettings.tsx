import type { Json } from '@sso/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, CheckSquare, FileText, Hash, IdCard, List, ListChecks, Mail, Pencil, Phone, Plus, Trash2, Type, Wallet, X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, ConfirmDialog, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { useEmployeeOptions, useLang } from '@/lib/crm';
import {
  ASSIGNEE_TYPES, DURATION_UNITS, EDITABLE_STEP_COLUMNS, FIELD_TYPES, nameOf, REQUEST_STATUSES, slugKey, useDepartmentOptions, useDocTypes, useRoleOptions,
  type AssigneeType, type DurationUnit, type FieldOption, type FieldType, type RequestStatus, type RequiredDocument, type RequiredField, type Step, type StepPatch,
} from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Tab = 'general' | 'data' | 'documents' | 'assignment';

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type, textarea: Type, number: Hash, money: Wallet, date: Calendar, select: List, multiselect: ListChecks,
  checkbox: CheckSquare, phone: Phone, email: Mail, national_id: IdCard,
};

function pickEditable(s: Step): StepPatch {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_STEP_COLUMNS) out[k] = s[k];
  return out as StepPatch;
}

/**
 * Settings of one step: General · Data (fields) · Documents · Assignment.
 * General/Assignment are saved together with "Save"; fields and documents are saved one by one.
 */
export function StepSettings({ step, index, editable, isNewStep, onDeleted, onClose }: {
  step: Step; index: number; editable: boolean; isNewStep: boolean; onDeleted: () => void; onClose?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState<StepPatch>(() => pickEditable(step));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(pickEditable(step));
  }, [step]);

  const original = useMemo(() => pickEditable(step), [step]);
  const changed = useMemo(() => {
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE_STEP_COLUMNS) {
      if ((form[k] ?? null) !== (original[k] ?? null)) patch[k] = form[k] ?? null;
    }
    return patch as StepPatch;
  }, [form, original]);
  const dirty = Object.keys(changed).length > 0;
  const set = (p: StepPatch) => setForm((f) => ({ ...f, ...p }));
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['workflow_steps', step.workflow_id] });

  const save = useMutation({
    mutationFn: async () => {
      const patch = { ...changed };
      if (patch.name_ar !== undefined) patch.name_ar = patch.name_ar.trim();
      const { error } = await supabase.from('workflow_steps').update(patch).eq('id', step.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('workflow.stepSaved'));
      invalidate();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_workflow_step', { p_step_id: step.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmDelete(false);
      invalidate();
      onDeleted();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const tabs: { k: Tab; count?: number }[] = [
    { k: 'general' }, { k: 'data', count: step.fields.length }, { k: 'documents', count: step.docs.length }, { k: 'assignment' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-4">
        <span className="grid size-7 place-items-center rounded-lg bg-navy text-xs font-bold text-white">{index + 1}</span>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-navy">{t('workflow.settings', { n: index + 1 })}</h2>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label={t('common.close')}>
            <X className="size-5" />
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto border-b border-line px-2">
        {tabs.map(({ k, count }) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`workflow.tabs.${k}`)}
            {count !== undefined && <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{count}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'general' && <GeneralTab form={form} set={set} editable={editable} isNewStep={isNewStep} />}
        {tab === 'assignment' && <AssignmentTab form={form} set={set} editable={editable} />}
        {tab === 'data' && <FieldsEditor step={step} editable={editable} onChanged={invalidate} />}
        {tab === 'documents' && <DocumentsEditor step={step} editable={editable} onChanged={invalidate} />}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {(tab === 'general' || tab === 'assignment' || dirty) && (
            <>
              <Button variant="primary" loading={save.isPending} disabled={!dirty || !(form.name_ar ?? '').trim() || !form.duration_value} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
              {dirty && (
                <>
                  <Button onClick={() => setForm(original)}>{t('common.cancel')}</Button>
                  <span className="text-xs text-warning">{t('workflow.unsaved')}</span>
                </>
              )}
            </>
          )}
          <div className="flex-1" />
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> {t('workflow.deleteStep')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('workflow.deleteStepConfirm', { name: step.name_ar })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

function GeneralTab({ form, set, editable, isNewStep }: { form: StepPatch; set: (p: StepPatch) => void; editable: boolean; isNewStep: boolean }) {
  const { t } = useTranslation();
  const d = !editable;
  return (
    <div className="space-y-4">
      <Field label={`${t('workflow.nameAr')} *`}>
        <Input value={form.name_ar ?? ''} disabled={d} onChange={(e) => set({ name_ar: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('workflow.nameEn')}>
          <Input dir="ltr" value={form.name_en ?? ''} disabled={d} onChange={(e) => set({ name_en: e.target.value || null })} />
        </Field>
        <Field label={t('workflow.stepKey')} hint={t('workflow.stepKeyHint')}>
          <Input dir="ltr" className="font-latin text-xs" value={form.step_key ?? ''} disabled={d || !isNewStep}
            onChange={(e) => set({ step_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </Field>
      </div>
      <Field label={t('workflow.description')}>
        <Textarea value={form.description ?? ''} disabled={d} onChange={(e) => set({ description: e.target.value || null })} />
      </Field>
      <Field label={t('workflow.clientInstructions')}>
        <Textarea value={form.client_instructions ?? ''} disabled={d} onChange={(e) => set({ client_instructions: e.target.value || null })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('workflow.duration')}>
          <Input type="number" min={1} dir="ltr" value={form.duration_value ?? ''} disabled={d}
            // empty while typing; saving is blocked until a positive number is entered
            onChange={(e) => set({ duration_value: e.target.value === '' ? (undefined as unknown as number) : Math.max(1, Math.round(Number(e.target.value)) || 1) })} />
        </Field>
        <Field label={t('workflow.unit')}>
          <Select value={form.duration_unit} disabled={d} onChange={(e) => set({ duration_unit: e.target.value as DurationUnit })}>
            {DURATION_UNITS.map((u) => <option key={u} value={u}>{t(`workflow.units.${u}`)}</option>)}
          </Select>
        </Field>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line px-3">
        <Toggle label={t('workflow.isRequired')} hint={t('workflow.isRequiredHint')} checked={!!form.is_required} disabled={d} onChange={(v) => set({ is_required: v })} />
        <Toggle label={t('workflow.clientActionRequired')} checked={!!form.client_action_required} disabled={d}
          onChange={(v) => set(v ? { client_action_required: true, is_client_visible: true } : { client_action_required: false })} />
        <Toggle label={t('workflow.isClientVisible')} checked={!!form.is_client_visible} disabled={d} onChange={(v) => set({ is_client_visible: v })} />
        <Toggle label={t('workflow.autoCreateTask')} checked={!!form.auto_create_task} disabled={d} onChange={(v) => set({ auto_create_task: v })} />
      </div>
      <Field label={t('workflow.completionLabel')}>
        <Input value={form.completion_status_label_ar ?? ''} disabled={d} onChange={(e) => set({ completion_status_label_ar: e.target.value || null })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('workflow.completionLabelEn')}>
          <Input dir="ltr" value={form.completion_status_label_en ?? ''} disabled={d} onChange={(e) => set({ completion_status_label_en: e.target.value || null })} />
        </Field>
        <Field label={t('workflow.setsStatus')}>
          <Select value={form.sets_request_status ?? ''} disabled={d} onChange={(e) => set({ sets_request_status: (e.target.value || null) as RequestStatus | null })}>
            <option value="">{t('workflow.noStatusChange')}</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(`workflow.requestStatuses.${s}`)}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  );
}

function AssignmentTab({ form, set, editable }: { form: StepPatch; set: (p: StepPatch) => void; editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const roles = useRoleOptions();
  const departments = useDepartmentOptions();
  const employees = useEmployeeOptions();
  const d = !editable;
  return (
    <div className="space-y-4">
      <Field label={t('workflow.assigneeType')}>
        <div className="grid grid-cols-2 gap-2">
          {ASSIGNEE_TYPES.map((a) => (
            <button key={a} type="button" disabled={d} onClick={() => set({ assignee_type: a as AssigneeType })}
              className={cn('h-10 rounded-[10px] border text-sm font-semibold disabled:opacity-60',
                form.assignee_type === a ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-white text-ink-2')}>
              {t(`workflow.assigneeTypes.${a}`)}
            </button>
          ))}
        </div>
      </Field>
      {form.assignee_type === 'department' && (
        <Field label={t('workflow.department')}>
          <Select value={form.assignee_department_id ?? ''} disabled={d} onChange={(e) => set({ assignee_department_id: e.target.value || null })}>
            <option value="">{t('workflow.pick')}</option>
            {(departments.data ?? []).map((o) => <option key={o.id} value={o.id}>{nameOf(o, lang)}</option>)}
          </Select>
        </Field>
      )}
      {form.assignee_type === 'role' && (
        <Field label={t('workflow.role')}>
          <Select value={form.assignee_role_id ?? ''} disabled={d} onChange={(e) => set({ assignee_role_id: e.target.value || null })}>
            <option value="">{t('workflow.pick')}</option>
            {(roles.data ?? []).map((o) => <option key={o.id} value={o.id}>{nameOf(o, lang)}</option>)}
          </Select>
        </Field>
      )}
      {form.assignee_type === 'employee' && (
        <Field label={t('workflow.employee')}>
          <Select value={form.assignee_employee_id ?? ''} disabled={d} onChange={(e) => set({ assignee_employee_id: e.target.value || null })}>
            <option value="">{t('workflow.pick')}</option>
            {(employees.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="rounded-xl border border-line px-3">
        <Toggle label={t('workflow.requiresApprovalToggle')} checked={!!form.requires_approval} disabled={d}
          onChange={(v) => set(v ? { requires_approval: true } : { requires_approval: false, approver_role_id: null })} />
      </div>
      {form.requires_approval && (
        <Field label={`${t('workflow.approverRole')} *`}>
          <Select value={form.approver_role_id ?? ''} disabled={d} onChange={(e) => set({ approver_role_id: e.target.value || null })}>
            <option value="">{t('workflow.pick')}</option>
            {(roles.data ?? []).map((o) => <option key={o.id} value={o.id}>{nameOf(o, lang)}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

// ---------------- Fields ----------------
interface FieldDraft {
  id?: string; label_ar: string; label_en: string; field_key: string; field_type: FieldType; optionsText: string;
  min: string; max: string; min_length: string; max_length: string; regex: string; is_required: boolean; filled_by: 'client' | 'staff';
  help_text: string; maps_to: string;
}
function toDraft(f?: RequiredField): FieldDraft {
  const v = f?.validation ?? {};
  return {
    id: f?.id, label_ar: f?.label_ar ?? '', label_en: f?.label_en ?? '', field_key: f?.field_key ?? '', field_type: f?.field_type ?? 'text',
    optionsText: (f?.options ?? []).map((o) => (o.value === o.label_ar ? o.label_ar : `${o.value} | ${o.label_ar}`)).join('\n'),
    min: v.min?.toString() ?? '', max: v.max?.toString() ?? '', min_length: v.min_length?.toString() ?? '', max_length: v.max_length?.toString() ?? '',
    regex: v.regex ?? '', is_required: f?.is_required ?? true, filled_by: f?.filled_by ?? 'client', help_text: f?.help_text ?? '', maps_to: f?.maps_to ?? '',
  };
}
function parseOptions(text: string): FieldOption[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const [a, b] = line.split('|').map((x) => x.trim());
    if (b) return { value: a!, label_ar: b };
    // Arabic-only labels have no latin slug -> option_1, option_2, …
    const v = slugKey(a!, 'option');
    return { value: v === 'option' ? `option_${i + 1}` : v, label_ar: a! };
  });
}
function num(v: string) {
  return v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
}

function FieldsEditor({ step, editable, onChanged }: { step: Step; editable: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [editing, setEditing] = useState<FieldDraft | null>(null);
  const [removing, setRemoving] = useState<RequiredField | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('required_fields').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRemoving(null);
      onChanged();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (editing) {
    return <FieldForm step={step} draft={editing} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />;
  }
  return (
    <div className="space-y-2">
      {step.fields.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t('workflow.noFields')}</p>}
      {step.fields.map((f) => {
        const Icon = FIELD_ICONS[f.field_type];
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <Icon className="size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{lang === 'en' ? f.label_en || f.label_ar : f.label_ar}</div>
              <div className="text-xs text-ink-3">
                {t(`workflow.fieldTypes.${f.field_type}`)}
                {f.options.length > 0 && ` · ${t('workflow.optionsCount', { count: f.options.length })}`}
                {f.validation.min != null && ` · ≥ ${f.validation.min}`}
                {f.validation.max != null && ` · ≤ ${f.validation.max}`}
              </div>
            </div>
            <Badge tone={f.filled_by === 'client' ? 'amber' : 'purple'} dot={false}>
              {f.filled_by === 'client' ? t('workflow.filledByClientBadge') : t('workflow.filledByStaffBadge')}
            </Badge>
            {f.is_required && <Badge tone="blue" dot={false}>{t('workflow.required')}</Badge>}
            {editable && (
              <>
                <button type="button" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" onClick={() => setEditing(toDraft(f))} aria-label={t('common.edit')}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => setRemoving(f)} aria-label={t('common.delete')}>
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>
        );
      })}
      {editable && (
        <button type="button" onClick={() => setEditing(toDraft())}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-200 text-sm font-semibold text-brand hover:bg-brand-50">
          <Plus className="size-4" /> {t('workflow.addField')}
        </button>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`${t('common.delete')}: ${removing?.label_ar ?? ''}`}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

function FieldForm({ step, draft, onDone, onCancel }: { step: Step; draft: FieldDraft; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState(draft);
  const set = (p: Partial<FieldDraft>) => setF((o) => ({ ...o, ...p }));
  const isChoice = f.field_type === 'select' || f.field_type === 'multiselect';
  const isNumeric = f.field_type === 'number' || f.field_type === 'money';
  const isText = f.field_type === 'text' || f.field_type === 'textarea';

  const save = useMutation({
    mutationFn: async () => {
      const validation: Record<string, unknown> = {};
      if (isNumeric) {
        if (num(f.min) !== undefined) validation.min = num(f.min);
        if (num(f.max) !== undefined) validation.max = num(f.max);
      }
      if (isText) {
        if (num(f.min_length) !== undefined) validation.min_length = num(f.min_length);
        if (num(f.max_length) !== undefined) validation.max_length = num(f.max_length);
        if (f.regex.trim()) validation.regex = f.regex.trim();
      }
      const payload = {
        label_ar: f.label_ar.trim(), label_en: f.label_en.trim() || null, field_type: f.field_type,
        options: (isChoice ? parseOptions(f.optionsText) : []) as unknown as Json, validation: validation as Json, is_required: f.is_required, filled_by: f.filled_by,
        help_text: f.help_text.trim() || null, maps_to: f.maps_to.trim() || null,
      };
      const { error } = f.id
        ? await supabase.from('required_fields').update(f.field_key.trim() ? { ...payload, field_key: f.field_key.trim() } : payload).eq('id', f.id)
        // an empty key is generated by the database from the English label
        : await supabase.from('required_fields').insert({ ...payload, field_key: f.field_key.trim(), workflow_step_id: step.id, sort_order: step.fields.length + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onDone();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <div className="space-y-4">
      <div className="text-sm font-bold text-navy">{f.id ? t('workflow.editField', { name: draft.label_ar }) : t('workflow.newField')}</div>
      <Field label={`${t('workflow.fieldLabel')} *`}>
        <Input value={f.label_ar} onChange={(e) => set({ label_ar: e.target.value })} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('workflow.fieldLabelEn')}>
          <Input dir="ltr" value={f.label_en} onChange={(e) => set({ label_en: e.target.value })} />
        </Field>
        <Field label={t('workflow.fieldKey')}>
          <Input dir="ltr" className="font-latin text-xs" value={f.field_key} placeholder={slugKey(f.label_en, 'field')}
            onChange={(e) => set({ field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </Field>
      </div>
      <Field label={t('workflow.fieldType')}>
        <Select value={f.field_type} onChange={(e) => set({ field_type: e.target.value as FieldType })}>
          {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`workflow.fieldTypes.${ft}`)}</option>)}
        </Select>
      </Field>
      {isChoice && (
        <Field label={`${t('workflow.options')} *`} hint={t('workflow.optionsHint')}>
          <Textarea className="min-h-28" value={f.optionsText} onChange={(e) => set({ optionsText: e.target.value })} />
        </Field>
      )}
      {isNumeric && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('workflow.min')}><Input type="number" dir="ltr" value={f.min} onChange={(e) => set({ min: e.target.value })} /></Field>
          <Field label={t('workflow.max')}><Input type="number" dir="ltr" value={f.max} onChange={(e) => set({ max: e.target.value })} /></Field>
        </div>
      )}
      {isText && (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('workflow.minLength')}><Input type="number" dir="ltr" value={f.min_length} onChange={(e) => set({ min_length: e.target.value })} /></Field>
          <Field label={t('workflow.maxLength')}><Input type="number" dir="ltr" value={f.max_length} onChange={(e) => set({ max_length: e.target.value })} /></Field>
          <Field label={t('workflow.regex')}><Input dir="ltr" className="font-latin text-xs" value={f.regex} onChange={(e) => set({ regex: e.target.value })} /></Field>
        </div>
      )}
      <Field label={t('workflow.filledBy')}>
        <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-muted p-1">
          {(['client', 'staff'] as const).map((who) => (
            <button key={who} type="button" onClick={() => set({ filled_by: who })}
              className={cn('h-9 rounded-lg text-sm font-semibold', f.filled_by === who ? 'bg-white text-navy shadow-sm' : 'text-ink-2')}>
              {who === 'client' ? t('workflow.filledByClient') : t('workflow.filledByStaff')}
            </button>
          ))}
        </div>
      </Field>
      <div className="rounded-xl border border-line px-3">
        <Toggle label={t('workflow.required')} checked={f.is_required} onChange={(v) => set({ is_required: v })} />
      </div>
      <Field label={t('workflow.helpText')}>
        <Input value={f.help_text} onChange={(e) => set({ help_text: e.target.value })} />
      </Field>
      <Field label={t('workflow.mapsTo')} hint={t('workflow.mapsToHint')}>
        <Input dir="ltr" className="font-latin text-xs" value={f.maps_to} onChange={(e) => set({ maps_to: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" loading={save.isPending}
          disabled={!f.label_ar.trim() || (isChoice && parseOptions(f.optionsText).length === 0)} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

// ---------------- Documents ----------------
function DocumentsEditor({ step, editable, onChanged }: { step: Step; editable: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const docTypes = useDocTypes();
  const [adding, setAdding] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const used = new Set(step.docs.map((d) => d.document_type_id));
  const available = (docTypes.data ?? []).filter((d) => d.is_active && !used.has(d.id));

  const add = useMutation({
    mutationFn: async (typeId: string) => {
      const { error } = await supabase.from('required_documents').insert({ workflow_step_id: step.id, document_type_id: typeId, sort_order: step.docs.length + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding('');
      onChanged();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<RequiredDocument, 'is_required' | 'instructions_ar' | 'max_files'>> }) => {
      const { error } = await supabase.from('required_documents').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: onChanged,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('required_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: onChanged,
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold text-ink-2">{t('workflow.documents')}</div>
      {step.docs.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t('workflow.noDocs')}</p>}
      {step.docs.map((d) => (
        <div key={d.id} className="rounded-xl border border-line">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <FileText className="size-5 shrink-0 text-brand" />
            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <div className="truncate text-sm font-semibold">{nameOf(d.type, lang)}</div>
              <div className="ltr text-xs text-ink-3">
                {(d.type?.allowed_mime ?? []).map((m) => m.split('/')[1]?.toUpperCase()).join(' / ')} · {t('workflow.maxSize', { size: d.type?.max_size_mb })}
              </div>
            </button>
            <Badge tone={d.is_required ? 'blue' : 'gray'} dot={false}>{d.is_required ? t('workflow.required') : t('workflow.optionalBadge')}</Badge>
            {editable && (
              <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => remove.mutate(d.id)} aria-label={t('common.delete')}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          {expanded === d.id && (
            <DocumentDetails doc={d} editable={editable} saving={update.isPending} onSave={(patch) => update.mutate({ id: d.id, patch })} />
          )}
        </div>
      ))}
      {editable && (
        <div className="flex gap-2 pt-1">
          <Select className="h-10 flex-1" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={t('workflow.addDocument')}>
            <option value="">{t('workflow.chooseDoc')}</option>
            {available.map((d) => <option key={d.id} value={d.id}>{nameOf(d, lang)}</option>)}
          </Select>
          <Button variant="primary" className="h-10" disabled={!adding} loading={add.isPending} onClick={() => add.mutate(adding)}>
            <Plus className="size-4" /> {t('workflow.addDocument')}
          </Button>
        </div>
      )}
      {editable && !creating && (
        <button type="button" onClick={() => setCreating(true)} className="text-xs font-semibold text-brand">+ {t('workflow.newDocType')}</button>
      )}
      {creating && (
        <NewDocTypeForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['document_types'] });
            add.mutate(id);
          }}
        />
      )}
    </div>
  );
}

function DocumentDetails({ doc, editable, saving, onSave }: {
  doc: RequiredDocument; editable: boolean; saving: boolean;
  onSave: (p: Partial<Pick<RequiredDocument, 'is_required' | 'instructions_ar' | 'max_files'>>) => void;
}) {
  const { t } = useTranslation();
  const [instr, setInstr] = useState(doc.instructions_ar ?? '');
  const [maxFiles, setMaxFiles] = useState(String(doc.max_files));
  return (
    <div className="space-y-3 border-t border-line px-3 py-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm">{t('workflow.required')}</span>
        <Switch checked={doc.is_required} disabled={!editable} onChange={(v) => onSave({ is_required: v })} label={t('workflow.required')} />
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label={t('workflow.docInstructions')}>
          <Input value={instr} disabled={!editable} onChange={(e) => setInstr(e.target.value)} />
        </Field>
        <Field label={t('workflow.maxFiles')}>
          <Input type="number" min={1} max={20} dir="ltr" value={maxFiles} disabled={!editable} onChange={(e) => setMaxFiles(e.target.value)} />
        </Field>
      </div>
      {editable && (
        <Button size="sm" loading={saving}
          disabled={instr === (doc.instructions_ar ?? '') && maxFiles === String(doc.max_files)}
          onClick={() => onSave({ instructions_ar: instr.trim() || null, max_files: Math.min(20, Math.max(1, Number(maxFiles) || 1)) })}>
          {t('common.save')}
        </Button>
      )}
    </div>
  );
}

function NewDocTypeForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name_ar: '', name_en: '', max_size_mb: '10', has_expiry: false });
  const create = useMutation({
    mutationFn: async () => {
      const key = slugKey(f.name_en, 'doc') === 'doc' ? `doc_${Date.now().toString(36)}` : slugKey(f.name_en, 'doc');
      const { data, error } = await supabase.from('document_types').insert({
        key, name_ar: f.name_ar.trim(), name_en: f.name_en.trim() || null,
        max_size_mb: Math.min(50, Math.max(1, Number(f.max_size_mb) || 10)), has_expiry: f.has_expiry, sort_order: 50,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: onCreated,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Section>
      <div className="text-sm font-bold text-navy">{t('workflow.newDocType')}</div>
      <Field label={`${t('workflow.docTypeName')} *`}>
        <Input value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('workflow.docTypeNameEn')}>
          <Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
        <Field label={t('workflow.maxSizeMb')}>
          <Input type="number" dir="ltr" min={1} max={50} value={f.max_size_mb} onChange={(e) => setF({ ...f, max_size_mb: e.target.value })} />
        </Field>
      </div>
      <Toggle label={t('workflow.hasExpiry')} checked={f.has_expiry} onChange={(v) => setF({ ...f, has_expiry: v })} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={create.isPending} disabled={f.name_ar.trim().length < 2} onClick={() => create.mutate()}>{t('common.create')}</Button>
        <Button size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">{children}</div>;
}
