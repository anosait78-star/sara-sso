import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FileText, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentReview, type ReviewDoc } from '@/components/requests/DocumentReview';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { fmtDate, useLang } from '@/lib/crm';
import { DOC_STATUS_TONE } from '@/lib/requests';
import { useMediaQuery } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Tab = 'review' | 'rejected' | 'approved';
const STATUSES: Record<Tab, string[]> = { review: ['uploaded', 'under_review'], rejected: ['rejected'], approved: ['approved'] };

interface QueueDoc extends ReviewDoc {
  updated_at: string;
  customer: { id: string; full_name: string; company_name: string | null; customer_type: string } | null;
  request: { id: string; request_no: string } | null;
  file: { created_at: string; uploader_type: string; version_no: number } | null;
}
const SELECT = '*, customer:customers(id, full_name, company_name, customer_type), request:service_requests(id, request_no), ' +
  'type:document_types(allowed_mime, max_size_mb, has_expiry), reason:rejection_reasons(text_ar, text_en), ' +
  'file:document_files!documents_current_file_id_fkey(created_at, uploader_type, version_no)';

/** Review queue: uploaded documents waiting for a decision (PROJECT_PLAN §4.2 screen 12). */
export function DocumentsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [tab, setTab] = useState<Tab>('review');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['documents', 'queue', tab],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select(SELECT).in('status', STATUSES[tab] as never[])
        .order('updated_at', { ascending: tab !== 'review' ? false : true }).limit(200);
      if (error) throw error;
      return data as unknown as QueueDoc[];
    },
  });
  const counts = useQuery({
    queryKey: ['documents', 'queue', 'count'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).in('status', ['uploaded', 'under_review']);
      return count ?? 0;
    },
  });
  const rows = q.data ?? [];
  const open = useMemo(() => rows.find((d) => d.id === openId) ?? null, [rows, openId]);
  const changed = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['requests'] });
  };
  const who = (d: QueueDoc) => (d.customer?.customer_type === 'company' && d.customer.company_name ? d.customer.company_name : d.customer?.full_name ?? '—');

  const panel = open && (
    <Card className="p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-navy">{(lang === 'en' ? open.name_en : null) || open.name_ar}</div>
          <div className="text-xs text-ink-2">
            {open.customer && <Link to="/customers/$id" params={{ id: open.customer.id }} className="font-semibold text-brand">{who(open)}</Link>}
            {open.request && <> · <Link to="/requests/$id" params={{ id: open.request.id }} className="ltr font-latin font-semibold text-brand">{open.request.request_no}</Link></>}
          </div>
        </div>
        <button type="button" onClick={() => setOpenId(null)} className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label={t('common.close')}><X className="size-5" /></button>
      </div>
      <DocumentReview doc={open} onChanged={changed} />
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('documents.title')} />
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['review', 'rejected', 'approved'] as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => { setTab(k); setOpenId(null); }}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`documents.tabs.${k}`)}
            {k === 'review' && <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts.data ?? 0}</span>}
          </button>
        ))}
      </div>
      <div className={cn('grid gap-4', wide && open && 'grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]')}>
        <div className={cn(!wide && open && 'hidden')}>
          {q.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
            <Card><EmptyState icon={<FileText className="size-8" />} title={t(`documents.empty.${tab}`)} /></Card>
          ) : (
            <Card className="divide-y divide-line">
              {rows.map((d) => (
                <button key={d.id} type="button" onClick={() => setOpenId(d.id)}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-[#f9fbfe]', openId === d.id && 'bg-brand-50')}>
                  <FileText className="size-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{(lang === 'en' ? d.name_en : null) || d.name_ar}</div>
                    <div className="truncate text-xs text-ink-3">
                      {who(d)}{d.request ? <> · <span className="ltr font-latin">{d.request.request_no}</span></> : ''}
                      {d.file ? ` · v${d.file.version_no} · ${fmtDate(d.file.created_at, lang)}` : ''}
                    </div>
                  </div>
                  <Badge tone={DOC_STATUS_TONE[d.status]}>{t(`requests.docStatuses.${d.status}`)}</Badge>
                </button>
              ))}
            </Card>
          )}
        </div>
        {panel}
      </div>
    </div>
  );
}
