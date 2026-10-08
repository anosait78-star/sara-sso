import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, CopyPlus, FileText, GitBranch, Trash2, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Spinner, Switch } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import {
  draftVersion, iconOf, nameOf, publishedVersion, totalDays, useService, useWorkflowSteps,
  type Service, type WorkflowVersion,
} from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { ServiceFields, serviceFormErrors, servicePayload, toServiceForm, useToggleService, type ServiceForm } from './ServicesPage';

type Tab = 'general' | 'documents' | 'versions';

export function ServicePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useService(id);
  const toggle = useToggleService();
  const [tab, setTab] = useState<Tab>('general');
  const [f, setF] = useState<ServiceForm>(() => toServiceForm());
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const s = q.data;
  useEffect(() => {
    if (s) setF(toServiceForm(s));
  }, [s]);

  const pub = publishedVersion(s);
  const steps = useWorkflowSteps(pub?.id);
  const canEdit = can('services_config', 'edit');
  const errors = tried ? serviceFormErrors(f) : {};
  const dirty = !!s && JSON.stringify(f) !== JSON.stringify(toServiceForm(s));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('services').update(servicePayload(f)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('services').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void navigate({ to: '/services' });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!s) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;
  const Icon = iconOf(s.icon);

  const submit = () => {
    setTried(true);
    if (Object.keys(serviceFormErrors(f)).length === 0) save.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 md:pb-0">
      <Link to="/services" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2">
        <ChevronRight className="size-4 ltr:rotate-180" />{t('services.title')}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand"><Icon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">{nameOf(s.category, lang)} · <span className="ltr font-latin">{s.code}</span></div>
          <h1 className="text-xl font-bold text-navy md:text-2xl">{nameOf(s, lang)}</h1>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Switch checked={s.is_active} disabled={!canEdit || (!s.is_active && !pub)} onChange={(v) => toggle.mutate({ id: s.id, active: v })} label={t('services.isActive')} />
          <Badge tone={s.is_active ? 'green' : 'red'}>{s.is_active ? t('services.activeShort') : t('services.inactive')}</Badge>
        </label>
        {can('services_config', 'delete') && (
          <Button variant="danger" size="md" onClick={() => setDeleting(true)} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>
        )}
        <Link to="/services/$id/workflow" params={{ id: s.id }}>
          <Button variant="navy"><Workflow className="size-4" /> {t('services.openBuilder')}</Button>
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['general', 'documents', 'versions'] as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`services.tabs.${k}`)}
            {k === 'versions' && <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{s.versions?.length ?? 0}</span>}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
          <Card className="p-4 md:p-5">
            <ServiceFields f={f} set={(p) => setF((o) => ({ ...o, ...p }))} errors={errors} disabled={!canEdit} />
            <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
              <span className="font-semibold text-ink-2">{t('services.expectedDuration')}: </span>
              {steps.data ? t('services.durationValue', { count: totalDays(steps.data) }) : '—'}
              <span className="text-xs text-ink-3"> · {t('services.fromSteps')}</span>
            </div>
            {canEdit && (
              <div className="fixed inset-x-0 bottom-[68px] z-20 flex gap-2 border-t border-line bg-white px-4 py-3 md:static md:mt-5 md:border-0 md:p-0">
                <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>{t('common.save')}</Button>
                {dirty && <Button onClick={() => setF(toServiceForm(s))}>{t('common.cancel')}</Button>}
              </div>
            )}
          </Card>
          <div className="space-y-4">
            <VersionsCard service={s} />
            <Card>
              <CardHeader title={t('services.currentSummary')} icon={<Workflow className="size-4 text-brand" />} />
              <div className="flex flex-wrap gap-1.5 p-4">
                {(steps.data ?? []).map((st, i) => (
                  <span key={st.id} className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-navy">{i + 1}. {nameOf(st, lang)}</span>
                ))}
                {pub && steps.data?.length === 0 && <span className="text-sm text-ink-3">{t('services.noSteps')}</span>}
                {!pub && <span className="text-sm text-ink-3">{t('services.noWorkflow')}</span>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title={t('services.tabs.documents')} icon={<FileText className="size-4 text-brand" />} />
          {(steps.data ?? []).every((st) => st.docs.length === 0) ? (
            <EmptyState title={t('services.noDocs')} />
          ) : (
            <ul className="divide-y divide-line">
              {(steps.data ?? []).flatMap((st) => st.docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{nameOf(d.type, lang)}</div>
                    <div className="text-xs text-ink-3">{t('services.docStep', { step: nameOf(st, lang) })} · {d.type?.max_size_mb}MB</div>
                  </div>
                  <Badge tone={d.is_required ? 'blue' : 'gray'} dot={false}>{d.is_required ? t('workflow.required') : t('workflow.optionalBadge')}</Badge>
                </li>
              )))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'versions' && <VersionsCard service={s} full />}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('services.deleteConfirm', { name: nameOf(s, lang) })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

const statusTone = { draft: 'amber', published: 'green', archived: 'gray' } as const;

/** Versions list with running requests and "new draft" action. */
export function VersionsCard({ service, full }: { service: Service; full?: boolean }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const versions = service.versions ?? [];
  const pub = publishedVersion(service);
  const draft = draftVersion(service);
  const next = Math.max(0, ...versions.map((v) => v.version)) + 1;

  const running = useQuery({
    queryKey: ['workflow_running', service.id, versions.map((v) => v.id).join()],
    queryFn: async () => {
      const entries = await Promise.all(
        versions.filter((v) => v.status !== 'draft').map(async (v) => {
          const { data } = await supabase.rpc('workflow_running_requests', { p_workflow_id: v.id });
          return [v.id, (data as number | null) ?? 0] as const;
        }),
      );
      return new Map(entries);
    },
  });

  const create = useMutation({
    mutationFn: async (from?: WorkflowVersion) => {
      const { data, error } = from && from.status === 'archived'
        ? await supabase.rpc('clone_workflow_as_draft', { p_workflow_id: from.id })
        : await supabase.rpc('create_workflow_draft', { p_service_id: service.id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (wf) => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void navigate({ to: '/services/$id/workflow/$workflowId', params: { id: service.id, workflowId: wf } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  return (
    <Card>
      <CardHeader title={t('services.versions')} icon={<GitBranch className="size-4 text-brand" />} />
      <ul className="divide-y divide-line">
        {versions.map((v) => (
          <li key={v.id} className="flex items-start gap-3 px-4 py-3">
            <span className="font-latin text-sm font-bold text-navy">v{v.version}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{v.change_note || '—'}</div>
              <div className="text-xs text-ink-3">
                {fmtDate(v.published_at ?? v.created_at, i18n.language, false)} · {t('services.steps', { count: v.steps?.[0]?.count ?? 0 })}
                {v.status !== 'draft' && <> · {t('services.running', { count: running.data?.get(v.id) ?? 0 })}</>}
              </div>
              {full && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link to="/services/$id/workflow/$workflowId" params={{ id: service.id, workflowId: v.id }} className="text-xs font-semibold text-brand">
                    {t('services.openBuilder')}
                  </Link>
                  {v.status === 'archived' && !draft && can('services_config', 'create') && (
                    <button type="button" className="text-xs font-semibold text-brand" onClick={() => create.mutate(v)}>
                      {t('services.newDraftFrom', { next, from: v.version })}
                    </button>
                  )}
                </div>
              )}
            </div>
            <Badge tone={statusTone[v.status]}>{t(`workflow.statuses.${v.status}`)}</Badge>
          </li>
        ))}
      </ul>
      {can('services_config', 'create') && (
        <div className="border-t border-line p-3">
          {draft ? (
            <Link to="/services/$id/workflow/$workflowId" params={{ id: service.id, workflowId: draft.id }}>
              <Button className="w-full" size="sm">{t('services.openDraft', { version: draft.version })}</Button>
            </Link>
          ) : (
            <Button className="w-full" size="sm" loading={create.isPending} onClick={() => create.mutate(undefined)}>
              <CopyPlus className="size-4" />
              {pub ? t('services.newDraftFrom', { next, from: pub.version }) : t('services.newDraft')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
