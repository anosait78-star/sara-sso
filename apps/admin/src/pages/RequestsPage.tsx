import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ChevronLeft, ClipboardList, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PriorityLabel } from '@/components/crm';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useEmployeeOptions, useLang } from '@/lib/crm';
import {
  customerTitle, isLate, OPEN_STATUSES, REQUEST_SELECT, REQUEST_STATUS_TONE, useActiveServices, type Priority, type RequestRow,
} from '@/lib/requests';
import { nameOf, useCategories } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Tab = 'open' | 'waiting_client' | 'overdue' | 'completed' | 'cancelled';
const TABS: Tab[] = ['open', 'waiting_client', 'overdue', 'completed', 'cancelled'];
const inTab = (r: RequestRow, tab: Tab) =>
  tab === 'open' ? OPEN_STATUSES.includes(r.status)
  : tab === 'overdue' ? r.is_overdue && OPEN_STATUSES.includes(r.status)
  : r.status === tab;

export function RequestsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can, staff } = useAuth();
  const navigate = useNavigate();
  const employees = useEmployeeOptions();
  const services = useActiveServices();
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [service, setService] = useState('');
  const [owner, setOwner] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['requests', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });

  const counts = useMemo(() => {
    const c = Object.fromEntries(TABS.map((k) => [k, 0])) as Record<Tab, number>;
    for (const r of list.data ?? []) for (const k of TABS) if (inTab(r, k)) c[k]++;
    return c;
  }, [list.data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((r) => inTab(r, tab) && (!service || r.service_id === service) && (!owner || r.owner_employee_id === owner)
      && (!term || [r.request_no, r.customer?.full_name, r.customer?.company_name, r.customer?.customer_no, r.customer?.phone]
        .some((v) => v?.toLowerCase().includes(term))));
  }, [list.data, tab, q, service, owner]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('requests.title')} actions={can('service_requests', 'create') && (
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('requests.new')}</Button>
      )} />

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {k === 'overdue' && <AlertTriangle className="size-4 text-danger" />}
            {t(`requests.tabs.${k}`)} <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
          <Input className="h-10 ps-9" placeholder={t('requests.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-10 w-auto max-w-64" value={service} onChange={(e) => setService(e.target.value)} aria-label={t('requests.service')}>
          <option value="">{t('requests.service')}: {t('common.all')}</option>
          {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{nameOf(s, lang)}</option>)}
        </Select>
        <Select className="h-10 w-auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={t('crm.owner')}>
          <option value="">{t('crm.owner')}: {t('common.all')}</option>
          {staff && <option value={staff.employee_id}>{t('requests.mine')}</option>}
          {(employees.data ?? []).filter((e) => e.id !== staff?.employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </div>

      {list.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList className="size-8" />} title={t('requests.empty')} /></Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.number')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('requests.service')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.currentStep')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.status')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('crm.owner')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('requests.dueAt')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/requests/$id', params: { id: r.id } })}>
                    <td className="px-4 py-3">
                      <div className="ltr text-start font-latin font-bold text-navy">{r.request_no}</div>
                      <PriorityLabel p={r.priority} />
                    </td>
                    <td className="px-4 py-3 font-semibold">{customerTitle(r.customer)}</td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{nameOf(r.service, lang)}</td>
                    <td className="px-4 py-3">
                      {r.current_step ? (
                        <>
                          <div className="font-semibold">{nameOf(r.current_step, lang)}</div>
                          <div className={cn('text-xs', isLate(r.current_step.due_at) ? 'font-semibold text-danger' : 'text-ink-3')}>
                            {r.current_step.due_at ? fmtDate(r.current_step.due_at, lang, false) : ''}
                          </div>
                        </>
                      ) : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(`requests.statuses.${r.status}`)}</Badge>
                        {r.is_overdue && <Badge tone="red" dot={false}>{t('requests.overdue')}</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">{r.owner?.profile?.full_name ?? <span className="text-ink-3">{t('crm.unassigned')}</span>}</td>
                    <td className={cn('hidden px-4 py-3 xl:table-cell', r.is_overdue ? 'font-semibold text-danger' : 'text-ink-2')}>{fmtDate(r.due_at, lang, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Link key={r.id} to="/requests/$id" params={{ id: r.id }} className="block">
                <Card className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="ltr font-latin text-sm font-bold text-navy">{r.request_no}</span>
                      <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(`requests.statuses.${r.status}`)}</Badge>
                    </div>
                    <div className="mt-1 truncate font-semibold">{customerTitle(r.customer)}</div>
                    <div className="truncate text-xs text-ink-2">{nameOf(r.service, lang)}</div>
                    {r.current_step && (
                      <div className={cn('mt-1 truncate text-xs', isLate(r.current_step.due_at) ? 'text-danger' : 'text-ink-3')}>
                        {t('requests.currentStep')}: {nameOf(r.current_step, lang)}
                      </div>
                    )}
                  </div>
                  <ChevronLeft className="size-5 shrink-0 text-ink-3 ltr:rotate-180" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <NewRequestDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

// ---------- create ----------
export interface CustomerPick { id: string; title: string }

export function CustomerPicker({ value, onChange }: { value: CustomerPick | null; onChange: (c: CustomerPick | null) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const res = useQuery({
    queryKey: ['global_search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('global_search', { p_query: q.trim() });
      if (error) throw error;
      return (data as { kind: string; id: string; number: string | null; title: string; subtitle: string | null }[]).filter((r) => r.kind === 'customer');
    },
  });
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-brand-100 bg-brand-50 px-3 py-2.5 text-sm">
        <span className="flex-1 truncate font-semibold">{value.title}</span>
        <button type="button" className="text-xs font-semibold text-ink-2" onClick={() => onChange(null)}>{t('common.edit')}</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input placeholder={t('search.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {res.data && (
        <div className="max-h-48 overflow-y-auto rounded-[10px] border border-line bg-white">
          {res.data.length === 0 ? <div className="px-3 py-2 text-xs text-ink-3">{t('search.noResults')}</div> : res.data.map((r) => (
            <button key={r.id} type="button" onClick={() => { onChange({ id: r.id, title: r.title }); setQ(''); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
              <span className="flex-1 truncate">{r.title}</span>
              <span className="ltr text-[11px] text-ink-3">{r.number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A business-line file the new request is linked to right after it is created. */
export type RequestLink =
  | { kind: 'company'; id: string }
  | { kind: 'policy'; id: string }
  | { kind: 'loan'; id: string };

async function linkNewRequest(requestId: string, link: RequestLink) {
  const { error } = link.kind === 'company'
    ? await supabase.rpc('link_request_company_file', { p_request_id: requestId, p_company_file_id: link.id })
    : link.kind === 'policy'
      ? await supabase.rpc('link_request_policy', { p_request_id: requestId, p_policy_id: link.id })
      : await supabase.rpc('link_request_loan', { p_request_id: requestId, p_loan_id: link.id });
  if (error) throw error;
}

export function NewRequestDrawer({ open, onOpenChange, customer, link }: {
  open: boolean; onOpenChange: (v: boolean) => void; customer?: CustomerPick;
  /** procedure for an existing company / policy / loan file: the new request is linked to it */
  link?: RequestLink;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can, staff } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const services = useActiveServices();
  const categories = useCategories();
  const employees = useEmployeeOptions();
  const [pick, setPick] = useState<CustomerPick | null>(customer ?? null);
  const [serviceId, setServiceId] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_service_request', {
        p_service_id: serviceId, p_customer_id: pick!.id, p_owner_employee_id: ownerId || undefined, p_priority: priority, p_notes: notes || undefined,
      });
      if (error) throw error;
      if (link) await linkNewRequest(data as string, link);
      return data as string;
    },
    onSuccess: (id) => {
      toast.success(t('requests.created'));
      void qc.invalidateQueries({ queryKey: ['requests'] });
      onOpenChange(false);
      void navigate({ to: '/requests/$id', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const selected = services.data?.find((s) => s.id === serviceId);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (v) { setPick(customer ?? null); setServiceId(''); setPriority('normal'); setOwnerId(''); setNotes(''); }
        onOpenChange(v);
      }}
      title={t('requests.new')}
      footer={
        <>
          <Button variant="primary" loading={create.isPending} disabled={!pick || !serviceId} onClick={() => create.mutate()}>{t('common.create')}</Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`${t('requests.customer')} *`}>
          <CustomerPicker value={pick} onChange={setPick} />
        </Field>
        <Field label={`${t('requests.service')} *`} hint={selected?.default_price != null ? `${t('services.price')}: ${Number(selected.default_price).toLocaleString('en')} EGP` : undefined}>
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">{t('workflow.pick')}</option>
            {(categories.data ?? []).map((c) => {
              const items = (services.data ?? []).filter((s) => s.category_id === c.id);
              return items.length === 0 ? null : (
                <optgroup key={c.id} label={nameOf(c, lang)}>
                  {items.map((s) => <option key={s.id} value={s.id}>{nameOf(s, lang)}</option>)}
                </optgroup>
              );
            })}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('followups.priority')}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => <option key={p} value={p}>{t(`followups.priorities.${p}`)}</option>)}
            </Select>
          </Field>
          {can('service_requests', 'assign') && (
            <Field label={t('crm.owner')}>
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">{staff?.full_name ?? t('requests.mine')}</option>
                {(employees.data ?? []).filter((e) => e.id !== staff?.employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label={t('requests.notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-3">{t('requests.createHint')}</p>
      </div>
    </Drawer>
  );
}
