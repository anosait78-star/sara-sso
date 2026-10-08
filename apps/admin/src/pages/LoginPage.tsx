import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input } from '@/components/ui';
import { setLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session && !loading) void navigate({ to: '/' });
  }, [session, loading, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setLoading(false);
      setError(t('errors.invalidCredentials'));
      return;
    }
    // Only active staff may use the admin system.
    const { data } = await supabase.rpc('get_my_staff_context');
    if (!data || data.length === 0) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(t('errors.notStaff'));
      return;
    }
    await refresh();
    setLoading(false);
    void navigate({ to: '/' });
  }

  return (
    <div className="flex min-h-full bg-white">
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <form onSubmit={onSubmit} className="w-full max-w-[400px] space-y-5">
          <img src="/logo.png" alt="SSO · Sara Soliman" className="h-20 w-auto" />
          <div>
            <h1 className="text-2xl font-bold text-navy">{t('auth.loginTitle')}</h1>
            <p className="mt-1 text-sm text-ink-2">{t('auth.loginSubtitle')}</p>
          </div>
          <Field label={t('auth.email')}>
            <Input type="email" autoComplete="username" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')}>
            <div className="relative">
              <Input type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} className="pe-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 end-0 grid w-10 place-items-center text-ink-3" aria-label="toggle password">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          {error && <div className="rounded-lg bg-[#fce8e8] px-3 py-2 text-sm text-danger" role="alert">{error}</div>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {t('auth.login')} <ArrowLeft className="size-4 ltr:rotate-180" />
          </Button>
          <p className="text-xs text-ink-3">{t('auth.forgot')}</p>
          <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-ink-2">
            <ShieldCheck className="size-4 shrink-0" /> {t('auth.inviteOnly')}
          </div>
          <button type="button" onClick={() => setLocale(i18n.language === 'ar' ? 'en' : 'ar')} className="text-xs font-semibold text-brand">
            {t('topbar.language')}
          </button>
        </form>
      </div>
      <div className="relative hidden w-[44%] max-w-[620px] flex-col justify-end overflow-hidden bg-navy p-12 text-white lg:flex">
        <div className="absolute -start-32 -top-32 size-[420px] rounded-full border-[60px] border-navy-700" />
        <img src="/logo-white.png" alt="" className="relative mb-auto mt-10 w-72 opacity-95" />
        <p className="relative text-3xl font-bold leading-snug">
          {t('auth.tagline1')}
          <br />
          <span className="text-sky">{t('auth.tagline2')}</span>
        </p>
        <p className="relative mt-3 text-sm text-[#b9c8e2]">{t('auth.lines')}</p>
      </div>
    </div>
  );
}
