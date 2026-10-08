import * as Dialog from '@radix-ui/react-dialog';
import {
  closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronRight, Clock, CopyPlus, FileText, Flag, GripVertical, Info, ListChecks,
  MonitorSmartphone, Play, Plus, Rocket, Smartphone, Trash2, UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Select, Spinner } from '@/components/ui';
import { StepSettings } from '@/components/workflow/StepSettings';
import { CompareDialog, NewStepDialog, PublishDialog } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { useEmployeeOptions, useLang } from '@/lib/crm';
import {
  draftVersion, nameOf, publishedVersion, useDepartmentOptions, useMediaQuery, useRoleOptions, useService, useWorkflowSteps,
  type Step, type WorkflowVersion,
} from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

const statusTone = { draft: 'amber', published: 'green', archived: 'gray' } as const;

export function WorkflowBuilderPage() {
  const { id, workflowId } = useParams({ strict: false }) as { id: string; workflowId?: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isMobile = !useMediaQuery('(min-width: 768px)');

  const service = useService(id);
  const s = service.data;
  const versions = s?.versions ?? [];
  const pub = publishedVersion(s);
  const draft = draftVersion(s);
  const wf: WorkflowVersion | undefined = versions.find((v) => v.id === workflowId) ?? draft ?? pub ?? versions[0];
  const editable = !!wf && wf.status === 'draft' && can('services_config', 'edit');

  const steps = useWorkflowSteps(wf?.id);
  const base = useWorkflowSteps(wf?.status === 'draft' ? wf.based_on_workflow_id : null);
  const baseKeys = useMemo(() => new Set((base.data ?? []).map((x) => x.step_key)), [base.data]);
  const running = useQuery({
    queryKey: ['workflow_running', pub?.id],
    enabled: !!pub,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workflow_running_requests', { p_workflow_id: pub!.id });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });

  // local order for optimistic drag & drop
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder((steps.data ?? []).map((x) => x.id));
  }, [steps.data]);
  const byId = useMemo(() => new Map((steps.data ?? []).map((x) => [x.id, x])), [steps.data]);
  const ordered = order.map((sid) => byId.get(sid)).filter(Boolean) as Step[];

  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // switching version or layout closes the drawer and clears the selection
  useEffect(() => {
    setSettingsOpen(false);
  }, [isDesktop, wf?.id]);
  useEffect(() => {
    setSelected(null);
  }, [wf?.id]);

  // keep a step selected on desktop (side panel is always visible)
  useEffect(() => {
    if (isDesktop && !selected && ordered[0]) setSelected(ordered[0].id);
    // a just-inserted step is not in the list until the refetch finishes
    if (selected && steps.data && !steps.isFetching && !byId.has(selected)) setSelected(null);
  }, [isDesktop, selected, ordered, steps.data, steps.isFetching, byId]);

  const refreshSteps = () => void qc.invalidateQueries({ queryKey: ['workflow_steps', wf?.id] });
  const refreshService = () => void qc.invalidateQueries({ queryKey: ['services'] });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_workflow_steps', { p_workflow_id: wf!.id, p_step_ids: ids });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('workflow.reordered'));
      refreshSteps();
    },
    onError: (e) => {
      toast.error(t(errorKey(e)));
      setOrder((steps.data ?? []).map((x) => x.id));
    },
  });
  const insert = useMutation({
    mutationFn: async ({ pos, ar, en }: { pos: number; ar: string; en: string }) => {
      const { data, error } = await supabase.rpc('insert_workflow_step', { p_workflow_id: wf!.id, p_position: pos, p_name_ar: ar, p_name_en: en || undefined });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => {
      setInsertAt(null);
      refreshSteps();
      refreshService();
      setSelected(newId);
      setSettingsOpen(true);
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const createDraft = useMutation({
    mutationFn: async () => {
      const { data, error } = wf && wf.status === 'archived'
        ? await supabase.rpc('clone_workflow_as_draft', { p_workflow_id: wf.id })
        : await supabase.rpc('create_workflow_draft', { p_service_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId) => {
      refreshService();
      void navigate({ to: '/services/$id/workflow/$workflowId', params: { id, workflowId: newId } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const discard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('service_workflows').delete().eq('id', wf!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDiscarding(false);
      refreshService();
      void navigate({ to: '/services/$id/workflow', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    reorder.mutate(next);
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
  };

  if (service.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!s || !wf) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;

  const selectedStep = selected ? byId.get(selected) ?? null : null;
  const selectedIndex = selectedStep ? ordered.indexOf(selectedStep) : -1;
  const compareTarget = wf.status === 'draft'
    ? (pub ?? versions.find((v) => v.id === wf.based_on_workflow_id) ?? null)
    : versions.find((v) => v.version < wf.version && v.status !== 'draft') ?? null;
  const basedOnVersion = versions.find((v) => v.id === wf.based_on_workflow_id)?.version;

  const selectStep = (sid: string) => {
    setSelected(sid);
    setSettingsOpen(true);
  };

  const settings = selectedStep && (
    <StepSettings
      key={selectedStep.id}
      step={selectedStep}
      index={selectedIndex}
      editable={editable}
      isNewStep={!baseKeys.has(selectedStep.step_key) && wf.status === 'draft'}
      onDeleted={() => { setSelected(null); setSettingsOpen(false); refreshService(); }}
      onClose={isDesktop ? undefined : () => setSettingsOpen(false)}
    />
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs text-ink-3">
            <Link to="/services" className="hover:text-brand">{t('services.title')}</Link>
            <ChevronRight className="size-3 rtl:rotate-180" />
            <Link to="/services/$id" params={{ id }} className="truncate hover:text-brand">{nameOf(s, lang)}</Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-latin text-xl font-bold text-navy md:text-2xl">{t('workflow.title')}</h1>
            <Badge tone={statusTone[wf.status]}>
              {wf.status === 'draft' && !pub ? t('workflow.unpublishedDraft') : t(`workflow.statuses.${wf.status}`)}
            </Badge>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <Select className="h-10 w-auto min-w-44" value={wf.id} aria-label="version"
            onChange={(e) => void navigate({ to: '/services/$id/workflow/$workflowId', params: { id, workflowId: e.target.value } })}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {t('workflow.versionLabel', { version: v.version, status: t(`workflow.statuses.${v.status}`) })}
                {v.status === 'draft' && v.based_on_workflow_id ? ` ${t('workflow.basedOn', { version: versions.find((x) => x.id === v.based_on_workflow_id)?.version })}` : ''}
              </option>
            ))}
          </Select>
          {compareTarget && (
            <Button onClick={() => setComparing(true)}>
              <ArrowUpDown className="size-4" /> <span className="hidden sm:inline">{t('workflow.compare', { version: compareTarget.version })}</span>
            </Button>
          )}
          {editable && can('services_config', 'edit') && (
            <Button variant="danger" onClick={() => setDiscarding(true)} aria-label={t('workflow.discardDraft')}>
              <Trash2 className="size-4" /><span className="hidden lg:inline">{t('workflow.discardDraft')}</span>
            </Button>
          )}
          {wf.status !== 'draft' && can('services_config', 'create') && (
            draft ? (
              <Link to="/services/$id/workflow/$workflowId" params={{ id, workflowId: draft.id }}>
                <Button variant="primary">{t('workflow.openDraft', { version: draft.version })}</Button>
              </Link>
            ) : (
              <Button variant="primary" loading={createDraft.isPending} onClick={() => createDraft.mutate()}>
                <CopyPlus className="size-4" /> {t('workflow.createDraft', { version: wf.version })}
              </Button>
            )
          )}
          {wf.status === 'draft' && can('services_config', 'approve') && (
            <Button variant="primary" onClick={() => setPublishing(true)} disabled={ordered.length === 0}>
              <Rocket className="size-4" /> {t('workflow.publish', { version: wf.version })}
            </Button>
          )}
        </div>
      </div>

      {/* banner */}
      <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
        wf.status === 'draft' ? 'border-[#f2dca3] bg-[#fdf6e3] text-[#6b4a00]' : 'border-line bg-white text-ink-2')}>
        <Info className="mt-0.5 size-4 shrink-0" />
        <div className="flex-1">
          {wf.status === 'draft'
            ? pub
              ? t('workflow.draftBanner', { version: wf.version, published: pub.version, count: running.data ?? 0 })
              : t('workflow.draftBannerNoPublished', { version: wf.version })
            : t('workflow.readOnlyBanner', { version: wf.version, status: t(`workflow.statuses.${wf.status}`) })}
          {wf.status === 'draft' && basedOnVersion && <span className="text-xs opacity-80"> · {t('workflow.autosave')}</span>}
        </div>
      </div>
      {isMobile && editable && (
        <div className="flex items-center gap-2 text-xs text-ink-3"><MonitorSmartphone className="size-4" /> {t('workflow.mobileHint')}</div>
      )}

      <div className={cn('grid gap-4', isDesktop && 'grid-cols-[minmax(0,1fr)_420px]')}>
        {/* canvas */}
        <Card className="relative bg-[radial-gradient(#dfe7f3_1px,transparent_1px)] [background-size:18px_18px] p-3 md:p-6">
          <div className="mx-auto flex max-w-[620px] flex-col items-stretch">
            <Pill icon={<Play className="size-3.5" />}>{t('workflow.start')}</Pill>
            {steps.isLoading ? (
              <div className="grid place-items-center py-16"><Spinner /></div>
            ) : ordered.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-3">{t('workflow.noSteps')}</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={!editable || isMobile}>
                  {ordered.map((st, i) => (
                    <div key={st.id}>
                      <Gap editable={editable} onAdd={() => setInsertAt(i + 1)} />
                      <StepCard
                        step={st}
                        index={i}
                        selected={selected === st.id}
                        isNew={wf.status === 'draft' && !!wf.based_on_workflow_id && base.isSuccess && !baseKeys.has(st.step_key)}
                        editable={editable}
                        listMode={isMobile}
                        onSelect={() => selectStep(st.id)}
                        onUp={() => move(i, i - 1)}
                        onDown={() => move(i, i + 1)}
                        isFirst={i === 0}
                        isLast={i === ordered.length - 1}
                      />
                    </div>
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {editable && (
              <button type="button" onClick={() => setInsertAt(ordered.length + 1)}
                className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-[10px] border border-dashed border-brand bg-white px-5 text-sm font-semibold text-brand hover:bg-brand-50">
                <Plus className="size-4" /> {t('workflow.addStep')}
              </button>
            )}
            <div className="mt-4"><Pill icon={<Flag className="size-3.5" />} muted>{t('workflow.end')}</Pill></div>
          </div>
          {editable && !isMobile && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-3"><GripVertical className="size-4" /> {t('workflow.dragHint')}</div>
          )}
        </Card>

        {/* settings: fixed panel on desktop, drawer on tablet/mobile */}
        {isDesktop ? (
          <Card className="sticky top-0 flex h-[calc(100vh-150px)] min-h-[520px] flex-col overflow-hidden">
            {settings ?? <EmptyState icon={<ListChecks className="size-8" />} title={t('workflow.selectStep')} />}
          </Card>
        ) : (
          <SettingsDrawer open={settingsOpen && !!selectedStep} onOpenChange={setSettingsOpen}>{settings}</SettingsDrawer>
        )}
      </div>

      <NewStepDialog
        open={insertAt !== null}
        onOpenChange={(v) => !v && setInsertAt(null)}
        loading={insert.isPending}
        onSubmit={(ar, en) => insertAt !== null && insert.mutate({ pos: insertAt, ar, en })}
      />
      <CompareDialog
        open={comparing}
        onOpenChange={setComparing}
        from={compareTarget && (wf.status === 'draft' || compareTarget.version < wf.version) ? compareTarget : wf}
        to={compareTarget && (wf.status === 'draft' || compareTarget.version < wf.version) ? wf : compareTarget}
      />
      {wf.status === 'draft' && (
        <PublishDialog
          key={wf.id}
          open={publishing}
          onOpenChange={setPublishing}
          draft={wf}
          published={pub}
          onPublished={() => {
            refreshService();
            refreshSteps();
          }}
        />
      )}
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t('workflow.discardConfirm', { version: wf.version })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </div>
  );
}

/** Tablet: drawer covering 60% · Mobile: full screen. The step panel brings its own header and close button. */
function SettingsDrawer({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(11,22,40,.45)]" />
        <Dialog.Content className="fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-white shadow-2xl outline-none md:w-[60vw]">
          <Dialog.Title className="sr-only">{t('workflow.title')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('workflow.title')}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Pill({ icon, children, muted }: { icon: React.ReactNode; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-center">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold', muted ? 'bg-muted text-ink-2' : 'bg-navy text-white')}>
        {icon}{children}
      </span>
    </div>
  );
}

/** Connector between steps with a "+" to insert a step at that position. */
function Gap({ editable, onAdd }: { editable: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="group relative flex h-8 items-center justify-center">
      <span className="absolute inset-y-0 w-px bg-brand-200" />
      {editable && (
        <button type="button" onClick={onAdd} title={t('workflow.addStepHere')} aria-label={t('workflow.addStepHere')}
          className="relative z-[1] grid size-6 place-items-center rounded-full border border-brand bg-white text-brand opacity-100 transition-opacity hover:bg-brand hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100">
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function StepCard({ step, index, selected, isNew, editable, listMode, onSelect, onUp, onDown, isFirst, isLast }: {
  step: Step; index: number; selected: boolean; isNew: boolean; editable: boolean; listMode: boolean; onSelect: () => void;
  onUp: () => void; onDown: () => void; isFirst: boolean; isLast: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: !editable || listMode });
  const assignee = useAssigneeLabel(step);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex items-center gap-2 rounded-xl border bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,30,54,.04)] transition-colors md:gap-3 md:px-4',
        selected ? 'border-brand ring-3 ring-brand-50' : 'border-line hover:border-brand-200',
        isDragging && 'z-10 shadow-xl ring-3 ring-brand-100',
      )}
    >
      {editable && !listMode && (
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={t('workflow.dragHint')}
          className="cursor-grab touch-none rounded-md p-1 text-ink-3 hover:bg-muted active:cursor-grabbing">
          <GripVertical className="size-5" />
        </button>
      )}
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold', isNew ? 'bg-sky text-white' : 'bg-navy text-white')}>{index + 1}</span>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-navy">{nameOf(step, lang)}</span>
          {isNew && <Badge tone="sky" dot={false}>{t('workflow.newStep')}</Badge>}
          {!step.is_required && <Badge tone="gray" dot={false}>{t('workflow.optional')}</Badge>}
          {!step.is_client_visible && <Badge tone="gray" dot={false}>{t('workflow.hidden')}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{t(`workflow.days.${step.duration_unit}`, { count: step.duration_value })}</span>
          <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{assignee}</span>
          {step.fields.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks className="size-3.5" />{t('workflow.fieldsCount', { count: step.fields.length })}</span>}
          {step.docs.length > 0 && <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />{t('workflow.docsCount', { count: step.docs.length })}</span>}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5 text-ink-3">
        {step.requires_approval && <span title={t('workflow.requiresApproval')}><CheckCircle2 className="size-[18px] text-[#6b45d9]" /></span>}
        {step.client_action_required && <span title={t('workflow.clientAction')}><Smartphone className="size-[18px] text-warning" /></span>}
      </div>
      {editable && listMode && (
        <div className="flex shrink-0 flex-col">
          <button type="button" disabled={isFirst} onClick={onUp} className="rounded-md p-1 text-ink-2 disabled:opacity-30" aria-label={t('workflow.moveUp')}>
            <ArrowUp className="size-4" />
          </button>
          <button type="button" disabled={isLast} onClick={onDown} className="rounded-md p-1 text-ink-2 disabled:opacity-30" aria-label={t('workflow.moveDown')}>
            <ArrowDown className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function useAssigneeLabel(step: Step) {
  const { t } = useTranslation();
  const lang = useLang();
  const roles = useRoleOptions();
  const departments = useDepartmentOptions();
  const employees = useEmployeeOptions();
  switch (step.assignee_type) {
    case 'department':
      return nameOf(departments.data?.find((d) => d.id === step.assignee_department_id), lang);
    case 'role':
      return nameOf(roles.data?.find((r) => r.id === step.assignee_role_id), lang);
    case 'employee':
      return employees.data?.find((e) => e.id === step.assignee_employee_id)?.name ?? '—';
    default:
      return t('workflow.assigneeShort.request_owner');
  }
}
