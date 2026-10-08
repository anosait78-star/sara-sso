import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FolderPlus, Info, Layers, Plus, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Switch, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/crm';
import {
  draftVersion, ICON_NAMES, iconOf, nameOf, publishedVersion, SERVICE_MODULES, SERVICE_SELECT, slugKey, useCategories,
  type Category, type Service, type ServiceModule,
} from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

export function useServices() {
  return useQuery({
    queryKey: ['services', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select(SERVICE_SELECT).order('sort_order').order('created_at');
      if (error) throw error;
      return data as unknown as Service[];
    },
  });
}

/** Activate / stop a service (the database refuses activation without a published workflow). */
export function useToggleService() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('services').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['services'] }),
    onError: (e) => toast.error(t(errorKey(e))),
  });
}

export function ServicesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const categories = useCategories();
  const list = useServices();
  const toggle = useToggleService();
  const [tab, setTab] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState<Category | 'new' | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of list.data ?? []) m.set(s.category_id, (m.get(s.category_id) ?? 0) + 1);
    return m;
  }, [list.data]);
  const rows = (list.data ?? []).filter((s) => tab === 'all' || s.category_id === tab);
  const canEdit = can('services_config', 'edit');

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        crumb={t('services.crumb')}
        title={t('services.title')}
        actions={
          <>
            {can('services_config', 'create') && (
              <Button onClick={() => setCategory('new')}>
                <FolderPlus className="size-4" /> {t('services.newCategory')}
              </Button>
            )}
            {can('services_config', 'create') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> {t('services.new')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')} label={t('services.all')} count={list.data?.length ?? 0} />
        {(categories.data ?? []).map((c) => {
          const Icon = iconOf(c.icon);
          return (
            <TabButton
              key={c.id}
              active={tab === c.id}
              onClick={() => setTab(c.id)}
              onDoubleClick={canEdit ? () => setCategory(c) : undefined}
              label={nameOf(c, lang)}
              count={counts.get(c.id) ?? 0}
              icon={<Icon className="size-4" />}
              muted={!c.is_active}
            />
          );
        })}
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={<Layers className="size-8" />} title={t('services.empty')} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((s) => (
            <ServiceCard key={s.id} s={s} lang={lang} canEdit={canEdit} onToggle={(active) => toggle.mutate({ id: s.id, active })} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-xs text-navy">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" />
        {t('services.stopHint')}
      </div>

      <ServiceFormDrawer open={creating} onOpenChange={setCreating} defaultCategory={tab === 'all' ? undefined : tab} />
      <CategoryDrawer category={category} onClose={() => setCategory(null)} />
    </div>
  );
}

function TabButton({ active, onClick, onDoubleClick, label, count, icon, muted }: {
  active: boolean; onClick: () => void; onDoubleClick?: () => void; label: string; count: number; icon?: React.ReactNode; muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', active ? 'border-brand text-brand' : 'border-transparent text-ink-2', muted && 'opacity-60')}
    >
      {icon}
      {label}
      <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{count}</span>
    </button>
  );
}

function ServiceCard({ s, lang, canEdit, onToggle }: { s: Service; lang: 'ar' | 'en'; canEdit: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useTranslation();
  const Icon = iconOf(s.icon);
  const pub = publishedVersion(s);
  const draft = draftVersion(s);
  return (
    <Card className={cn('flex flex-col p-4', !s.is_active && 'bg-[#fbfcfe]')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', s.is_active ? 'bg-brand-50 text-brand' : 'bg-muted text-ink-3')}>
          <Icon className="size-5" />
        </span>
        <Link to="/services/$id" params={{ id: s.id }} className="min-w-0 flex-1">
          <div className="font-bold leading-snug text-navy hover:text-brand">{nameOf(s, lang)}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            {nameOf(s.category, lang)} · <span className="ltr font-latin">{s.code}</span>
          </div>
        </Link>
        <Switch checked={s.is_active} disabled={!canEdit || (!s.is_active && !pub)} onChange={onToggle} label={t('services.isActive')} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pub ? (
          <Badge tone="blue" dot={false}><span className="font-latin">Workflow v{pub.version}</span></Badge>
        ) : (
          <Badge tone="amber" dot={false}>{t('services.noWorkflow')}</Badge>
        )}
        {pub && <Badge tone="gray" dot={false}>{t('services.steps', { count: pub.steps?.[0]?.count ?? 0 })}</Badge>}
        {draft && <Badge tone="purple" dot={false}>{t('services.draftOpen', { version: draft.version })}</Badge>}
        {s.is_client_visible ? <Badge tone="sky" dot={false}>{t('services.clientVisible')}</Badge> : <Badge tone="gray" dot={false}>{t('services.internal')}</Badge>}
        {!s.is_active && <Badge tone="red">{t('services.inactive')}</Badge>}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs">
        <span className="text-ink-3">{s.default_price != null ? `${Number(s.default_price).toLocaleString('en')} ${s.currency}` : '—'}</span>
        <Link to="/services/$id/workflow" params={{ id: s.id }} className="inline-flex items-center gap-1 font-semibold text-brand">
          <Workflow className="size-3.5" /> {t('services.openBuilder')}
        </Link>
      </div>
    </Card>
  );
}

// ---------- Create / edit service ----------
export interface ServiceForm {
  name_ar: string; name_en: string; code: string; category_id: string; module_key: ServiceModule; description_ar: string; description_en: string;
  icon: string; default_price: string; is_client_visible: boolean; allow_client_request: boolean;
}
export function toServiceForm(s?: Service | null, category?: string): ServiceForm {
  return {
    name_ar: s?.name_ar ?? '', name_en: s?.name_en ?? '', code: s?.code ?? '', category_id: s?.category_id ?? category ?? '',
    module_key: s?.module_key ?? 'generic', description_ar: s?.description_ar ?? '', description_en: s?.description_en ?? '',
    icon: s?.icon ?? 'file-text', default_price: s?.default_price != null ? String(s.default_price) : '',
    is_client_visible: s?.is_client_visible ?? true, allow_client_request: s?.allow_client_request ?? true,
  };
}
export function servicePayload(f: ServiceForm) {
  return {
    name_ar: f.name_ar.trim(), name_en: f.name_en.trim() || null, code: f.code.trim().toUpperCase(), category_id: f.category_id,
    module_key: f.module_key, description_ar: f.description_ar.trim() || null, description_en: f.description_en.trim() || null, icon: f.icon,
    default_price: f.default_price === '' ? null : Number(f.default_price), is_client_visible: f.is_client_visible, allow_client_request: f.allow_client_request,
  };
}
export function serviceFormErrors(f: ServiceForm) {
  const e: Partial<Record<keyof ServiceForm, string>> = {};
  if (f.name_ar.trim().length < 2) e.name_ar = 'required';
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(f.code.trim().toUpperCase())) e.code = 'code';
  if (!f.category_id) e.category_id = 'required';
  if (f.default_price !== '' && !(Number(f.default_price) >= 0)) e.default_price = 'number';
  return e;
}

/** Shared form body (create drawer + service details page). */
export function ServiceFields({ f, set, errors, disabled }: {
  f: ServiceForm; set: (patch: Partial<ServiceForm>) => void; errors: Partial<Record<keyof ServiceForm, string>>; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const categories = useCategories();
  const Icon = iconOf(f.icon);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={`${t('services.nameAr')} *`} error={errors.name_ar && t('common.required')}>
        <Input value={f.name_ar} disabled={disabled} onChange={(e) => set({ name_ar: e.target.value })} />
      </Field>
      <Field label={t('services.nameEn')}>
        <Input dir="ltr" value={f.name_en} disabled={disabled} onChange={(e) => set({ name_en: e.target.value })} />
      </Field>
      <Field label={`${t('services.category')} *`} error={errors.category_id && t('common.required')}>
        <Select value={f.category_id} disabled={disabled} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">{t('workflow.pick')}</option>
          {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{nameOf(c, lang)}</option>)}
        </Select>
      </Field>
      <Field label={t('services.module')}>
        <Select value={f.module_key} disabled={disabled} onChange={(e) => set({ module_key: e.target.value as ServiceModule })}>
          {SERVICE_MODULES.map((m) => <option key={m} value={m}>{t(`services.modules.${m}`)}</option>)}
        </Select>
      </Field>
      <Field label={`${t('services.code')} *`} hint={t('services.codeHint')} error={errors.code && t('services.codeHint')}>
        <Input dir="ltr" className="font-latin uppercase" value={f.code} disabled={disabled} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label={t('services.price')} error={errors.default_price && t('errors.generic')}>
          <Input type="number" min={0} dir="ltr" value={f.default_price} disabled={disabled} onChange={(e) => set({ default_price: e.target.value })} />
        </Field>
        <Field label={t('services.icon')}>
          <div className="flex items-center gap-2">
            <span className="grid size-11 place-items-center rounded-[10px] border border-line text-brand"><Icon className="size-5" /></span>
            <Select className="w-32" value={f.icon} disabled={disabled} onChange={(e) => set({ icon: e.target.value })} aria-label={t('services.icon')}>
              {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
        </Field>
      </div>
      <Field label={t('services.descriptionAr')} className="md:col-span-2">
        <Textarea value={f.description_ar} disabled={disabled} onChange={(e) => set({ description_ar: e.target.value })} />
      </Field>
      <Field label={t('services.descriptionEn')} className="md:col-span-2">
        <Textarea dir="ltr" value={f.description_en} disabled={disabled} onChange={(e) => set({ description_en: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-3 md:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.is_client_visible} disabled={disabled} onChange={(v) => set({ is_client_visible: v })} />
          {t('services.isClientVisible')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.allow_client_request} disabled={disabled} onChange={(v) => set({ allow_client_request: v })} />
          {t('services.allowClientRequest')}
        </label>
      </div>
    </div>
  );
}

function ServiceFormDrawer({ open, onOpenChange, defaultCategory }: { open: boolean; onOpenChange: (v: boolean) => void; defaultCategory?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState<ServiceForm>(() => toServiceForm(null, defaultCategory));
  const [tried, setTried] = useState(false);
  const errors = tried ? serviceFormErrors(f) : {};

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('services').insert(servicePayload(f)).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t('services.created'));
      void qc.invalidateQueries({ queryKey: ['services'] });
      onOpenChange(false);
      void navigate({ to: '/services/$id/workflow', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const submit = () => {
    setTried(true);
    if (Object.keys(serviceFormErrors(f)).length === 0) save.mutate();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (v) { setF(toServiceForm(null, defaultCategory)); setTried(false); }
        onOpenChange(v);
      }}
      title={t('services.new')}
      width="lg"
      footer={
        <>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{t('common.create')}</Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </>
      }
    >
      <ServiceFields f={f} set={(p) => setF((o) => ({ ...o, ...p }))} errors={errors} />
      <p className="mt-4 text-xs text-ink-3">{t('services.needsWorkflowHint')}</p>
    </Drawer>
  );
}

function CategoryDrawer({ category, onClose }: { category: Category | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isNew = category === 'new';
  const current = category && category !== 'new' ? category : null;
  const [f, setF] = useState({ name_ar: '', name_en: '', key: '', icon: 'file-text', is_active: true, sort_order: '0' });
  useEffect(() => {
    if (!category) return;
    setF({ name_ar: current?.name_ar ?? '', name_en: current?.name_en ?? '', key: current?.key ?? '', icon: current?.icon ?? 'file-text', is_active: current?.is_active ?? true, sort_order: String(current?.sort_order ?? 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name_ar: f.name_ar.trim(), name_en: f.name_en.trim() || null, icon: f.icon, is_active: f.is_active, sort_order: Number(f.sort_order) || 0 };
      const { error } = current
        ? await supabase.from('service_categories').update(payload).eq('id', current.id)
        : await supabase.from('service_categories').insert({ ...payload, key: f.key || slugKey(f.name_en, 'category') });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['service_categories'] });
      onClose();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <Drawer
      open={!!category}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={isNew ? t('services.newCategory') : t('services.editCategory')}
      footer={
        <>
          <Button variant="primary" loading={save.isPending} disabled={f.name_ar.trim().length < 2} onClick={() => save.mutate()}>{t('common.save')}</Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`${t('services.categoryName')} *`}>
          <Input value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
        </Field>
        <Field label={t('services.nameEn')}>
          <Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
        {isNew && (
          <Field label={t('services.categoryKey')}>
            <Input dir="ltr" className="font-latin" value={f.key} placeholder={slugKey(f.name_en, 'category')} onChange={(e) => setF({ ...f, key: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('services.icon')}>
            <Select value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })}>
              {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label={t('services.sortOrder')}>
            <Input type="number" dir="ltr" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
          {t('services.activeShort')}
        </label>
      </div>
    </Drawer>
  );
}

