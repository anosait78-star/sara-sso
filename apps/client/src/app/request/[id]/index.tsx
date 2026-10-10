import { Ionicons } from '@expo/vector-icons';
import type { DynamicValue } from '@sso/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { DocumentRow } from '@/components/DocumentRow';
import { DynamicFields } from '@/components/DynamicFields';
import { Badge, Button, Card, colors, Loading, Ltr, Notice, Progress, Row, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import {
  DOC_SELECT, fmtDate, nameOf, OPEN, progressOf, REQUEST_SELECT, STATUS_TONE, STEP_SELECT, type ClientDocument, type ClientRequest, type ClientStep,
} from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Request details: status, what is needed now, documents, the visible path and messages (PROJECT_PLAN §5.3 screens 6–10). */
export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['request', id],
    queryFn: async () => {
      const [r, s, d, v, m] = await Promise.all([
        supabase.from('service_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle(),
        supabase.from('service_request_steps').select(STEP_SELECT).eq('request_id', id).order('sort_order'),
        supabase.from('documents').select(DOC_SELECT).eq('request_id', id).order('created_at'),
        supabase.from('request_field_values').select('request_step_id, field_key, value').eq('request_id', id),
        supabase.from('request_messages').select('id', { count: 'exact', head: true }).eq('request_id', id).eq('sender_type', 'staff').is('read_at', null),
      ]);
      if (r.error) throw r.error;
      return {
        request: r.data as unknown as ClientRequest | null,
        steps: (s.data ?? []) as unknown as ClientStep[],
        docs: (d.data ?? []) as unknown as ClientDocument[],
        values: (v.data ?? []) as { request_step_id: string; field_key: string; value: unknown }[],
        unread: m.count ?? 0,
      };
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['request', id] });
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['steps'] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };
  const save = useMutation({
    mutationFn: async ({ step, values }: { step: string; values: Record<string, DynamicValue> }) => {
      const { error } = await supabase.rpc('client_submit_step_data', { p_request_step_id: step, p_values: values as never });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: async (step: string) => {
      const { error } = await supabase.rpc('client_submit_step', { p_request_step_id: step });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (q.isLoading) return <Loading />;
  const r = q.data?.request;
  if (!r) return <View style={{ padding: 16 }}><Notice tone="red" text={t('errors.forbidden')} /></View>;
  const steps = q.data!.steps;
  const docs = q.data!.docs;
  const p = progressOf(steps);
  const open = OPEN.includes(r.status);
  const current = steps.find((s) => s.id === r.current_step_id) ?? null;
  const waiting = current?.status === 'waiting_client' ? current : null;
  const clientFields = (waiting?.fields_snapshot ?? []).filter((f) => f.filled_by === 'client');
  const initial = Object.fromEntries(q.data!.values.filter((v) => v.request_step_id === waiting?.id).map((v) => [v.field_key, v.value as DynamicValue]));
  const waitingDocs = docs.filter((d) => d.request_step_id === waiting?.id);
  const otherDocs = docs.filter((d) => d.request_step_id !== waiting?.id);
  const missingRequired = clientFields.some((f) => f.is_required && (initial[f.field_key] === undefined || initial[f.field_key] === null))
    || waitingDocs.some((d) => d.is_required && (d.status === 'pending' || d.status === 'rejected'));

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 600, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Stack.Screen options={{ title: r.request_no }} />
      <Card>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h2">{nameOf(r.service, locale)}</T>
            <Ltr v="small">{r.request_no}</Ltr>
          </View>
          <Badge label={t(`requests.statuses.${r.status}`)} tone={STATUS_TONE[r.status]} />
        </Row>
        {r.status !== 'cancelled' && (
          <View style={{ gap: 4 }}>
            <Progress value={p.pct} />
            <Row>
              <T v="small" style={{ flex: 1 }}>{t('requests.progress', { done: p.done, total: p.total })}</T>
              {open && r.due_at && <T v="small">{t('requests.expected', { date: fmtDate(r.due_at, locale) })}</T>}
            </Row>
          </View>
        )}
        {r.status === 'cancelled' && !!r.cancelled_reason && <T v="caption" style={{ color: colors.danger }}>{t('requests.cancelReason', { reason: r.cancelled_reason })}</T>}
        <Button title={`${t('requests.messages')}${q.data!.unread ? ` (${q.data!.unread})` : ''}`} small variant="secondary" icon="chatbubbles-outline"
          onPress={() => router.push(`/request/${r.id}/messages`)} />
      </Card>

      {waiting && open && (
        <Card style={{ borderColor: '#f2dca3', backgroundColor: '#fffaf0' }}>
          <Row>
            <Ionicons name="hand-left-outline" size={18} color={colors.warning} />
            <T v="h2" style={{ flex: 1 }}>{t('requests.yourPart')}</T>
          </Row>
          <T v="label" style={{ color: colors.navy }}>{nameOf(waiting, locale)}</T>
          {!!waiting.client_instructions && <T v="caption">{waiting.client_instructions}</T>}
          {clientFields.length > 0 && (
            <DynamicFields fields={clientFields} initial={initial} saving={save.isPending} onSave={(values) => save.mutate({ step: waiting.id, values })} />
          )}
          {save.isError && <Notice tone="red" text={t('errors.invalidValue')} />}
          {waitingDocs.map((d) => <DocumentRow key={d.id} doc={d} canUpload onUploaded={refresh} />)}
          {submit.isError && <Notice tone="red" text={t('errors.incomplete')} />}
          <Button testID="submit-step" title={t('requests.submitPart')} icon="paper-plane-outline" loading={submit.isPending} disabled={missingRequired}
            onPress={() => submit.mutate(waiting.id)} />
        </Card>
      )}
      {current && !waiting && open && current.status === 'active' && submit.isSuccess && <Notice tone="green" icon="checkmark-circle-outline" text={t('requests.submitted')} />}

      {otherDocs.length > 0 && (
        <Card>
          <T v="h2">{t('requests.documents')}</T>
          {otherDocs.map((d) => (
            <DocumentRow key={d.id} doc={d} canUpload={open && (d.status === 'rejected' || (d.status === 'pending' && d.request_step_id === current?.id))} onUploaded={refresh} />
          ))}
        </Card>
      )}

      <Card>
        <T v="h2">{t('requests.path')}</T>
        {steps.map((s, i) => {
          const done = s.status === 'completed' || s.status === 'skipped';
          const isCurrent = s.id === r.current_step_id;
          return (
            <Row key={s.id} style={{ alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? colors.success : isCurrent ? colors.brand : '#fff', borderWidth: 2, borderColor: done ? colors.success : isCurrent ? colors.brand : colors.line }}>
                  {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <T v="small" style={{ color: isCurrent ? '#fff' : colors.ink3 }}>{i + 1}</T>}
                </View>
                {i < steps.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: done ? colors.success : colors.line }} />}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: 8 }}>
                <T v="body" style={{ color: done ? colors.ink2 : colors.navy }}>{nameOf(s, locale)}</T>
                <T v="small">
                  {done
                    ? `${(locale === 'en' ? s.completion_status_label_en || s.completion_status_label_ar : s.completion_status_label_ar) ?? t(`requests.stepStatuses.${s.status}`)} · ${t('requests.doneOn', { date: fmtDate(s.completed_at, locale) })}`
                    : isCurrent ? `${t(`requests.stepStatuses.${s.status}`)}${s.due_at ? ` · ${t('requests.expectedOn', { date: fmtDate(s.due_at, locale) })}` : ''}`
                    : t('requests.stepStatuses.pending')}
                </T>
              </View>
            </Row>
          );
        })}
      </Card>
    </ScrollView>
  );
}
