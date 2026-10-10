import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Card, CardHeader, Input, Switch } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

type Table = 'insurance_companies' | 'insurance_types' | 'financing_entities';
const TABLES: Table[] = ['insurance_companies', 'insurance_types', 'financing_entities'];
interface Row { id: string; name_ar: string; name_en: string | null; is_active: boolean; sort_order: number; key?: string }

/** Settings → the lists the business-line modules pick from (insurers, insurance types, lenders). */
export function ReferenceListsCard({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [table, setTable] = useState<Table>('insurance_companies');
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const q = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').order('sort_order');
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: [table] });
  const add = useMutation({
    mutationFn: async () => {
      const base = { name_ar: ar.trim(), name_en: en.trim() || null, sort_order: (q.data?.length ?? 0) + 1 };
      const { error } = table === 'insurance_types'
        ? await supabase.from(table).insert({ ...base, key: `t${Date.now().toString(36)}` })
        : await supabase.from(table).insert(base);
      if (error) throw error;
    },
    onSuccess: () => { setAr(''); setEn(''); refresh(); toast.success(t('common.saved')); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const toggle = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.from(table).update({ is_active: !r.is_active }).eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader icon={<ListChecks className="size-4" />} title={t('settings.lists')} />
      <div className="flex gap-1 overflow-x-auto border-b border-line px-2">
        {TABLES.map((k) => (
          <button key={k} type="button" onClick={() => setTable(k)}
            className={cn('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold', table === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`settings.listNames.${k}`)}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className={cn('min-w-0 flex-1', !r.is_active && 'opacity-50')}>
              <div className="truncate text-sm font-semibold">{r.name_ar}</div>
              {r.name_en && <div className="ltr truncate text-start text-xs text-ink-3">{r.name_en}</div>}
            </div>
            <Switch checked={r.is_active} disabled={!editable} onChange={() => toggle.mutate(r)} label={t('settings.active')} />
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-line p-4">
          <Input className="h-9 min-w-40 flex-1" placeholder={t('settings.nameArShort')} value={ar} onChange={(e) => setAr(e.target.value)} />
          <Input className="h-9 min-w-40 flex-1" dir="ltr" placeholder={t('settings.nameEnShort')} value={en} onChange={(e) => setEn(e.target.value)} />
          <Button size="sm" variant="primary" disabled={ar.trim().length < 2} loading={add.isPending} onClick={() => add.mutate()}><Plus className="size-4" /> {t('settings.addItem')}</Button>
        </div>
      )}
    </Card>
  );
}
