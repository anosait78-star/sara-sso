// Client self-registration from the app (PROJECT_PLAN §5.2) — no SMS / OTP.
// 1. validates the 4-part name, national ID, Egyptian mobile and password
// 2. creates the auth user with the internal e-mail derived from the phone
// 3. register_client_account(): new customer (self_registered), or a pending link request when the
//    phone / national ID belongs to a customer created by the staff (never linked automatically)
import { adminClient, handle, HttpError, json } from '../_shared/http.ts';
import { isAcceptablePassword, isFourPartName, normalizeEgyptianMobile, validateEgyptianNationalId } from '../_shared/validators.ts';

interface Body {
  full_name?: string;
  national_id?: string;
  phone?: string;
  password?: string;
  accept_terms?: boolean;
}

/** +201002345678 -> 201002345678@clients.sso.internal (same rule as the apps). */
export function clientEmail(phone: string) {
  return `${phone.replace(/\D/g, '')}@clients.sso.internal`;
}

Deno.serve((req) =>
  handle(req, async (req) => {
    const body = (await req.json()) as Body;
    const fullName = (body.full_name ?? '').trim().replace(/\s+/g, ' ');
    const nationalId = (body.national_id ?? '').trim();
    const phone = normalizeEgyptianMobile(body.phone ?? '');
    const password = body.password ?? '';

    if (!isFourPartName(fullName)) throw new HttpError(400, 'invalid_name');
    if (!validateEgyptianNationalId(nationalId).valid) throw new HttpError(400, 'invalid_national_id');
    if (!phone) throw new HttpError(400, 'invalid_phone');
    if (!isAcceptablePassword(password)) throw new HttpError(400, 'weak_password');
    if (body.accept_terms !== true) throw new HttpError(400, 'terms_required');

    const admin = adminClient();
    const { data: check, error: checkErr } = await admin.rpc('check_client_registration', { p_phone: phone, p_national_id: nationalId });
    if (checkErr) throw new HttpError(500, checkErr.message);
    if (check === 'registered') throw new HttpError(409, 'already_registered');

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: clientEmail(phone),
      password,
      email_confirm: true,
      app_metadata: { user_type: 'client', full_name: fullName },
    });
    if (createErr) throw new HttpError(createErr.status === 422 ? 409 : 400, createErr.status === 422 ? 'already_registered' : createErr.message);

    const { data: result, error: regErr } = await admin.rpc('register_client_account', {
      p_user_id: created.user.id, p_full_name: fullName, p_national_id: nationalId, p_phone: phone,
    });
    if (regErr) {
      await admin.auth.admin.deleteUser(created.user.id); // keep auth and customers consistent
      throw new HttpError(regErr.code === '23505' ? 409 : 400, regErr.code === '23505' ? 'already_registered' : regErr.message);
    }
    return json(result);
  }),
);
