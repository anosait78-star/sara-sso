import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView } from 'react-native';
import { RequestCard } from '@/components/RequestCard';
import { Card, colors, Empty, font, Row, T } from '@/components/ui';
import { OPEN, useMyRequests, useMySteps } from '@/lib/data';

/** Open requests and history (completed / cancelled). */
export default function RequestsScreen() {
  const { t } = useTranslation();
  const requests = useMyRequests();
  const steps = useMySteps();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const rows = (requests.data ?? []).filter((r) => (tab === 'active' ? OPEN.includes(r.status) : !OPEN.includes(r.status)));
  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => { void requests.refetch(); void steps.refetch(); }} />}>
      <Row gap={4} style={{ backgroundColor: colors.muted, borderRadius: 10, padding: 4 }}>
        {(['active', 'history'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? '#fff' : 'transparent' }}>
            <T v="label" style={{ color: tab === k ? colors.navy : colors.ink3, fontFamily: font.semibold }}>{t(`requests.${k}`)}</T>
          </Pressable>
        ))}
      </Row>
      {rows.length === 0 ? <Card><Empty icon="document-text-outline" title={t('requests.empty')} /></Card> : rows.map((r) => (
        <RequestCard key={r.id} request={r} steps={(steps.data ?? []).filter((s) => s.request_id === r.id)} />
      ))}
    </ScrollView>
  );
}
