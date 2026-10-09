import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ClipboardList, ListTodo, SquareCheckBig, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CompleteTaskDialog, FollowUpRow, TASK_SELECT, type TaskRow } from '@/components/crm';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dueBucket, fmtDate, useLang } from '@/lib/crm';
import { customerTitle, isLate, REQUEST_SELECT, STEP_STATUS_TONE, type RequestRow, type StepStatus } from '@/lib/requests';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface MyStep {
  id: string; name_ar: string; name_en: string | null; status: StepStatus; due_at: string | null;
  request: { id: string; request_no: string; customer: RequestRow['customer'] } | null;
}

/** "What do I do today?" — my tasks, my request steps and overdue requests (PROJECT_PLAN §4.2 / §10). */
export function MyWork() {
  const { t } = useTranslation();
  const lang = useLang();
  const { staff, can } = useAuth();
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const me = staff?.employee_id;

  const tasks = useQuery({
    queryKey: ['tasks', 'dashboard', me],
    enabled: !!me && can('tasks', 'view'),
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('assigned_to', me!).in('status', ['todo', 'in_progress'])
        .order('due_at', { ascending: true, nullsFirst: false }).limit(100);
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
  const steps = useQuery({
    queryKey: ['requests', 'my-steps', me],
    enabled: !!me && can('service_requests', 'view'),
    queryFn: async () => {
      const { data, error } = await supabase.from('service_request_steps')
        .select('id, name_ar, name_en, status, due_at, request:service_requests!service_request_steps_request_id_fkey(id, request_no, customer:customers(id, full_name, company_name, customer_type, phone, customer_no))')
        .eq('assigned_employee_id', me!).in('status', ['active', 'waiting_client', 'waiting_approval', 'returned']).order('due_at').limit(50);
      if (error) throw error;
      return data as unknown as MyStep[];
    },
  });
  const overdue = useQuery({
    queryKey: ['requests', 'overdue'],
    enabled: can('service_requests', 'view'),
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).eq('is_overdue', true)
        .in('status', ['submitted', 'in_progress', 'waiting_client', 'on_hold']).order('due_at').limit(20);
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });

  const open = tasks.data ?? [];
  const lateTasks = open.filter((x) => dueBucket(x.due_at) === 'overdue');
  const todayTasks = open.filter((x) => ['overdue', 'today'].includes(dueBucket(x.due_at)));
  const upcoming = open.filter((x) => {
    if (!x.due_at || dueBucket(x.due_at) !== 'upcoming') return false;
    return new Date(x.due_at).getTime() - Date.now() < 7 * 86_400_000;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<ListTodo className="size-5" />} value={open.length} label={t('dashboard.kpi.openTasks')} to="/tasks" />
        <Kpi icon={<AlertTriangle className="size-5" />} value={lateTasks.length} label={t('dashboard.kpi.overdueTasks')} tone="danger" to="/tasks" />
        <Kpi icon={<Workflow className="size-5" />} value={steps.data?.length ?? 0} label={t('dashboard.kpi.mySteps')} to="/requests" />
        <Kpi icon={<ClipboardList className="size-5" />} value={overdue.data?.length ?? 0} label={t('dashboard.kpi.overdueRequests')} tone="danger" to="/requests" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<SquareCheckBig className="size-4" />} title={t('dashboard.today')} actions={<Link to="/tasks" className="text-xs font-semibold text-brand">{t('common.more')}</Link>} />
          <div className="divide-y divide-line px-4">
            {todayTasks.length === 0 ? <EmptyState title={t('dashboard.nothingToday')} /> : todayTasks.slice(0, 8).map((x) => <FollowUpRow key={x.id} task={x} showRelated onComplete={setCompleting} />)}
          </div>
          {upcoming.length > 0 && (
            <div className="border-t border-line px-4 py-2 text-xs text-ink-3">{t('dashboard.upcomingCount', { count: upcoming.length })}</div>
          )}
        </Card>

        <Card>
          <CardHeader icon={<Workflow className="size-4" />} title={t('dashboard.mySteps')} />
          {(steps.data ?? []).length === 0 ? <EmptyState title={t('dashboard.noSteps')} /> : (
            <ul className="divide-y divide-line">
              {steps.data!.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <Link to="/requests/$id" params={{ id: s.request?.id ?? '' }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{nameOf(s, lang)}</div>
                      <div className="truncate text-[11px] text-ink-3"><span className="ltr font-latin">{s.request?.request_no}</span> · {customerTitle(s.request?.customer ?? null)}</div>
                    </div>
                    <div className="text-end">
                      <Badge tone={STEP_STATUS_TONE[s.status]}>{t(`requests.stepStatuses.${s.status}`)}</Badge>
                      <div className={cn('mt-0.5 text-[11px]', isLate(s.due_at) ? 'font-semibold text-danger' : 'text-ink-3')}>{fmtDate(s.due_at, lang, false)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(overdue.data ?? []).length > 0 && (
        <Card>
          <CardHeader icon={<AlertTriangle className="size-4 text-danger" />} title={t('dashboard.overdueRequests')} />
          <ul className="divide-y divide-line">
            {overdue.data!.map((r) => (
              <li key={r.id}>
                <Link to="/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
                  <span className="ltr w-28 shrink-0 font-latin text-sm font-bold text-navy">{r.request_no}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{customerTitle(r.customer)}</div>
                    <div className="truncate text-[11px] text-ink-3">{nameOf(r.service, lang)}{r.current_step ? ` · ${nameOf(r.current_step, lang)}` : ''}</div>
                  </div>
                  <span className="text-xs font-semibold text-danger">{fmtDate(r.due_at, lang, false)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
    </div>
  );
}

function Kpi({ icon, value, label, tone, to }: { icon: ReactNode; value: number; label: string; tone?: 'danger'; to: string }) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-3 p-3 hover:border-brand-200">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tone === 'danger' && value > 0 ? 'bg-[#fce8e8] text-danger' : 'bg-brand-50 text-brand')}>{icon}</span>
        <div className="min-w-0">
          <div className="font-latin text-xl font-bold text-navy">{value}</div>
          <div className="truncate text-xs text-ink-2">{label}</div>
        </div>
      </Card>
    </Link>
  );
}
