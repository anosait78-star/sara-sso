import { useMutation, useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Card, EmptyState, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

interface Message { id: string; sender_type: 'client' | 'staff'; sender_name: string | null; body: string; created_at: string; read_at: string | null }

/** Request thread with the client (PROJECT_PLAN §5.4) — visible to the client in the app. */
export function RequestMessages({ requestId, open }: { requestId: string; open: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const [body, setBody] = useState('');
  const q = useQuery({
    queryKey: ['messages', requestId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('request_messages').select('id, sender_type, sender_name, body, created_at, read_at')
        .eq('request_id', requestId).order('created_at');
      if (error) throw error;
      return data as unknown as Message[];
    },
  });
  const unread = (q.data ?? []).filter((m) => m.sender_type === 'client' && !m.read_at).length;
  useEffect(() => {
    if (unread) void supabase.rpc('mark_messages_read', { p_request_id: requestId });
  }, [unread, requestId]);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_request_message', { p_request_id: requestId, p_body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setBody(''); void q.refetch(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card className="p-4">
      {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState title={t('messages.empty')} /> : (
        <div className="space-y-3">
          {q.data.map((m) => (
            <div key={m.id} className={cn('flex flex-col gap-1', m.sender_type === 'staff' ? 'items-start' : 'items-end')}>
              <div className={cn('max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm', m.sender_type === 'staff' ? 'bg-brand text-white' : 'border border-line bg-white')}>{m.body}</div>
              <span className="text-[11px] text-ink-3">
                {m.sender_type === 'client' ? `${t('messages.client')}: ` : ''}{m.sender_name ?? '—'} · {fmtDate(m.created_at, lang)}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && can('service_requests', 'view') && (
        <div className="mt-4 flex items-end gap-2 border-t border-line pt-3">
          <Textarea className="min-h-12 flex-1" placeholder={t('messages.placeholder')} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button variant="primary" loading={send.isPending} disabled={!body.trim()} onClick={() => send.mutate()}><Send className="size-4" /> {t('messages.send')}</Button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">{t('messages.visibleHint')}</p>
    </Card>
  );
}
