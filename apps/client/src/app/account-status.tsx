import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ContactButtons } from '@/components/ContactButtons';
import { Button, colors, Screen, T, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Shown when the account cannot use the app yet: link under review, link rejected, suspended, or not a client. */
export default function AccountStatusScreen() {
  const { t } = useTranslation();
  const { gate, signOut, refresh } = useAuth();
  const content: Record<string, { icon: IconName; title: string; body: string; color: string }> = {
    pending: { icon: 'time-outline', title: t('auth.pendingTitle'), body: t('auth.pendingBody'), color: colors.brand },
    rejected: { icon: 'alert-circle-outline', title: t('auth.rejectedTitle'), body: t('auth.rejectedBody'), color: colors.danger },
    suspended: { icon: 'lock-closed-outline', title: t('auth.suspendedTitle'), body: t('auth.suspendedBody'), color: colors.danger },
    not_client: { icon: 'person-remove-outline', title: t('auth.notClient'), body: '', color: colors.ink2 },
  };
  const c = content[gate] ?? content.pending!;
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 60, paddingBottom: 12 }}>
        <Ionicons name={c.icon} size={56} color={c.color} />
        <T v="title" center>{c.title}</T>
        {!!c.body && <T v="body" center style={{ color: colors.ink2 }}>{c.body}</T>}
      </View>
      {gate !== 'not_client' && <ContactButtons />}
      {gate === 'pending' && <Button title={t('common.retry')} variant="secondary" icon="refresh" onPress={() => void refresh()} />}
      <Button title={t('auth.logout')} variant="ghost" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}
