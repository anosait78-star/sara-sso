import { Link } from '@tanstack/react-router';
import { ChevronLeft, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useLang } from '@/lib/crm';
import { draftVersion, iconOf, nameOf, publishedVersion, useCategories } from '@/lib/services';
import { useServices } from './ServicesPage';

/** Entry point from the sidebar: pick a service to open its Workflow Builder. */
export function WorkflowIndexPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const categories = useCategories();
  const list = useServices();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t('workflow.title')} crumb={t('workflow.pickService')} />
      {list.isLoading ? (
        <div className="grid place-items-center py-20"><Spinner /></div>
      ) : (list.data ?? []).length === 0 ? (
        <Card><EmptyState icon={<Workflow className="size-8" />} title={t('services.empty')} /></Card>
      ) : (
        (categories.data ?? []).map((c) => {
          const rows = (list.data ?? []).filter((s) => s.category_id === c.id);
          if (rows.length === 0) return null;
          return (
            <Card key={c.id}>
              <div className="border-b border-line px-4 py-3 text-sm font-bold text-navy">{nameOf(c, lang)}</div>
              <ul className="divide-y divide-line">
                {rows.map((s) => {
                  const Icon = iconOf(s.icon);
                  const pub = publishedVersion(s);
                  const draft = draftVersion(s);
                  return (
                    <li key={s.id}>
                      <Link to="/services/$id/workflow" params={{ id: s.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f9fbfe]">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Icon className="size-[18px]" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{nameOf(s, lang)}</div>
                          <div className="ltr text-start text-xs text-ink-3">{s.code}</div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {pub ? <Badge tone="green" dot={false}><span className="font-latin">v{pub.version}</span></Badge> : <Badge tone="amber" dot={false}>{t('services.noWorkflow')}</Badge>}
                          {draft && <Badge tone="purple" dot={false}>{t('services.draftOpen', { version: draft.version })}</Badge>}
                        </div>
                        <ChevronLeft className="size-5 shrink-0 text-ink-3 ltr:rotate-180" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
