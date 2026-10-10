import { toSubmitValue, validateDynamicValue, type DynamicField, type DynamicFieldError, type DynamicValue } from '@sso/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';
import { useLocale } from '@/i18n';
import { Button, colors, Field, font, Input, Row, T } from './ui';

type Values = Record<string, DynamicValue>;

/** Client-side form for the fields the client fills in a step (validated with the shared rules, then by the server). */
export function DynamicFields({ fields, initial, saving, onSave }: { fields: DynamicField[]; initial: Values; saving?: boolean; onSave: (v: Values) => void }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const key = JSON.stringify(initial);
  const [values, setValues] = useState<Values>(initial);
  const [tried, setTried] = useState(false);
  useEffect(() => setValues(JSON.parse(key) as Values), [key]);

  const errors: Record<string, DynamicFieldError> = {};
  for (const f of fields) {
    const e = validateDynamicValue({ ...f, is_required: false }, values[f.field_key]);
    if (e) errors[f.field_key] = e;
  }
  const dirty = JSON.stringify(values) !== key;
  const label = (f: { label_ar: string; label_en?: string | null }) => (locale === 'en' ? f.label_en || f.label_ar : f.label_ar);

  return (
    <View style={{ gap: 12 }}>
      {fields.map((f) => {
        const v = values[f.field_key];
        const set = (x: DynamicValue) => setValues((o) => ({ ...o, [f.field_key]: x }));
        const err = tried && errors[f.field_key] ? t(`dynamic.errors.${errors[f.field_key]}`, { min: f.validation?.min, max: f.validation?.max }) : null;
        return (
          <Field key={f.field_key} label={`${label(f)}${f.is_required ? ' *' : ''}`} hint={f.help_text ?? undefined} error={err}>
            {f.field_type === 'select' || f.field_type === 'multiselect' ? (
              <Row wrap>
                {(f.options ?? []).map((o) => {
                  const arr = Array.isArray(v) ? v : [];
                  const on = f.field_type === 'select' ? v === o.value : arr.includes(o.value);
                  return (
                    <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }}
                      onPress={() => set(f.field_type === 'select' ? o.value : on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                      style={{ height: 38, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1,
                        borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand50 : '#fff' }}>
                      <T v="label" style={{ color: on ? colors.brand : colors.ink2, fontFamily: font.semibold }}>{label(o)}</T>
                    </Pressable>
                  );
                })}
              </Row>
            ) : f.field_type === 'checkbox' ? (
              <Switch value={v === true} onValueChange={set} trackColor={{ true: colors.brand, false: '#cbd5e3' }} />
            ) : (
              <Input
                value={v === null || v === undefined ? '' : String(v)}
                onChangeText={(x) => set(x)}
                multiline={f.field_type === 'textarea'}
                ltr={['number', 'money', 'phone', 'email', 'national_id', 'date'].includes(f.field_type) ? true : undefined}
                keyboardType={f.field_type === 'number' || f.field_type === 'money' || f.field_type === 'national_id' ? 'numeric'
                  : f.field_type === 'phone' ? 'phone-pad' : f.field_type === 'email' ? 'email-address' : 'default'}
                placeholder={f.field_type === 'date' ? 'YYYY-MM-DD' : f.field_type === 'money' ? 'EGP' : undefined}
                invalid={!!err}
              />
            )}
          </Field>
        );
      })}
      <Button title={t('requests.saveData')} small variant="secondary" icon="save-outline" loading={saving} disabled={!dirty}
        onPress={() => {
          setTried(true);
          if (Object.keys(errors).length) return;
          const out: Values = {};
          const before = JSON.parse(key) as Values;
          for (const f of fields) {
            if (JSON.stringify(values[f.field_key] ?? null) !== JSON.stringify(before[f.field_key] ?? null)) out[f.field_key] = toSubmitValue(f, values[f.field_key]);
          }
          onSave(out);
        }} />
    </View>
  );
}
