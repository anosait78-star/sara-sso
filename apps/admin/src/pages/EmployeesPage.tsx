import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building, Copy, MailPlus, Pencil, Plus, RotateCcw, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Switch } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { invokeFunction, supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Status = 'invited' | 'active' | 'suspended';
interface EmployeeRow {
  id: string;
  employee_no: string | null;
  job_title: string | null;
  status: Status;
  role_id: string;
  department_id: string | null;
  profile_id: string;
  profile: { full_name: string; email: string | null } | null;
  role: { id: string; key: string; name_ar: string; name_en: string | null } | null;
  department: { id: string; name_ar: string } | null;
}
interface RoleOpt { id: string; key: string; name_ar: string; name_en: string | null }
interface Dept { id: string; name_ar: string; name_en: string | null; is_active: boolean }

const statusTone: Record<Status, 'green' | 'amber' | 'gray'> = { active: 'green', invited: 'amber', suspended: 'gray' };

function useLookups() {
  const roles = useQuery({
    queryKey: ['roles', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, key, name_ar, name_en').order('created_at');
      if (error) throw error;
      return data as RoleOpt[];
    },
  });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, name_ar, name_en, is_active').order('created_at');
      if (error) throw error;
      return data as Dept[];
    },
  });
  return { roles: roles.data ?? [], departments: departments.data ?? [] };
}

export function EmployeesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const { can } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('employees.title')}
        actions={can('employees', 'create') && tab === 'employees' && (
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <MailPlus className="size-4" /> {t('employees.invite')}
          </Button>
        )}
      />
      <div className="flex gap-1 border-b border-line">
        {(['employees', 'departments'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}
          >
            {t(k === 'employees' ? 'employees.tabEmployees' : 'employees.tabDepartments')}
          </button>
        ))}
      </div>
      {tab === 'employees' ? <EmployeesList /> : <DepartmentsTab />}
      <InviteDrawer open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function EmployeesList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const { can, staff } = useAuth();
  const qc = useQueryClient();
  const { departments } = useLookups();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | Status>('');
  const [dept, setDept] = useState('');
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [confirm, setConfirm] = useState<{ row: EmployeeRow; next: 'active' | 'suspended' } | null>(null);

  const list = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_no, job_title, status, role_id, department_id, profile_id, profile:profiles(full_name, email), role:roles(id, key, name_ar, name_en), department:departments(id, name_ar)')
        .order('created_at');
      if (error) throw error;
      return data as unknown as EmployeeRow[];
    },
  });

  const statusMut = useMutation({
    mutationFn: (p: { employee_id: string; status: 'active' | 'suspended' }) => invokeFunction('set-employee-status', p),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['employees'] });
      setConfirm(null);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((r) =>
      (!status || r.status === status) &&
      (!dept || r.department_id === dept) &&
      (!term || [r.profile?.full_name, r.profile?.email, r.employee_no, r.job_title].some((v) => v?.toLowerCase().includes(term))),
    );
  }, [list.data, q, status, dept]);

  const canEdit = can('employees', 'edit');
  const roleName = (r: EmployeeRow) => (lang === 'en' ? r.role?.name_en ?? r.role?.name_ar : r.role?.name_ar) ?? '—';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
          <Input className="h-10 ps-9" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-10 w-auto" value={status} onChange={(e) => setStatus(e.target.value as '' | Status)} aria-label={t('employees.status')}>
          <option value="">{t('employees.status')}: {t('common.all')}</option>
          {(['active', 'invited', 'suspended'] as Status[]).map((s) => <option key={s} value={s}>{t(`employees.statuses.${s}`)}</option>)}
        </Select>
        <Select className="h-10 w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t('employees.department')}>
          <option value="">{t('employees.department')}: {t('common.all')}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{lang === 'en' ? d.name_en ?? d.name_ar : d.name_ar}</option>)}
        </Select>
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={<Users className="size-8" />} title={t('employees.empty')} /></Card>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-start text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.name')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.number')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.department')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.role')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('employees.jobTitle')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const self = r.id === staff?.employee_id;
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.profile?.full_name ?? ''} size="sm" />
                          <div className="min-w-0">
                            <div className="font-semibold">{r.profile?.full_name}</div>
                            <div className="ltr truncate text-xs text-ink-3">{r.profile?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="ltr px-4 py-3 text-ink-2">{r.employee_no}</td>
                      <td className="px-4 py-3">{r.department?.name_ar ?? t('employees.noDepartment')}</td>
                      <td className="px-4 py-3"><Badge tone={r.role?.key === 'super_admin' ? 'navy' : 'blue'} dot={false}>{roleName(r)}</Badge></td>
                      <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{r.job_title}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[r.status]}>{t(`employees.statuses.${r.status}`)}</Badge></td>
                      <td className="px-4 py-3">
                        {canEdit && !self && (
                          <RowActions row={r} onEdit={() => setEditing(r)} onStatus={(next) => setConfirm({ row: r, next })} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => {
              const self = r.id === staff?.employee_id;
              return (
                <Card key={r.id} className="flex items-center gap-3 p-3">
                  <Avatar name={r.profile?.full_name ?? ''} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.profile?.full_name}</div>
                    <div className="truncate text-xs text-ink-2">{roleName(r)} · {r.department?.name_ar ?? t('employees.noDepartment')}</div>
                    <div className="mt-1"><Badge tone={statusTone[r.status]}>{t(`employees.statuses.${r.status}`)}</Badge></div>
                  </div>
                  {canEdit && !self && <RowActions row={r} onEdit={() => setEditing(r)} onStatus={(next) => setConfirm({ row: r, next })} />}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <EditEmployeeDrawer row={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.next === 'suspended' ? t('employees.suspendConfirm', { name: confirm.row.profile?.full_name }) : `${t('employees.reactivate')}: ${confirm?.row.profile?.full_name ?? ''}`}
        confirmLabel={confirm?.next === 'suspended' ? t('employees.suspend') : t('employees.reactivate')}
        cancelLabel={t('common.cancel')}
        danger={confirm?.next === 'suspended'}
        loading={statusMut.isPending}
        onConfirm={() => confirm && statusMut.mutate({ employee_id: confirm.row.id, status: confirm.next })}
      />
    </>
  );
}

function RowActions({ row, onEdit, onStatus }: { row: EmployeeRow; onEdit: () => void; onStatus: (next: 'active' | 'suspended') => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t('employees.edit')}><Pencil className="size-4" /></Button>
      {row.status === 'suspended' ? (
        <Button size="sm" variant="ghost" onClick={() => onStatus('active')} title={t('employees.reactivate')}><RotateCcw className="size-4" /></Button>
      ) : row.status === 'active' ? (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => onStatus('suspended')} title={t('employees.suspend')}><Ban className="size-4" /></Button>
      ) : null}
    </div>
  );
}

function EditEmployeeDrawer({ row, onClose }: { row: EmployeeRow | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const qc = useQueryClient();
  const { roles, departments } = useLookups();
  const [form, setForm] = useState<{ role_id: string; department_id: string; job_title: string } | null>(null);
  const current = row && (form ?? { role_id: row.role_id, department_id: row.department_id ?? '', job_title: row.job_title ?? '' });

  const save = useMutation({
    mutationFn: async () => {
      if (!row || !current) return;
      const { error } = await supabase
        .from('employees')
        .update({ role_id: current.role_id, department_id: current.department_id || null, job_title: current.job_title || null })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['employees'] });
      setForm(null);
      onClose();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <Drawer
      open={!!row}
      onOpenChange={(v) => { if (!v) { setForm(null); onClose(); } }}
      title={`${t('employees.edit')} — ${row?.profile?.full_name ?? ''}`}
      footer={<><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={() => { setForm(null); onClose(); }}>{t('common.cancel')}</Button></>}
    >
      {current && (
        <div className="space-y-4">
          <Field label={t('employees.role')}>
            <Select value={current.role_id} onChange={(e) => setForm({ ...current, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{lang === 'en' ? r.name_en ?? r.name_ar : r.name_ar}</option>)}
            </Select>
          </Field>
          <Field label={t('employees.department')}>
            <Select value={current.department_id} onChange={(e) => setForm({ ...current, department_id: e.target.value })}>
              <option value="">{t('employees.noDepartment')}</option>
              {departments.filter((d) => d.is_active || d.id === current.department_id).map((d) => <option key={d.id} value={d.id}>{lang === 'en' ? d.name_en ?? d.name_ar : d.name_ar}</option>)}
            </Select>
          </Field>
          <Field label={t('employees.jobTitle')}>
            <Input value={current.job_title} onChange={(e) => setForm({ ...current, job_title: e.target.value })} />
          </Field>
        </div>
      )}
    </Drawer>
  );
}

function InviteDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const qc = useQueryClient();
  const { roles, departments } = useLookups();
  const empty = { full_name: '', email: '', role_id: '', department_id: '', job_title: '', method: 'password' as 'password' | 'email' };
  const [form, setForm] = useState(empty);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      invokeFunction<{ employee_id: string; temp_password?: string }>('invite-employee', {
        ...form,
        email: form.email.trim().toLowerCase(),
        department_id: form.department_id || null,
        job_title: form.job_title || null,
      }),
    onSuccess: (res) => {
      toast.success(t('employees.invited'));
      void qc.invalidateQueries({ queryKey: ['employees'] });
      if (res.temp_password) setTempPassword(res.temp_password);
      else close();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  function close() {
    setForm(empty);
    setTempPassword(null);
    onOpenChange(false);
  }
  const valid = form.full_name.trim().length > 2 && /\S+@\S+\.\S+/.test(form.email) && form.role_id;

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
      title={t('employees.inviteTitle')}
      footer={tempPassword
        ? <Button variant="primary" onClick={close}>{t('common.close')}</Button>
        : <><Button variant="primary" disabled={!valid} loading={invite.isPending} onClick={() => invite.mutate()}>{t('employees.invite')}</Button><Button onClick={close}>{t('common.cancel')}</Button></>}
    >
      {tempPassword ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{t('employees.tempPasswordShown')}</p>
          <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
            <code className="ltr flex-1 text-lg font-bold tracking-wider text-navy">{tempPassword}</code>
            <Button size="sm" onClick={() => { void navigator.clipboard.writeText(tempPassword); toast.success(t('common.copied')); }}>
              <Copy className="size-4" /> {t('common.copy')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={`${t('employees.name')} *`}>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label={`${t('employees.email')} *`}>
            <Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('employees.role')} *`}>
              <Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                <option value="" disabled>—</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{lang === 'en' ? r.name_en ?? r.name_ar : r.name_ar}</option>)}
              </Select>
            </Field>
            <Field label={t('employees.department')}>
              <Select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">{t('employees.noDepartment')}</option>
                {departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{lang === 'en' ? d.name_en ?? d.name_ar : d.name_ar}</option>)}
              </Select>
            </Field>
          </div>
          <Field label={t('employees.jobTitle')}>
            <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold text-ink-2">{t('employees.inviteMethod')}</legend>
            {(['password', 'email'] as const).map((m) => (
              <label key={m} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', form.method === m ? 'border-brand bg-brand-50' : 'border-line')}>
                <input type="radio" name="method" className="mt-1 accent-[var(--color-brand)]" checked={form.method === m} onChange={() => setForm({ ...form, method: m })} />
                <span>
                  <span className="block text-sm font-semibold">{t(m === 'password' ? 'employees.methodPassword' : 'employees.methodEmail')}</span>
                  <span className="block text-xs text-ink-2">{t(m === 'password' ? 'employees.methodPasswordHint' : 'employees.methodEmailHint')}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </Drawer>
  );
}

function DepartmentsTab() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { departments } = useLookups();
  const counts = useQuery({
    queryKey: ['employees', 'dept-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('department_id');
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data) if (r.department_id) m.set(r.department_id, (m.get(r.department_id) ?? 0) + 1);
      return m;
    },
  });
  const [draft, setDraft] = useState({ name_ar: '', name_en: '' });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('departments').insert({ name_ar: draft.name_ar.trim(), name_en: draft.name_en.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ name_ar: '', name_en: '' });
      void qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const toggle = useMutation({
    mutationFn: async (p: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('departments').update({ is_active: p.is_active }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['departments'] }),
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <div className="space-y-3">
      {can('employees', 'create') && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <Field label={t('employees.departmentName')} className="flex-1">
            <Input value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
          </Field>
          <Field label={t('employees.departmentNameEn')} className="flex-1">
            <Input dir="ltr" value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
          </Field>
          <Button variant="primary" disabled={draft.name_ar.trim().length < 2} loading={add.isPending} onClick={() => add.mutate()}>
            <Plus className="size-4" /> {t('employees.addDepartment')}
          </Button>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => (
          <Card key={d.id} className={cn('flex items-center gap-3 p-4', !d.is_active && 'opacity-60')}>
            <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand"><Building className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{d.name_ar}</div>
              <div className="text-xs text-ink-2">{d.name_en ? <span className="ltr">{d.name_en}</span> : null} · {t('employees.membersCount', { count: counts.data?.get(d.id) ?? 0 })}</div>
            </div>
            {can('employees', 'edit') && (
              <Switch checked={d.is_active} label={t('employees.active')} onChange={(v) => toggle.mutate({ id: d.id, is_active: v })} />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
