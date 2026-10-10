import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useLocale } from '@/i18n';
import { DOC_TONE, nameOf, type ClientDocument } from '@/lib/data';
import { pickAndUpload, UploadError, type Source } from '@/lib/upload';
import { Badge, Button, colors, Row, T } from './ui';

/** One document slot: status, rejection reason, and upload (camera / photos / PDF) while it is still needed. */
export function DocumentRow({ doc, canUpload, onUploaded }: { doc: ClientDocument; canUpload: boolean; onUploaded: () => void }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needs = doc.status === 'pending' || doc.status === 'rejected';
  const reason = doc.reason ? (locale === 'en' ? doc.reason.text_en || doc.reason.text_ar : doc.reason.text_ar) : null;

  const upload = async (source: Source) => {
    setError(null);
    setBusy(true);
    try {
      const ok = await pickAndUpload({
        id: doc.id, customer_id: doc.customer_id, request_id: doc.request_id,
        max_size_mb: doc.type?.max_size_mb ?? 10, allowed_mime: doc.type?.allowed_mime ?? ['application/pdf', 'image/jpeg', 'image/png'],
      }, source);
      if (ok) onUploaded();
    } catch (e) {
      console.warn('document upload failed', e);
      setError(e instanceof UploadError ? (e.message === 'size' ? t('errors.fileTooLarge', { size: doc.type?.max_size_mb }) : t('errors.fileType')) : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Row>
        <Ionicons name={doc.status === 'approved' ? 'checkmark-circle' : doc.status === 'rejected' ? 'close-circle' : 'document-outline'} size={22}
          color={doc.status === 'approved' ? colors.success : doc.status === 'rejected' ? colors.danger : colors.ink3} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">{nameOf(doc, locale)}{!doc.is_required ? ` (${t('common.optional')})` : ''}</T>
          {doc.reused_from_document_id && <T v="small">{t('docs.reused')}</T>}
          {!!doc.instructions_ar && needs && <T v="small">{doc.instructions_ar}</T>}
          {needs && <T v="small">{t('docs.maxSize', { size: doc.type?.max_size_mb ?? 10 })}</T>}
        </View>
        <Badge label={t(`docs.statuses.${doc.status}`)} tone={DOC_TONE[doc.status]} />
      </Row>
      {doc.status === 'rejected' && (
        <T v="caption" style={{ color: colors.danger }}>{t('docs.rejectedReason', { reason: [reason, doc.rejection_note].filter(Boolean).join(' — ') })}</T>
      )}
      {doc.status === 'pending' && !!doc.review_note && <T v="caption" style={{ color: colors.warning }}>{doc.review_note}</T>}
      {error && <T v="small" style={{ color: colors.danger }}>{error}</T>}
      {canUpload && needs && (
        <Row wrap gap={6}>
          {Platform.OS !== 'web' && <Button small variant="secondary" icon="camera-outline" title={t('docs.camera')} disabled={busy} onPress={() => void upload('camera')} />}
          <Button testID={`upload-${doc.id}`} small variant="secondary" icon="image-outline" title={t('docs.gallery')} disabled={busy} onPress={() => void upload('gallery')} />
          <Button small variant="secondary" icon="document-attach-outline" title={t('docs.file')} loading={busy} disabled={busy} onPress={() => void upload('file')} />
        </Row>
      )}
    </View>
  );
}
