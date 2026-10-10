import { isAcceptablePassword, isFourPartName, normalizeEgyptianMobile, validateEgyptianNationalId } from '@sso/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch } from 'react-native';
import { Button, colors, Field, Input, Notice, Row, Screen, T } from '@/components/ui';
import { authErrorKey, useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [f, setF] = useState({ full_name: '', national_id: '', phone: '', password: '', confirm: '' });
  const [terms, setTerms] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  const errors = {
    full_name: !isFourPartName(f.full_name) ? t('errors.invalidName') : null,
    national_id: !validateEgyptianNationalId(f.national_id).valid ? t('errors.invalidNationalId') : null,
    phone: !normalizeEgyptianMobile(f.phone) ? t('errors.invalidPhone') : null,
    password: !isAcceptablePassword(f.password) ? t('errors.weakPassword') : null,
    confirm: f.confirm !== f.password ? t('errors.passwordsMismatch') : null,
    terms: !terms ? t('errors.termsRequired') : null,
  };
  const valid = Object.values(errors).every((x) => !x);

  const submit = async () => {
    setTried(true);
    setError(null);
    if (!valid) return;
    setBusy(true);
    try {
      await register({ full_name: f.full_name.trim(), national_id: f.national_id.trim(), phone: f.phone, password: f.password, accept_terms: terms });
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);

  return (
    <Screen>
      {error && <Notice tone="red" icon="alert-circle-outline" text={error} />}
      <Field label={`${t('auth.fullName')} *`} hint={t('auth.fullNameHint')} error={show('full_name')}>
        <Input testID="full_name" value={f.full_name} onChangeText={set('full_name')} invalid={!!show('full_name')} autoComplete="name" />
      </Field>
      <Field label={`${t('auth.nationalId')} *`} error={show('national_id')}>
        <Input testID="national_id" value={f.national_id} onChangeText={(v) => set('national_id')(v.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad" ltr invalid={!!show('national_id')} />
      </Field>
      <Field label={`${t('auth.phone')} *`} error={show('phone')}>
        <Input testID="reg_phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="01xxxxxxxxx" ltr invalid={!!show('phone')} />
      </Field>
      <Field label={`${t('auth.password')} *`} hint={t('auth.passwordHint')} error={show('password')}>
        <Input testID="reg_password" value={f.password} onChangeText={set('password')} secureTextEntry ltr invalid={!!show('password')} />
      </Field>
      <Field label={`${t('auth.confirmPassword')} *`} error={show('confirm')}>
        <Input testID="reg_confirm" value={f.confirm} onChangeText={set('confirm')} secureTextEntry ltr invalid={!!show('confirm')} />
      </Field>
      <Pressable onPress={() => setTerms(!terms)} accessibilityRole="checkbox" accessibilityState={{ checked: terms }}>
        <Row>
          <Switch testID="terms" value={terms} onValueChange={setTerms} trackColor={{ true: colors.brand, false: '#cbd5e3' }} />
          <T v="body" style={{ flex: 1 }}>{t('auth.acceptTerms')}</T>
        </Row>
      </Pressable>
      {tried && errors.terms && <T v="small" style={{ color: colors.danger }}>{errors.terms}</T>}
      <Button testID="register" title={t('auth.register')} loading={busy} onPress={submit} />
      <Link href="/login" asChild>
        <Pressable accessibilityRole="link"><T v="label" center style={{ color: colors.brand }}>{t('auth.haveAccount')}</T></Pressable>
      </Link>
    </Screen>
  );
}
