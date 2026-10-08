import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Check, ChevronRight, Clock, Info, MessageSquare, Pencil, Repeat, ThumbsDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AppointmentsPanel, FollowUpsPanel, NotesPanel, PhoneActions, Timeline } from '@/components/crm';
import { Button, Card, CardHeader, EmptyState, Field, Input, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { displayPhone, fmtDate, fromLocalInput, labelOf, useLang, useLookups, useStages } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { ConvertLeadDrawer, LEAD_SELECT, LeadFormDrawer, StageBadge, StageChangeDrawer, useInvalidateLeads, type LeadRow } from './LeadsPage';

type ActType = 'call' | 'meeting' | 'whatsapp' | 'email' | 'note';
interface ActivityRow { id: string; type: string; summary: string | null; occurred_at: string; from_stage_id: string | null; to_stage_id: string | null; actor: { profile: { full_name: string } | null } | null }

export function LeadPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const stages = useStages();
  const lines = useLookups('interest_line');
  const sources = useLookups('lead_source');
  const reasons = useLookups('lost_reason');
  const invalidate = useInvalidateLeads();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [act, setAct] = useState<{ type: ActType; summary: string; next: string }>({ type: 'call', summary: '', next: '' });
  const [tab, setTab] = useState<'activity' | 'followups' | 'appointments' | 'notes' | 'timeline'>('activity');

  const q = useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as LeadRow | null;
    },
  });
  const acts = useQuery({
    queryKey: ['lead_activities', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_activities')
        .select('id, type, summary, occurred_at, from_stage_id, to_stage_id, actor:employees(profile:profiles(full_name))')
        .eq('lead_id', id).order('occurred_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ActivityRow[];
    },
  });
  const log = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('log_lead_activity', {
        p_lead_id: id, p_type: act.type, p_summary: act.summary.trim(), p_next_follow_up_at: fromLocalInput(act.next) ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); setAct({ type: act.type, summary: '', next: '' }); invalidate(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading || stages.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  const l = q.data;
  if (!l) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;

  const stage = stages.data?.find((s) => s.id === l.stage_id);
  const pipeline = (stages.data ?? []).filter((s) => s.is_pipeline);
  const curIdx = pipeline.findIndex((s) => s.id === l.stage_id);
  const editable = can('leads', 'edit') && !l.converted_customer_id;
  const stageName = (sid: string | null) => { const s = stages.data?.find((x) => x.id === sid); return s ? (lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar) : ''; };
  const pendingStage = pendingKey ? stages.data?.find((s) => s.key === pendingKey) : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Link to="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('leads.title')}</Link>

      <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-navy md:text-xl">{l.full_name}</h1>
            <StageBadge stage={stage} />
            <span className="ltr text-xs text-ink-3">{l.lead_no}</span>
          </div>
          <div className="mt-1 text-xs text-ink-2">{l.interest_details || labelOf(lines.data, l.interest_line, lang)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PhoneActions phone={l.phone} size="md" />
          {editable && (
            <>
              <Button onClick={() => setEditing(true)} aria-label={t('common.edit')}><Pencil className="size-4" /></Button>
              <Button onClick={() => setPendingKey('postponed')}><Clock className="size-4" /> {t('leads.postpone')}</Button>
              <Button variant="danger" onClick={() => setPendingKey('not_interested')}><ThumbsDown className="size-4" /> {t('leads.notInterested')}</Button>
              {can('customers', 'create') && <Button variant="success" onClick={() => setConverting(true)}><Repeat className="size-4" /> {t('leads.convert')}</Button>}
            </>
          )}
        </div>
      </Card>

      {l.converted_customer_id && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#bfe6cf] bg-[#e5f6ec] px-4 py-3 text-sm text-[#0b6b35]">
          <Check className="size-5" /> {t('leads.converted')} · {fmtDate(l.converted_at, lang)}
          <Link to="/customers/$id" params={{ id: l.converted_customer_id }} className="ms-auto font-semibold text-brand">{t('leads.openCustomer')}</Link>
        </div>
      )}

      {/* stage bar */}
      <div className="flex gap-1 overflow-x-auto">
        {pipeline.map((s, i) => {
          const done = curIdx >= 0 && i < curIdx;
          const cur = s.id === l.stage_id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!editable || cur || s.stage_category === 'won'}
              onClick={() => (s.requires !== 'none' ? setPendingKey(s.key) : supabase.rpc('change_lead_stage', { p_lead_id: l.id, p_stage_id: s.id }).then(({ error }) => (error ? toast.error(t(errorKey(error))) : (toast.success(t('common.saved')), invalidate()))))}
              className={cn('flex h-9 min-w-28 flex-1 items-center justify-center gap-1 px-3 text-xs font-semibold whitespace-nowrap first:rounded-s-lg last:rounded-e-lg',
                cur ? 'bg-brand text-white' : done ? 'bg-brand-100 text-navy' : 'bg-muted text-ink-3', editable && !cur && s.stage_category !== 'won' && 'hover:bg-brand-50')}
            >
              {done && <Check className="size-3.5" />}{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}
            </button>
          );
        })}
      </div>
      {stage && !stage.is_pipeline && (
        <div className="flex items-center gap-2 rounded-xl bg-[#fdf3dc] px-4 py-2.5 text-sm text-[#7a5200]">
          <Info className="size-4" /> {stageName(stage.id)}
          {l.postponed_until && ` · ${fmtDate(l.postponed_until, lang, false)}`}
          {l.lost_reason && ` · ${labelOf(reasons.data, l.lost_reason, lang)}`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* info */}
        <Card className="h-fit">
          <CardHeader icon={<Info className="size-4" />} title={t('customers.basicInfo')} />
          <dl className="px-4 py-1 text-[13px]">
            {[
              [t('crm.phone'), l.phone ? <span className="ltr">{displayPhone(l.phone)}</span> : '—'],
              [t('crm.email'), l.email ? <span className="ltr">{l.email}</span> : '—'],
              [t('customers.companyName'), l.company_name ?? '—'],
              [t('leads.interest'), labelOf(lines.data, l.interest_line, lang)],
              [t('leads.budget'), l.budget ? <span className="ltr">{Number(l.budget).toLocaleString('en')} EGP</span> : '—'],
              [t('crm.source'), labelOf(sources.data, l.source, lang)],
              [t('crm.owner'), l.owner?.profile?.full_name ?? t('crm.unassigned')],
              [t('leads.nextFollowUp'), fmtDate(l.next_follow_up_at, lang)],
              [t('crm.createdAt'), fmtDate(l.created_at, lang, false)],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-dashed border-line py-2.5 last:border-0"><dt className="text-ink-2">{k}</dt><dd className="text-end font-semibold">{v}</dd></div>
            ))}
          </dl>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 overflow-x-auto border-b border-line">
            {(['activity', 'followups', 'appointments', 'notes', 'timeline'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn('-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2', k === 'timeline' && 'lg:hidden')}>
                {{ activity: t('leads.activity'), followups: t('followups.title'), appointments: t('appointments.title'), notes: t('crm.notes'), timeline: t('crm.timeline') }[k]}
              </button>
            ))}
          </div>
          {tab === 'activity' && (
            <Card>
              {editable && (
                <div className="space-y-3 border-b border-line p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(['call', 'meeting', 'whatsapp', 'email', 'note'] as ActType[]).map((k) => (
                      <button key={k} type="button" onClick={() => setAct({ ...act, type: k })} className={cn('rounded-full px-3 py-1 text-xs font-semibold', act.type === k ? 'bg-navy text-white' : 'bg-muted text-ink-2')}>{t(`leads.activityTypes.${k}`)}</button>
                    ))}
                  </div>
                  <Textarea value={act.summary} onChange={(e) => setAct({ ...act, summary: e.target.value })} placeholder={t('leads.activityPlaceholder')} />
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label={t('leads.scheduleNext')} className="min-w-52 flex-1"><Input type="datetime-local" className="h-10" value={act.next} onChange={(e) => setAct({ ...act, next: e.target.value })} /></Field>
                    <Button variant="primary" disabled={!act.summary.trim()} loading={log.isPending} onClick={() => log.mutate()}><MessageSquare className="size-4" /> {t('leads.save')}</Button>
                  </div>
                </div>
              )}
              <ol className="divide-y divide-line px-4">
                {acts.data?.map((a) => (
                  <li key={a.id} className="py-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand">{t(`leads.activityTypes.${a.type}`, { defaultValue: a.type })}</span>
                      {a.type === 'stage_change' || a.type === 'converted' ? <span className="text-ink-2">{stageName(a.from_stage_id)} ← {stageName(a.to_stage_id)}</span> : null}
                      <span className="ms-auto text-[11px] text-ink-3">{fmtDate(a.occurred_at, lang)}{a.actor?.profile?.full_name ? ` · ${a.actor.profile.full_name}` : ''}</span>
                    </div>
                    {a.summary && <p className="mt-1.5 whitespace-pre-wrap text-ink">{a.summary}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {tab === 'followups' && <FollowUpsPanel leadId={l.id} defaultAssignee={l.owner_employee_id} />}
          {tab === 'appointments' && <AppointmentsPanel leadId={l.id} />}
          {tab === 'notes' && <NotesPanel leadId={l.id} />}
          {tab === 'timeline' && <div className="lg:hidden"><Timeline leadId={l.id} /></div>}
        </div>
        <div className="hidden lg:block"><Timeline leadId={l.id} /></div>
      </div>

      <LeadFormDrawer open={editing} onOpenChange={setEditing} lead={l} />
      <ConvertLeadDrawer lead={converting ? l : null} onClose={() => setConverting(false)} />
      <StageChangeDrawer pending={pendingStage ? { lead: l, stage: pendingStage } : null} onClose={() => setPendingKey(null)} />
    </div>
  );
}
