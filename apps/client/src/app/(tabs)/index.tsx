import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RequestCard } from '@/components/RequestCard';
import { Button, Card, colors, Empty, Row, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDate, nameOf, OPEN, useMyDocuments, useMyRequests, useMySteps, useNotifications } from '@/lib/data';

/** "What do I need to do now?" (PROJECT_PLAN §5.1). */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const { status } = useAuth();
  const requests = useMyRequests();
  const steps = useMySteps();
  const docs = useMyDocuments();
  const notifications = useNotifications();

  const open = (requests.data ?? []).filter((r) => OPEN.includes(r.status));
  const waitingSteps = (steps.data ?? []).filter((s) => s.status === 'waiting_client' && open.some((r) => r.current_step_id === s.id));
  const rejected = (docs.data ?? []).filter((d) => d.status === 'rejected' && open.some((r) => r.id === d.request_id));
  const todo = [
    ...waitingSteps.map((s) => ({ key: s.id, request: s.request_id, icon: 'create-outline' as const, text: t('home.stepWaiting', { step: nameOf(s, locale) }) })),
    ...rejected.filter((d) => !waitingSteps.some((s) => s.id === d.request_step_id))
      .map((d) => ({ key: d.id, request: d.request_id!, icon: 'alert-circle-outline' as const, text: t('home.docRejected', { doc: nameOf(d, locale) }) })),
  ];
  const refreshing = requests.isRefetching || steps.isRefetching;
  const reload = () => {
    void requests.refetch();
    void steps.refetch();
    void docs.refetch();
    void notifications.refetch();
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 600, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <View>
          <T v="title">{t('home.hello', { name: status?.full_name.split(' ')[0] ?? '' })}</T>
          {status?.customer_no && <T v="small">{status.customer_no}</T>}
        </View>

        <Card style={{ borderColor: todo.length ? '#f2dca3' : colors.line, backgroundColor: todo.length ? '#fffaf0' : '#fff' }}>
          <Row>
            <Ionicons name="hand-left-outline" size={18} color={todo.length ? colors.warning : colors.ink3} />
            <T v="h2" style={{ flex: 1 }}>{t('home.requiredTitle')}</T>
            {todo.length > 0 && <T v="label" style={{ color: colors.warning }}>{todo.length}</T>}
          </Row>
          {todo.length === 0 ? <T v="caption">{t('home.requiredEmpty')}</T> : todo.map((x) => (
            <Card key={x.key} style={{ padding: 10 }} onPress={() => router.push(`/request/${x.request}`)}>
              <Row>
                <Ionicons name={x.icon} size={18} color={colors.warning} />
                <T v="body" style={{ flex: 1 }}>{x.text}</T>
                <Ionicons name={locale === 'ar' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.ink3} />
              </Row>
            </Card>
          ))}
        </Card>

        <Row>
          <T v="h2" style={{ flex: 1 }}>{t('home.activeTitle')}</T>
        </Row>
        {open.length === 0 ? <Card><Empty title={t('home.noActive')} /></Card> : open.map((r) => (
          <RequestCard key={r.id} request={r} steps={(steps.data ?? []).filter((s) => s.request_id === r.id)} />
        ))}
        <Button title={t('home.newRequest')} icon="add-circle-outline" onPress={() => router.push('/services')} />

        {(notifications.data ?? []).length > 0 && (
          <Card>
            <T v="h2">{t('home.latest')}</T>
            {notifications.data!.slice(0, 3).map((n) => (
              <View key={n.id} style={{ gap: 2, paddingVertical: 4 }}>
                <T v="body">{n.body ?? n.title}</T>
                <T v="small">{fmtDate(n.created_at, locale, true)}</T>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
