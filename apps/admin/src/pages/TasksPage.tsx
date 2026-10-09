import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Columns3, List, Play, Plus, RotateCcw, SquareCheckBig } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CompleteTaskDialog, FollowUpRow, PriorityLabel, RelationPicker, TASK_SELECT, type Relation, type TaskRow } from '@/components/crm';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dueBucket, fmtDate, fromLocalInput, useEmployeeOptions, useLang } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Scope = 'mine' | 'team' | 'all';
type View = 'list' | 'board';
const BUCKETS = ['overdue', 'today', 'upcoming', 'noDate'] as const;
const KINDS = ['task', 'step_work', 'follow_up', 'call', 'inquiry', 'renewal'] as const;
const BOARD = ['todo', 'in_progress', 'done'] as const;

export function TasksPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { staff, scopeOf, can } = useAuth();
  const viewScope = scopeOf('tasks', 'view');
  const scopes: Scope[] = ['mine', ...(viewScope === 'department' || viewScope === 'all' ? (['team'] as Scope[]) : []), ...(viewScope === 'all' ? (['all'] as Scope[]) : [])];
  const [scope, setScope] = useState<Scope>('mine');
  const [view, setView] = useState<View>('list');
  const [kind, setKind] = useState('');
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['tasks', 'all', scope, staff?.employee_id],
    enabled: !!staff,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      let query = supabase.from('tasks').select(`${TASK_SELECT}, completed_at`)
        .or(`status.in.(todo,in_progress),and(status.eq.done,completed_at.gte.${weekAgo})`)
        .order('due_at', { ascending: true, nullsFirst: false }).limit(500);
      if (scope === 'mine') query = query.eq('assigned_to', staff!.employee_id);
      if (scope === 'team' && staff?.department_id) query = query.eq('department_id', staff.department_id);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((x) => !kind || x.kind === kind), [q.data, kind]);
  const open = rows.filter((x) => x.status !== 'done');
  const grouped = useMemo(() => {
    const g: Record<(typeof BUCKETS)[number], TaskRow[]> = { overdue: [], today: [], upcoming: [], noDate: [] };
    for (const task of open) g[dueBucket(task.due_at)].push(task);
    return g;
  }, [open]);

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'todo' | 'in_progress' }) => {
      const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('tasks.title')} actions={can('tasks', 'create') && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('tasks.new')}</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {scopes.map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn('rounded-md px-3 py-1', scope === s ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>{t(`followups.${s}`)}</button>
          ))}
        </div>
        <Select className="h-9 w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('tasks.kind')}>
          <option value="">{t('tasks.kind')}: {t('common.all')}</option>
          {KINDS.map((k) => <option key={k} value={k}>{t(`tasks.kinds.${k}`)}</option>)}
        </Select>
        <div className="flex-1" />
        <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {(['list', 'board'] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1', view === v ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>
              {v === 'list' ? <List className="size-4" /> : <Columns3 className="size-4" />}{t(`tasks.views.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : view === 'list' && rows.length === 0 ? (
        <Card><EmptyState icon={<SquareCheckBig className="size-8" />} title={t('tasks.empty')} /></Card>
      ) : view === 'list' ? (
        open.length === 0 ? <Card><EmptyState icon={<SquareCheckBig className="size-8" />} title={t('tasks.allDone')} /></Card> :
        BUCKETS.filter((b) => grouped[b].length).map((b) => (
          <section key={b} className="space-y-2">
            <h2 className={cn('text-xs font-bold', b === 'overdue' ? 'text-danger' : b === 'today' ? 'text-brand' : 'text-ink-3')}>{t(`followups.${b}`)} ({grouped[b].length})</h2>
            <Card className="divide-y divide-line px-4">
              {grouped[b].map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><FollowUpRow task={task} showRelated onComplete={setCompleting} /></div>
                  <Badge tone={task.kind === 'step_work' ? 'blue' : 'gray'} dot={false} className="hidden sm:inline-flex">{t(`tasks.kinds.${task.kind}`)}</Badge>
                </div>
              ))}
            </Card>
          </section>
        ))
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {BOARD.map((col) => {
            const items = rows.filter((x) => x.status === col);
            return (
              <div key={col} className="min-w-0 rounded-[var(--radius-card)] bg-muted p-2">
                <div className="flex items-center justify-between px-2 py-1.5 text-sm font-bold text-navy">
                  {t(`tasks.statuses.${col}`)} <span className="rounded-md bg-white px-1.5 text-[11px] text-ink-2">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((task) => {
                    const late = col !== 'done' && dueBucket(task.due_at) === 'overdue';
                    return (
                      <Card key={task.id} className="p-3">
                        <div className={cn('text-[13px] font-semibold', col === 'done' && 'text-ink-3 line-through')}>{task.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
                          <span className={cn(late && 'font-semibold text-danger')}><CalendarClock className="me-1 inline size-3" />{task.due_at ? fmtDate(task.due_at, lang) : t('followups.noDate')}</span>
                          {task.assignee?.profile?.full_name && <span>{task.assignee.profile.full_name}</span>}
                          {task.request && <Link to="/requests/$id" params={{ id: task.request.id }} className="ltr font-latin font-semibold text-brand">{task.request.request_no}</Link>}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <PriorityLabel p={task.priority} />
                          <div className="flex-1" />
                          {col === 'todo' && <Button size="sm" onClick={() => move.mutate({ id: task.id, status: 'in_progress' })}><Play className="size-3.5" /> {t('tasks.start')}</Button>}
                          {col !== 'done' && <Button size="sm" variant="success" onClick={() => setCompleting(task)}>{t('followups.complete')}</Button>}
                          {col === 'done' && <Button size="sm" variant="ghost" onClick={() => move.mutate({ id: task.id, status: 'todo' })}><RotateCcw className="size-3.5" /> {t('tasks.reopen')}</Button>}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
      <NewTaskDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function NewTaskDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { can, staff } = useAuth();
  const qc = useQueryClient();
  const employees = useEmployeeOptions();
  const empty = { title: '', description: '', kind: 'task', assigned_to: '', due: '', priority: 'normal' };
  const [f, setF] = useState(empty);
  const [rel, setRel] = useState<Relation | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').insert({
        title: f.title.trim(), description: f.description.trim() || null, kind: f.kind as 'task', assigned_to: f.assigned_to || staff?.employee_id,
        due_at: fromLocalInput(f.due), priority: f.priority as 'normal',
        customer_id: rel?.kind === 'customer' ? rel.id : null, lead_id: rel?.kind === 'lead' ? rel.id : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['tasks'] }); onOpenChange(false); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Drawer open={open} onOpenChange={(v) => { if (v) { setF(empty); setRel(null); } onOpenChange(v); }} title={t('tasks.new')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={!f.title.trim()} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('followups.taskTitle')} *`}><Input value={f.title} autoFocus onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('workflow.description')}><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('tasks.kind')}>
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {(['task', 'call', 'inquiry', 'follow_up', 'renewal'] as const).map((k) => <option key={k} value={k}>{t(`tasks.kinds.${k}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('followups.priority')}>
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{t(`followups.priorities.${p}`)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('followups.dueAt')}><Input type="datetime-local" dir="ltr" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          {can('tasks', 'assign') && (
            <Field label={t('followups.assignee')}>
              <Select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
                <option value="">{staff?.full_name}</option>
                {(employees.data ?? []).filter((e) => e.id !== staff?.employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label={t('followups.relatedTo')}><RelationPicker value={rel} onChange={setRel} /></Field>
      </div>
    </Drawer>
  );
}
