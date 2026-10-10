import {
  IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold, useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, font, Loading } from '@/components/ui';
import { restoreLocale, useLocale } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold });
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    void restoreLocale().finally(() => setLocaleReady(true));
  }, []);
  if (!fontsLoaded || !localeReady) return <Loading />;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Directed>
            <Gate />
          </Directed>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Arabic-first layout direction without restarting the app: style.direction on native, dir on web. */
function Directed({ children }: { children: React.ReactNode }) {
  const { rtl } = useLocale();
  const webDir = Platform.OS === 'web' ? ({ dir: rtl ? 'rtl' : 'ltr' } as object) : {};
  return (
    <View style={{ flex: 1, direction: rtl ? 'rtl' : 'ltr', backgroundColor: colors.canvas }} {...webDir}>
      <StatusBar style="dark" />
      {children}
    </View>
  );
}

const PUBLIC = ['login', 'register', 'forgot'];

/** Sends the user to the right place for their account state (signed out, temporary password, pending link…). */
function Gate() {
  const { t } = useTranslation();
  const { gate } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const first: string = segments[0] ?? '';

  useEffect(() => {
    if (gate === 'loading') return;
    if (gate === 'signed_out' && !PUBLIC.includes(first)) router.replace('/login');
    else if (gate === 'change_password' && first !== 'change-password') router.replace('/change-password');
    else if (['pending', 'rejected', 'suspended', 'not_client'].includes(gate) && first !== 'account-status') router.replace('/account-status');
    else if (gate === 'ready' && (PUBLIC.includes(first) || first === 'account-status' || first === 'change-password' || first === '')) router.replace('/(tabs)');
  }, [gate, first, router]);

  if (gate === 'loading') return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: font.bold, color: colors.navy },
        headerTintColor: colors.navy,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#fff' },
        contentStyle: { backgroundColor: colors.canvas },
        headerBackTitle: t('common.back'),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('auth.register') }} />
      <Stack.Screen name="forgot" options={{ title: t('auth.forgotTitle') }} />
      <Stack.Screen name="change-password" options={{ title: t('auth.changePasswordTitle') }} />
      <Stack.Screen name="account-status" options={{ headerShown: false }} />
      <Stack.Screen name="service/[id]" options={{ title: t('tabs.services') }} />
      <Stack.Screen name="request/[id]/index" options={{ title: t('requests.title') }} />
      <Stack.Screen name="request/[id]/messages" options={{ title: t('messages.title') }} />
    </Stack>
  );
}
