import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale } from '@/i18n';

// Design tokens — same palette as the admin (logo colours, PROJECT_PLAN §16)
export const colors = {
  navy: '#0b2a55', brand: '#0057e6', brand50: '#e8f1fe', brand100: '#c9defd', sky: '#22a0f5',
  canvas: '#f4f7fb', surface: '#ffffff', muted: '#eef3fa', line: '#e3e9f2',
  ink: '#0f1e36', ink2: '#5b6b84', ink3: '#8a98ae',
  success: '#12a150', successBg: '#e5f6ec', warning: '#b57a00', warningBg: '#fdf3dc', danger: '#d93b3b', dangerBg: '#fce8e8',
  purple: '#6b45d9', purpleBg: '#efeafe',
};
export const font = {
  regular: 'IBMPlexSansArabic_400Regular', medium: 'IBMPlexSansArabic_500Medium', semibold: 'IBMPlexSansArabic_600SemiBold', bold: 'IBMPlexSansArabic_700Bold',
};
export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = 'title' | 'h2' | 'body' | 'label' | 'caption' | 'small';
const variantStyle: Record<Variant, TextStyle> = {
  title: { fontSize: 22, fontFamily: font.bold, color: colors.navy },
  h2: { fontSize: 16, fontFamily: font.bold, color: colors.navy },
  body: { fontSize: 14, fontFamily: font.regular, color: colors.ink },
  label: { fontSize: 13, fontFamily: font.semibold, color: colors.ink2 },
  caption: { fontSize: 12, fontFamily: font.regular, color: colors.ink2 },
  small: { fontSize: 11, fontFamily: font.regular, color: colors.ink3 },
};

/** Text aligned with the reading direction (textAlign does not accept start/end). */
export function T({ v = 'body', style, center, ...props }: TextProps & { v?: Variant; center?: boolean }) {
  const { rtl } = useLocale();
  return <Text {...props} style={[variantStyle[v], { textAlign: center ? 'center' : rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, style]} />;
}

/** Numbers, phones and codes stay left-to-right inside Arabic text. */
export function Ltr({ children, style, v = 'body' }: { children: ReactNode; style?: StyleProp<TextStyle>; v?: Variant }) {
  return <Text style={[variantStyle[v], { writingDirection: 'ltr' }, style]}>{children}</Text>;
}

export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const body = <View style={[padded && { padding: 16, gap: 14 }, { maxWidth: 600, width: '100%', alignSelf: 'center' }]}>{children}</View>;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>{body}</ScrollView> : <View style={{ flex: 1 }}>{body}</View>}
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, gap = 8, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
  secondary: { bg: '#fff', fg: colors.ink, border: colors.line },
  danger: { bg: '#fff', fg: colors.danger, border: '#f3c5c5' },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  success: { bg: colors.successBg, fg: colors.success, border: '#bfe6cf' },
};
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, small, style, testID }: {
  title: string; onPress?: () => void; variant?: ButtonVariant; loading?: boolean; disabled?: boolean; icon?: IconName; small?: boolean;
  style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const c = buttonColors[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button, small && { height: 38, paddingHorizontal: 12 },
        { backgroundColor: c.bg, borderColor: c.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={c.fg} /> : null}
      <Text style={{ color: c.fg, fontFamily: font.semibold, fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      {children}
      {error ? <T v="small" style={{ color: colors.danger }}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}

export function Input({ ltr, style, invalid, ...props }: TextInputProps & { ltr?: boolean; invalid?: boolean }) {
  const { rtl } = useLocale();
  const isLtr = ltr ?? !rtl;
  return (
    <TextInput
      placeholderTextColor={colors.ink3}
      {...props}
      style={[styles.input, invalid && { borderColor: colors.danger }, { textAlign: isLtr ? 'left' : 'right', writingDirection: isLtr ? 'ltr' : 'rtl' }, props.multiline && { height: 96, textAlignVertical: 'top', paddingTop: 10 }, style]}
    />
  );
}

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple';
const toneColors: Record<Tone, [string, string]> = {
  blue: [colors.brand50, colors.brand], green: [colors.successBg, colors.success], amber: [colors.warningBg, colors.warning],
  red: [colors.dangerBg, colors.danger], gray: ['#eef1f5', colors.ink2], purple: [colors.purpleBg, colors.purple],
};
export function Badge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, height: 24, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 4, backgroundColor: colors.brand }} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title }: { icon?: IconName; title: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
      <Ionicons name={icon} size={36} color={colors.ink3} />
      <T v="caption" center>{title}</T>
    </View>
  );
}

export function Notice({ tone = 'blue', icon = 'information-circle-outline', text }: { tone?: Tone; icon?: IconName; text: string }) {
  const [bg, fg] = toneColors[tone];
  return (
    <Row style={{ backgroundColor: bg, borderRadius: 12, padding: 12, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={fg} />
      <T v="caption" style={{ color: fg, flex: 1 }}>{text}</T>
    </Row>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  button: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 12, fontSize: 15, fontFamily: font.regular, color: colors.ink },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#fff' },
});
