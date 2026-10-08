import { describe, expect, it } from 'vitest';
import { isAcceptablePassword, isFourPartName, normalizeEgyptianMobile, validateEgyptianNationalId } from './validators';

describe('validateEgyptianNationalId', () => {
  it('accepts a well-formed id and extracts the birth date', () => {
    expect(validateEgyptianNationalId('29003141201234')).toEqual({ valid: true, birthDate: '1990-03-14' });
  });
  it('rejects wrong length, century, date and governorate', () => {
    expect(validateEgyptianNationalId('2900314120123').reason).toBe('must_be_14_digits');
    expect(validateEgyptianNationalId('19003141201234').reason).toBe('invalid_century');
    expect(validateEgyptianNationalId('29002301201234').reason).toBe('invalid_birth_date');
    expect(validateEgyptianNationalId('29003149901234').reason).toBe('invalid_governorate');
  });
});

describe('normalizeEgyptianMobile', () => {
  it('normalizes local, international and Arabic-digit input', () => {
    expect(normalizeEgyptianMobile('0100 234 5678')).toBe('+201002345678');
    expect(normalizeEgyptianMobile('+201112345678')).toBe('+201112345678');
    expect(normalizeEgyptianMobile('00201551234567')).toBe('+201551234567');
    expect(normalizeEgyptianMobile('٠١٠٠٢٣٤٥٦٧٨')).toBe('+201002345678');
  });
  it('rejects non-mobile numbers', () => {
    expect(normalizeEgyptianMobile('0131234567')).toBeNull();
    expect(normalizeEgyptianMobile('01312345678')).toBeNull();
  });
});

describe('name and password rules', () => {
  it('requires a four-part name', () => {
    expect(isFourPartName('أحمد محمد عبدالله السيد')).toBe(true);
    expect(isFourPartName('أحمد محمد عبدالله')).toBe(false);
  });
  it('requires 8+ chars with letters and digits', () => {
    expect(isAcceptablePassword('abc12345')).toBe(true);
    expect(isAcceptablePassword('12345678')).toBe(false);
    expect(isAcceptablePassword('abc123')).toBe(false);
  });
});
