import { isAcceptablePassword } from '@sso/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Forced after a temporary password, and available from the account screen. */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, refresh } = useAuth();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!isAcceptablePassword(pw)) return setError(t('errors.weakPassword'));
    if (pw !== confirm) return setError(t('errors.passwordsMismatch'));
    setBusy(true);
    const { error: e1 } = await supabase.auth.updateUser({ password: pw });
    if (e1) {
      setBusy(false);
      return setError(t('errors.generic'));
    }
    await supabase.rpc('clear_must_change_password');
    await supabase.auth.refreshSession();
    await refresh();
    setBusy(false);
    setDone(true);
    if (!status?.must_change_password) router.back();
  };

  return (
    <Screen>
      {status?.must_change_password && <Notice tone="amber" icon="key-outline" text={t('auth.changePasswordForced')} />}
      {error && <Notice tone="red" icon="alert-circle-outline" text={error} />}
      {done && <Notice tone="green" icon="checkmark-circle-outline" text={t('auth.changed')} />}
      <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
        <Input testID="new_password" value={pw} onChangeText={setPw} secureTextEntry ltr />
      </Field>
      <Field label={t('auth.confirmPassword')}>
        <Input testID="confirm_password" value={confirm} onChangeText={setConfirm} secureTextEntry ltr />
      </Field>
      <Button testID="save_password" title={t('common.save')} loading={busy} disabled={!pw || !confirm} onPress={submit} />
    </Screen>
  );
}
