import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CompleteTaskDialog, FollowUpRow, RelationPicker, TASK_SELECT, type Relation, type TaskRow } from '@/components/crm';
import { Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dueBucket, fromLocalInput, useEmployeeOptions } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Scope = 'mine' | 'team' | 'all';
const BUCKETS = ['overdue', 'today', 'upcoming', 'noDate'] as const;

export function FollowUpsPage() {
  const { t } = useTranslation();
  const { staff, scopeOf, can } = useAuth();
  const viewScope = scopeOf('tasks', 'view');
  const scopes: Scope[] = ['mine', ...(viewScope === 'department' || viewScope === 'all' ? (['team'] as Scope[]) : []), ...(viewScope === 'all' ? (['all'] as Scope[]) : [])];
  const [scope, setScope] = useState<Scope>(viewScope === 'all' ? 'all' : 'mine');
  const [showDone, setShowDone] = useState(false);
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['tasks', 'followups', scope, showDone, staff?.employee_id],
    enabled: !!staff,
    queryFn: async () => {
      let query = supabase.from('tasks').select(TASK_SELECT).eq('kind', 'follow_up')
        .in('status', showDone ? ['done'] : ['todo', 'in_progress'])
        .order('due_at', { ascending: !showDone, nullsFirst: false }).limit(300);
      if (scope === 'mine') query = query.eq('assigned_to', staff!.employee_id);
      if (scope === 'team' && staff?.department_id) query = query.eq('department_id', staff.department_id);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<(typeof BUCKETS)[number], TaskRow[]> = { overdue: [], today: [], upcoming: [], noDate: [] };
    for (const task of q.data ?? []) g[dueBucket(task.due_at)].push(task);
    return g;
  }, [q.data]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('followups.title')} actions={can('tasks', 'create') && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('followups.new')}</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {scopes.map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn('rounded-md px-3 py-1', scope === s ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>{t(`followups.${s}`)}</button>
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {[false, true].map((d) => (
            <button key={String(d)} type="button" onClick={() => setShowDone(d)} className={cn('rounded-md px-3 py-1', showDone === d ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>{d ? t('followups.done') : t('followups.open')}</button>
          ))}
        </div>
      </div>

      {q.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : !q.data?.length ? (
        <Card><EmptyState icon={<CalendarClock className="size-8" />} title={t('followups.empty')} /></Card>
      ) : showDone ? (
        <Card className="divide-y divide-line px-4">{q.data.map((task) => <Linked key={task.id} task={task} onComplete={setCompleting} />)}</Card>
      ) : (
        BUCKETS.filter((b) => grouped[b].length).map((b) => (
          <section key={b} className="space-y-2">
            <h2 className={cn('text-xs font-bold', b === 'overdue' ? 'text-danger' : b === 'today' ? 'text-brand' : 'text-ink-3')}>{t(`followups.${b}`)} ({grouped[b].length})</h2>
            <Card className="divide-y divide-line px-4">{grouped[b].map((task) => <Linked key={task.id} task={task} onComplete={setCompleting} />)}</Card>
          </section>
        ))
      )}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
      <NewFollowUpDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Linked({ task, onComplete }: { task: TaskRow; onComplete: (t: TaskRow) => void }) {
  const target = task.customer ? { to: '/customers/$id' as const, id: task.customer.id } : task.lead ? { to: '/leads/$id' as const, id: task.lead.id } : null;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><FollowUpRow task={task} showRelated onComplete={onComplete} /></div>
      {target && <Link to={target.to} params={{ id: target.id }} className="shrink-0 text-xs font-semibold text-brand">↗</Link>}
    </div>
  );
}

function NewFollowUpDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can, staff } = useAuth();
  const employees = useEmployeeOptions();
  const [form, setForm] = useState({ title: '', description: '', due: '', priority: 'normal', assigned_to: '' });
  const [relation, setRelation] = useState<Relation | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').insert({
        kind: 'follow_up', title: form.title.trim(), description: form.description || null, due_at: fromLocalInput(form.due),
        priority: form.priority as TaskRow['priority'], assigned_to: form.assigned_to || null,
        customer_id: relation?.kind === 'customer' ? relation.id : null, lead_id: relation?.kind === 'lead' ? relation.id : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      setForm({ title: '', description: '', due: '', priority: 'normal', assigned_to: '' });
      setRelation(null);
      onOpenChange(false);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t('followups.new')}
      footer={<><Button variant="primary" disabled={!form.title.trim()} loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('followups.relatedTo')}><RelationPicker value={relation} onChange={setRelation} /></Field>
        <Field label={`${t('followups.taskTitle')} *`}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('roles.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('followups.dueAt')}><Input type="datetime-local" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
          <Field label={t('followups.priority')}>
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{t(`followups.priorities.${p}`)}</option>)}
            </Select>
          </Field>
        </div>
        {can('tasks', 'assign') && (
          <Field label={t('followups.assignee')}>
            <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">{staff?.full_name}</option>
              {(employees.data ?? []).filter((e) => e.id !== staff?.employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Drawer>
  );
}
