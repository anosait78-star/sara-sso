import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from './ar';
import { en } from './en';

export type Locale = 'ar' | 'en';
const STORAGE_KEY = 'sso-admin-locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'ar';
}

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function setLocale(locale: Locale) {
  void i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

const locale = initialLocale();
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: locale,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});
applyDocumentLocale(locale);

export default i18n;
