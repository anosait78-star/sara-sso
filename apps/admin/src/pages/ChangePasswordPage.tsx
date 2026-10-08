import { isAcceptablePassword } from '@sso/shared';
import { useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, sessionLoading, staff, refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !session) void navigate({ to: '/login' });
  }, [session, sessionLoading, navigate]);

  if (sessionLoading) return <div className="grid h-full place-items-center"><Spinner className="size-8" /></div>;
  const forced = !!staff?.must_change_password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isAcceptablePassword(password)) return setError(t('errors.weakPassword'));
    if (password !== confirm) return setError(t('errors.passwordsMismatch'));
    setLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) {
      setLoading(false);
      return setError(/weak|password/i.test(updErr.message) ? t('errors.weakPassword') : t('errors.generic'));
    }
    await supabase.rpc('clear_must_change_password');
    await refresh();
    setLoading(false);
    toast.success(t('auth.passwordChanged'));
    void navigate({ to: '/' });
  }

  return (
    <div className="grid min-h-full place-items-center bg-canvas p-5">
      <form onSubmit={onSubmit} className="w-full max-w-[420px] space-y-4 rounded-2xl border border-line bg-white p-6">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand">
          <KeyRound className="size-6" />
        </span>
        <h1 className="text-xl font-bold text-navy">{t('auth.changePasswordTitle')}</h1>
        {forced && <p className="rounded-lg bg-[#fdf3dc] px-3 py-2 text-sm text-[#7a5200]">{t('auth.changePasswordForced')}</p>}
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label={t('auth.confirmPassword')}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <div className="rounded-lg bg-[#fce8e8] px-3 py-2 text-sm text-danger" role="alert">{error}</div>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={loading} className="flex-1">{t('common.save')}</Button>
          {!forced && <Button type="button" onClick={() => void navigate({ to: '/' })}>{t('common.cancel')}</Button>}
        </div>
      </form>
    </div>
  );
}
