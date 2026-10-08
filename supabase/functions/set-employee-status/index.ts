// Suspends or reactivates a staff member.
// Suspension: employees.status = 'suspended' (RLS stops treating them as staff immediately)
// + an auth ban so no new sessions/refreshes are possible.
import { adminClient, callerClient, handle, HttpError, json, requirePermission } from '../_shared/http.ts';

Deno.serve((req) =>
  handle(req, async (req) => {
    const { userId } = await requirePermission(req, 'employees', 'edit');
    const body = (await req.json()) as { employee_id?: string; status?: 'active' | 'suspended' };
    if (!body.employee_id || (body.status !== 'active' && body.status !== 'suspended')) {
      throw new HttpError(400, 'employee_id and status (active|suspended) are required');
    }

    // Update through the caller's client so RLS scope and the database guards
    // (no self-change, last super admin, super admin only) are enforced.
    const caller = callerClient(req);
    const { data: updated, error } = await caller
      .from('employees')
      .update({ status: body.status })
      .eq('id', body.employee_id)
      .select('profile_id')
      .maybeSingle();
    if (error) throw new HttpError(error.code === '42501' ? 403 : 400, error.message);
    if (!updated) throw new HttpError(403, 'forbidden');
    if (updated.profile_id === userId) throw new HttpError(403, 'you cannot change your own status');

    const admin = adminClient();
    const { error: banErr } = await admin.auth.admin.updateUserById(updated.profile_id, {
      ban_duration: body.status === 'suspended' ? '876000h' : 'none',
    });
    if (banErr) throw new HttpError(500, banErr.message);

    return json({ ok: true });
  }),
);
