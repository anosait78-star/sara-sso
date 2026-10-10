import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Card, colors, Empty, font, Loading, Row, T } from '@/components/ui';
import { useLocale } from '@/i18n';
import { nameOf } from '@/lib/data';
import { supabase } from '@/lib/supabase';

interface Category { id: string; name_ar: string; name_en: string | null; icon: string | null; sort_order: number }
interface Service { id: string; category_id: string; name_ar: string; name_en: string | null; description_ar: string | null; description_en: string | null; default_price: number | null }

/** Client-visible, active services grouped by the business-line categories (from the database). */
export default function ServicesScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const router = useRouter();
  const [cat, setCat] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const [c, s] = await Promise.all([
        supabase.from('service_categories').select('id, name_ar, name_en, icon, sort_order').eq('is_active', true).order('sort_order'),
        supabase.from('services').select('id, category_id, name_ar, name_en, description_ar, description_en, default_price')
          .eq('is_active', true).eq('is_client_visible', true).eq('allow_client_request', true).order('sort_order'),
      ]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      return { categories: c.data as Category[], services: s.data as Service[] };
    },
  });
  if (q.isLoading) return <Loading />;
  const categories = (q.data?.categories ?? []).filter((c) => q.data?.services.some((s) => s.category_id === c.id));
  const services = (q.data?.services ?? []).filter((s) => !cat || s.category_id === cat);

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[{ id: null as string | null, label: t('common.all') }, ...categories.map((c) => ({ id: c.id as string | null, label: nameOf(c, locale) }))].map((c) => (
          <Pressable key={c.id ?? 'all'} onPress={() => setCat(c.id)} accessibilityRole="tab" accessibilityState={{ selected: cat === c.id }}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1,
              borderColor: cat === c.id ? colors.brand : colors.line, backgroundColor: cat === c.id ? colors.brand50 : '#fff' }}>
            <T v="label" style={{ color: cat === c.id ? colors.brand : colors.ink2, fontFamily: font.semibold }}>{c.label}</T>
          </Pressable>
        ))}
      </ScrollView>
      {services.length === 0 ? <Card><Empty icon="grid-outline" title={t('services.empty')} /></Card> : services.map((s) => (
        <Card key={s.id} onPress={() => router.push(`/service/${s.id}`)}>
          <Row>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="briefcase-outline" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="h2">{nameOf(s, locale)}</T>
              <T v="small">{nameOf(q.data?.categories.find((c) => c.id === s.category_id), locale)}</T>
            </View>
            <Ionicons name={locale === 'ar' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.ink3} />
          </Row>
          {!!(locale === 'en' ? s.description_en || s.description_ar : s.description_ar) && (
            <T v="caption" numberOfLines={2}>{locale === 'en' ? s.description_en || s.description_ar : s.description_ar}</T>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
