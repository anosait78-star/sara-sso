import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, Row } from './ui';

/** Call / WhatsApp the company (numbers from Settings → company). */
export function ContactButtons() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['company_contact'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_company_contact');
      return (data ?? {}) as { phone?: string; whatsapp?: string };
    },
  });
  const phone = q.data?.phone?.trim();
  const wa = (q.data?.whatsapp || q.data?.phone || '').replace(/\D/g, '');
  return (
    <Row gap={10}>
      <Button title={t('common.call')} icon="call-outline" variant="secondary" style={{ flex: 1 }} disabled={!phone}
        onPress={() => phone && void Linking.openURL(`tel:${phone}`)} />
      <Button title={t('common.whatsapp')} icon="logo-whatsapp" variant="success" style={{ flex: 1 }} disabled={!wa}
        onPress={() => wa && void Linking.openURL(`https://wa.me/${wa}`)} />
    </Row>
  );
}
