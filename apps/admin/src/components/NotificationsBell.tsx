import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtDate, useLang } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Notification { id: string; event_key: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

/** In-app notifications (polled; Realtime is added when the realtime service runs in production). */
export function NotificationsBell() {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['notifications'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id, event_key, title, body, link, read_at, created_at')
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data as unknown as Notification[];
    },
  });
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  const markRead = async (ids?: string[]) => {
    await supabase.rpc('mark_notifications_read', { p_ids: ids });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="relative grid size-10 place-items-center rounded-[10px] border border-line text-ink-2 outline-none hover:bg-muted" aria-label={t('notifications.title')}>
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-[min(380px,92vw)] rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="flex-1 text-sm font-bold text-navy">{t('notifications.title')}</span>
            {unread > 0 && (
              <button type="button" onClick={() => void markRead()} className="flex items-center gap-1 text-xs font-semibold text-brand">
                <CheckCheck className="size-4" /> {t('notifications.markAll')}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {(q.data ?? []).length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-3">{t('notifications.empty')}</p> : q.data!.map((n) => (
              <DropdownMenu.Item key={n.id} onSelect={() => { void markRead([n.id]); if (n.link) void navigate({ to: n.link }); }}
                className={cn('flex cursor-pointer gap-3 border-b border-line px-4 py-3 outline-none last:border-0 data-[highlighted]:bg-muted', !n.read_at && 'bg-brand-50/50')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} />
                <div className="min-w-0 flex-1">
                  <div className="ltr text-start font-latin text-xs font-bold text-navy">{n.title}</div>
                  {n.body && <div className="text-[13px] text-ink">{n.body}</div>}
                  <div className="text-[11px] text-ink-3">{fmtDate(n.created_at, lang)}</div>
                </div>
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
