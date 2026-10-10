import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
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
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_files')
        .select('id, file_no, approved_name, proposed_names, status, commercial_register_no, tax_card_no').order('created_at');
      if (error) throw error;
      return data as unknown as { id: string; file_no: string; approved_name: string | null; proposed_names: string[]; status: string; commercial_register_no: string | null; tax_card_no: string | null }[];
    },
  });
  const policies = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('insurance_policies')
        .select('id, file_no, policy_no, subject, status, end_date, type:insurance_types(name_ar, name_en), company:insurance_companies(name_ar, name_en)')
        .not('status', 'in', '(renewed,cancelled)').order('end_date');
      if (error) throw error;
      return data as unknown as {
        id: string; file_no: string; policy_no: string | null; subject: string | null; status: string; end_date: string | null;
        type: { name_ar: string; name_en: string | null } | null; company: { name_ar: string; name_en: string | null } | null;
      }[];
    },
  });
  const loans = useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_applications').select('id, file_no, requested_amount, approved_amount, status')
        .neq('status', 'cancelled').order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as { id: string; file_no: string; requested_amount: number | null; approved_amount: number | null; status: string }[];
    },
  });
  const nm = (x: { name_ar: string; name_en: string | null } | null) => (x ? (locale === 'en' ? x.name_en ?? x.name_ar : x.name_ar) : null);
  const egp = (n: number | null) => (n == null ? '—' : `${Number(n).toLocaleString('en')} EGP`);
  const CATEGORIES = ['requests', 'documents', 'payments', 'messages', 'insurance', 'loans'] as const;
  const prefs = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_preferences').select('category, push');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.category, p.push])) as Record<string, boolean>;
    },
  });
  const setPref = useMutation({
    mutationFn: async ({ category, push }: { category: string; push: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('notification_preferences').upsert({ user_id: u.user!.id, category, push });
      if (error) throw error;
    },
    onSuccess: () => void prefs.refetch(),
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

      {(companies.data ?? []).length > 0 && (
        <Card>
          <T v="h2">{t('account.companies')}</T>
          {companies.data!.map((c) => (
            <View key={c.id} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T v="label" style={{ color: colors.navy }}>{c.approved_name || c.proposed_names[0] || c.file_no}</T>
              <T v="small">{t(`account.companyStatus.${c.status}`)}</T>
              {c.commercial_register_no && <Row><T v="caption" style={{ flex: 1 }}>{t('account.commercialRegister')}</T><Ltr v="caption">{c.commercial_register_no}</Ltr></Row>}
              {c.tax_card_no && <Row><T v="caption" style={{ flex: 1 }}>{t('account.taxCard')}</T><Ltr v="caption">{c.tax_card_no}</Ltr></Row>}
            </View>
          ))}
        </Card>
      )}

      {(policies.data ?? []).length > 0 && (
        <Card>
          <T v="h2">{t('account.policies')}</T>
          {policies.data!.map((p) => (
            <View key={p.id} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
              <T v="label" style={{ color: colors.navy }}>{[nm(p.type), p.subject].filter(Boolean).join(' — ') || p.file_no}</T>
              <T v="small" style={{ color: p.status === 'expiring' || p.status === 'expired' ? colors.danger : colors.ink2 }}>{t(`account.policyStatus.${p.status}`)}</T>
              {p.company && <Row><T v="caption" style={{ flex: 1 }}>{t('account.insurer')}</T><T v="caption">{nm(p.company)}</T></Row>}
              {p.policy_no && <Row><T v="caption" style={{ flex: 1 }}>{t('account.policyNo')}</T><Ltr v="caption">{p.policy_no}</Ltr></Row>}
              {p.end_date && <Row><T v="caption" style={{ flex: 1 }}>{t('account.validUntil')}</T><Ltr v="caption">{p.end_date}</Ltr></Row>}
            </View>
          ))}
        </Card>
      )}

      {(loans.data ?? []).length > 0 && (
        <Card>
          <T v="h2">{t('account.loans')}</T>
          {loans.data!.map((l) => (
            <View key={l.id} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
              <Row><T v="label" style={{ flex: 1, color: colors.navy }}>{t('account.requestedAmount')}</T><Ltr v="label">{egp(l.requested_amount)}</Ltr></Row>
              <T v="small">{t(`account.loanStatus.${l.status}`)}</T>
              {l.approved_amount != null && ['approved', 'disbursed'].includes(l.status) && (
                <Row><T v="caption" style={{ flex: 1 }}>{t('account.approvedAmount')}</T><Ltr v="caption">{egp(l.approved_amount)}</Ltr></Row>
              )}
            </View>
          ))}
        </Card>
      )}

      <Card>
        <T v="h2">{t('account.notifications')}</T>
        <T v="small">{t('account.notificationsHint')}</T>
        {CATEGORIES.map((c) => (
          <Row key={c} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 }}>
            <T v="body" style={{ flex: 1 }}>{t(`account.notificationCategories.${c}`)}</T>
            <Switch testID={`pref-${c}`} value={prefs.data?.[c] ?? true} onValueChange={(v) => setPref.mutate({ category: c, push: v })}
              trackColor={{ true: colors.brand, false: colors.line }} thumbColor="#fff" />
          </Row>
        ))}
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
