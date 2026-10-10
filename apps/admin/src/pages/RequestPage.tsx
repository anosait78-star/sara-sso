import type { DynamicValue } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  AlertTriangle, Ban, Eye, Check, CheckCircle2, ChevronRight, CircleDashed, CirclePause, CirclePlay, Clock, FileCheck2, FileText, FileX2,
  ListChecks, Pencil, Plus, RotateCcw, SkipForward, Smartphone, UserRound, UserRoundCog,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CompleteTaskDialog, FollowUpRow, PriorityLabel, TASK_SELECT, Timeline, type TaskRow } from '@/components/crm';
import { DynamicForm, formatFieldValue } from '@/components/requests/DynamicForm';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Switch, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { DocumentReview } from '@/components/requests/DocumentReview';
import { RequestMessages } from '@/components/requests/RequestMessages';
import { useAuth } from '@/lib/auth';
import { fmtDate, toLocalInput, fromLocalInput, useEmployeeOptions, useLang } from '@/lib/crm';
import {
  customerTitle, DOC_STATUS_TONE, isLate, REQUEST_STATUS_TONE, STEP_STATUS_TONE, useFieldValues,
  useRequest, useRequestDocuments, useRequestSteps, useStepMissing, type Priority, type RequestDocument, type RequestRow, type RequestStep,
} from '@/lib/requests';
import { ASSIGNEE_TYPES, DURATION_UNITS, nameOf, useDepartmentOptions, useRoleOptions, type AssigneeType, type DurationUnit } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Tab = 'data' | 'documents' | 'workflow' | 'messages' | 'tasks' | 'timeline';

export function RequestPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can, staff } = useAuth();
  const qc = useQueryClient();
  const req = useRequest(id);
  const steps = useRequestSteps(id);
  const docs = useRequestDocuments(id);
  const values = useFieldValues(id);
  const roles = useRoleOptions();
  const [tab, setTab] = useState<Tab>('data');
  const [dialog, setDialog] = useState<null | 'complete' | 'approve' | 'return' | 'skip' | 'reassign' | 'hold' | 'cancel' | 'edit' | 'adhoc'>(null);

  const r = req.data;
  const current = steps.data?.find((s) => s.id === r?.current_step_id) ?? null;
  const missing = useStepMissing(current?.id);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const myRoleId = roles.data?.find((x) => x.key === staff?.role_key)?.id;
  const isApprover = !!current && (staff?.role_key === 'super_admin' || (!!myRoleId && current.approver_role_id === myRoleId));
  const open = !!r && !['completed', 'cancelled'].includes(r.status);
  const canEdit = can('service_requests', 'edit') && open;

  const saveData = useMutation({
    mutationFn: async (v: Record<string, DynamicValue>) => {
      const { error } = await supabase.rpc('submit_step_data', { p_request_step_id: current!.id, p_values: v as never });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); refresh(); },
    onError: (e) => toast.error(t(requestErrorKey(e))),
  });

  if (req.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!r) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;

  const initialValues = Object.fromEntries((values.data ?? []).filter((v) => v.request_step_id === current?.id).map((v) => [v.field_key, v.value as DynamicValue]));
  const tabs: Tab[] = ['data', 'documents', 'workflow', 'messages', 'tasks', 'timeline'];
  const stepDocs = (docs.data ?? []).filter((d) => d.request_step_id === current?.id);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Link to="/requests" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('requests.title')}</Link>

      {/* header */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="ltr font-latin text-xl font-bold text-navy md:text-2xl">{r.request_no}</h1>
              <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(`requests.statuses.${r.status}`)}</Badge>
              {r.is_overdue && <Badge tone="red" dot={false}><AlertTriangle className="size-3.5" /> {t('requests.overdue')}</Badge>}
              <PriorityLabel p={r.priority} />
            </div>
            <div className="mt-1 text-sm font-semibold text-ink">{nameOf(r.service, lang)} <span className="font-latin text-xs text-ink-3">· v{r.workflow?.version}</span></div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              <Link to="/customers/$id" params={{ id: r.customer_id }} className="font-semibold text-brand">{customerTitle(r.customer)}</Link>
              <span><UserRound className="me-1 inline size-3.5" />{r.owner?.profile?.full_name ?? t('crm.unassigned')}</span>
              <span><Clock className="me-1 inline size-3.5" />{t('requests.expected')}: {fmtDate(r.due_at, lang, false)}</span>
              {r.total_amount != null && <span className="ltr">{Number(r.total_amount).toLocaleString('en')} EGP</span>}
            </div>
            {r.status === 'on_hold' && r.hold_reason && <p className="mt-2 text-xs text-[#6b45d9]">{t('requests.holdReason')}: {r.hold_reason}</p>}
            {r.status === 'cancelled' && r.cancelled_reason && <p className="mt-2 text-xs text-danger">{t('requests.cancelReason')}: {r.cancelled_reason}</p>}
          </div>
          {open && (
            <div className="flex flex-wrap gap-2">
              {can('service_requests', 'edit') && <Button size="sm" onClick={() => setDialog('edit')}><Pencil className="size-4" /> {t('common.edit')}</Button>}
              {can('service_requests', 'edit') && (r.status === 'on_hold'
                ? <ResumeButton requestId={r.id} onDone={refresh} />
                : <Button size="sm" onClick={() => setDialog('hold')}><CirclePause className="size-4" /> {t('requests.hold')}</Button>)}
              {can('service_requests', 'delete') && <Button size="sm" variant="danger" onClick={() => setDialog('cancel')}><Ban className="size-4" /> {t('requests.cancel')}</Button>}
            </div>
          )}
        </div>
        <Progress steps={steps.data ?? []} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {/* current step */}
          {current ? (
            <Card className="border-brand-100">
              <div className="flex flex-wrap items-start gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white">{current.sort_order}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink-3">{t('requests.currentStep')}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-navy">{nameOf(current, lang)}</span>
                    <Badge tone={STEP_STATUS_TONE[current.status]}>{t(`requests.stepStatuses.${current.status}`)}</Badge>
                    {current.is_adhoc && <Badge tone="sky" dot={false}>{t('requests.adhoc')}</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                    <span><UserRound className="me-1 inline size-3.5" />{current.assignee?.profile?.full_name ?? nameOf(current.department, lang)}</span>
                    <span className={cn(isLate(current.due_at, current.status) && 'font-semibold text-danger')}>
                      <Clock className="me-1 inline size-3.5" />{t('requests.stepDue')}: {fmtDate(current.due_at, lang)}
                    </span>
                    {current.requires_approval && <span className="text-[#6b45d9]"><CheckCircle2 className="me-1 inline size-3.5" />{t('requests.approver')}: {nameOf(current.approver_role, lang)}</span>}
                  </div>
                  {current.description && <p className="mt-2 text-sm text-ink-2">{current.description}</p>}
                  {current.client_instructions && <p className="mt-1 text-xs text-[#8a5d00]"><Smartphone className="me-1 inline size-3.5" />{current.client_instructions}</p>}
                  {current.status === 'returned' && current.return_reason && (
                    <p className="mt-2 rounded-lg bg-[#fff5f5] px-3 py-2 text-sm text-danger"><RotateCcw className="me-1 inline size-4" />{t('requests.returnedBecause')}: {current.return_reason}</p>
                  )}
                </div>
              </div>

              {current.status !== 'waiting_approval' && (missing.data?.length ?? 0) > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <div className="mb-2 text-xs font-bold text-ink-2">{t('requests.missingTitle')}</div>
                  <ul className="flex flex-wrap gap-1.5">
                    {missing.data!.map((m) => (
                      <li key={m.kind + m.item_key} className="inline-flex items-center gap-1 rounded-lg bg-[#fdf3dc] px-2 py-1 text-xs text-[#8a5d00]">
                        {m.kind === 'field' ? <ListChecks className="size-3.5" /> : <FileText className="size-3.5" />}{(lang === 'en' ? m.name_en : null) || m.name_ar}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {open && (
                <div className="flex flex-wrap gap-2 border-t border-line bg-[#fbfcfe] px-4 py-3">
                  {current.status === 'waiting_approval' ? (
                    isApprover ? (
                      <>
                        <Button variant="success" onClick={() => setDialog('approve')}><Check className="size-4" /> {t('requests.approve')}</Button>
                        <Button variant="danger" onClick={() => setDialog('return')}><RotateCcw className="size-4" /> {t('requests.return')}</Button>
                      </>
                    ) : <span className="text-sm text-[#6b45d9]">{t('requests.waitingApprover', { role: nameOf(current.approver_role, lang) })}</span>
                  ) : canEdit && r.status !== 'on_hold' && (
                    <>
                      <Button variant="primary" disabled={(missing.data?.length ?? 0) > 0} onClick={() => setDialog('complete')}>
                        <CheckCircle2 className="size-4" /> {current.requires_approval ? t('requests.sendForApproval') : t('requests.completeStep')}
                      </Button>
                      {!current.is_required && <Button onClick={() => setDialog('skip')}><SkipForward className="size-4" /> {t('requests.skip')}</Button>}
                    </>
                  )}
                  {can('service_requests', 'assign') && <Button onClick={() => setDialog('reassign')}><UserRoundCog className="size-4" /> {t('requests.reassign')}</Button>}
                </div>
              )}
            </Card>
          ) : r.status === 'completed' ? (
            <Card className="flex items-center gap-3 p-4 text-success"><CheckCircle2 className="size-6" /><span className="font-bold">{t('requests.completedOn', { date: fmtDate(r.completed_at, lang) })}</span></Card>
          ) : null}

          <div className="flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn('-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2', k === 'timeline' && 'lg:hidden')}>
                {t(`requests.tabs2.${k}`)}
                {k === 'documents' && <span className="ms-1.5 rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{docs.data?.length ?? 0}</span>}
              </button>
            ))}
          </div>

          {tab === 'data' && (
            <div className="space-y-4">
              {current && current.fields_snapshot.length > 0 && (
                <Card>
                  <CardHeader title={`${t('requests.stepData')}: ${nameOf(current, lang)}`} icon={<ListChecks className="size-4 text-brand" />} />
                  <div className="p-4">
                    <DynamicForm fields={current.fields_snapshot} initial={initialValues} readOnly={!canEdit || current.status === 'waiting_approval'}
                      saving={saveData.isPending} onSubmit={(v) => saveData.mutate(v)} />
                  </div>
                </Card>
              )}
              {current && stepDocs.length > 0 && (
                <Card>
                  <CardHeader title={t('requests.stepDocuments')} icon={<FileText className="size-4 text-brand" />} />
                  <DocumentList docs={stepDocs} onChanged={refresh} />
                </Card>
              )}
              <AllValues steps={steps.data ?? []} values={values.data ?? []} currentId={current?.id} />
            </div>
          )}
          {tab === 'documents' && (
            <Card>
              {(docs.data ?? []).length === 0 ? <EmptyState title={t('requests.noDocuments')} /> : (
                (steps.data ?? []).filter((s) => (docs.data ?? []).some((d) => d.request_step_id === s.id)).map((s) => (
                  <div key={s.id}>
                    <div className="border-b border-line bg-muted px-4 py-2 text-xs font-bold text-ink-2">{s.sort_order}. {nameOf(s, lang)}</div>
                    <DocumentList docs={(docs.data ?? []).filter((d) => d.request_step_id === s.id)} onChanged={refresh} />
                  </div>
                ))
              )}
            </Card>
          )}
          {tab === 'workflow' && (
            <Stepper steps={steps.data ?? []} currentId={current?.id} docs={docs.data ?? []}
              canAdhoc={canEdit} onAdhoc={() => setDialog('adhoc')} />
          )}
          {tab === 'messages' && <RequestMessages requestId={r.id} open={open} />}
          {tab === 'tasks' && <RequestTasks requestId={r.id} />}
          {tab === 'timeline' && <div className="lg:hidden"><Timeline requestId={r.id} /></div>}
        </div>
        <div className="hidden space-y-4 lg:block">
          {r.notes && <Card className="p-4 text-sm"><div className="mb-1 text-xs font-bold text-ink-2">{t('requests.notes')}</div>{r.notes}</Card>}
          <Timeline requestId={r.id} />
        </div>
      </div>

      {current && (
        <>
          <ReasonDialog open={dialog === 'complete'} onClose={() => setDialog(null)} title={current.requires_approval ? t('requests.sendForApproval') : t('requests.completeStep')}
            label={t('requests.note')} optional onDone={refresh}
            run={(note) => supabase.rpc('complete_request_step', { p_request_step_id: current.id, p_note: note || undefined })} />
          <ReasonDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title={t('requests.approve')} label={t('requests.note')} optional onDone={refresh}
            run={(note) => supabase.rpc('approve_request_step', { p_request_step_id: current.id, p_note: note || undefined })} />
          <ReasonDialog open={dialog === 'return'} onClose={() => setDialog(null)} title={t('requests.return')} label={t('requests.reason')} onDone={refresh} danger
            run={(reason) => supabase.rpc('return_request_step', { p_request_step_id: current.id, p_reason: reason })} />
          <ReasonDialog open={dialog === 'skip'} onClose={() => setDialog(null)} title={t('requests.skip')} label={t('requests.reason')} onDone={refresh}
            run={(reason) => supabase.rpc('skip_request_step', { p_request_step_id: current.id, p_reason: reason })} />
          <ReassignDialog open={dialog === 'reassign'} onClose={() => setDialog(null)} step={current} onDone={refresh} />
          <AdhocDialog open={dialog === 'adhoc'} onClose={() => setDialog(null)} request={r} afterStep={current} onDone={refresh} />
        </>
      )}
      <ReasonDialog open={dialog === 'hold'} onClose={() => setDialog(null)} title={t('requests.hold')} label={t('requests.reason')} onDone={refresh}
        run={(reason) => supabase.rpc('set_request_hold', { p_request_id: r.id, p_hold: true, p_reason: reason })} />
      <ReasonDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={t('requests.cancelConfirm', { no: r.request_no })} label={t('requests.reason')} onDone={refresh} danger
        run={(reason) => supabase.rpc('cancel_service_request', { p_request_id: r.id, p_reason: reason })} />
      <EditRequestDialog open={dialog === 'edit'} onClose={() => setDialog(null)} request={r} onDone={refresh} />
    </div>
  );
}

/** Maps request-engine errors to messages. */
function requestErrorKey(e: unknown) {
  const msg = (e as { message?: string })?.message ?? '';
  if (/step incomplete/i.test(msg)) return 'requests.errors.incomplete';
  if (/below the minimum|above the maximum|invalid (value|option|phone|email|national id)|too (short|long)|invalid format/i.test(msg)) return 'requests.errors.invalidValue';
  if (/not the active step|not waiting/i.test(msg)) return 'requests.errors.stepChanged';
  if (/service is not active/i.test(msg)) return 'requests.errors.serviceInactive';
  if (/reason is required/i.test(msg)) return 'requests.errors.reasonRequired';
  if (/after the active step/i.test(msg)) return 'requests.errors.adhocPosition';
  return errorKey(e);
}

function Progress({ steps }: { steps: RequestStep[] }) {
  const { t } = useTranslation();
  if (!steps.length) return null;
  const done = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs text-ink-2"><span>{t('requests.progress', { done, total: steps.length })}</span><span className="font-latin">{pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function ResumeButton({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_request_hold', { p_request_id: requestId, p_hold: false });
      if (error) throw error;
    },
    onSuccess: onDone,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return <Button size="sm" variant="success" loading={m.isPending} onClick={() => m.mutate()}><CirclePlay className="size-4" /> {t('requests.resume')}</Button>;
}

// ---------- documents ----------
function DocumentList({ docs, onChanged }: { docs: RequestDocument[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = docs.find((d) => d.id === openId) ?? null;
  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          {d.status === 'approved' ? <FileCheck2 className="size-5 shrink-0 text-success" /> : d.status === 'rejected' ? <FileX2 className="size-5 shrink-0 text-danger" /> : <FileText className="size-5 shrink-0 text-ink-3" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{(lang === 'en' ? d.name_en : null) || d.name_ar}</span>
              {!d.is_required && <Badge tone="gray" dot={false}>{t('workflow.optionalBadge')}</Badge>}
              {d.reused_from_document_id && <Badge tone="sky" dot={false}>{t('documents.reused')}</Badge>}
            </div>
            <div className="text-xs text-ink-3">
              {d.status === 'approved' && d.received_physically && `${t('requests.receivedPhysically')} · `}
              {d.reviewed_at && `${fmtDate(d.reviewed_at, lang)}${d.reviewer?.profile?.full_name ? ` · ${d.reviewer.profile.full_name}` : ''}`}
              {d.review_note && ` · ${d.review_note}`}
            </div>
            {d.status === 'rejected' && (
              <div className="text-xs text-danger">{(lang === 'en' ? d.reason?.text_en : null) || d.reason?.text_ar}{d.rejection_note ? ` — ${d.rejection_note}` : ''}</div>
            )}
          </div>
          <Badge tone={DOC_STATUS_TONE[d.status]}>{t(`requests.docStatuses.${d.status}`)}</Badge>
          <Button size="sm" onClick={() => setOpenId(d.id)}><Eye className="size-4" /> {t('documents.openReview')}</Button>
        </li>
      ))}
      <Modal open={!!open} onOpenChange={(v) => !v && setOpenId(null)} wide title={open ? (lang === 'en' ? open.name_en : null) || open.name_ar : ''}>
        {open && <DocumentReview doc={open} onChanged={onChanged} />}
      </Modal>
    </ul>
  );
}

// ---------- data of all steps ----------
function AllValues({ steps, values, currentId }: { steps: RequestStep[]; values: { request_step_id: string; field_key: string; value: unknown }[]; currentId?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const others = steps.filter((s) => s.id !== currentId && s.fields_snapshot.length > 0 && values.some((v) => v.request_step_id === s.id));
  if (!others.length) return null;
  return (
    <Card>
      <CardHeader title={t('requests.allData')} icon={<ListChecks className="size-4 text-brand" />} />
      <div className="divide-y divide-line">
        {others.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="mb-2 text-xs font-bold text-ink-2">{s.sort_order}. {nameOf(s, lang)}</div>
            <dl className="grid gap-x-6 text-[13px] sm:grid-cols-2">
              {s.fields_snapshot.map((f) => {
                const v = values.find((x) => x.request_step_id === s.id && x.field_key === f.field_key);
                return (
                  <div key={f.field_key} className="flex justify-between gap-3 border-b border-dashed border-line py-2">
                    <dt className="text-ink-2">{(lang === 'en' ? f.label_en : null) || f.label_ar}</dt>
                    <dd className="whitespace-pre-line text-end font-semibold">{formatFieldValue(f, v?.value, lang, [t('common.yes'), t('common.no')])}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- vertical stepper ----------
function Stepper({ steps, currentId, docs, canAdhoc, onAdhoc }: { steps: RequestStep[]; currentId?: string; docs: RequestDocument[]; canAdhoc: boolean; onAdhoc: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card className="p-4">
      <ol className="relative">
        {steps.map((s, i) => {
          const done = s.status === 'completed' || s.status === 'skipped';
          const isCurrent = s.id === currentId;
          const late = isLate(s.due_at, s.status) && !done;
          const lateDone = done && s.due_at && s.completed_at && new Date(s.completed_at) > new Date(s.due_at);
          const d = docs.filter((x) => x.request_step_id === s.id);
          return (
            <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span className={cn('absolute start-[15px] top-8 h-[calc(100%-24px)] w-0.5', done ? 'bg-success' : 'bg-line')} />}
              <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
                done ? 'border-success bg-success text-white' : isCurrent ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-3')}>
                {s.status === 'skipped' ? <SkipForward className="size-4" /> : done ? <Check className="size-4" /> : isCurrent ? s.sort_order : <CircleDashed className="size-4" />}
              </span>
              <div className={cn('min-w-0 flex-1 rounded-xl px-3 py-2', isCurrent && 'bg-brand-50')}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('font-semibold', done ? 'text-ink-2' : 'text-navy')}>{nameOf(s, lang)}</span>
                  <Badge tone={STEP_STATUS_TONE[s.status]}>{t(`requests.stepStatuses.${s.status}`)}</Badge>
                  {s.is_adhoc && <Badge tone="sky" dot={false}>{t('requests.adhoc')}</Badge>}
                  {!s.is_client_visible && <Badge tone="gray" dot={false}>{t('workflow.hidden')}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                  <span>SLA: {t(`workflow.days.${s.duration_unit}`, { count: s.duration_value })}</span>
                  {s.assignee?.profile?.full_name && <span>{s.assignee.profile.full_name}</span>}
                  {s.due_at && !done && <span className={cn(late && 'font-semibold text-danger')}>{t('requests.stepDue')}: {fmtDate(s.due_at, lang)}</span>}
                  {done && s.completed_at && <span className={cn(lateDone ? 'text-danger' : 'text-success')}>{fmtDate(s.completed_at, lang)}{lateDone ? ` · ${t('requests.afterSla')}` : ''}</span>}
                  {d.length > 0 && <span>{t('workflow.docsCount', { count: d.length })} ({d.filter((x) => x.status === 'approved').length}✓)</span>}
                </div>
                {s.skip_reason && <div className="mt-1 text-xs text-ink-2">{t('requests.skipReason')}: {s.skip_reason}</div>}
                {s.note && done && <div className="mt-1 text-xs text-ink-2">{s.note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {canAdhoc && currentId && (
        <button type="button" onClick={onAdhoc}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-brand text-sm font-semibold text-brand hover:bg-brand-50">
          <Plus className="size-4" /> {t('requests.addAdhoc')}
        </button>
      )}
    </Card>
  );
}

function RequestTasks({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const q = useQuery({
    queryKey: ['tasks', 'request', requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('service_request_id', requestId).order('due_at');
      if (error) throw error;
      return data as unknown as TaskRow[];
    },
  });
  return (
    <Card className="px-4">
      {q.isLoading ? <div className="py-6"><Spinner /></div> : !q.data?.length ? <EmptyState title={t('tasks.empty')} /> : (
        <div className="divide-y divide-line">{q.data.map((task) => <FollowUpRow key={task.id} task={task} onComplete={setCompleting} />)}</div>
      )}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
    </Card>
  );
}

// ---------- dialogs ----------
function ReasonDialog({ open, onClose, title, label, hint, optional, danger, run, onDone }: {
  open: boolean; onClose: () => void; title: string; label: string; hint?: string; optional?: boolean; danger?: boolean;
  run: (text: string) => PromiseLike<{ error: unknown }>; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await run(text.trim());
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); setText(''); onClose(); onDone(); },
    onError: (e) => toast.error(t(requestErrorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) { setText(''); onClose(); } }} title={title}
      footer={<>
        <Button variant={danger ? 'danger' : 'primary'} loading={m.isPending} disabled={!optional && !text.trim()} onClick={() => m.mutate()}>{t('common.save')}</Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </>}>
      <Field label={`${label}${optional ? '' : ' *'}`} hint={hint}>
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
}

function ReassignDialog({ open, onClose, step, onDone }: { open: boolean; onClose: () => void; step: RequestStep; onDone: () => void }) {
  const { t } = useTranslation();
  const employees = useEmployeeOptions();
  const [emp, setEmp] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reassign_request_step', { p_request_step_id: step.id, p_employee_id: emp });
      if (error) throw error;
    },
    onSuccess: () => { setEmp(''); onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('requests.reassign')}
      footer={<><Button variant="primary" loading={m.isPending} disabled={!emp} onClick={() => m.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <Field label={t('workflow.employee')}>
        <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
          <option value="">{t('workflow.pick')}</option>
          {(employees.data ?? []).filter((e) => e.id !== step.assigned_employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}

function EditRequestDialog({ open, onClose, request, onDone }: { open: boolean; onClose: () => void; request: RequestRow; onDone: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const employees = useEmployeeOptions();
  const [f, setF] = useState({ priority: request.priority, owner: request.owner_employee_id ?? '', due: toLocalInput(request.due_at), notes: request.notes ?? '' });
  const m = useMutation({
    mutationFn: async () => {
      const patch: { priority: Priority; due_at: string | null; notes: string | null; owner_employee_id?: string } = { priority: f.priority, due_at: fromLocalInput(f.due), notes: f.notes.trim() || null };
      if (f.owner && f.owner !== request.owner_employee_id) patch.owner_employee_id = f.owner;
      const { error } = await supabase.from('service_requests').update(patch).eq('id', request.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => { if (v) return; onClose(); }} title={t('requests.editTitle')}
      footer={<><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('followups.priority')}>
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => <option key={p} value={p}>{t(`followups.priorities.${p}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('requests.dueAt')}>
            <Input type="datetime-local" dir="ltr" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </Field>
        </div>
        {can('service_requests', 'assign') && (
          <Field label={t('crm.owner')}>
            <Select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
              <option value="">{t('crm.unassigned')}</option>
              {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('requests.notes')}><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AdhocDialog({ open, onClose, request, afterStep, onDone }: { open: boolean; onClose: () => void; request: RequestRow; afterStep: RequestStep; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const roles = useRoleOptions();
  const departments = useDepartmentOptions();
  const employees = useEmployeeOptions();
  const empty = { name_ar: '', duration_value: '1', duration_unit: 'business_days' as DurationUnit, assignee_type: 'request_owner' as AssigneeType,
    target: '', requires_approval: false, approver_role_id: '', is_client_visible: false, description: '' };
  const [f, setF] = useState(empty);
  const m = useMutation({
    mutationFn: async () => {
      const config = {
        name_ar: f.name_ar, description: f.description, duration_value: Number(f.duration_value) || 1, duration_unit: f.duration_unit,
        assignee_type: f.assignee_type,
        assignee_role_id: f.assignee_type === 'role' ? f.target : null,
        assignee_department_id: f.assignee_type === 'department' ? f.target : null,
        assignee_employee_id: f.assignee_type === 'employee' ? f.target : null,
        requires_approval: f.requires_approval, approver_role_id: f.requires_approval ? f.approver_role_id : null, is_client_visible: f.is_client_visible,
      };
      const { error } = await supabase.rpc('insert_adhoc_step', { p_request_id: request.id, p_after_step_id: afterStep.id, p_config: config });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('requests.adhocAdded')); setF(empty); onClose(); onDone(); },
    onError: (e) => toast.error(t(requestErrorKey(e))),
  });
  const targets = f.assignee_type === 'role' ? (roles.data ?? []).map((o) => ({ id: o.id, name: nameOf(o, lang) }))
    : f.assignee_type === 'department' ? (departments.data ?? []).map((o) => ({ id: o.id, name: nameOf(o, lang) }))
    : f.assignee_type === 'employee' ? (employees.data ?? []).map((o) => ({ id: o.id, name: o.name })) : [];
  const valid = f.name_ar.trim() && (f.assignee_type === 'request_owner' || f.target) && (!f.requires_approval || f.approver_role_id);
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('requests.addAdhoc')} icon={<Plus className="size-5 text-brand" />}
      footer={<><Button variant="primary" loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>{t('common.create')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-navy">{t('requests.adhocHint', { step: nameOf(afterStep, lang) })}</p>
        <Field label={`${t('workflow.nameAr')} *`}><Input value={f.name_ar} autoFocus onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
        <Field label={t('workflow.description')}><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('workflow.duration')}><Input type="number" min={1} dir="ltr" value={f.duration_value} onChange={(e) => setF({ ...f, duration_value: e.target.value })} /></Field>
          <Field label={t('workflow.unit')}>
            <Select value={f.duration_unit} onChange={(e) => setF({ ...f, duration_unit: e.target.value as DurationUnit })}>
              {DURATION_UNITS.map((u) => <option key={u} value={u}>{t(`workflow.units.${u}`)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('workflow.assigneeType')}>
            <Select value={f.assignee_type} onChange={(e) => setF({ ...f, assignee_type: e.target.value as AssigneeType, target: '' })}>
              {ASSIGNEE_TYPES.map((a) => <option key={a} value={a}>{t(`workflow.assigneeTypes.${a}`)}</option>)}
            </Select>
          </Field>
          {f.assignee_type !== 'request_owner' && (
            <Field label={t(`workflow.${f.assignee_type}`)}>
              <Select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
                <option value="">{t('workflow.pick')}</option>
                {targets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Toggle label={t('workflow.requiresApprovalToggle')} checked={f.requires_approval} onChange={(v) => setF({ ...f, requires_approval: v })} />
        {f.requires_approval && (
          <Field label={`${t('workflow.approverRole')} *`}>
            <Select value={f.approver_role_id} onChange={(e) => setF({ ...f, approver_role_id: e.target.value })}>
              <option value="">{t('workflow.pick')}</option>
              {(roles.data ?? []).map((o) => <option key={o.id} value={o.id}>{nameOf(o, lang)}</option>)}
            </Select>
          </Field>
        )}
        <Toggle label={t('workflow.isClientVisible')} checked={f.is_client_visible} onChange={(v) => setF({ ...f, is_client_visible: v })} />
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): ReactNode {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="flex-1">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}

