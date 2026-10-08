// Invites a staff member: creates the auth user, profile (via trigger) and employee row.
// method "password": returns a one-time temporary password (must be changed at first sign-in).
// method "email":    sends Supabase's invitation email (needs SMTP configured in production).
import { adminClient, handle, HttpError, json, requirePermission, tempPassword } from '../_shared/http.ts';

interface Body {
  full_name?: string;
  email?: string;
  role_id?: string;
  department_id?: string | null;
  job_title?: string | null;
  method?: 'password' | 'email';
}

Deno.serve((req) =>
  handle(req, async (req) => {
    const { userId, isSuperAdmin } = await requirePermission(req, 'employees', 'create');
    const body = (await req.json()) as Body;
    const fullName = body.full_name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    if (fullName.length < 3) throw new HttpError(400, 'full_name is required');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'valid email is required');
    if (!body.role_id) throw new HttpError(400, 'role_id is required');

    const admin = adminClient();
    const { data: role } = await admin.from('roles').select('id, key').eq('id', body.role_id).maybeSingle();
    if (!role) throw new HttpError(400, 'unknown role');
    if (role.key === 'super_admin' && !isSuperAdmin) throw new HttpError(403, 'only a super admin can assign the super admin role');

    const appMeta = { user_type: 'staff', full_name: fullName };
    let newUserId: string;
    let password: string | undefined;

    if (body.method === 'email') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: {} });
      if (error) throw new HttpError(error.status === 422 ? 409 : 400, error.message);
      newUserId = data.user.id;
      // invite does not accept app_metadata; set it right after creation
      await admin.auth.admin.updateUserById(newUserId, { app_metadata: appMeta });
      await admin.from('profiles').update({ user_type: 'staff', full_name: fullName }).eq('id', newUserId);
    } else {
      password = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { ...appMeta, must_change_password: true },
      });
      if (error) throw new HttpError(error.status === 422 ? 409 : 400, error.message);
      newUserId = data.user.id;
    }

    const { data: emp, error: empErr } = await admin
      .from('employees')
      .insert({
        profile_id: newUserId,
        role_id: role.id,
        department_id: body.department_id ?? null,
        job_title: body.job_title ?? null,
        status: body.method === 'email' ? 'invited' : 'active',
        created_by: userId,
      })
      .select('id')
      .single();
    if (empErr) {
      await admin.auth.admin.deleteUser(newUserId); // keep auth and employees consistent
      throw new HttpError(400, empErr.message);
    }

    return json({ employee_id: emp.id, temp_password: password });
  }),
);
