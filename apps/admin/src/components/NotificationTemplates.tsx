import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Field, Input, Switch, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

interface Template { event_key: string; category: string; description_ar: string | null; title_tpl: string; body_tpl: string; push_enabled: boolean }

/** Settings → push notification templates for the client app (D10 = Expo push only). */
export function NotificationTemplatesCard({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Template | null>(null);
  const q = useQuery({
    queryKey: ['notification_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_templates').select('*').order('category').order('event_key');
      if (error) throw error;
      return data as unknown as Template[];
    },
  });
  const save = useMutation({
    mutationFn: async (x: Template) => {
      const { error } = await supabase.from('notification_templates').update({ title_tpl: x.title_tpl, body_tpl: x.body_tpl, push_enabled: x.push_enabled }).eq('event_key', x.event_key);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); setEdit(null); void qc.invalidateQueries({ queryKey: ['notification_templates'] }); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader icon={<BellRing className="size-4" />} title={t('settings.templates.title')} />
      <p className="border-b border-line px-4 py-2.5 text-xs text-ink-2">{t('settings.templates.note')}</p>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((x) => (
          <li key={x.event_key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {x.description_ar ?? x.event_key}
                <Badge tone="gray" dot={false}>{t(`settings.templates.categories.${x.category}`)}</Badge>
              </div>
              <div className="truncate text-xs text-ink-3">{x.title_tpl}</div>
            </div>
            <Switch checked={x.push_enabled} disabled={!editable} onChange={(v) => save.mutate({ ...x, push_enabled: v })} label={t('settings.templates.push')} />
            {editable && <button type="button" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" onClick={() => setEdit(x)} aria-label={t('common.edit')}><Pencil className="size-4" /></button>}
          </li>
        ))}
      </ul>
      <TemplateDialog value={edit} onClose={() => setEdit(null)} onSave={(x) => save.mutate(x)} saving={save.isPending} />
    </Card>
  );
}

function TemplateDialog({ value, onClose, onSave, saving }: { value: Template | null; onClose: () => void; onSave: (x: Template) => void; saving: boolean }) {
  const { t } = useTranslation();
  const [x, setX] = useState<Template | null>(null);
  useEffect(() => setX(value), [value]);
  return (
    <Modal open={!!value} onOpenChange={(v) => !v && onClose()} title={value?.description_ar ?? ''}
      footer={<><Button variant="primary" loading={saving} disabled={!x?.title_tpl.trim()} onClick={() => x && onSave(x)}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      {x && (
        <div className="space-y-4">
          <Field label={t('settings.templates.titleTpl')}><Input value={x.title_tpl} onChange={(e) => setX({ ...x, title_tpl: e.target.value })} /></Field>
          <Field label={t('settings.templates.bodyTpl')} hint={t('settings.templates.vars')}><Textarea value={x.body_tpl} onChange={(e) => setX({ ...x, body_tpl: e.target.value })} /></Field>
          <div className="ltr text-start font-latin text-[11px] text-ink-3">{x.event_key}</div>
        </div>
      )}
    </Modal>
  );
}
