import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Landmark, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { companyName, COMPANY_SELECT, COMPANY_STATUS_TONE, COMPANY_STATUSES, type CompanyFile, type CompanyStatus } from '@/lib/companies';
import { labelOf, useLang, useLookups } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';
import { CustomerPicker, type CustomerPick } from './RequestsPage';

/** Company files: each company formed or served by the office, with its government procedures over time. */
export function CompanyFilesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const forms = useLookups('legal_form');
  const [tab, setTab] = useState<CompanyStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['company_files', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_files').select(COMPANY_SELECT).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as CompanyFile[];
    },
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.data?.length ?? 0 };
    for (const f of list.data ?? []) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [list.data]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((f) => (tab === 'all' || f.status === tab) && (!term || [
      f.file_no, f.approved_name, ...f.proposed_names, f.commercial_register_no, f.tax_card_no, f.customer?.full_name, f.customer?.company_name,
    ].some((v) => v?.toLowerCase().includes(term))));
  }, [list.data, tab, q]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('companies.title')} actions={can('company_formation', 'create') && (
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('companies.new')}</Button>
      )} />
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(['all', ...COMPANY_STATUSES] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {k === 'all' ? t('common.all') : t(`companies.statuses.${k}`)}
            <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
        <Input className="h-10 ps-9" placeholder={t('companies.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
        <Card><EmptyState icon={<Landmark className="size-8" />} title={t('companies.empty')} /></Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('companies.name')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.customer')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('companies.legalForm')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('companies.commercialRegister')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('requests.status')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('crm.owner')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/company-formation/$id', params: { id: f.id } })}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{companyName(f)}</div>
                      <div className="ltr text-start font-latin text-xs text-ink-3">{f.file_no}</div>
                    </td>
                    <td className="px-4 py-3">{f.customer?.full_name}</td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{labelOf(forms.data, f.legal_form, lang)}</td>
                    <td className="hidden px-4 py-3 xl:table-cell"><span className="ltr">{f.commercial_register_no ?? '—'}</span></td>
                    <td className="px-4 py-3"><Badge tone={COMPANY_STATUS_TONE[f.status]}>{t(`companies.statuses.${f.status}`)}</Badge></td>
                    <td className="hidden px-4 py-3 lg:table-cell">{f.owner?.profile?.full_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((f) => (
              <Link key={f.id} to="/company-formation/$id" params={{ id: f.id }} className="block">
                <Card className="flex items-center gap-3 p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand"><Landmark className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{companyName(f)}</div>
                    <div className="truncate text-xs text-ink-2">{f.customer?.full_name} · <span className="ltr font-latin">{f.file_no}</span></div>
                    <div className="mt-1"><Badge tone={COMPANY_STATUS_TONE[f.status]}>{t(`companies.statuses.${f.status}`)}</Badge></div>
                  </div>
                  <ChevronLeft className="size-5 text-ink-3 ltr:rotate-180" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      <NewCompanyDrawer open={creating} onOpenChange={setCreating} />
    </div>
  );
}

export function NewCompanyDrawer({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer?: CustomerPick }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const forms = useLookups('legal_form');
  const [pick, setPick] = useState<CustomerPick | null>(customer ?? null);
  const [f, setF] = useState({ names: '', legal_form: 'llc', capital: '', activity: '' });
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('company_files').insert({
        customer_id: pick!.id, proposed_names: f.names.split(/\n|،|,/).map((x) => x.trim()).filter(Boolean), legal_form: f.legal_form || null,
        capital: f.capital ? Number(f.capital) : null, activity: f.activity.trim() || null,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['company_files'] });
      onOpenChange(false);
      void navigate({ to: '/company-formation/$id', params: { id } });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  return (
    <Drawer open={open} onOpenChange={(v) => { if (v) { setPick(customer ?? null); setF({ names: '', legal_form: 'llc', capital: '', activity: '' }); } onOpenChange(v); }}
      title={t('companies.new')}
      footer={<><Button variant="primary" loading={save.isPending} disabled={!pick} onClick={() => save.mutate()}>{t('common.create')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}>
      <div className="space-y-4">
        <Field label={`${t('requests.customer')} *`}><CustomerPicker value={pick} onChange={setPick} /></Field>
        <Field label={t('companies.proposedNames')} hint={t('companies.proposedHint')}>
          <Textarea value={f.names} onChange={(e) => setF({ ...f, names: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('companies.legalForm')}>
            <Select value={f.legal_form} onChange={(e) => setF({ ...f, legal_form: e.target.value })}>
              <option value="">{t('workflow.pick')}</option>
              {(forms.data ?? []).map((x) => <option key={x.key} value={x.key}>{lang === 'en' ? x.name_en ?? x.name_ar : x.name_ar}</option>)}
            </Select>
          </Field>
          <Field label={t('companies.capital')}>
            <Input type="number" min={0} dir="ltr" value={f.capital} onChange={(e) => setF({ ...f, capital: e.target.value })} />
          </Field>
        </div>
        <Field label={t('companies.activity')}><Input value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} /></Field>
      </div>
    </Drawer>
  );
}
