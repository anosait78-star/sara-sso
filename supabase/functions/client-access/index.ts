// Client app account management from the admin (PROJECT_PLAN §5.2) — customers.manage_access only.
//   reset_password: one-time temporary password, forced change at next sign-in (never stored)
//   suspend / activate: app_access + auth ban (ends sessions)
import { adminClient, callerClient, handle, HttpError, json, requirePermission, tempPassword } from '../_shared/http.ts';

interface Body {
  customer_id?: string;
  action?: 'reset_password' | 'suspend' | 'activate';
}

Deno.serve((req) =>
  handle(req, async (req) => {
    await requirePermission(req, 'customers', 'manage_access');
    const body = (await req.json()) as Body;
    if (!body.customer_id || !['reset_password', 'suspend', 'activate'].includes(body.action ?? '')) {
      throw new HttpError(400, 'customer_id and action (reset_password|suspend|activate) are required');
    }

    // Read and change the customer through the caller's client: RLS scope + database guards apply,
    // and the audit log records the employee as the actor.
    const caller = callerClient(req);
    const { data: customer } = await caller.from('customers').select('id, user_id').eq('id', body.customer_id).maybeSingle();
    if (!customer) throw new HttpError(403, 'forbidden');
    if (!customer.user_id) throw new HttpError(400, 'customer has no app account');

    const admin = adminClient();
    if (body.action === 'reset_password') {
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(customer.user_id, { password, app_metadata: { must_change_password: true } });
      if (error) throw new HttpError(500, error.message);
      const { error: logErr } = await caller.rpc('log_client_access_change', { p_customer_id: customer.id, p_action: 'password_reset' });
      if (logErr) throw new HttpError(400, logErr.message);
      return json({ temp_password: password });
    }

    const suspend = body.action === 'suspend';
    const { error: updErr } = await caller.from('customers').update({ app_access: suspend ? 'suspended' : 'active' }).eq('id', customer.id);
    if (updErr) throw new HttpError(updErr.code === '42501' ? 403 : 400, updErr.message);
    const { error: banErr } = await admin.auth.admin.updateUserById(customer.user_id, { ban_duration: suspend ? '876000h' : 'none' });
    if (banErr) throw new HttpError(500, banErr.message);
    await caller.rpc('log_client_access_change', { p_customer_id: customer.id, p_action: suspend ? 'suspend' : 'activate' });
    return json({ ok: true });
  }),
);
