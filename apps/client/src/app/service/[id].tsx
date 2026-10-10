import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, colors, Field, Input, Loading, Notice, Row, Screen, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import { nameOf } from '@/lib/data';
import { supabase } from '@/lib/supabase';

interface Detail {
  id: string; name_ar: string; name_en: string | null; description_ar: string | null; description_en: string | null; default_price: number | null; current_workflow_id: string | null;
}
interface PubStep {
  id: string; sort_order: number; name_ar: string; name_en: string | null; duration_value: number; duration_unit: string;
  docs: { is_required: boolean; type: { name_ar: string; name_en: string | null } | null }[];
}

/** Service description, visible steps and required documents of the published version, then order. */
export default function ServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const q = useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const { data: s, error } = await supabase.from('services')
        .select('id, name_ar, name_en, description_ar, description_en, default_price, current_workflow_id').eq('id', id).maybeSingle();
      if (error) throw error;
      const svc = s as Detail | null;
      if (!svc?.current_workflow_id) return { svc, steps: [] as PubStep[] };
      const { data: steps } = await supabase.from('workflow_steps')
        .select('id, sort_order, name_ar, name_en, duration_value, duration_unit, docs:required_documents(is_required, type:document_types(name_ar, name_en))')
        .eq('workflow_id', svc.current_workflow_id).order('sort_order');
      return { svc, steps: (steps ?? []) as unknown as PubStep[] };
    },
  });
  const order = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('client_create_request', { p_service_id: id, p_notes: notes.trim() || undefined });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (requestId) => {
      void qc.invalidateQueries();
      router.replace(`/request/${requestId}`);
    },
  });

  if (q.isLoading) return <Loading />;
  const s = q.data?.svc;
  if (!s) return <Screen><Notice tone="red" text={t('errors.notAvailable')} /></Screen>;
  const steps = q.data?.steps ?? [];
  const days = Math.ceil(steps.reduce((n, x) => n + (x.duration_unit === 'hours' ? x.duration_value / 8 : x.duration_value), 0));
  const docs = steps.flatMap((x) => x.docs.filter((d) => d.type).map((d) => ({ ...d, step: x })));
  const description = locale === 'en' ? s.description_en || s.description_ar : s.description_ar;

  return (
    <Screen footer={<Button testID="order" title={t('services.order')} icon="paper-plane-outline" loading={order.isPending} onPress={() => order.mutate()} />}>
      <Stack.Screen options={{ title: nameOf(s, locale) }} />
      <T v="title">{nameOf(s, locale)}</T>
      {!!description && <T v="body" style={{ color: colors.ink2 }}>{description}</T>}
      <Row wrap>
        {days > 0 && <T v="label">{t('services.expected', { count: days })}</T>}
        {s.default_price != null && <T v="label">· {t('services.price', { price: Number(s.default_price).toLocaleString('en') })}</T>}
      </Row>
      {order.isError && <Notice tone="red" icon="alert-circle-outline" text={t('errors.notAvailable')} />}

      {steps.length > 0 && (
        <Card>
          <T v="h2">{t('services.steps')}</T>
          {steps.map((x, i) => (
            <Row key={x.id}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }}>
                <T v="small" style={{ color: colors.brand }}>{i + 1}</T>
              </View>
              <T v="body" style={{ flex: 1 }}>{nameOf(x, locale)}</T>
            </Row>
          ))}
        </Card>
      )}
      {docs.length > 0 && (
        <Card>
          <T v="h2">{t('services.documents')}</T>
          {docs.map((d, i) => (
            <Row key={i}>
              <Ionicons name="document-attach-outline" size={18} color={colors.brand} />
              <T v="body" style={{ flex: 1 }}>{nameOf(d.type, locale)}</T>
              {!d.is_required && <T v="small">{t('common.optional')}</T>}
            </Row>
          ))}
        </Card>
      )}
      <Field label={t('services.notesPlaceholder')}>
        <Input value={notes} onChangeText={setNotes} multiline />
      </Field>
    </Screen>
  );
}
