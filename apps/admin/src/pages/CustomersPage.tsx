import { isFourPartName, normalizeEgyptianMobile, validateEgyptianNationalId } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Building2, ChevronLeft, Plus, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PhoneActions } from '@/components/crm';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { displayPhone, labelOf, useEmployeeOptions, useLang, useLookups } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn, errorKey } from '@/lib/utils';

export interface CustomerRow {
  id: string; customer_no: string | null; customer_type: 'individual' | 'company'; full_name: string; company_name: string | null;
  national_id: string | null; commercial_register_no: string | null; tax_no: string | null; phone: string; alt_phone: string | null;
  email: string | null; address: string | null; city: string | null; birth_date: string | null; owner_employee_id: string | null;
  source: string | null; status: 'self_registered' | 'pending_link' | 'active' | 'inactive'; app_access: 'none' | 'active' | 'suspended';
  converted_from_lead_id: string | null; created_at: string;
  owner?: { profile: { full_name: string } | null } | null;
}
export const CUSTOMER_SELECT = '*, owner:employees!customers_owner_employee_id_fkey(profile:profiles(full_name))';

type Tab = 'active' | 'self_registered' | 'inactive';
const tabStatuses: Record<Tab, CustomerRow['status'][]> = { active: ['active'], self_registered: ['self_registered', 'pending_link'], inactive: ['inactive'] };

export function CustomersPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const sources = useLookups('lead_source');
  const employees = useEmployeeOptions();
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [owner, setOwner] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['customers', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select(CUSTOMER_SELECT).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as CustomerRow[];
    },
  });

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, self_registered: 0, inactive: 0 };
    for (const r of list.data ?? []) for (const k of Object.keys(tabStatuses) as Tab[]) if (tabStatuses[k].includes(r.status)) c[k]++;
    return c;
  }, [list.data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, '').replace(/^0+/, '');
    return (list.data ?? []).filter((r) =>
      tabStatuses[tab].includes(r.status) && (!type || r.customer_type === type) && (!owner || r.owner_employee_id === owner) &&
      (!term || [r.full_name, r.company_name, r.customer_no, r.email, r.national_id].some((v) => v?.toLowerCase().includes(term)) || (digits.length >= 4 && r.phone.includes(digits))),
    );
  }, [list.data, tab, q, type, owner]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('customers.title')} actions={can('customers', 'create') && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> {t('customers.new')}</Button>} />
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {(Object.keys(tabStatuses) as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-2')}>
            {t(`customers.tabs.${k}`)} <span className="rounded-md bg-muted px-1.5 text-[11px] text-ink-2">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
          <Input className="h-10 ps-9" placeholder={t('search.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-10 w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('customers.type')}>
          <option value="">{t('customers.type')}: {t('common.all')}</option>
          <option value="individual">{t('customers.types.individual')}</option>
          <option value="company">{t('customers.types.company')}</option>
        </Select>
        <Select className="h-10 w-auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={t('crm.owner')}>
          <option value="">{t('crm.owner')}: {t('common.all')}</option>
          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </div>

      {list.isLoading ? <div className="grid place-items-center py-20"><Spinner /></div> : rows.length === 0 ? (
        <Card><EmptyState icon={<Users className="size-8" />} title={t('customers.empty')} /></Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-xs text-ink-2">
                  <th className="px-4 py-3 text-start font-semibold">{t('customers.fullName')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('customers.type')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('crm.phone')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">{t('crm.source')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('crm.owner')}</th>
                  <th className="hidden px-4 py-3 text-start font-semibold xl:table-cell">{t('customers.appAccess')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-[#f9fbfe]" onClick={() => void navigate({ to: '/customers/$id', params: { id: r.id } })}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.full_name} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold">{r.customer_type === 'company' && r.company_name ? r.company_name : r.full_name}</div>
                          <div className="text-xs text-ink-3"><span className="ltr">{r.customer_no}</span>{r.customer_type === 'company' && r.company_name ? ` · ${r.full_name}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={r.customer_type === 'company' ? 'navy' : 'gray'} dot={false}>{t(`customers.types.${r.customer_type}`)}</Badge></td>
                    <td className="px-4 py-3"><span className="ltr text-ink-2">{displayPhone(r.phone)}</span></td>
                    <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{labelOf(sources.data, r.source, lang)}</td>
                    <td className="px-4 py-3">{r.owner?.profile?.full_name ?? <span className="text-ink-3">{t('crm.unassigned')}</span>}</td>
                    <td className="hidden px-4 py-3 xl:table-cell"><Badge tone={r.app_access === 'active' ? 'green' : r.app_access === 'suspended' ? 'red' : 'gray'}>{t(`customers.appAccessStates.${r.app_access}`)}</Badge></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><PhoneActions phone={r.phone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Link key={r.id} to="/customers/$id" params={{ id: r.id }} className="block">
                <Card className="flex items-center gap-3 p-3">
                  <Avatar name={r.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.customer_type === 'company' && r.company_name ? r.company_name : r.full_name}</div>
                    <div className="truncate text-xs text-ink-2"><span className="ltr">{displayPhone(r.phone)}</span> · {r.owner?.profile?.full_name ?? t('crm.unassigned')}</div>
                    <div className="mt-1 flex gap-1.5">
                      <Badge tone={r.customer_type === 'company' ? 'navy' : 'gray'} dot={false}>{t(`customers.types.${r.customer_type}`)}</Badge>
                      {r.customer_type === 'company' && <Building2 className="size-4 text-ink-3" />}
                    </div>
                  </div>
                  <ChevronLeft className="size-5 text-ink-3 ltr:rotate-180" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      <CustomerFormDrawer open={creating} onOpenChange={setCreating} onSaved={(id) => void navigate({ to: '/customers/$id', params: { id } })} />
    </div>
  );
}

export function CustomerFormDrawer({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; customer?: CustomerRow | null; onSaved?: (id: string) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { can, staff } = useAuth();
  const sources = useLookups('lead_source');
  const employees = useEmployeeOptions();
  const empty = { customer_type: 'individual' as CustomerRow['customer_type'], full_name: '', company_name: '', national_id: '', commercial_register_no: '', tax_no: '', phone: '', alt_phone: '', email: '', city: '', address: '', birth_date: '', source: '', owner_employee_id: '' };
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(customer ? {
      customer_type: customer.customer_type, full_name: customer.full_name, company_name: customer.company_name ?? '', national_id: customer.national_id ?? '',
      commercial_register_no: customer.commercial_register_no ?? '', tax_no: customer.tax_no ?? '', phone: customer.phone.replace(/^\+20/, '0'),
      alt_phone: customer.alt_phone?.replace(/^\+20/, '0') ?? '', email: customer.email ?? '', city: customer.city ?? '', address: customer.address ?? '',
      birth_date: customer.birth_date ?? '', source: customer.source ?? '', owner_employee_id: customer.owner_employee_id ?? '',
    } : { ...empty, owner_employee_id: staff?.employee_id ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer]);

  const phone = normalizeEgyptianMobile(form.phone);
  const altPhone = form.alt_phone ? normalizeEgyptianMobile(form.alt_phone) : null;
  const nid = form.national_id ? validateEgyptianNationalId(form.national_id) : { valid: true };
  const errors = {
    full_name: form.full_name.trim().length < 3 ? t('common.required') : '',
    company_name: form.customer_type === 'company' && form.company_name.trim().length < 2 ? t('common.required') : '',
    phone: !phone ? t('crm.invalidPhone') : '',
    alt_phone: form.alt_phone && !altPhone ? t('crm.invalidPhone') : '',
    national_id: !nid.valid ? t('crm.invalidNationalId') : '',
  };
  const valid = Object.values(errors).every((e) => !e);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        customer_type: form.customer_type, full_name: form.full_name.trim(), company_name: form.customer_type === 'company' ? form.company_name.trim() : null,
        national_id: form.national_id || null, commercial_register_no: form.commercial_register_no || null, tax_no: form.tax_no || null,
        phone: phone!, alt_phone: altPhone, email: form.email || null, city: form.city || null, address: form.address || null,
        birth_date: form.birth_date || null, source: form.source || null,
      };
      if (customer) {
        const upd = can('customers', 'assign') ? { ...payload, owner_employee_id: form.owner_employee_id || null } : payload;
        const { error } = await supabase.from('customers').update(upd).eq('id', customer.id);
        if (error) throw error;
        return customer.id;
      }
      const { data, error } = await supabase.from('customers')
        .insert({ ...payload, owner_employee_id: can('customers', 'assign') ? form.owner_employee_id || null : null })
        .select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['timeline'] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e) => {
      const k = errorKey(e);
      toast.error(k === 'errors.duplicate' ? t('crm.duplicatePhone') : t(k));
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const err = (k: keyof typeof errors) => (touched ? errors[k] || undefined : undefined);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={customer ? t('customers.edit') : t('customers.new')}
      footer={<><Button variant="primary" loading={save.isPending} onClick={() => { setTouched(true); if (valid) save.mutate(); }}>{t('common.save')}</Button><Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button></>}
    >
      <div className="space-y-4">
        <div className="flex rounded-xl bg-muted p-1">
          {(['individual', 'company'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setForm({ ...form, customer_type: k })} className={cn('flex-1 rounded-lg py-2 text-sm font-semibold', form.customer_type === k ? 'bg-white text-navy shadow-sm' : 'text-ink-3')}>
              {t(`customers.types.${k}`)}
            </button>
          ))}
        </div>
        {form.customer_type === 'company' && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={`${t('customers.companyName')} *`} error={err('company_name')} className="md:col-span-3"><Input value={form.company_name} onChange={set('company_name')} /></Field>
            <Field label={t('customers.commercialRegister')}><Input dir="ltr" value={form.commercial_register_no} onChange={set('commercial_register_no')} /></Field>
            <Field label={t('customers.taxNo')}><Input dir="ltr" value={form.tax_no} onChange={set('tax_no')} /></Field>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={`${form.customer_type === 'company' ? t('customers.contactName') : t('customers.fullName')} *`} error={err('full_name')} hint={form.customer_type === 'individual' && form.full_name.trim() && !isFourPartName(form.full_name) ? t('customers.fourPartHint') : undefined} className="md:col-span-2">
            <Input value={form.full_name} onChange={set('full_name')} />
          </Field>
          <Field label={`${t('crm.phone')} *`} error={err('phone')}><Input dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={form.phone} onChange={set('phone')} /></Field>
          <Field label={t('crm.altPhone')} error={err('alt_phone')}><Input dir="ltr" inputMode="tel" value={form.alt_phone} onChange={set('alt_phone')} /></Field>
          <Field label={t('customers.nationalId')} error={err('national_id')}><Input dir="ltr" inputMode="numeric" maxLength={14} value={form.national_id} onChange={set('national_id')} /></Field>
          <Field label={t('crm.email')}><Input dir="ltr" type="email" value={form.email} onChange={set('email')} /></Field>
          {form.customer_type === 'individual' && <Field label={t('customers.birthDate')}><Input type="date" value={form.birth_date} onChange={set('birth_date')} /></Field>}
          <Field label={t('crm.city')}><Input value={form.city} onChange={set('city')} /></Field>
          <Field label={t('crm.address')} className="md:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
          <Field label={t('crm.source')}>
            <Select value={form.source} onChange={set('source')}>
              <option value="">—</option>
              {(sources.data ?? []).map((s) => <option key={s.key} value={s.key}>{lang === 'en' ? s.name_en ?? s.name_ar : s.name_ar}</option>)}
            </Select>
          </Field>
          <Field label={t('crm.owner')}>
            <Select value={form.owner_employee_id} disabled={!can('customers', 'assign')} onChange={set('owner_employee_id')}>
              {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              {staff && !employees.data?.some((e) => e.id === staff.employee_id) && <option value={staff.employee_id}>{staff.full_name}</option>}
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
