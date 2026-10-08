import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_name: string | null;
  actor_type: string;
  action: 'insert' | 'update' | 'delete' | 'rpc';
  action_key: string | null;
  table_name: string;
  record_label: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
}
const PAGE = 50;
const TABLES = ['employees', 'roles', 'role_permissions', 'departments', 'profiles', 'app_settings'];
const actionTone = { insert: 'green', update: 'blue', delete: 'red', rpc: 'purple' } as const;

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const logs = useQuery({
    queryKey: ['audit', table, limit],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('id, occurred_at, actor_name, actor_type, action, action_key, table_name, record_label, record_id, old_values, new_values, changed_fields')
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (table) q = q.eq('table_name', table);
      const { data, error } = await q;
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('audit.title')}
        actions={
          <Select className="h-10 w-auto" value={table} onChange={(e) => { setTable(e.target.value); setLimit(PAGE); }} aria-label={t('audit.filterTable')}>
            <option value="">{t('audit.filterTable')}: {t('common.all')}</option>
            {TABLES.map((tb) => <option key={tb} value={tb}>{t(`audit.tables.${tb}`)}</option>)}
          </Select>
        }
      />
      {logs.isLoading ? (
        <div className="grid place-items-center py-24"><Spinner /></div>
      ) : !logs.data?.length ? (
        <Card><EmptyState icon={<ScrollText className="size-8" />} title={t('audit.empty')} /></Card>
      ) : (
        <Card className="divide-y divide-line">
          {logs.data.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:gap-4">
              <div className="w-44 shrink-0 text-xs text-ink-3">{formatDateTime(r.occurred_at, i18n.language)}</div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b className="text-navy">{r.actor_name || t('audit.system')}</b>
                  <Badge tone={actionTone[r.action]} dot={false}>{t(`audit.actions.${r.action}`)}</Badge>
                  <span className="text-ink-2">{t(`audit.tables.${r.table_name}`, { defaultValue: r.table_name })}</span>
                  {r.record_label && <span className="font-semibold">«{r.record_label}»</span>}
                  {r.action_key && <span className="ltr rounded bg-muted px-1.5 text-[11px] text-ink-2">{r.action_key}</span>}
                </div>
                {r.action === 'update' && r.changed_fields?.length ? (
                  <div className="space-y-1">
                    {r.changed_fields.map((f) => (
                      <div key={f} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="ltr rounded bg-brand-50 px-1.5 font-semibold text-brand">{f}</span>
                        <span className="text-ink-3">{t('audit.from')}</span>
                        <span className="ltr max-w-[40ch] truncate rounded bg-[#fce8e8] px-1.5 text-[#8a1f1f]">{show(r.old_values?.[f])}</span>
                        <span className="text-ink-3">{t('audit.to')}</span>
                        <span className="ltr max-w-[40ch] truncate rounded bg-[#e5f6ec] px-1.5 text-[#0b6b35]">{show(r.new_values?.[f])}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {logs.data.length >= limit && (
            <div className="p-3 text-center">
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>{t('common.more')}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
