import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, colors, Empty, Input, Row, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import { fmtDate } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Request thread with the company (PROJECT_PLAN §5.4). */
export default function MessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const q = useQuery({
    queryKey: ['messages', id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('request_messages').select('id, sender_type, sender_name, body, created_at').eq('request_id', id).order('created_at');
      if (error) throw error;
      return data as { id: string; sender_type: 'client' | 'staff'; sender_name: string | null; body: string; created_at: string }[];
    },
  });
  useEffect(() => {
    void supabase.rpc('mark_messages_read', { p_request_id: id }).then(() => qc.invalidateQueries({ queryKey: ['request', id] }));
  }, [id, q.data?.length, qc]);
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_request_message', { p_request_id: id, p_body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody('');
      void q.refetch();
    },
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {(q.data ?? []).length === 0 ? <Empty icon="chatbubbles-outline" title={t('messages.empty')} /> : q.data!.map((m) => {
          const mine = m.sender_type === 'client';
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '85%', gap: 2 }}>
              <View style={{ backgroundColor: mine ? colors.brand : '#fff', borderRadius: 14, padding: 10, borderWidth: mine ? 0 : 1, borderColor: colors.line }}>
                <T v="body" style={{ color: mine ? '#fff' : colors.ink }}>{m.body}</T>
              </View>
              <T v="small">{mine ? t('messages.you') : m.sender_name ?? t('messages.team')} · {fmtDate(m.created_at, locale, true)}</T>
            </View>
          );
        })}
      </ScrollView>
      <Row style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#fff' }}>
        <View style={{ flex: 1 }}><Input testID="message" value={body} onChangeText={setBody} placeholder={t('messages.placeholder')} /></View>
        <Button testID="send" title={t('common.send')} icon="send" small loading={send.isPending} disabled={!body.trim()} onPress={() => send.mutate()} />
      </Row>
    </KeyboardAvoidingView>
  );
}
