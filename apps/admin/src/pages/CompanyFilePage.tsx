import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight, ClipboardList, Crown, Landmark, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Switch, Textarea } from '@/components/ui';
import { Modal } from '@/components/workflow/WorkflowDialogs';
import { useAuth } from '@/lib/auth';
import { companyName, COMPANY_STATUS_TONE, COMPANY_STATUSES, useCompanyFile, type CompanyFile, type CompanyStatus, type Partner } from '@/lib/companies';
import { fmtDate, useLang, useLookups } from '@/lib/crm';
import { REQUEST_SELECT, REQUEST_STATUS_TONE, type RequestRow } from '@/lib/requests';
import { nameOf } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { NewRequestDrawer } from './RequestsPage';

type Form = Record<'approved_name' | 'proposed' | 'legal_form' | 'capital' | 'activity' | 'address' | 'city' | 'commercial_register_no' | 'tax_card_no' | 'social_insurance_no' | 'chamber_no' | 'established_on' | 'notes', string> & { status: CompanyStatus };
const toForm = (f: CompanyFile): Form => ({
  approved_name: f.approved_name ?? '', proposed: f.proposed_names.join('\n'), legal_form: f.legal_form ?? '', capital: f.capital != null ? String(f.capital) : '',
  activity: f.activity ?? '', address: f.address ?? '', city: f.city ?? '', commercial_register_no: f.commercial_register_no ?? '', tax_card_no: f.tax_card_no ?? '',
  social_insurance_no: f.social_insurance_no ?? '', chamber_no: f.chamber_no ?? '', established_on: f.established_on ?? '', notes: f.notes ?? '', status: f.status,
});

/** Company file: company data, registry numbers, partners and the government procedures linked to it. */
export function CompanyFilePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const qc = useQueryClient();
  const forms = useLookups('legal_form');
  const q = useCompanyFile(id);
  const [f, setF] = useState<Form | null>(null);
  const [newRequest, setNewRequest] = useState(false);
  const file = q.data;
  useEffect(() => { if (file) setF(toForm(file)); }, [file]);

  const requests = useQuery({
    queryKey: ['requests', 'company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_requests').select(REQUEST_SELECT).eq('company_file_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });

  const canEdit = can('company_formation', 'edit');
  const dirty = !!file && !!f && JSON.stringify(f) !== JSON.stringify(toForm(file));
  const save = useMutation({
    mutationFn: async () => {
      const x = f!;
      const { error } = await supabase.from('company_files').update({
        approved_name: x.approved_name.trim() || null, proposed_names: x.proposed.split(/\n|،|,/).map((s) => s.trim()).filter(Boolean),
        legal_form: x.legal_form || null, capital: x.capital === '' ? null : Number(x.capital), activity: x.activity.trim() || null,
        address: x.address.trim() || null, city: x.city.trim() || null, commercial_register_no: x.commercial_register_no.trim() || null,
        tax_card_no: x.tax_card_no.trim() || null, social_insurance_no: x.social_insurance_no.trim() || null, chamber_no: x.chamber_no.trim() || null,
        established_on: x.established_on || null, notes: x.notes.trim() || null, status: x.status,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['company_files'] }); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (q.isLoading || (file && !f)) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!file || !f) return <Card className="mx-auto max-w-md"><EmptyState title={t('forbidden.body')} /></Card>;
  const set = (p: Partial<Form>) => setF((o) => ({ ...o!, ...p }));
  const input = (k: keyof Form, label: string, ltr?: boolean, type = 'text') => (
    <Field label={label}>
      <Input type={type} dir={ltr ? 'ltr' : undefined} value={f[k]} disabled={!canEdit} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16 md:pb-0">
      <Link to="/company-formation" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2"><ChevronRight className="size-4 ltr:rotate-180" />{t('companies.title')}</Link>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand"><Landmark className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-navy">{companyName(file)}</h1>
            <Badge tone={COMPANY_STATUS_TONE[file.status]}>{t(`companies.statuses.${file.status}`)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-2">
            <span className="ltr font-latin">{file.file_no}</span>
            {file.customer && <Link to="/customers/$id" params={{ id: file.customer.id }} className="font-semibold text-brand">{file.customer.full_name}</Link>}
            {file.established_on && <span>{t('companies.establishedOn', { date: fmtDate(file.established_on, lang, false) })}</span>}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('companies.data')} icon={<Pencil className="size-4 text-brand" />} />
            <div className="grid gap-4 p-4 md:grid-cols-2">
              {input('approved_name', t('companies.approvedName'))}
              <Field label={t('companies.legalForm')}>
                <Select value={f.legal_form} disabled={!canEdit} onChange={(e) => set({ legal_form: e.target.value })}>
                  <option value="">{t('workflow.pick')}</option>
                  {(forms.data ?? []).map((x) => <option key={x.key} value={x.key}>{lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar}</option>)}
                </Select>
              </Field>
              <Field label={t('companies.proposedNames')} hint={t('companies.proposedHint')} className="md:col-span-2">
                <Textarea value={f.proposed} disabled={!canEdit} onChange={(e) => set({ proposed: e.target.value })} />
              </Field>
              {input('capital', t('companies.capital'), true, 'number')}
              {input('activity', t('companies.activity'))}
              {input('address', t('crm.address'))}
              {input('city', t('crm.city'))}
              <Field label={t('requests.status')}>
                <Select value={f.status} disabled={!canEdit} onChange={(e) => set({ status: e.target.value as CompanyStatus })}>
                  {COMPANY_STATUSES.map((s) => <option key={s} value={s}>{t(`companies.statuses.${s}`)}</option>)}
                </Select>
              </Field>
              {input('established_on', t('companies.established'), true, 'date')}
            </div>
            <div className="border-t border-line px-4 pb-1 pt-3 text-xs font-bold text-ink-2">{t('companies.registry')}</div>
            <div className="grid gap-4 p-4 pt-2 md:grid-cols-2">
              {input('commercial_register_no', t('companies.commercialRegister'), true)}
              {input('tax_card_no', t('companies.taxCard'), true)}
              {input('social_insurance_no', t('companies.socialInsurance'), true)}
              {input('chamber_no', t('companies.chamber'), true)}
              <Field label={t('requests.notes')} className="md:col-span-2">
                <Textarea value={f.notes} disabled={!canEdit} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
            {canEdit && (
              <div className="fixed inset-x-0 bottom-[68px] z-20 flex gap-2 border-t border-line bg-white px-4 py-3 md:static md:px-4 md:pb-4">
                <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>{t('common.save')}</Button>
                {dirty && <Button onClick={() => setF(toForm(file))}>{t('common.cancel')}</Button>}
              </div>
            )}
            <p className="px-4 pb-4 text-xs text-ink-3">{t('companies.mappedHint')}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <PartnersCard fileId={file.id} editable={canEdit} />
          <Card>
            <CardHeader title={t('companies.procedures')} icon={<ClipboardList className="size-4 text-brand" />}
              actions={can('service_requests', 'create') && file.customer && (
                <Button size="sm" variant="primary" onClick={() => setNewRequest(true)}><Plus className="size-4" /> {t('companies.newProcedure')}</Button>
              )} />
            {(requests.data ?? []).length === 0 ? <EmptyState title={t('companies.noProcedures')} /> : (
              <ul className="divide-y divide-line">
                {requests.data!.map((r) => (
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
          </Card>
        </div>
      </div>
      {file.customer && (
        <NewRequestDrawer open={newRequest} onOpenChange={(v) => { setNewRequest(v); if (!v) void qc.invalidateQueries({ queryKey: ['requests', 'company', id] }); }}
          customer={{ id: file.customer.id, title: file.customer.full_name }} link={{ kind: 'company', id: file.id }} />
      )}
    </div>
  );
}

function PartnersCard({ fileId, editable }: { fileId: string; editable: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  const q = useQuery({
    queryKey: ['company_partners', fileId],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_partners').select('*').eq('company_file_id', fileId).order('sort_order').order('created_at');
      if (error) throw error;
      return data as unknown as Partner[];
    },
  });
  const total = (q.data ?? []).reduce((s, p) => s + Number(p.share_percent), 0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['company_partners', fileId] });
  const remove = useMutation({
    mutationFn: async (pid: string) => {
      const { error } = await supabase.from('company_partners').delete().eq('id', pid);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Card>
      <CardHeader title={t('companies.partners')} icon={<Users className="size-4 text-brand" />}
        actions={editable && <Button size="sm" onClick={() => setEdit({ nationality: 'مصري', share_percent: Math.max(0, 100 - total), is_manager: false })}><Plus className="size-4" /> {t('companies.addPartner')}</Button>} />
      <div className="px-4 pt-3">
        <div className="mb-1 flex justify-between text-xs text-ink-2"><span>{t('companies.sharesTotal')}</span><span className={cn('font-latin font-bold', total === 100 ? 'text-success' : 'text-warning')}>{total}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', total === 100 ? 'bg-success' : 'bg-warning')} style={{ width: `${Math.min(100, total)}%` }} /></div>
      </div>
      {(q.data ?? []).length === 0 ? <EmptyState title={t('companies.noPartners')} /> : (
        <ul className="divide-y divide-line">
          {q.data!.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold">{p.full_name}{p.is_manager && <Crown className="size-4 text-warning" aria-label={t('companies.manager')} />}</div>
                <div className="ltr text-start text-xs text-ink-3">{p.national_id ?? '—'} · {p.nationality}</div>
              </div>
              <span className="font-latin text-sm font-bold text-navy">{Number(p.share_percent)}%</span>
              {editable && (
                <>
                  <button type="button" className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" onClick={() => setEdit(p)} aria-label={t('common.edit')}><Pencil className="size-4" /></button>
                  <button type="button" className="rounded-lg p-1.5 text-danger hover:bg-[#fff5f5]" onClick={() => remove.mutate(p.id)} aria-label={t('common.delete')}><Trash2 className="size-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <PartnerDialog fileId={fileId} partner={edit} onClose={() => setEdit(null)} onDone={refresh} />
    </Card>
  );
}

function PartnerDialog({ fileId, partner, onClose, onDone }: { fileId: string; partner: Partial<Partner> | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [p, setP] = useState<Partial<Partner>>({});
  useEffect(() => { if (partner) setP(partner); }, [partner]);
  const nidOk = !p.national_id || /^[23]\d{13}$/.test(p.national_id);
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: (p.full_name ?? '').trim(), national_id: p.national_id || null, nationality: p.nationality || 'مصري',
        share_percent: Number(p.share_percent) || 0, is_manager: !!p.is_manager,
      };
      const { error } = p.id
        ? await supabase.from('company_partners').update(payload).eq('id', p.id)
        : await supabase.from('company_partners').insert({ ...payload, company_file_id: fileId });
      if (error) throw error;
    },
    onSuccess: () => { onClose(); onDone(); },
    onError: (e) => toast.error(/exceed 100/.test((e as Error).message) ? t('companies.sharesExceeded') : t(errorKey(e))),
  });
  return (
    <Modal open={!!partner} onOpenChange={(v) => !v && onClose()} title={p.id ? t('common.edit') : t('companies.addPartner')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={(p.full_name ?? '').trim().length < 2 || !nidOk} onClick={() => save.mutate()}>{t('common.save')}</Button><Button onClick={onClose}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('companies.partnerName')} *`}><Input value={p.full_name ?? ''} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('customers.nationalId')} error={!nidOk ? t('crm.invalidNationalId') : undefined}>
            <Input dir="ltr" value={p.national_id ?? ''} onChange={(e) => setP({ ...p, national_id: e.target.value.replace(/\D/g, '').slice(0, 14) })} />
          </Field>
          <Field label={t('companies.share')}>
            <Input type="number" min={0} max={100} dir="ltr" value={p.share_percent ?? 0} onChange={(e) => setP({ ...p, share_percent: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label={t('companies.nationality')}><Input value={p.nationality ?? ''} onChange={(e) => setP({ ...p, nationality: e.target.value })} /></Field>
        <label className="flex items-center gap-3 text-sm"><span className="flex-1">{t('companies.manager')}</span><Switch checked={!!p.is_manager} onChange={(v) => setP({ ...p, is_manager: v })} /></label>
      </div>
    </Modal>
  );
}
