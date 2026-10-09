import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, useLang } from '@/lib/crm';
import { REQUEST_SELECT, REQUEST_STATUS_TONE, type RequestRow } from '@/lib/requests';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { NewRequestDrawer } from '@/pages/RequestsPage';

/** Customer 360 → requests tab. */
export function CustomerRequests({ customerId, title }: { customerId: string; title: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['requests', 'customer', customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).eq('customer_id', customerId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });
  return (
    <Card>
      <CardHeader icon={<ClipboardList className="size-4" />} title={t('requests.title')}
        actions={can('service_requests', 'create') && <Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('requests.new')}</Button>} />
      {q.isLoading ? <div className="p-4"><Spinner /></div> : !q.data?.length ? <EmptyState title={t('requests.empty')} /> : (
        <ul className="divide-y divide-line">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link to="/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f9fbfe]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="ltr font-latin text-sm font-bold text-navy">{r.request_no}</span>
                    <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(`requests.statuses.${r.status}`)}</Badge>
                    {r.is_overdue && <Badge tone="red" dot={false}>{t('requests.overdue')}</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-[13px]">{nameOf(r.service, lang)}{r.current_step ? ` · ${nameOf(r.current_step, lang)}` : ''}</div>
                </div>
                <span className="text-xs text-ink-3">{fmtDate(r.created_at, lang, false)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewRequestDrawer open={creating} onOpenChange={setCreating} customer={{ id: customerId, title }} />
    </Card>
  );
}
