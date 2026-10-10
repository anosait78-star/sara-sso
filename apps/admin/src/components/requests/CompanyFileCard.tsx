import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Landmark, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { companyName, COMPANY_STATUS_TONE, useCompanyFile, useCustomerCompanies } from '@/lib/companies';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

/** Request page → company module panel (module_key = company_formation, or any request linked to a company). */
export function CompanyFileCard({ requestId, customerId, companyFileId, open }: { requestId: string; customerId: string; companyFileId: string | null; open: boolean }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const file = useCompanyFile(companyFileId);
  const companies = useCustomerCompanies(companyFileId ? null : customerId);
  const [pick, setPick] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['company_files'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
  };
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_company_file_from_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t('companies.opened')); refresh(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });
  const link = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('link_request_company_file', { p_request_id: requestId, p_company_file_id: pick });
      if (error) throw error;
    },
    onSuccess: () => { setPick(''); refresh(); },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  const f = file.data;
  return (
    <Card>
      <CardHeader title={t('companies.fileCard')} icon={<Landmark className="size-4 text-brand" />} />
      {f ? (
        <div className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Link to="/company-formation/$id" params={{ id: f.id }} className="flex-1 font-bold text-brand">{companyName(f)}</Link>
            <Badge tone={COMPANY_STATUS_TONE[f.status]}>{t(`companies.statuses.${f.status}`)}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-3">{t('companies.fileNo')}</dt><dd className="ltr text-start font-latin">{f.file_no}</dd>
            <dt className="text-ink-3">{t('companies.capital')}</dt><dd className="ltr text-start">{f.capital != null ? `${Number(f.capital).toLocaleString('en')} EGP` : '—'}</dd>
            <dt className="text-ink-3">{t('companies.commercialRegister')}</dt><dd className="ltr text-start">{f.commercial_register_no ?? '—'}</dd>
            <dt className="text-ink-3">{t('companies.taxCard')}</dt><dd className="ltr text-start">{f.tax_card_no ?? '—'}</dd>
          </dl>
          <p className="text-[11px] text-ink-3">{t('companies.mappedHint')}</p>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <p className="text-xs text-ink-3">{t('companies.notLinked')}</p>
          {open && can('company_formation', 'create') && (
            <Button size="sm" variant="primary" loading={create.isPending} onClick={() => create.mutate()}><Plus className="size-4" /> {t('companies.openFromRequest')}</Button>
          )}
          {open && (companies.data ?? []).length > 0 && (
            <div className="flex gap-2">
              <Select className="h-9 flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('companies.linkExisting')}>
                <option value="">{t('companies.linkExisting')}</option>
                {companies.data!.map((c) => <option key={c.id} value={c.id}>{companyName(c)} · {c.file_no}</option>)}
              </Select>
              <Button size="sm" disabled={!pick} loading={link.isPending} onClick={() => link.mutate()}><Link2 className="size-4" /></Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Customer 360 → the customer's companies. */
export function CustomerCompaniesCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const q = useCustomerCompanies(customerId);
  if (!q.data?.length) return null;
  return (
    <Card>
      <CardHeader title={t('companies.title')} icon={<Landmark className="size-4 text-brand" />} />
      <ul className="divide-y divide-line">
        {q.data.map((c) => (
          <li key={c.id}>
            <Link to="/company-formation/$id" params={{ id: c.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f9fbfe]">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{companyName(c)}</span>
              <Badge tone={COMPANY_STATUS_TONE[c.status]}>{t(`companies.statuses.${c.status}`)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
