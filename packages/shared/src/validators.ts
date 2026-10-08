// Validators shared by the admin and client apps.

/** Egyptian national ID: 14 digits = century(2|3) + YYMMDD + governorate(2) + serial(4) + check(1). */
export function validateEgyptianNationalId(input: string): { valid: boolean; reason?: string; birthDate?: string } {
  const id = input.trim();
  if (!/^\d{14}$/.test(id)) return { valid: false, reason: 'must_be_14_digits' };
  const century = id[0] === '2' ? 1900 : id[0] === '3' ? 2000 : null;
  if (!century) return { valid: false, reason: 'invalid_century' };
  const year = century + Number(id.slice(1, 3));
  const month = Number(id.slice(3, 5));
  const day = Number(id.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { valid: false, reason: 'invalid_birth_date' };
  }
  if (date.getTime() > Date.now()) return { valid: false, reason: 'birth_date_in_future' };
  const gov = Number(id.slice(7, 9));
  const validGov = new Set([1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 88]);
  if (!validGov.has(gov)) return { valid: false, reason: 'invalid_governorate' };
  return { valid: true, birthDate: date.toISOString().slice(0, 10) };
}

/** Normalizes an Egyptian mobile number to E.164 (+201xxxxxxxxx). Returns null when invalid. */
export function normalizeEgyptianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let local: string | null = null;
  if (/^01[0125]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^\+?201[0125]\d{8}$/.test(digits)) local = digits.replace(/^\+?20/, '');
  else if (/^00201[0125]\d{8}$/.test(digits)) local = digits.slice(4);
  return local ? `+20${local}` : null;
}

/** Full Arabic/Latin name with at least four parts ("الاسم رباعي"). */
export function isFourPartName(input: string): boolean {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 4 && parts.every((p) => /^[\p{L}'ـ-]+$/u.test(p));
}

/** Matches Supabase auth settings: at least 8 chars, letters and digits. */
export function isAcceptablePassword(input: string): boolean {
  return input.length >= 8 && /\p{L}/u.test(input) && /\d/.test(input);
}
