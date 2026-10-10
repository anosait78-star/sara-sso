import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { ar } from './ar';
import { en } from './en';

export type Locale = 'ar' | 'en';
const KEY = 'sso-client-locale';

// Arabic first (PROJECT_PLAN §5.1); English only when chosen in the app (account → language).

void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

async function readSaved(): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

/** Restores the language chosen in the app (profile → language). */
export async function restoreLocale() {
  const saved = await readSaved();
  if (saved === 'ar' || saved === 'en') await i18n.changeLanguage(saved);
}

export async function setLocale(locale: Locale) {
  await i18n.changeLanguage(locale);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, locale);
    else await SecureStore.setItemAsync(KEY, locale);
  } catch {
    /* ignore */
  }
}

/** Current language and layout direction (applied with style.direction on the root view). */
export function useLocale() {
  const { i18n: inst } = useTranslation();
  const locale: Locale = inst.language === 'en' ? 'en' : 'ar';
  return { locale, rtl: locale === 'ar' };
}

export default i18n;
