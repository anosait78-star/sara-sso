import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CalendarClock, CalendarDays, Check, ChevronsUp, ChevronUp, CircleDot, Equal, History, MessageCircle, Phone, Plus, StickyNote,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Drawer, EmptyState, Field, Input, Select, Spinner, Switch, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dueBucket, fmtDate, fromLocalInput, telHref, toLocalInput, useEmployeeOptions, useLang, waHref } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Ref = { customerId?: string; leadId?: string; requestId?: string };
const refFilter = (r: Ref) =>
  r.requestId ? { col: 'service_request_id', val: r.requestId } : r.customerId ? { col: 'customer_id', val: r.customerId } : { col: 'lead_id', val: r.leadId! };

// ---------- phone quick actions ----------
export function PhoneActions({ phone, size = 'sm' }: { phone: string | null | undefined; size?: 'sm' | 'md' }) {
  if (!phone) return null;
  return (
    <div className="flex gap-1.5">
      <a href={telHref(phone)}><Button size={size} variant="secondary" aria-label="call"><Phone className="size-4" /></Button></a>
      <a href={waHref(phone)} target="_blank" rel="noreferrer"><Button size={size} variant="secondary" className="text-success" aria-label="whatsapp"><MessageCircle className="size-4" /></Button></a>
    </div>
  );
}

// ---------- priority ----------
export function PriorityLabel({ p }: { p: 'low' | 'normal' | 'high' | 'urgent' }) {
  const { t } = useTranslation();
  const map = { urgent: ['text-danger', ChevronsUp], high: ['text-[#e8590c]', ChevronUp], normal: ['text-brand', Equal], low: ['text-ink-3', CircleDot] } as const;
  const [cls, Icon] = map[p];
  return <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', cls)}><Icon className="size-3.5" />{t(`followups.priorities.${p}`)}</span>;
}

// ---------- timeline ----------
interface EventRow { id: number; event_type: string; summary_ar: string; summary_en: string | null; actor_name: string | null; occurred_at: string; visible_to_client: boolean }
const eventTone = (type: string) =>
  type.includes('converted') || type.endsWith('completed') || type.endsWith('.done') ? 'bg-[#e5f6ec] text-success'
  : type.includes('stage') ? 'bg-[#efeafe] text-[#6b45d9]'
  : type.includes('cancelled') || type.includes('no_show') ? 'bg-[#fce8e8] text-danger'
  : 'bg-brand-50 text-brand';

export function Timeline({ customerId, leadId, requestId, limit = 40 }: Ref & { limit?: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const f = refFilter({ customerId, leadId, requestId });
  const q = useQuery({
    queryKey: ['timeline', f.col, f.val],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('id, event_type, summary_ar, summary_en, actor_name, occurred_at, visible_to_client')
        .eq(f.col, f.val)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as EventRow[];
    },
  });
  return (
    <Card>
      <CardHeader icon={<History className="size-4" />} title={t('crm.timeline')} />
      <div className="p-4">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <p className="text-sm text-ink-3">{t('crm.noTimeline')}</p> : (
          <ol className="relative space-y-4">
            {q.data.map((e, i) => (
              <li key={e.id} className="relative flex gap-3">
                {i < q.data.length - 1 && <span className="absolute start-[13px] top-7 h-[calc(100%-4px)] w-0.5 bg-line" />}
                <span className={cn('relative grid size-7 shrink-0 place-items-center rounded-full', eventTone(e.event_type))}>
                  <CircleDot className="size-3.5" />
                </span>
                <div className="min-w-0 text-[13px] leading-snug">
                  <div className="text-ink">{lang === 'en' ? e.summary_en ?? e.summary_ar : e.summary_ar}</div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {fmtDate(e.occurred_at, lang)}{e.actor_name ? ` · ${e.actor_name}` : ''}
                    {e.visible_to_client && <span className="ms-1.5 text-sky">· {t('crm.visibleToClient')}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

// ---------- notes ----------
interface NoteRow { id: string; body: string; visibility: 'internal' | 'client'; created_at: string; author: { profile: { full_name: string } | null } | null }
export function NotesPanel({ customerId, leadId }: Ref) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { staff } = useAuth();
  const f = refFilter({ customerId, leadId });
  const [body, setBody] = useState('');
  const [client, setClient] = useState(false);
  const q = useQuery({
    queryKey: ['notes', f.col, f.val],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, body, visibility, created_at, author:employees(profile:profiles(full_name))')
        .eq(f.col, f.val)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as NoteRow[];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notes').insert({
        body: body.trim(), visibility: customerId && client ? 'client' : 'internal', author_employee_id: staff!.employee_id,
        customer_id: customerId ?? null, lead_id: customerId ? null : leadId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody('');
      setClient(false);
      void qc.invalidateQueries({ queryKey: ['notes', f.col, f.val] });
      void qc.invalidateQueries({ queryKey: ['timeline', f.col, f.val] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader icon={<StickyNote className="size-4" />} title={t('crm.notes')} />
      <div className="space-y-3 p-4">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('crm.notePlaceholder')} />
        <div className="flex flex-wrap items-center gap-3">
          {customerId && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <Switch checked={client} onChange={setClient} label={t('crm.visibleToClient')} /> {t('crm.visibleToClient')}
            </label>
          )}
          <Button size="sm" variant="primary" className="ms-auto" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>{t('crm.addNote')}</Button>
        </div>
        <div className="divide-y divide-line">
          {q.data?.map((n) => (
            <div key={n.id} className="py-2.5 text-[13px]">
              <p className="whitespace-pre-wrap text-ink">{n.body}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-3">
                {n.author?.profile?.full_name} · {fmtDate(n.created_at, lang)}
                <Badge tone={n.visibility === 'client' ? 'sky' : 'gray'} dot={false} className="h-5 text-[10px]">{n.visibility === 'client' ? t('crm.visibleToClient') : t('crm.internal')}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------- follow-ups ----------
export interface TaskRow {
  id: string; kind: string; title: string; description: string | null; due_at: string | null; priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'; outcome: string | null; assigned_to: string | null; customer_id: string | null; lead_id: string | null;
  assignee?: { profile: { full_name: string } | null } | null;
  customer?: { id: string; full_name: string; customer_no: string | null } | null;
  lead?: { id: string; full_name: string; lead_no: string | null } | null;
  service_request_id?: string | null;
  request?: { id: string; request_no: string } | null;
}
export const TASK_SELECT = 'id, kind, title, description, due_at, priority, status, outcome, assigned_to, customer_id, lead_id, service_request_id, assignee:employees!tasks_assigned_to_fkey(profile:profiles(full_name)), customer:customers(id, full_name, customer_no), lead:leads(id, full_name, lead_no), request:service_requests(id, request_no)';

export function useCompleteTask(onDone?: () => void) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; outcome: string }) => {
      const { error } = await supabase.from('tasks').update({ status: 'done', outcome: p.outcome || null }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      onDone?.();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
}

export function FollowUpRow({ task, showRelated, onComplete }: { task: TaskRow; showRelated?: boolean; onComplete: (t: TaskRow) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const bucket = task.status === 'done' ? 'done' : dueBucket(task.due_at);
  const related = task.customer ?? task.lead;
  return (
    <div className="flex items-start gap-3 py-3">
      <button
        type="button"
        disabled={task.status === 'done'}
        onClick={() => onComplete(task)}
        className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2', task.status === 'done' ? 'border-success bg-success text-white' : 'border-[#b8c4d6] hover:border-brand')}
        aria-label={t('followups.complete')}
      >
        {task.status === 'done' && <Check className="size-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13px] font-semibold', task.status === 'done' && 'text-ink-3 line-through')}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span className={cn(bucket === 'overdue' && 'font-semibold text-danger', bucket === 'today' && 'font-semibold text-brand')}>
            <CalendarClock className="me-1 inline size-3" />{task.due_at ? fmtDate(task.due_at, lang) : t('followups.noDate')}
          </span>
          {task.assignee?.profile?.full_name && <span>{task.assignee.profile.full_name}</span>}
          {showRelated && related && <span className="text-brand">{related.full_name}</span>}
          {showRelated && task.request && <Link to="/requests/$id" params={{ id: task.request.id }} className="ltr font-latin font-semibold text-brand">{task.request.request_no}</Link>}
          {task.outcome && <span className="text-ink-2">— {task.outcome}</span>}
        </div>
      </div>
      <PriorityLabel p={task.priority} />
    </div>
  );
}

export function CompleteTaskDialog({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState('');
  const complete = useCompleteTask(() => { setOutcome(''); onClose(); });
  return (
    <Drawer
      open={!!task}
      onOpenChange={(v) => !v && onClose()}
      title={`${t('followups.complete')}: ${task?.title ?? ''}`}
      footer={<><Button variant="primary" loading={complete.isPending} onClick={() => task && complete.mutate({ id: task.id, outcome })}><Check className="size-4" /> {t('followups.complete')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}
    >
      <Field label={t('followups.outcome')}>
        <Textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder={t('followups.outcomePlaceholder')} />
      </Field>
    </Drawer>
  );
}

export function FollowUpsPanel({ customerId, leadId, defaultAssignee }: Ref & { defaultAssignee?: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = useAuth();
  const f = refFilter({ customerId, leadId });
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', due: '', priority: 'normal' });
  const q = useQuery({
    queryKey: ['tasks', f.col, f.val],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq(f.col, f.val).neq('status', 'cancelled')
        .order('status').order('due_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').insert({
        kind: 'follow_up', title: form.title.trim(), due_at: fromLocalInput(form.due), priority: form.priority as TaskRow['priority'],
        customer_id: customerId ?? null, lead_id: customerId ? null : leadId ?? null, assigned_to: defaultAssignee ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ title: '', due: '', priority: 'normal' });
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader
        icon={<CalendarClock className="size-4" />}
        title={t('followups.title')}
        actions={can('tasks', 'create') && <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> {t('followups.new')}</Button>}
      />
      <div className="px-4">
        {adding && (
          <div className="space-y-2 border-b border-line py-3">
            <Input placeholder={t('followups.taskTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Input type="datetime-local" className="h-10 w-auto flex-1" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
              <Select className="h-10 w-auto" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {(['low', 'normal', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{t(`followups.priorities.${p}`)}</option>)}
              </Select>
              <Button size="md" variant="primary" disabled={!form.title.trim()} loading={add.isPending} onClick={() => add.mutate()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
        {q.isLoading ? <div className="py-4"><Spinner /></div> : !q.data?.length ? <p className="py-4 text-sm text-ink-3">{t('followups.empty')}</p> : (
          <div className="divide-y divide-line">{q.data.map((task) => <FollowUpRow key={task.id} task={task} onComplete={setCompleting} />)}</div>
        )}
      </div>
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
    </Card>
  );
}

// ---------- appointments ----------
export interface AppointmentRow {
  id: string; type: 'meeting' | 'call' | 'property_visit' | 'gov_visit' | 'other'; title: string; starts_at: string; ends_at: string | null;
  location: string | null; status: 'scheduled' | 'done' | 'cancelled' | 'no_show'; outcome: string | null; employee_id: string | null;
  customer_id: string | null; lead_id: string | null;
  employee?: { profile: { full_name: string } | null } | null;
  customer?: { id: string; full_name: string } | null;
  lead?: { id: string; full_name: string } | null;
}
export const APPOINTMENT_SELECT = 'id, type, title, starts_at, ends_at, location, status, outcome, employee_id, customer_id, lead_id, employee:employees!appointments_employee_id_fkey(profile:profiles(full_name)), customer:customers(id, full_name), lead:leads(id, full_name)';

export function AppointmentDrawer({ open, onOpenChange, appointment, customerId, leadId }: { open: boolean; onOpenChange: (v: boolean) => void; appointment?: AppointmentRow | null } & Ref) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can, staff } = useAuth();
  const employees = useEmployeeOptions();
  const init = () => ({
    type: appointment?.type ?? 'meeting',
    title: appointment?.title ?? '',
    starts: toLocalInput(appointment?.starts_at),
    ends: toLocalInput(appointment?.ends_at),
    location: appointment?.location ?? '',
    employee_id: appointment?.employee_id ?? staff?.employee_id ?? '',
    status: appointment?.status ?? 'scheduled',
    outcome: appointment?.outcome ?? '',
  });
  const [form, setForm] = useState(init);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${appointment?.id ?? 'new'}`;
  if (key !== lastKey) { setLastKey(key); setForm(init()); setRelation(null); }
  const pick = !appointment && !customerId && !leadId;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        type: form.type as AppointmentRow['type'], title: form.title.trim(), starts_at: fromLocalInput(form.starts)!, ends_at: fromLocalInput(form.ends),
        location: form.location || null, employee_id: form.employee_id || null, status: form.status as AppointmentRow['status'], outcome: form.outcome || null,
      };
      if (appointment) {
        const { error } = await supabase.from('appointments').update(payload).eq('id', appointment.id);
        if (error) throw error;
      } else {
        const cId = customerId ?? (relation?.kind === 'customer' ? relation.id : null);
        const lId = cId ? null : leadId ?? (relation?.kind === 'lead' ? relation.id : null);
        const { error } = await supabase.from('appointments').insert({ ...payload, customer_id: cId, lead_id: lId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const valid = form.title.trim() && form.starts && (!form.ends || form.ends > form.starts);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={appointment ? t('appointments.edit') : t('appointments.new')}
      footer={<><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}
    >
      <div className="space-y-4">
        {pick && <Field label={t('appointments.customerOrLead')}><RelationPicker value={relation} onChange={setRelation} /></Field>}
        <Field label={`${t('appointments.titleField')} *`}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('appointments.type')}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AppointmentRow['type'] })}>
            {(['meeting', 'call', 'property_visit', 'gov_visit', 'other'] as const).map((k) => <option key={k} value={k}>{t(`appointments.types.${k}`)}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('appointments.startsAt')} *`}><Input type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} /></Field>
          <Field label={t('appointments.endsAt')}><Input type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></Field>
        </div>
        <Field label={t('appointments.location')}><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label={t('appointments.employee')}>
          <Select value={form.employee_id} disabled={!can('appointments', 'assign')} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            {staff && !employees.data?.some((e) => e.id === staff.employee_id) && <option value={staff.employee_id}>{staff.full_name}</option>}
          </Select>
        </Field>
        {appointment && (
          <>
            <Field label={t('employees.status')}>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppointmentRow['status'] })}>
                {(['scheduled', 'done', 'cancelled', 'no_show'] as const).map((s) => <option key={s} value={s}>{t(`appointments.statuses.${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('followups.outcome')}><Textarea value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} /></Field>
          </>
        )}
      </div>
    </Drawer>
  );
}

export function AppointmentsPanel({ customerId, leadId }: Ref) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const f = refFilter({ customerId, leadId });
  const [editing, setEditing] = useState<AppointmentRow | null | 'new'>(null);
  const q = useQuery({
    queryKey: ['appointments', f.col, f.val],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select(APPOINTMENT_SELECT).eq(f.col, f.val).order('starts_at', { ascending: false });
      if (error) throw error;
      return data as unknown as AppointmentRow[];
    },
  });
  return (
    <Card>
      <CardHeader
        icon={<CalendarDays className="size-4" />}
        title={t('appointments.title')}
        actions={can('appointments', 'create') && <Button size="sm" variant="ghost" onClick={() => setEditing('new')}><Plus className="size-4" /> {t('appointments.new')}</Button>}
      />
      <div className="divide-y divide-line px-4">
        {!q.data?.length ? <EmptyState title={t('appointments.empty')} /> : q.data.map((a) => (
          <button key={a.id} type="button" onClick={() => setEditing(a)} className="flex w-full items-center gap-3 py-3 text-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><CalendarDays className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{a.title}</span>
              <span className="block text-[11px] text-ink-3">{fmtDate(a.starts_at, lang)}{a.location ? ` · ${a.location}` : ''}</span>
            </span>
            <AppointmentStatusBadge s={a.status} />
          </button>
        ))}
      </div>
      <AppointmentDrawer open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} appointment={editing === 'new' ? null : editing} customerId={customerId} leadId={leadId} />
    </Card>
  );
}

export function AppointmentStatusBadge({ s }: { s: AppointmentRow['status'] }) {
  const { t } = useTranslation();
  const tone = { scheduled: 'blue', done: 'green', cancelled: 'red', no_show: 'amber' } as const;
  return <Badge tone={tone[s]}>{t(`appointments.statuses.${s}`)}</Badge>;
}

// ---------- relation picker (customer or lead via global search) ----------
export interface Relation { kind: 'customer' | 'lead'; id: string; title: string }
export function RelationPicker({ value, onChange }: { value: Relation | null; onChange: (r: Relation | null) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const res = useQuery({
    queryKey: ['global_search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('global_search', { p_query: q.trim() });
      if (error) throw error;
      return data as { kind: 'customer' | 'lead'; id: string; number: string | null; title: string; subtitle: string | null }[];
    },
  });
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
        <Badge tone={value.kind === 'customer' ? 'blue' : 'purple'} dot={false}>{value.kind === 'customer' ? t('search.customers') : t('search.leads')}</Badge>
        <span className="flex-1 truncate font-semibold">{value.title}</span>
        <button type="button" className="text-xs font-semibold text-ink-2" onClick={() => onChange(null)}>{t('common.edit')}</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input placeholder={t('search.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      {res.data && (
        <div className="max-h-48 overflow-y-auto rounded-[10px] border border-line bg-white">
          {res.data.length === 0 ? <div className="px-3 py-2 text-xs text-ink-3">{t('search.noResults')}</div> : res.data.map((r) => (
            <button key={`${r.kind}-${r.id}`} type="button" onClick={() => { onChange({ kind: r.kind, id: r.id, title: r.title }); setQ(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
              <Badge tone={r.kind === 'customer' ? 'blue' : 'purple'} dot={false} className="h-5 text-[10px]">{r.kind === 'customer' ? t('search.customers') : t('search.leads')}</Badge>
              <span className="flex-1 truncate">{r.title}</span>
              <span className="ltr text-[11px] text-ink-3">{r.number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
