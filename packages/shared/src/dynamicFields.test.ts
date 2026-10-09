import { describe, expect, it } from 'vitest';
import { toSubmitValue, validateDynamicValue, type DynamicField } from './dynamicFields';

const f = (p: Partial<DynamicField>): DynamicField => ({ field_key: 'k', label_ar: 'حقل', field_type: 'text', is_required: true, filled_by: 'client', ...p });

describe('validateDynamicValue', () => {
  it('required vs optional empty values', () => {
    expect(validateDynamicValue(f({}), '')).toBe('required');
    expect(validateDynamicValue(f({ is_required: false }), '')).toBeNull();
  });
  it('numbers and money with bounds', () => {
    const capital = f({ field_type: 'money', validation: { min: 1000 } });
    expect(validateDynamicValue(capital, '50000')).toBeNull();
    expect(validateDynamicValue(capital, '10')).toBe('below_min');
    expect(validateDynamicValue(capital, '-5')).toBe('not_a_number');
    expect(validateDynamicValue(f({ field_type: 'number', validation: { max: 50 } }), 51)).toBe('above_max');
  });
  it('select / multiselect options', () => {
    const options = [{ value: 'trade', label_ar: 'تجارة' }, { value: 'it', label_ar: 'تقنية' }];
    expect(validateDynamicValue(f({ field_type: 'select', options }), 'trade')).toBeNull();
    expect(validateDynamicValue(f({ field_type: 'select', options }), 'x')).toBe('invalid_option');
    expect(validateDynamicValue(f({ field_type: 'multiselect', options }), ['trade', 'it'])).toBeNull();
    expect(validateDynamicValue(f({ field_type: 'multiselect', options }), ['trade', 'x'])).toBe('invalid_option');
  });
  it('formats', () => {
    expect(validateDynamicValue(f({ field_type: 'national_id' }), '29003141201234')).toBeNull();
    expect(validateDynamicValue(f({ field_type: 'national_id' }), '123')).toBe('invalid_national_id');
    expect(validateDynamicValue(f({ field_type: 'email' }), 'a@b.co')).toBeNull();
    expect(validateDynamicValue(f({ field_type: 'date' }), '2026-13-01')).toBe('invalid_date');
    expect(validateDynamicValue(f({ validation: { regex: '^\\d+$' } }), 'abc')).toBe('invalid_format');
  });
  it('normalises submit values', () => {
    expect(toSubmitValue(f({ field_type: 'money' }), '1500')).toBe(1500);
    expect(toSubmitValue(f({ field_type: 'phone' }), '0100 234 5678')).toBe('01002345678');
    expect(toSubmitValue(f({}), '  ')).toBeNull();
  });
});
