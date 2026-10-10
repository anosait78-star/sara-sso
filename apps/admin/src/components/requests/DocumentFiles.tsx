import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Spinner } from '@/components/ui';
import { fmtDate, useLang } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

export interface DocFile {
  id: string; document_id: string; version_no: number; storage_path: string; original_name: string | null; mime_type: string; size_bytes: number;
  uploader_type: 'client' | 'staff'; review_status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string;
}

export function useDocumentFiles(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['document_files', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase.from('document_files').select('*').eq('document_id', documentId!).order('version_no', { ascending: false });
      if (error) throw error;
      return data as unknown as DocFile[];
    },
  });
}

/** Short-lived signed URL (5 minutes) — the bucket is private (PROJECT_PLAN §9.3). */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed_url', path],
    enabled: !!path,
    staleTime: 4 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('customer-documents').createSignedUrl(path!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Inline preview of a file version (image or PDF). */
export function FilePreview({ file, className }: { file: DocFile; className?: string }) {
  const { t } = useTranslation();
  const url = useSignedUrl(file.storage_path);
  if (url.isLoading) return <div className={cn('grid place-items-center bg-muted', className)}><Spinner /></div>;
  if (!url.data) return <div className={cn('grid place-items-center bg-muted text-sm text-ink-3', className)}>{t('errors.generic')}</div>;
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-[#f7f9fc]', className)}>
      {file.mime_type === 'application/pdf'
        ? <iframe src={url.data} title={file.original_name ?? 'pdf'} className="h-full w-full" />
        : <img src={url.data} alt={file.original_name ?? ''} className="h-full w-full object-contain" />}
      <a href={url.data} target="_blank" rel="noreferrer" className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-brand shadow">
        <ExternalLink className="size-3.5" /> {t('documents.open')}
      </a>
    </div>
  );
}

/** Version history of a document slot. */
export function FileVersions({ files, selected, onSelect }: { files: DocFile[]; selected?: string; onSelect: (f: DocFile) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.id}>
          <button type="button" onClick={() => onSelect(f)}
            className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-xs', selected === f.id ? 'border-brand bg-brand-50' : 'border-line bg-white hover:bg-muted')}>
            <FileText className="size-4 shrink-0 text-ink-3" />
            <span className="font-latin font-bold">v{f.version_no}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{fmtDate(f.created_at, lang)} · {t(`documents.uploader.${f.uploader_type}`)}</span>
            <Badge tone={f.review_status === 'approved' ? 'green' : f.review_status === 'rejected' ? 'red' : 'sky'} dot={false}>{t(`documents.fileStatus.${f.review_status}`)}</Badge>
          </button>
          {f.review_note && f.review_status === 'rejected' && <p className="px-3 pt-1 text-[11px] text-danger">{f.review_note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Staff upload into a document slot (scanned paper, e-mail attachment…). */
export function StaffUpload({ doc, onDone, size = 'sm' }: {
  doc: { id: string; customer_id: string; request_id: string | null; allowed_mime?: string[]; max_size_mb?: number }; onDone: () => void; size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const allowed = doc.allowed_mime ?? ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.type)) throw new Error('type');
      if (file.size > (doc.max_size_mb ?? 10) * 1024 * 1024) throw new Error('size');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${doc.customer_id}/${doc.request_id ?? 'general'}/${doc.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('customer-documents').upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.rpc('register_document_upload', {
        p_document_id: doc.id, p_path: path, p_original_name: file.name, p_mime: file.type, p_size: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('documents.uploaded')); onDone(); },
    onError: (e) => toast.error((e as Error).message === 'type' ? t('documents.badType') : (e as Error).message === 'size' ? t('documents.tooLarge', { size: doc.max_size_mb ?? 10 }) : t(errorKey(e))),
    onSettled: () => { setName(''); if (input.current) input.current.value = ''; },
  });
  return (
    <>
      <input ref={input} type="file" className="hidden" accept={(doc.allowed_mime ?? ['application/pdf', 'image/*']).join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); upload.mutate(f); } }} />
      <Button size={size} loading={upload.isPending} onClick={() => input.current?.click()} title={name || undefined}>
        <Upload className="size-4" /> {t('documents.upload')}
      </Button>
    </>
  );
}
