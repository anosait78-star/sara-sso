import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Card, CardHeader, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { errorKey } from '@/lib/utils';

interface Company { name_ar: string; name_en: string; phone: string; whatsapp: string; email: string; address: string; currency: string }
const EMPTY: Company = { name_ar: '', name_en: '', phone: '', whatsapp: '', email: '', address: '', currency: 'EGP' };

export function SettingsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('settings', 'edit');
  const [form, setForm] = useState<Company>(EMPTY);

  const company = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'company').maybeSingle();
      if (error) throw error;
      return { ...EMPTY, ...((data?.value as Partial<Company> | undefined) ?? {}) };
    },
  });
  useEffect(() => {
    if (company.data) setForm(company.data);
  }, [company.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('app_settings').update({ value: { ...form } }).eq('key', 'company');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(t(errorKey(e))),
  });

  if (company.isLoading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('settings.title')} actions={editable && <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>} />
      <Card>
        <CardHeader icon={<Building2 className="size-4" />} title={t('settings.company')} />
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-24 w-48 place-items-center rounded-xl border border-dashed border-brand-200 bg-white p-2">
              <img src="/logo.png" alt="SSO" className="max-h-20" />
            </div>
            <p className="text-xs text-ink-2">{t('settings.logoNote')}</p>
          </div>
          <fieldset disabled={!editable} className="grid gap-4 md:grid-cols-2">
            <Field label={t('settings.nameAr')}><Input value={form.name_ar} onChange={set('name_ar')} /></Field>
            <Field label={t('settings.nameEn')}><Input dir="ltr" value={form.name_en} onChange={set('name_en')} /></Field>
            <Field label={t('settings.phone')}><Input dir="ltr" value={form.phone} onChange={set('phone')} /></Field>
            <Field label={t('settings.whatsapp')}><Input dir="ltr" value={form.whatsapp} onChange={set('whatsapp')} /></Field>
            <Field label={t('settings.email')}><Input dir="ltr" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label={t('settings.currency')}><Input dir="ltr" value={form.currency} onChange={set('currency')} /></Field>
            <Field label={t('settings.address')} className="md:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
          </fieldset>
        </div>
      </Card>
    </div>
  );
}
