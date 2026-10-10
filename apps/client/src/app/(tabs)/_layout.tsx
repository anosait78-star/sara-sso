import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';
import { colors, font, type IconName } from '@/components/ui';
import { useNotifications } from '@/lib/data';
import { usePushRegistration } from '@/lib/push';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  requests: ['document-text', 'document-text-outline'],
  services: ['grid', 'grid-outline'],
  notifications: ['notifications', 'notifications-outline'],
  account: ['person', 'person-outline'],
};

/** Bottom navigation: Home · My requests · Services · Notifications · Account (PROJECT_PLAN §17). */
export default function TabsLayout() {
  const { t } = useTranslation();
  usePushRegistration(true);
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.ink3,
        // Arabic glyphs are taller than the default line box: give the label a line height
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11, lineHeight: 16 },
        // web has no safe-area inset: give the labels room
        ...(Platform.OS === 'web' ? { tabBarStyle: { height: 72, paddingTop: 6, paddingBottom: 14 } } : {}),
        headerTitleStyle: { fontFamily: font.bold, color: colors.navy },
        headerShadowVisible: false,
        // own label: the default one clips Arabic glyphs (single line box, no room for diacritics)
        tabBarLabel: ({ color, children }) => (
          <Text numberOfLines={1} style={{ color, fontFamily: font.semibold, fontSize: 11, lineHeight: 18, includeFontPadding: false }}>{children}</Text>
        ),
        tabBarIcon: ({ focused, color, size }) => <Ionicons name={ICONS[route.name]?.[focused ? 0 : 1] ?? 'ellipse'} size={size} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), headerShown: false }} />
      <Tabs.Screen name="requests" options={{ title: t('tabs.requests') }} />
      <Tabs.Screen name="services" options={{ title: t('tabs.services') }} />
      <Tabs.Screen name="notifications" options={{ title: t('tabs.notifications'), tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />
    </Tabs>
  );
}
