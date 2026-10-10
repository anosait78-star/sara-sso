import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ContactButtons } from '@/components/ContactButtons';
import { colors, Screen, T } from '@/components/ui';

/** No reset link or SMS: passwords are reset by the company only (PROJECT_PLAN §5.2). */
export default function ForgotScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Ionicons name="shield-checkmark-outline" size={48} color={colors.brand} />
      </View>
      <T v="body">{t('auth.forgotBody')}</T>
      <ContactButtons />
    </Screen>
  );
}
