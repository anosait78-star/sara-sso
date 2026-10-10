import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Button, Card, colors, Empty, Row, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import { fmtDate, useNotifications } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Grouped by day; each notification opens its request. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useNotifications();
  const rows = q.data ?? [];
  const today = new Date().toDateString();
  const groups = [
    { key: 'today', items: rows.filter((n) => new Date(n.created_at).toDateString() === today) },
    { key: 'earlier', items: rows.filter((n) => new Date(n.created_at).toDateString() !== today) },
  ].filter((g) => g.items.length);

  const markRead = async (ids?: string[]) => {
    await supabase.rpc('mark_notifications_read', { p_ids: ids });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {rows.some((n) => !n.read_at) && <Button title={t('notifications.markAll')} variant="ghost" small icon="checkmark-done" onPress={() => void markRead()} />}
      {rows.length === 0 ? <Card><Empty icon="notifications-off-outline" title={t('notifications.empty')} /></Card> : groups.map((g) => (
        <View key={g.key} style={{ gap: 8 }}>
          <T v="label">{t(`notifications.${g.key}`)}</T>
          {g.items.map((n) => (
            <Card key={n.id} style={!n.read_at ? { borderColor: colors.brand100, backgroundColor: '#f7faff' } : undefined}
              onPress={() => {
                void markRead([n.id]);
                if (n.link) router.push(n.link.replace('/requests/', '/request/') as never);
              }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Ionicons name={n.event_key.includes('rejected') ? 'alert-circle' : n.event_key.includes('message') ? 'chatbubble-ellipses' : 'notifications'}
                  size={20} color={n.event_key.includes('rejected') ? colors.danger : colors.brand} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="label" style={{ color: colors.navy }}>{n.title}</T>
                  {!!n.body && <T v="body">{n.body}</T>}
                  <T v="small">{fmtDate(n.created_at, locale, true)}</T>
                </View>
                {!n.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 }} />}
              </Row>
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
