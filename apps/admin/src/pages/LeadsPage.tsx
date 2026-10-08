import { normalizeEgyptianMobile, validateEgyptianNationalId } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlarmClock, CalendarDays, ChevronLeft, Kanban, List, Plus, Repeat, Search, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PhoneActions } from '@/components/crm';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { displayPhone, dueBucket, fmtDate, fromLocalInput, labelOf, useEmployeeOptions, useLang, useLookups, useStages, type Stage } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

export interface LeadRow {
  id: string; lead_no: string | null; full_name: string; company_name: string | null; phone: string | null; email: string | null;
  interest_line: string | null; interest_details: string | null; budget: number | null; source: string | null; stage_id: string;
  owner_employee_id: string | null; next_follow_up_at: string | null; postponed_until: string | null; lost_reason: string | null; lost_note: string | null;
  converted_customer_id: string | null; converted_at: string | null; created_at: string;
  owner?: { profile: { full_name: string } | null } | null;
}
export const LEAD_SELECT = '*, owner:employees!leads_owner_employee_id_fkey(profile:profiles(full_name))';

export function useInvalidateLeads() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['lead_activities'] });
  };
}

export function LeadsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const stages = useStages();
  const lines = useLookups('interest_line');
  const employees = useEmployeeOptions();
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [q, setQ] = useState('');
  const [line, setLine] = useState('');
  const [owner, setOwner] = useState('');
  const [creating, setCreating] = useState(false);
  const [mobileStage, setMobileStage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ lead: LeadRow; stage: Stage } | null>(null);
  const [converting, setConverting] = useState<LeadRow | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const invalidate = useInvalidateLeads();

  const list = useQuery({
    queryKey: ['leads', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(LEAD_SELECT).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as LeadRow[];
    },
  });

  const move = useMutation({
    mutationFn: async (p: { lead: LeadRow; stage: Stage }) => {
      const { error } = await supabase.rpc('change_lead_stage', { p_lead_id: p.lead.id, p_stage_id: p.stage.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); invalidate(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((l) => (!line || l.interest_line === line) && (!owner || l.owner_employee_id === owner) &&
      (!term || [l.full_name, l.company_name, l.lead_no, l.phone, l.email, l.interest_details].some((v) => v?.toLowerCase().includes(term))));
  }, [list.data, q, line, owner]);

  const pipeline = (stages.data ?? []).filter((s) => s.is_pipeline);
  const side = (stages.data ?? []).filter((s) => !s.is_pipeline);
  const byStage = (id: string) => filtered.filter((l) => l.stage_id === id);
  const stageOf = (id: string) => stages.data?.find((s) => s.id === id);

  function requestMove(lead: LeadRow, stage: Stage) {
    if (lead.stage_id === stage.id || lead.converted_customer_id) return;
    if (stage.stage_category === 'won') return setConverting(lead);
    if (stage.requires !== 'none') return setPending({ lead, stage });
    move.mutate({ lead, stage });
  }

  useEffect(() => { if (!mobileStage && pipeline[0]) setMobileStage(pipeline[0].id); }, [pipeline, mobileStage]);

  const card = (l: LeadRow) => {
    const bucket = dueBucket(l.next_follow_up_at);
    return (
      <div
        key={l.id}
        draggable={can('leads', 'edit') && !l.converted_customer_id}
        onDragStart={(e) => e.dataTransfer.setData('text/lead', l.id)}
        onClick={() => void navigate({ to: '/leads/$id', params: { id: l.id } })}
        className="cursor-pointer space-y-1.5 rounded-xl border border-line bg-white p-3 text-[12.5px] shadow-[0_1px_2px_rgba(11,42,85,.04)] hover:border-brand-200"
      >
        <div className="font-semibold text-ink">{l.full_name}</div>
        <div className="line-clamp-2 text-ink-2">{l.interest_details || labelOf(lines.data, l.interest_line, lang)}</div>
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          {l.next_follow_up_at && (
            <span className={cn(bucket === 'overdue' && 'font-semibold text-danger', bucket === 'today' && 'font-semibold text-brand')}>
              {bucket === 'overdue' ? <AlarmClock className="me-0.5 inline size-3" /> : <CalendarDays className="me-0.5 inline size-3" />}
              {fmtDate(l.next_follow_up_at, lang, false)}
            </span>
          )}
          <span className="ms-auto"><Avatar name={l.owner?.profile?.full_name ?? '?'} size="sm" /></span>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <PageHeader
        title={t('leads.title')}
        actions={<>
          <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
            {(['pipeline', 'list'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1', view === v ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>
                {v === 'pipeline' ? <Kanban className="size-4" /> : <List className="size-4" />}{t(`leads.${v}`)}
              </button>
            ))}
          </div>
          {can('leads', 'create') && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('leads.new')}</Button>}
        </>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
          <Input className="h-10 ps-9" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-10 w-auto" value={line} onChange={(e) => setLine(e.target.value)} aria-label={t('leads.interest')}>
          <option value="">{t('leads.interest')}: {t('common.all')}</option>
          {(lines.data ?? []).map((l) => <option key={l.key} value={l.key}>{lang === 'en' ? l.name_en ?? l.name_ar : l.name_ar}</option>)}
        </Select>
        <Select className="h-10 w-auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={t('crm.owner')}>
          <option value="">{t('crm.owner')}: {t('common.all')}</option>
          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </div>

      {list.isLoading || stages.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : view === 'pipeline' ? (
        <>
          {/* desktop / tablet kanban */}
          <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
            {pipeline.map((s) => {
              const items = byStage(s.id);
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(null);
                    const lead = list.data?.find((l) => l.id === e.dataTransfer.getData('text/lead'));
                    if (lead) requestMove(lead, s);
                  }}
                  className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-xl p-2.5 transition-colors', s.stage_category === 'won' ? 'bg-[#e5f6ec]' : 'bg-muted', dragOver === s.id && 'ring-2 ring-brand')}
                >
                  <div className="flex items-center gap-2 px-1 pb-1 text-[13px] font-bold text-navy">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}
                    <span className="ms-auto rounded-md bg-white px-1.5 text-[11px] text-ink-2">{items.length}</span>
                  </div>
                  <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto">{items.map(card)}</div>
                </div>
              );
            })}
            <div className="flex w-52 shrink-0 flex-col gap-2 rounded-xl bg-canvas p-2.5">
              <div className="px-1 pb-1 text-[13px] font-bold text-navy">{t('leads.sideStates')}</div>
              {side.map((s) => (
                <div
                  key={s.id}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const lead = list.data?.find((l) => l.id === e.dataTransfer.getData('text/lead')); if (lead) requestMove(lead, s); }}
                  className={cn('flex items-center justify-between rounded-lg border border-dashed bg-white px-3 py-3 text-[12.5px]', dragOver === s.id ? 'border-brand' : 'border-line')}
                >
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}</span>
                  <b className="font-latin">{byStage(s.id).length}</b>
                </div>
              ))}
              <p className="px-1 text-[11px] text-ink-3">{t('leads.dropHint')}</p>
            </div>
          </div>
          {/* mobile: one stage at a time */}
          <div className="space-y-3 md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...pipeline, ...side].map((s) => (
                <button key={s.id} type="button" onClick={() => setMobileStage(s.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold', mobileStage === s.id ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink-2')}>
                  {lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar} <span className="font-latin opacity-70">{byStage(s.id).length}</span>
                </button>
              ))}
            </div>
            {mobileStage && byStage(mobileStage).length === 0 ? <Card><EmptyState title={t('leads.empty')} /></Card> : mobileStage && byStage(mobileStage).map((l) => (
              <Card key={l.id} className="space-y-2 p-3">
                <Link to="/leads/$id" params={{ id: l.id }} className="block">
                  <div className="font-semibold">{l.full_name}</div>
                  <div className="text-xs text-ink-2">{l.interest_details || labelOf(lines.data, l.interest_line, lang)}</div>
                  {l.next_follow_up_at && <div className={cn('mt-1 text-xs', dueBucket(l.next_follow_up_at) === 'overdue' ? 'font-semibold text-danger' : 'text-ink-3')}>{t('leads.nextFollowUp')}: {fmtDate(l.next_follow_up_at, lang)}</div>}
                </Link>
                <div className="flex items-center gap-2">
                  <PhoneActions phone={l.phone} />
                  {can('leads', 'edit') && !l.converted_customer_id && (
                    <Select className="h-8 flex-1 text-xs" value="" onChange={(e) => { const s = stages.data?.find((x) => x.id === e.target.value); if (s) requestMove(l, s); }} aria-label={t('leads.moveTo')}>
                      <option value="">{t('leads.moveTo')}…</option>
                      {(stages.data ?? []).filter((s) => s.id !== l.stage_id).map((s) => <option key={s.id} value={s.id}>{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}</option>)}
                    </Select>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="overflow-x-auto">
          {filtered.length === 0 ? <EmptyState icon={<UserPlus className="size-8" />} title={t('leads.empty')} /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('employees.name')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('leads.stage')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('leads.interest')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('crm.phone')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('leads.nextFollowUp')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('crm.owner')}</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const s = stageOf(l.stage_id);
                  return (
                    <tr key={l.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/leads/$id', params: { id: l.id } })}>
                      <td className="px-4 py-3"><div className="font-semibold">{l.full_name}</div><div className="ltr text-xs text-ink-3">{l.lead_no}</div></td>
                      <td className="px-4 py-3">{s && <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: s.color }} />{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}</span>}</td>
                      <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{labelOf(lines.data, l.interest_line, lang)}</td>
                      <td className="hidden px-4 py-3 lg:table-cell"><span className="ltr text-ink-2">{displayPhone(l.phone)}</span></td>
                      <td className={cn('px-4 py-3 text-xs', dueBucket(l.next_follow_up_at) === 'overdue' ? 'font-semibold text-danger' : 'text-ink-2')}>{l.next_follow_up_at ? fmtDate(l.next_follow_up_at, lang) : '—'}</td>
                      <td className="hidden px-4 py-3 md:table-cell">{l.owner?.profile?.full_name ?? '—'}</td>
                      <td className="px-2 py-3"><ChevronLeft className="size-4 text-ink-3 ltr:rotate-180" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <LeadFormDrawer open={creating} onOpenChange={setCreating} onSaved={(id) => void navigate({ to: '/leads/$id', params: { id } })} />
      <StageChangeDrawer pending={pending} onClose={() => setPending(null)} />
      <ConvertLeadDrawer lead={converting} onClose={() => setConverting(null)} />
    </div>
  );
}

export function LeadFormDrawer({ open, onOpenChange, lead, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; lead?: LeadRow | null; onSaved?: (id: string) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { can, staff } = useAuth();
  const sources = useLookups('lead_source');
  const lines = useLookups('interest_line');
  const employees = useEmployeeOptions();
  const stages = useStages();
  const invalidate = useInvalidateLeads();
  const empty = { full_name: '', company_name: '', phone: '', email: '', interest_line: '', interest_details: '', budget: '', source: '', owner_employee_id: '' };
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(lead ? {
      full_name: lead.full_name, company_name: lead.company_name ?? '', phone: lead.phone?.replace(/^\+20/, '0') ?? '', email: lead.email ?? '',
      interest_line: lead.interest_line ?? '', interest_details: lead.interest_details ?? '', budget: lead.budget?.toString() ?? '', source: lead.source ?? '',
      owner_employee_id: lead.owner_employee_id ?? '',
    } : { ...empty, owner_employee_id: staff?.employee_id ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead]);
  const phone = form.phone ? normalizeEgyptianMobile(form.phone) : null;
  const errors = {
    full_name: form.full_name.trim().length < 2 ? t('common.required') : '',
    phone: form.phone && !phone ? t('crm.invalidPhone') : !form.phone && !form.email ? t('leads.phoneOrEmail') : '',
  };
  const valid = !errors.full_name && !errors.phone;
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name.trim(), company_name: form.company_name || null, phone, email: form.email || null,
        interest_line: form.interest_line || null, interest_details: form.interest_details || null, budget: form.budget ? Number(form.budget) : null,
        source: form.source || null,
      };
      if (lead) {
        const upd = can('leads', 'assign') ? { ...payload, owner_employee_id: form.owner_employee_id || null } : payload;
        const { error } = await supabase.from('leads').update(upd).eq('id', lead.id);
        if (error) throw error;
        return lead.id;
      }
      const newStage = stages.data?.find((s) => s.key === 'new');
      if (!newStage) throw new Error('stages not loaded');
      const { data, error } = await supabase.from('leads').insert({ ...payload, stage_id: newStage.id, owner_employee_id: can('leads', 'assign') ? form.owner_employee_id || null : null }).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { toast.success(t('common.saved')); invalidate(); onOpenChange(false); onSaved?.(id); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} width="lg" title={lead ? t('leads.edit') : t('leads.new')}
      footer={<><Button variant="primary" loading={save.isPending} onClick={() => { setTouched(true); if (valid) save.mutate(); }}>{t('common.save')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={`${t('employees.name')} *`} error={touched ? errors.full_name || undefined : undefined}><Input value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label={t('customers.companyName')}><Input value={form.company_name} onChange={set('company_name')} /></Field>
        <Field label={t('crm.phone')} error={touched ? errors.phone || undefined : undefined}><Input dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={form.phone} onChange={set('phone')} /></Field>
        <Field label={t('crm.email')}><Input dir="ltr" type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label={t('leads.interest')}>
          <Select value={form.interest_line} onChange={set('interest_line')}>
            <option value="">—</option>
            {(lines.data ?? []).map((l) => <option key={l.key} value={l.key}>{lang === 'en' ? l.name_en ?? l.name_ar : l.name_ar}</option>)}
          </Select>
        </Field>
        <Field label={t('leads.budget')}><Input dir="ltr" inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        <Field label={t('leads.interestDetails')} className="md:col-span-2"><Textarea value={form.interest_details} onChange={set('interest_details')} /></Field>
        <Field label={t('crm.source')}>
          <Select value={form.source} onChange={set('source')}>
            <option value="">—</option>
            {(sources.data ?? []).map((s) => <option key={s.key} value={s.key}>{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.owner')}>
          <Select value={form.owner_employee_id} disabled={!can('leads', 'assign')} onChange={set('owner_employee_id')}>
            {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            {staff && !employees.data?.some((e) => e.id === staff.employee_id) && <option value={staff.employee_id}>{staff.full_name}</option>}
          </Select>
        </Field>
      </div>
    </Drawer>
  );
}

export function StageChangeDrawer({ pending, onClose }: { pending: { lead: LeadRow; stage: Stage } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const reasons = useLookups('lost_reason');
  const invalidate = useInvalidateLeads();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setDate(''); setReason(''); setNote(''); }, [pending]);
  const req = pending?.stage.requires;
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('change_lead_stage', {
        p_lead_id: pending!.lead.id, p_stage_id: pending!.stage.id, p_note: note || undefined,
        p_follow_up_at: req === 'follow_up_date' ? fromLocalInput(date) ?? undefined : undefined,
        p_lost_reason: req === 'reason' ? reason : undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); invalidate(); onClose(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const valid = req === 'follow_up_date' ? !!date : req === 'reason' ? !!reason : true;
  return (
    <Drawer open={!!pending} onOpenChange={(v) => !v && onClose()}
      title={`${t('leads.moveTo')}: ${pending ? (lang === 'en' ? pending.stage.name_en ?? pending.stage.name_ar : pending.stage.name_ar) : ''}`}
      footer={<><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm font-semibold">{pending?.lead.full_name}</p>
        {req === 'follow_up_date' && <Field label={`${t('leads.followUpDate')} *`}><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        {req === 'reason' && (
          <Field label={`${t('leads.reason')} *`}>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">—</option>
              {(reasons.data ?? []).map((r) => <option key={r.key} value={r.key}>{lang === 'en' ? r.name_en ?? r.name_ar : r.name_ar}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('leads.noteOptional')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}

export function ConvertLeadDrawer({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateLeads();
  const qc = useQueryClient();
  const [type, setType] = useState<'individual' | 'company'>('individual');
  const [nid, setNid] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  useEffect(() => { setType(lead?.company_name ? 'company' : 'individual'); setNid(''); setDuplicateId(null); }, [lead]);
  const nidOk = !nid || validateEgyptianNationalId(nid).valid;
  const convert = useMutation({
    mutationFn: async (mergeInto?: string) => {
      const { data, error } = await supabase.rpc('convert_lead_to_customer', {
        p_lead_id: lead!.id, p_customer_type: type, p_national_id: nid || undefined, p_merge_into: mergeInto,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (customerId) => {
      toast.success(t('leads.converted'));
      invalidate();
      void qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
      void navigate({ to: '/customers/$id', params: { id: customerId } });
    },
    onError: (e) => {
      const m = /duplicate customer:([0-9a-f-]{36})/.exec((e as { message?: string }).message ?? '');
      if (m) setDuplicateId(m[1]!);
      else toast.error(t(errorKey(e)));
    },
  });
  return (
    <Drawer open={!!lead} onOpenChange={(v) => !v && onClose()} title={t('leads.convertTitle', { name: lead?.full_name ?? '' })}
      footer={duplicateId
        ? <><Button variant="primary" loading={convert.isPending} onClick={() => convert.mutate(duplicateId)}><Repeat className="size-4" /> {t('leads.mergeInto')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>
        : <><Button variant="primary" disabled={!nidOk} loading={convert.isPending} onClick={() => convert.mutate(undefined)}><Repeat className="size-4" /> {t('leads.convert')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-navy">{t('leads.convertBody')}</p>
        {duplicateId ? (
          <div className="space-y-2 rounded-xl border border-[#f3e1b5] bg-[#fdf3dc] p-3 text-sm text-[#7a5200]">
            <p>{t('leads.duplicateFound')}</p>
            <Link to="/customers/$id" params={{ id: duplicateId }} className="font-semibold text-brand" onClick={onClose}>{t('leads.openCustomer')}</Link>
          </div>
        ) : (
          <>
            <div className="flex rounded-xl bg-muted p-1">
              {(['individual', 'company'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setType(k)} className={cn('flex-1 rounded-lg py-2 text-sm font-semibold', type === k ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>{t(`customers.types.${k}`)}</button>
              ))}
            </div>
            <Field label={`${t('customers.nationalId')} (${t('common.optional')})`} error={!nidOk ? t('crm.invalidNationalId') : undefined}>
              <Input dir="ltr" inputMode="numeric" maxLength={14} value={nid} onChange={(e) => setNid(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </>
        )}
      </div>
    </Drawer>
  );
}

export function StageBadge({ stage }: { stage: Stage | undefined }) {
  const lang = useLang();
  if (!stage) return null;
  return <Badge tone="gray" dot={false} className="gap-1.5"><span className="size-2 rounded-full" style={{ background: stage.color }} />{lang === 'en' ? stage.name_en ?? stage.name_ar : stage.name_ar}</Badge>;
}
