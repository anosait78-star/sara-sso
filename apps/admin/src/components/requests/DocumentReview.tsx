import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CopyPlus, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import { DOC_STATUS_TONE, useRejectionReasons, type DocumentStatus } from '@/lib/requests';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';
import { FilePreview, FileVersions, StaffUpload, useDocumentFiles, type DocFile } from './DocumentFiles';

export interface ReviewDoc {
  id: string; customer_id: string; request_id: string | null; name_ar: string; name_en: string | null; status: DocumentStatus;
  current_file_id: string | null; received_physically: boolean; reused_from_document_id: string | null; review_note: string | null;
  rejection_note: string | null; reviewed_at: string | null; expires_at: string | null;
  type?: { allowed_mime: string[]; max_size_mb: number; has_expiry: boolean } | null;
  reason?: { text_ar: string; text_en: string | null } | null;
}

/** Preview + versions + decision for one document slot. Opening an uploaded document marks it "under review". */
export function DocumentReview({ doc, onChanged }: { doc: ReviewDoc; onChanged: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const files = useDocumentFiles(doc.id);
  const [selected, setSelected] = useState<DocFile | null>(null);
  const [dialog, setDialog] = useState<null | 'approve' | 'reject' | 'copy'>(null);
  const canReview = can('documents', 'approve');

  useEffect(() => {
    setSelected(null);
    if (doc.status === 'uploaded' && canReview) {
      void supabase.rpc('start_document_review', { p_document_id: doc.id }).then(() => onChanged());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  const shown = selected ?? files.data?.find((f) => f.id === doc.current_file_id) ?? files.data?.[0] ?? null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['document_files', doc.id] });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={DOC_STATUS_TONE[doc.status]}>{t(`requests.docStatuses.${doc.status}`)}</Badge>
        {doc.received_physically && <Badge tone="gray" dot={false}>{t('requests.receivedPhysically')}</Badge>}
        {doc.reused_from_document_id && <Badge tone="sky" dot={false}>{t('documents.reused')}</Badge>}
        {doc.expires_at && <span className="text-xs text-ink-3">{t('documents.expires', { date: fmtDate(doc.expires_at, lang, false) })}</span>}
      </div>
      {doc.status === 'rejected' && (
        <p className="rounded-lg bg-[#fff5f5] px-3 py-2 text-sm text-danger">
          {(lang === 'en' ? doc.reason?.text_en : null) || doc.reason?.text_ar}{doc.rejection_note ? ` — ${doc.rejection_note}` : ''}
        </p>
      )}
      {files.isLoading ? <div className="py-10"><Spinner /></div> : shown ? (
        <>
          <FilePreview file={shown} className="h-[420px] md:h-[520px]" />
          {(files.data?.length ?? 0) > 1 && <FileVersions files={files.data!} selected={shown.id} onSelect={setSelected} />}
        </>
      ) : <EmptyState title={doc.received_physically ? t('documents.paperOnly') : t('documents.noFile')} />}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {canReview && doc.status !== 'approved' && (doc.current_file_id || doc.status === 'pending' || doc.status === 'rejected') && (
          <Button variant="success" onClick={() => setDialog('approve')}><Check className="size-4" /> {doc.current_file_id ? t('documents.approve') : t('requests.receive')}</Button>
        )}
        {canReview && doc.status !== 'rejected' && doc.status !== 'pending' && (
          <Button variant="danger" onClick={() => setDialog('reject')}><XCircle className="size-4" /> {t('requests.reject')}</Button>
        )}
        {canReview && doc.request_id && doc.status === 'approved' && (
          <Button onClick={() => setDialog('copy')}><CopyPlus className="size-4" /> {t('documents.newCopy')}</Button>
        )}
        {can('documents', 'create') && doc.status !== 'approved' && (
          <StaffUpload doc={{ id: doc.id, customer_id: doc.customer_id, request_id: doc.request_id, allowed_mime: doc.type?.allowed_mime, max_size_mb: doc.type?.max_size_mb }} onDone={refresh} size="md" />
        )}
      </div>

      <ApproveDialog open={dialog === 'approve'} onClose={() => setDialog(null)} doc={doc} onDone={refresh} />
      <RejectDocDialog open={dialog === 'reject'} onClose={() => setDialog(null)} doc={doc} onDone={refresh} />
      <NewCopyDialog open={dialog === 'copy'} onClose={() => setDialog(null)} doc={doc} onDone={refresh} />
    </div>
  );
}

function ApproveDialog({ open, onClose, doc, onDone }: { open: boolean; onClose: () => void; doc: ReviewDoc; onDone: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('receive_document', { p_document_id: doc.id, p_note: note || undefined, p_expires_at: expires || undefined });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); setNote(''); setExpires(''); onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`${t('documents.approve')}: ${doc.name_ar}`}
      footer={<><Button variant="success" loading={m.isPending} onClick={() => m.mutate()}><Check className="size-4" /> {t('documents.approve')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        {doc.type?.has_expiry && (
          <Field label={t('documents.expiryDate')} hint={t('documents.expiryHint')}>
            <Input type="date" dir="ltr" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        )}
        <Field label={t('requests.note')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function RejectDocDialog({ open, onClose, doc, onDone }: { open: boolean; onClose: () => void; doc: ReviewDoc; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const reasons = useRejectionReasons();
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reject_document', { p_document_id: doc.id, p_reason_id: (reasonId || null) as string, p_note: note || undefined });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); setReasonId(''); setNote(''); onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`${t('requests.reject')}: ${doc.name_ar}`}
      footer={<><Button variant="danger" loading={m.isPending} disabled={!reasonId && !note.trim()} onClick={() => m.mutate()}>{t('requests.reject')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('requests.reason')} *`}>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">{t('workflow.pick')}</option>
            {(reasons.data ?? []).map((x) => <option key={x.id} value={x.id}>{(lang === 'en' ? x.text_en : null) || x.text_ar}</option>)}
          </Select>
        </Field>
        <Field label={t('requests.note')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-xs text-ink-3">{t('documents.rejectHint')}</p>
      </div>
    </Modal>
  );
}

function NewCopyDialog({ open, onClose, doc, onDone }: { open: boolean; onClose: () => void; doc: ReviewDoc; onDone: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_new_document_copy', { p_document_id: doc.id, p_note: note });
      if (error) throw error;
    },
    onSuccess: () => { setNote(''); onClose(); onDone(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={t('documents.newCopy')}
      footer={<><Button variant="primary" loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <Field label={`${t('requests.reason')} *`} hint={t('documents.newCopyHint')}>
        <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
