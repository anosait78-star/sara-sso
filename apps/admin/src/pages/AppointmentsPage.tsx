import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarDays, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APPOINTMENT_SELECT, AppointmentDrawer, AppointmentStatusBadge, type AppointmentRow } from '@/components/crm';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function AppointmentsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [editing, setEditing] = useState<AppointmentRow | 'new' | null>(null);

  const q = useQuery({
    queryKey: ['appointments', 'page', when],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase.from('appointments').select(APPOINTMENT_SELECT).limit(300);
      query = when === 'upcoming'
        ? query.gte('starts_at', new Date(Date.now() - 2 * 3600_000).toISOString()).order('starts_at', { ascending: true })
        : query.lt('starts_at', now).order('starts_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as AppointmentRow[];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, AppointmentRow[]>();
    for (const a of q.data ?? []) {
      const d = new Date(a.starts_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return [...m.values()];
  }, [q.data]);
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeStyle: 'short' }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('appointments.title')} actions={can('appointments', 'create') && <Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" /> {t('appointments.new')}</Button>} />
      <div className="flex w-fit rounded-lg bg-muted p-1 text-sm font-semibold">
        {(['upcoming', 'past'] as const).map((w) => (
          <button key={w} type="button" onClick={() => setWhen(w)} className={cn('rounded-md px-3 py-1', when === w ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>{t(`appointments.${w}`)}</button>
        ))}
      </div>
      {q.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : !byDay.length ? (
        <Card><EmptyState icon={<CalendarDays className="size-8" />} title={t('appointments.empty')} /></Card>
      ) : byDay.map((items) => (
        <section key={items[0]!.id} className="space-y-2">
          <h2 className="text-xs font-bold text-ink-2">{dayLabel(items[0]!.starts_at)}</h2>
          <Card className="divide-y divide-line">
            {items.map((a) => {
              const rel = a.customer ? { to: '/customers/$id' as const, id: a.customer.id, name: a.customer.full_name } : a.lead ? { to: '/leads/$id' as const, id: a.lead.id, name: a.lead.full_name } : null;
              return (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  <div className="w-14 shrink-0 text-center">
                    <div className="font-latin text-sm font-bold text-navy">{time(a.starts_at)}</div>
                    <div className="text-[10px] text-ink-3">{t(`appointments.types.${a.type}`)}</div>
                  </div>
                  <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-start">
                    <div className="text-[13px] font-semibold">{a.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                      {a.location && <span><MapPin className="me-0.5 inline size-3" />{a.location}</span>}
                      {a.employee?.profile?.full_name && <span>{a.employee.profile.full_name}</span>}
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <AppointmentStatusBadge s={a.status} />
                    {rel && <Link to={rel.to} params={{ id: rel.id }} className="text-[11px] font-semibold text-brand">{rel.name}</Link>}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ))}
      <AppointmentDrawer open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} appointment={editing === 'new' ? null : editing} />
    </div>
  );
}
