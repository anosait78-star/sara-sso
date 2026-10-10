import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactButtons } from '@/components/ContactButtons';
import { Button, Card, colors, Field, Input, Ltr, Notice, Row, Screen, T } from '@/components/ui';
import { setLocale, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const { status, signOut } = useAuth();
  const [inquiry, setInquiry] = useState('');
  const me = useQuery({
    queryKey: ['me', 'customer'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('full_name, customer_no, phone, national_id').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_request_message', { p_request_id: null as unknown as string, p_body: inquiry.trim() });
      if (error) throw error;
    },
    onSuccess: () => setInquiry(''),
  });
  const masked = me.data?.national_id ? `${me.data.national_id.slice(0, 4)}•••••••${me.data.national_id.slice(-3)}` : '—';

  return (
    <Screen>
      <Card>
        <T v="h2">{me.data?.full_name ?? status?.full_name}</T>
        {[[t('account.customerNo'), me.data?.customer_no ?? '—'], [t('account.phone'), me.data?.phone ?? '—'], [t('account.nationalId'), masked]].map(([k, v]) => (
          <Row key={k}>
            <T v="caption" style={{ flex: 1 }}>{k}</T>
            <Ltr v="label">{v}</Ltr>
          </Row>
        ))}
      </Card>

      <Card>
        <T v="label">{t('account.language')}</T>
        <Row>
          {(['ar', 'en'] as const).map((l) => (
            <Button key={l} title={l === 'ar' ? 'العربية' : 'English'} small variant={locale === l ? 'primary' : 'secondary'} style={{ flex: 1 }}
              onPress={() => void setLocale(l)} />
          ))}
        </Row>
      </Card>

      <Button title={t('account.changePassword')} variant="secondary" icon="key-outline" onPress={() => router.push('/change-password')} />

      <Card>
        <T v="h2">{t('account.inquiry')}</T>
        {send.isSuccess && <Notice tone="green" icon="checkmark-circle-outline" text={t('account.inquirySent')} />}
        <Field label={t('account.inquiryPlaceholder')}>
          <Input value={inquiry} onChangeText={setInquiry} multiline />
        </Field>
        <Button title={t('common.send')} small icon="send" loading={send.isPending} disabled={!inquiry.trim()} onPress={() => send.mutate()} />
      </Card>

      <Card>
        <T v="h2">{t('account.contact')}</T>
        <ContactButtons />
      </Card>

      <Button title={t('auth.logout')} variant="danger" icon="log-out-outline" onPress={() => void signOut()} />
      <T v="small" center style={{ color: colors.ink3 }}>SSO · Sara Soliman</T>
    </Screen>
  );
}
