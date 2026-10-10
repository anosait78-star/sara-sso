import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';
import { Button, colors, Field, Input, Notice, Row, Screen, T } from '@/components/ui';
import { setLocale, useLocale } from '@/i18n';
import { authErrorKey, useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(phone, password);
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Pressable onPress={() => void setLocale(locale === 'ar' ? 'en' : 'ar')} accessibilityRole="button">
          <T v="label" style={{ color: colors.brand }}>{locale === 'ar' ? 'English' : 'العربية'}</T>
        </Pressable>
      </Row>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
        <Image source={require('../../assets/logo.png')} style={{ width: 200, height: 90 }} resizeMode="contain" accessibilityLabel="SSO" />
        <T v="h2" center>{t('auth.tagline')}</T>
        <T v="small" center>{t('auth.lines')}</T>
      </View>
      <T v="title">{t('auth.login')}</T>
      {error && <Notice tone="red" icon="alert-circle-outline" text={error} />}
      <Field label={t('auth.phone')}>
        <Input testID="phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="01xxxxxxxxx" ltr autoComplete="tel" />
      </Field>
      <Field label={t('auth.password')}>
        <Input testID="password" value={password} onChangeText={setPassword} secureTextEntry ltr autoComplete="password" onSubmitEditing={submit} />
      </Field>
      <Button testID="login" title={t('auth.login')} loading={busy} disabled={!phone || !password} onPress={submit} />
      <Link href="/forgot" asChild>
        <Pressable accessibilityRole="link"><T v="label" center style={{ color: colors.brand }}>{t('auth.forgot')}</T></Pressable>
      </Link>
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
      <T v="caption" center>{t('auth.noAccount')}</T>
      <Link href="/register" asChild>
        <Button title={t('auth.register')} variant="secondary" icon="person-add-outline" />
      </Link>
    </Screen>
  );
}
