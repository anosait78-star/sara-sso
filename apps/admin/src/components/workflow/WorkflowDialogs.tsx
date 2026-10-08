import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpDown, CircleAlert, Minus, Pencil, Plus, Rocket, ShieldCheck, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Field, Input, Spinner, Textarea } from '@/components/ui';
import { useLang } from '@/lib/crm';
import { useWorkflowDiff, type DiffRow, type ValidationIssue } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

export function Modal({ open, onOpenChange, title, icon, children, footer, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; icon?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(11,22,40,.45)]" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none',
            'md:inset-x-auto md:bottom-auto md:start-1/2 md:top-1/2 md:max-h-[86vh] md:-translate-y-1/2 md:rounded-2xl ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2',
            wide ? 'md:w-[min(640px,92vw)]' : 'md:w-[min(460px,92vw)]',
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            {icon}
            <Dialog.Title className="flex-1 text-base font-bold text-navy">{title}</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label={t('common.close')}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const tone: Record<string, string> = {
  added: 'border-[#bfe6cf] bg-[#effaf3] text-[#0c6b37]',
  removed: 'border-[#f3c5c5] bg-[#fff5f5] text-danger',
  moved: 'border-[#f2dca3] bg-[#fdf6e3] text-[#8a5d00]',
  changed: 'border-brand-100 bg-brand-50 text-navy',
};

/** Human-readable list of workflow_diff() rows. */
export function DiffList({ rows }: { rows: DiffRow[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-ink-3">{t('workflow.diffEmpty')}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const kind = r.change.split('_')[1] as 'added' | 'removed' | 'moved' | 'changed';
        const Icon = kind === 'added' ? Plus : kind === 'removed' ? Minus : kind === 'moved' ? ArrowUpDown : Pencil;
        const name = (lang === 'en' ? r.step_name_en : null) || r.step_name_ar || r.step_key;
        const item = (lang === 'en' ? r.item_name_en : null) || r.item_name_ar || r.item_key;
        const fields = [...new Set((r.detail.fields ?? []).map((k) => t(`workflow.stepFieldLabels.${k}`, { defaultValue: k })))].join('، ');
        return (
          <li key={i} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', tone[kind])}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span>{t(`workflow.diff.${r.change}`, { name, item, pos: r.detail.position, from: r.detail.from, to: r.detail.to, fields })}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function CompareDialog({ open, onOpenChange, from, to }: {
  open: boolean; onOpenChange: (v: boolean) => void; from: { id: string; version: number } | null; to: { id: string; version: number } | null;
}) {
  const { t } = useTranslation();
  const diff = useWorkflowDiff(open ? from?.id : null, open ? to?.id : null);
  return (
    <Modal open={open} onOpenChange={onOpenChange} wide icon={<ArrowUpDown className="size-5 text-brand" />}
      title={t('workflow.compareTitle', { from: from?.version, to: to?.version })}>
      {diff.isLoading ? <div className="grid place-items-center py-10"><Spinner /></div> : <DiffList rows={diff.data ?? []} />}
    </Modal>
  );
}

/** Publish confirmation: validation issues, diff vs the published version, impact on running requests, note. */
export function PublishDialog({ open, onOpenChange, draft, published, onPublished }: {
  open: boolean; onOpenChange: (v: boolean) => void; draft: { id: string; version: number; change_note: string | null };
  published: { id: string; version: number } | null; onPublished: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(draft.change_note ?? '');
  const diff = useWorkflowDiff(open ? published?.id : null, open ? draft.id : null);
  const issues = useQuery({
    queryKey: ['validate_workflow', draft.id, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_workflow', { p_workflow_id: draft.id });
      if (error) throw error;
      return data as unknown as ValidationIssue[];
    },
  });
  const running = useQuery({
    queryKey: ['workflow_running', published?.id],
    enabled: open && !!published,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workflow_running_requests', { p_workflow_id: published!.id });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('publish_workflow', { p_workflow_id: draft.id, p_change_note: note.trim() || undefined });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('workflow.published', { version: draft.version }));
      onOpenChange(false);
      onPublished();
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const blocked = (issues.data?.length ?? 0) > 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange} wide icon={<Rocket className="size-5 text-brand" />}
      title={t('workflow.publishTitle', { version: draft.version })}
      footer={
        <>
          <Button variant="primary" loading={publish.isPending} disabled={blocked || issues.isLoading} onClick={() => publish.mutate()}>
            <Rocket className="size-4" /> {t('workflow.publishConfirm')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {blocked && (
          <div className="rounded-xl border border-[#f3c5c5] bg-[#fff5f5] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-danger"><CircleAlert className="size-4" /> {t('workflow.issuesTitle')}</div>
            <ul className="space-y-1 text-sm text-ink">
              {issues.data!.map((i, n) => (
                <li key={n}>• {i.step_name ? `${i.step_name}: ` : ''}{t(`workflow.issues.${i.issue}`, { defaultValue: i.issue })}{i.detail && i.issue.includes('options') ? ` (${i.detail})` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        {published && (
          <div>
            <div className="mb-2 text-xs font-bold text-ink-2">{t('workflow.compareTitle', { from: published.version, to: draft.version })}</div>
            {diff.isLoading ? <Spinner /> : <DiffList rows={diff.data ?? []} />}
          </div>
        )}
        <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-navy">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
          {published
            ? t('workflow.publishImpact', { count: running.data ?? 0, version: published.version, next: draft.version })
            : t('workflow.publishFirst')}
        </div>
        <Field label={t('workflow.changeNote')}>
          <Textarea value={note} placeholder={t('workflow.changeNotePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Asks for the name of a new step. */
export function NewStepDialog({ open, onOpenChange, onSubmit, loading }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (nameAr: string, nameEn: string) => void; loading?: boolean;
}) {
  const { t } = useTranslation();
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (v) { setAr(''); setEn(''); }
        onOpenChange(v);
      }}
      title={t('workflow.addStep')}
      icon={<Plus className="size-5 text-brand" />}
      footer={
        <>
          <Button variant="primary" loading={loading} disabled={!ar.trim()} onClick={() => onSubmit(ar.trim(), en.trim())}>{t('common.create')}</Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ar.trim()) onSubmit(ar.trim(), en.trim()); }}>
        <Field label={`${t('workflow.newStepName')} *`}>
          <Input value={ar} autoFocus onChange={(e) => setAr(e.target.value)} />
        </Field>
        <Field label={t('workflow.nameEn')} hint={t('workflow.stepKeyHint')}>
          <Input dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
