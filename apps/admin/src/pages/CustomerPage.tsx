import { normalizeEgyptianMobile } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { CalendarClock, CalendarDays, ChevronRight, Info, Pencil, Plus, Repeat, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AppointmentsPanel, FollowUpsPanel, NotesPanel, PhoneActions, Timeline } from '@/components/crm';
import { Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { displayPhone, fmtDate, labelOf, useLang, useLookups } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { CUSTOMER_SELECT, CustomerFormDrawer, type CustomerRow } from './CustomersPage';
import { CustomerRequests } from '@/components/requests/CustomerRequests';
import { ClientAccessCard } from '@/components/requests/ClientAccess';

type Tab = 'overview' | 'requests' | 'followups' | 'appointments' | 'notes' | 'timeline';

export function CustomerPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sources = useLookups('lead_source');
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select(CUSTOMER_SELECT).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerRow | null;
    },
  });
  const stats = useQuery({
    queryKey: ['customers', id, 'stats'],
    queryFn: async () => {
      const [fu, ap] = await Promise.all([
        supabase.from('tasks').select('id, due_at', { count: 'exact' }).eq('customer_id', id).in('status', ['todo', 'in_progress']),
        supabase.from('appointments').select('id', { count: 'exact' }).eq('customer_id', id).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()),
      ]);
      const overdue = (fu.data ?? []).filter((r) => r.due_at && new Date(r.due_at) < new Date()).length;
      return { followUps: fu.count ?? 0, overdue, appointments: ap.count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void navigate({ to: '/customers' });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  const c = q.data;
  if (!c) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;
  const title = c.customer_type === 'company' && c.company_name ? c.company_name : c.full_name;
  const statusTone = { active: 'green', inactive: 'gray', self_registered: 'sky', pending_link: 'amber' } as const;

  const tabs: Tab[] = ['overview', ...(can('service_requests', 'view') ? (['requests'] as Tab[]) : []), 'followups', 'appointments', 'notes', 'timeline'];
  const tabLabel = (k: Tab) => ({ overview: t('customers.overview'), requests: t('requests.title'), followups: t('followups.title'), appointments: t('appointments.title'), notes: t('crm.notes'), timeline: t('crm.timeline') })[k];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('customers.title')}</Link>

      {/* header */}
      <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={title} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold text-navy md:text-xl">{title}</h1>
              <Badge tone={statusTone[c.status]}>{t(`customers.statuses.${c.status}`)}</Badge>
              <Badge tone={c.customer_type === 'company' ? 'navy' : 'gray'} dot={false}>{t(`customers.types.${c.customer_type}`)}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              <span className="ltr">{c.customer_no}</span>
              <span className="ltr">{displayPhone(c.phone)}</span>
              {c.email && <span className="ltr">{c.email}</span>}
              <span><UserRound className="me-1 inline size-3.5" />{c.owner?.profile?.full_name ?? t('crm.unassigned')}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PhoneActions phone={c.phone} size="md" />
          {can('customers', 'edit') && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> {t('common.edit')}</Button>}
          {can('customers', 'delete') && <Button variant="danger" onClick={() => setDeleting(true)} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>}
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<CalendarClock className="size-5" />} value={stats.data?.followUps ?? 0} label={t('followups.title')} />
        <Kpi icon={<CalendarClock className="size-5" />} value={stats.data?.overdue ?? 0} label={t('followups.overdue')} tone="danger" />
        <Kpi icon={<CalendarDays className="size-5" />} value={stats.data?.appointments ?? 0} label={t('appointments.upcoming')} />
        <Kpi icon={<Plus className="size-5" />} value={fmtDate(c.created_at, lang, false)} label={t('crm.createdAt')} small />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2', k === 'timeline' && 'lg:hidden')}>
            {tabLabel(k)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {tab === 'overview' && (
            <>
              <Card>
                <CardHeader icon={<Info className="size-4" />} title={t('customers.basicInfo')} />
                <dl className="grid gap-x-6 px-4 py-2 text-[13px] sm:grid-cols-2">
                  {[
                    [t('customers.fullName'), c.full_name],
                    [t('customers.nationalId'), c.national_id ? <span className="ltr">{`${c.national_id.slice(0, 4)}•••••••${c.national_id.slice(-3)}`}</span> : '—'],
                    [t('crm.phone'), <span className="ltr">{displayPhone(c.phone)}</span>],
                    [t('crm.altPhone'), c.alt_phone ? <span className="ltr">{displayPhone(c.alt_phone)}</span> : '—'],
                    [t('crm.email'), c.email ? <span className="ltr">{c.email}</span> : '—'],
                    [t('crm.city'), c.city ?? '—'],
                    [t('crm.address'), c.address ?? '—'],
                    [t('crm.source'), labelOf(sources.data, c.source, lang)],
                    ...(c.customer_type === 'company' ? [[t('customers.commercialRegister'), c.commercial_register_no ?? '—'], [t('customers.taxNo'), c.tax_no ?? '—']] : [[t('customers.birthDate'), c.birth_date ?? '—']]),
                    [t('customers.appAccess'), t(`customers.appAccessStates.${c.app_access}`)],
                  ].map(([k, v], i) => (
                    <div key={i} className="flex justify-between gap-3 border-b border-dashed border-line py-2.5">
                      <dt className="text-ink-2">{k}</dt><dd className="text-end font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {c.converted_from_lead_id && (
                  <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-ink-2">
                    <Repeat className="size-4 text-sky" /> {t('customers.fromLead')} ·
                    <Link to="/leads/$id" params={{ id: c.converted_from_lead_id }} className="font-semibold text-brand">{t('crm.open')}</Link>
                  </div>
                )}
              </Card>
              {c.customer_type === 'company' && <ContactsCard customerId={c.id} />}
              <ClientAccessCard customer={c} />
              <div className="flex items-center gap-2 rounded-xl bg-canvas px-4 py-3 text-xs text-ink-2"><Info className="size-4 shrink-0" />{t('customers.comingPhases')}</div>
            </>
          )}
          {tab === 'requests' && <CustomerRequests customerId={c.id} title={title} />}
          {tab === 'followups' && <FollowUpsPanel customerId={c.id} defaultAssignee={c.owner_employee_id} />}
          {tab === 'appointments' && <AppointmentsPanel customerId={c.id} />}
          {tab === 'notes' && <NotesPanel customerId={c.id} />}
          {tab === 'timeline' && <div className="lg:hidden"><Timeline customerId={c.id} /></div>}
        </div>
        <div className="hidden lg:block"><Timeline customerId={c.id} /></div>
      </div>

      <CustomerFormDrawer open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t('customers.deleteConfirm', { name: title })} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}

function Kpi({ icon, value, label, tone, small }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone?: 'danger'; small?: boolean }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tone === 'danger' ? 'bg-[#fce8e8] text-danger' : 'bg-brand-50 text-brand')}>{icon}</span>
      <div className="min-w-0">
        <div className={cn('font-latin font-bold text-navy', small ? 'text-sm' : 'text-xl')}>{value}</div>
        <div className="truncate text-xs text-ink-2">{label}</div>
      </div>
    </Card>
  );
}

function ContactsCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', role: '', phone: '' });
  const q = useQuery({
    queryKey: ['customer_contacts', customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer_contacts').select('*').eq('customer_id', customerId).order('created_at');
      if (error) throw error;
      return data;
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const phone = form.phone ? normalizeEgyptianMobile(form.phone) : null;
      if (form.phone && !phone) throw new Error('phone');
      const { error } = await supabase.from('customer_contacts').insert({ customer_id: customerId, name: form.name.trim(), role: form.role || null, phone });
      if (error) throw error;
    },
    onSuccess: () => { setForm({ name: '', role: '', phone: '' }); void qc.invalidateQueries({ queryKey: ['customer_contacts', customerId] }); },
    onError: (e) => toast.error((e as Error).message === 'phone' ? t('crm.invalidPhone') : t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader icon={<UserRound className="size-4" />} title={t('customers.contacts')} />
      <div className="divide-y divide-line px-4">
        {q.data?.map((ct) => (
          <div key={ct.id} className="flex items-center gap-3 py-2.5 text-[13px]">
            <Avatar name={ct.name} size="sm" />
            <div className="min-w-0 flex-1"><div className="font-semibold">{ct.name}</div><div className="text-xs text-ink-3">{ct.role ?? ''} {ct.phone ? <span className="ltr">· {displayPhone(ct.phone)}</span> : null}</div></div>
            <PhoneActions phone={ct.phone} />
          </div>
        ))}
        {can('customers', 'edit') && (
          <div className="flex flex-wrap gap-2 py-3">
            <Input className="h-10 min-w-36 flex-1" placeholder={t('employees.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input className="h-10 w-36" placeholder={t('customers.contactRole')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            <Input className="h-10 w-40" dir="ltr" placeholder="01xxxxxxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Button variant="primary" disabled={form.name.trim().length < 2} loading={add.isPending} onClick={() => add.mutate()}><Plus className="size-4" /> {t('customers.addContact')}</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
