import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useLocale } from '@/i18n';
import { fmtDate, nameOf, progressOf, STATUS_TONE, type ClientRequest, type ClientStep } from '@/lib/data';
import { Badge, Card, Ltr, Progress, Row, T } from './ui';

export function RequestCard({ request: r, steps }: { request: ClientRequest; steps: ClientStep[] }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const p = progressOf(steps);
  const current = steps.find((s) => s.id === r.current_step_id);
  return (
    <Card onPress={() => router.push(`/request/${r.id}`)}>
      <Row>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h2">{nameOf(r.service, locale)}</T>
          <Ltr v="small">{r.request_no}</Ltr>
        </View>
        <Badge label={t(`requests.statuses.${r.status}`)} tone={STATUS_TONE[r.status]} />
      </Row>
      {current && <T v="caption">{t('requests.currentStep')}: {nameOf(current, locale)}</T>}
      {r.status !== 'cancelled' && steps.length > 0 && (
        <View style={{ gap: 4 }}>
          <Progress value={p.pct} />
          <Row>
            <T v="small" style={{ flex: 1 }}>{t('requests.progress', { done: p.done, total: p.total })}</T>
            {r.due_at && r.status !== 'completed' && <T v="small">{t('requests.expected', { date: fmtDate(r.due_at, locale) })}</T>}
          </Row>
        </View>
      )}
    </Card>
  );
}
