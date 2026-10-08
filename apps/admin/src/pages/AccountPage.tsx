import { Link } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, PageHeader } from '@/components/ui';
import { setLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { staff } = useAuth();

  function changeLocale(l: 'ar' | 'en') {
    setLocale(l);
    // remember the preference on the profile as well (RLS allows editing own locale)
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void supabase.from('profiles').update({ locale: l }).eq('id', data.user.id);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={t('account.title')} />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={staff?.full_name ?? ''} size="lg" />
        <div className="min-w-0">
          <div className="text-lg font-bold text-navy">{staff?.full_name}</div>
          <div className="ltr text-sm text-ink-2">{staff?.email}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="blue" dot={false}>{i18n.language === 'en' ? staff?.role_name_en ?? staff?.role_name_ar : staff?.role_name_ar}</Badge>
            {staff?.department_name_ar && <Badge tone="gray" dot={false}>{staff.department_name_ar}</Badge>}
            {staff?.employee_no && <Badge tone="gray" dot={false}><span className="ltr">{staff.employee_no}</span></Badge>}
          </div>
        </div>
      </Card>
      <Card className="divide-y divide-line">
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm font-semibold">{t('account.language')}</span>
          <div className="flex rounded-lg bg-muted p-1 text-sm font-semibold">
            {(['ar', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => changeLocale(l)} className={`rounded-md px-3 py-1 ${i18n.language === l ? 'bg-white text-navy shadow-sm' : 'text-ink-3'}`}>
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm font-semibold">{t('account.changePassword')}</span>
          <Link to="/change-password"><Button size="sm"><KeyRound className="size-4" /> {t('account.changePassword')}</Button></Link>
        </div>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <div className="font-latin text-6xl font-bold text-brand-100">404</div>
      <h1 className="mt-2 text-lg font-bold text-navy">{t('notFound.title')}</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-semibold text-brand">{t('notFound.back')}</Link>
    </div>
  );
}
