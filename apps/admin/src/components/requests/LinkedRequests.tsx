import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/crm';
import { REQUEST_SELECT, REQUEST_STATUS_TONE, type RequestRow } from '@/lib/requests';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { NewRequestDrawer, type RequestLink } from '@/pages/RequestsPage';

const COLUMN = { company: 'company_file_id', policy: 'insurance_policy_id', loan: 'loan_application_id' } as const;

/** Requests (procedures) linked to a business-line file, with "new procedure" linked to the same file. */
export function LinkedRequestsCard({ link, customer, title, empty }: {
  link: RequestLink; customer: { id: string; full_name: string } | null | undefined; title: string; empty: string;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ['requests', link.kind, link.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).eq(COLUMN[link.kind], link.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });
  return (
    <Card>
      <CardHeader title={title} icon={<ClipboardList className="size-4 text-brand" />}
        actions={can('service_requests', 'create') && customer && (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" /> {t('companies.newProcedure')}</Button>
        )} />
      {(q.data ?? []).length === 0 ? <EmptyState title={empty} /> : (
        <ul className="divide-y divide-line">
          {q.data!.map((r) => (
            <li key={r.id}>
              <Link to="/requests/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f9fbfe]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{nameOf(r.service, lang)}</div>
                  <div className="ltr text-start font-latin text-xs text-ink-3">{r.request_no}</div>
                </div>
                <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(`requests.statuses.${r.status}`)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {customer && (
        <NewRequestDrawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) void qc.invalidateQueries({ queryKey: key }); }}
          customer={{ id: customer.id, title: customer.full_name }} link={link} />
      )}
    </Card>
  );
}
