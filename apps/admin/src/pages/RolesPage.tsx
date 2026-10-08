import { ACTION_LABELS, MODULE_LABELS, PERMISSION_ACTIONS, PERMISSION_MODULES, SCOPE_LABELS, type PermissionAction, type PermissionModule, type PermissionScope } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Info, Lock, Plus, Shield, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, ConfirmDialog, Drawer, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

interface Role { id: string; key: string; name_ar: string; name_en: string | null; description: string | null; is_system: boolean }
interface Perm { id: string; module: string; action: string; description_ar: string | null }
type Grants = Map<string, PermissionScope>; // "module.action" -> scope

/** Actions where record scope matters; others are always "all". */
const SCOPED: PermissionAction[] = ['view', 'edit', 'delete', 'approve', 'assign'];

export function RolesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<{ copyFrom: Role | null } | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const roles = useQuery({
    queryKey: ['roles', 'full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, key, name_ar, name_en, description, is_system').order('created_at');
      if (error) throw error;
      return data as Role[];
    },
  });
  const perms = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('id, module, action, description_ar').order('sort_order');
      if (error) throw error;
      return data as Perm[];
    },
  });
  const rolePerms = useQuery({
    queryKey: ['role_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('role_id, scope, permission:permissions(module, action)');
      if (error) throw error;
      return data as unknown as { role_id: string; scope: PermissionScope; permission: { module: string; action: string } }[];
    },
  });
  const memberCounts = useQuery({
    queryKey: ['employees', 'role-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('role_id');
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data) m.set(r.role_id, (m.get(r.role_id) ?? 0) + 1);
      return m;
    },
  });

  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data.find((r) => !r.is_system)?.id ?? roles.data[0]!.id);
  }, [roles.data, selectedId]);

  const grantsByRole = useMemo(() => {
    const m = new Map<string, Grants>();
    for (const rp of rolePerms.data ?? []) {
      if (!m.has(rp.role_id)) m.set(rp.role_id, new Map());
      m.get(rp.role_id)!.set(`${rp.permission.module}.${rp.permission.action}`, rp.scope);
    }
    return m;
  }, [rolePerms.data]);

  const del = useMutation({
    mutationFn: async (role: Role) => {
      const { error } = await supabase.from('roles').delete().eq('id', role.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      setToDelete(null);
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;
  const name = (r: Role) => (lang === 'en' ? r.name_en ?? r.name_ar : r.name_ar);

  if (roles.isLoading || perms.isLoading || rolePerms.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title={t('roles.title')}
        actions={can('roles', 'create') && (
          <>
            {selected && !selected.is_system && (
              <Button onClick={() => setCreateOpen({ copyFrom: selected })}><Copy className="size-4" /> {t('roles.copyRole')}</Button>
            )}
            <Button variant="primary" onClick={() => setCreateOpen({ copyFrom: null })}><Plus className="size-4" /> {t('roles.newRole')}</Button>
          </>
        )}
      />
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* role list: horizontal chips on mobile/tablet, side list on desktop */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {roles.data?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm lg:w-full',
                r.id === selectedId ? 'border-brand bg-brand-50 font-bold text-brand' : 'border-line bg-white text-ink',
              )}
            >
              {r.is_system ? <Lock className="size-4 shrink-0" /> : <Shield className="size-4 shrink-0" />}
              <span className="truncate">{name(r)}</span>
              <span className="ms-auto whitespace-nowrap text-[11px] font-medium text-ink-3">{t('roles.employees', { count: memberCounts.data?.get(r.id) ?? 0 })}</span>
            </button>
          ))}
        </div>
        {selected && perms.data && (
          <RoleEditor
            key={selected.id}
            role={selected}
            perms={perms.data}
            initial={grantsByRole.get(selected.id) ?? new Map()}
            onDelete={can('roles', 'delete') && !selected.is_system ? () => setToDelete(selected) : undefined}
          />
        )}
      </div>

      <CreateRoleDrawer
        state={createOpen}
        initialGrants={createOpen?.copyFrom ? grantsByRole.get(createOpen.copyFrom.id) ?? new Map() : new Map()}
        onClose={() => setCreateOpen(null)}
        onCreated={(id) => { setSelectedId(id); setCreateOpen(null); }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={t('roles.deleteConfirm', { name: toDelete ? name(toDelete) : '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete)}
      />
    </div>
  );
}

function RoleEditor({ role, perms, initial, onDelete }: { role: Role; perms: Perm[]; initial: Grants; onDelete?: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('roles', 'edit') && !role.is_system;
  const [grants, setGrants] = useState<Grants>(() => new Map(initial));
  const dirty = useMemo(() => {
    if (grants.size !== initial.size) return true;
    for (const [k, v] of grants) if (initial.get(k) !== v) return true;
    return false;
  }, [grants, initial]);

  const available = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of perms) {
      if (!m.has(p.module)) m.set(p.module, new Set());
      m.get(p.module)!.add(p.action);
    }
    return m;
  }, [perms]);
  const modules = PERMISSION_MODULES.filter((m) => available.has(m));
  const actions = PERMISSION_ACTIONS.filter((a) => perms.some((p) => p.action === a));

  const save = useMutation({
    mutationFn: async () => {
      const payload = [...grants].map(([k, scope]) => {
        const [module, action] = k.split('.');
        return { module, action, scope };
      });
      const { error } = await supabase.rpc('set_role_permissions', { p_role_id: role.id, p_grants: payload });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('common.saved'));
      await qc.invalidateQueries({ queryKey: ['role_permissions'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const isOn = (m: string, a: string) => role.is_system || grants.has(`${m}.${a}`);
  function toggle(m: string, a: string) {
    const k = `${m}.${a}`;
    const next = new Map(grants);
    if (next.has(k)) next.delete(k);
    else next.set(k, 'all');
    setGrants(next);
  }
  function setScope(m: string, a: string, s: PermissionScope) {
    const next = new Map(grants);
    next.set(`${m}.${a}`, s);
    setGrants(next);
  }

  const cell = (m: string, a: string) => {
    if (!available.get(m)?.has(a)) return <span className="text-line">—</span>;
    const on = isOn(m, a);
    const scope = role.is_system ? 'all' : grants.get(`${m}.${a}`);
    return (
      <div className="flex flex-col items-center gap-1">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-brand)]"
          checked={on}
          disabled={!editable}
          onChange={() => toggle(m, a)}
          aria-label={`${m}.${a}`}
        />
        {on && SCOPED.includes(a as PermissionAction) && (
          editable ? (
            <select
              className="h-6 rounded-md border border-brand-100 bg-brand-50 px-1 text-[10.5px] font-semibold text-brand"
              value={scope}
              onChange={(e) => setScope(m, a, e.target.value as PermissionScope)}
            >
              {(['all', 'department', 'own'] as PermissionScope[]).map((s) => <option key={s} value={s}>{SCOPE_LABELS[s][lang]}</option>)}
            </select>
          ) : (
            <span className="text-[10.5px] font-semibold text-brand">{SCOPE_LABELS[scope ?? 'all'][lang]}</span>
          )
        )}
      </div>
    );
  };

  return (
    <Card className="min-w-0 flex-1 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-navy">{lang === 'en' ? role.name_en ?? role.name_ar : role.name_ar}</span>
            {role.is_system && <Badge tone="navy" dot={false}><Lock className="size-3" /> {t('roles.system')}</Badge>}
            <span className="ltr text-xs text-ink-3">{role.key}</span>
          </div>
          {role.description && <div className="text-xs text-ink-2">{role.description}</div>}
        </div>
        {dirty && <Badge tone="amber">{t('roles.unsaved')}</Badge>}
        {onDelete && <Button size="sm" variant="danger" onClick={onDelete}><Trash2 className="size-4" /> {t('roles.deleteRole')}</Button>}
        {editable && <Button size="sm" variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>{t('roles.saveChanges')}</Button>}
      </div>
      {(role.is_system || !editable) && (
        <div className="flex items-center gap-2 bg-canvas px-4 py-2 text-xs text-ink-2">
          <Info className="size-4 shrink-0" /> {role.is_system ? t('roles.systemNote') : t('roles.readOnly')}
        </div>
      )}

      {/* desktop/tablet matrix */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs text-ink-2">
              <th className="sticky start-0 bg-muted px-4 py-2.5 text-start font-semibold">{t('roles.module')}</th>
              {actions.map((a) => <th key={a} className="px-2 py-2.5 text-center font-semibold">{ACTION_LABELS[a][lang]}</th>)}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m} className="border-t border-line">
                <td className="sticky start-0 bg-white px-4 py-2 font-semibold whitespace-nowrap">{MODULE_LABELS[m as PermissionModule][lang]}</td>
                {actions.map((a) => <td key={a} className="px-2 py-2 text-center align-top">{cell(m, a)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile: per-module list */}
      <div className="divide-y divide-line md:hidden">
        {modules.map((m) => (
          <div key={m} className="px-4 py-3">
            <div className="mb-2 text-sm font-bold text-navy">{MODULE_LABELS[m as PermissionModule][lang]}</div>
            <div className="grid grid-cols-2 gap-2">
              {actions.filter((a) => available.get(m)?.has(a)).map((a) => (
                <div key={a} className={cn('flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2', isOn(m, a) ? 'border-brand-100 bg-brand-50' : 'border-line')}>
                  <span className="text-xs font-semibold">{ACTION_LABELS[a][lang]}</span>
                  {cell(m, a)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line bg-canvas px-4 py-2.5 text-xs text-ink-2">{t('roles.scopeNote')}</div>
    </Card>
  );
}

function CreateRoleDrawer({ state, initialGrants, onClose, onCreated }: { state: { copyFrom: Role | null } | null; initialGrants: Grants; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ key: '', name_ar: '', name_en: '', description: '' });
  const keyValid = /^[a-z][a-z0-9_]{2,40}$/.test(form.key);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .insert({ key: form.key, name_ar: form.name_ar.trim(), name_en: form.name_en.trim() || null, description: form.description.trim() || null })
        .select('id')
        .single();
      if (error) throw error;
      if (state?.copyFrom && initialGrants.size) {
        const payload = [...initialGrants].map(([k, scope]) => ({ module: k.split('.')[0], action: k.split('.')[1], scope }));
        const { error: e2 } = await supabase.rpc('set_role_permissions', { p_role_id: data.id, p_grants: payload });
        if (e2) throw e2;
      }
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success(t('common.saved'));
      await qc.invalidateQueries({ queryKey: ['roles'] });
      await qc.invalidateQueries({ queryKey: ['role_permissions'] });
      setForm({ key: '', name_ar: '', name_en: '', description: '' });
      onCreated(id);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <Drawer
      open={!!state}
      onOpenChange={(v) => !v && onClose()}
      title={state?.copyFrom ? `${t('roles.copyRole')}: ${state.copyFrom.name_ar}` : t('roles.newRole')}
      footer={<><Button variant="primary" disabled={!keyValid || form.name_ar.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>{t('common.create')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}
    >
      <div className="space-y-4">
        <Field label={`${t('roles.nameAr')} *`}>
          <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        </Field>
        <Field label={t('roles.nameEn')}>
          <Input dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </Field>
        <Field label={`${t('roles.key')} *`} hint={t('roles.keyHint')} error={form.key && !keyValid ? t('roles.keyHint') : undefined}>
          <Input dir="ltr" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </Field>
        <Field label={t('roles.description')}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  );
}
