// Shared helpers for Edge Functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Service-role client — server side only, never sent to a browser or app. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the caller (RLS applies), built from the request's Authorization header. */
export function callerClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'missing authorization');
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Ensures the caller is active staff holding module.action; returns the caller's user id. */
export async function requirePermission(req: Request, module: string, action: string): Promise<{ userId: string; isSuperAdmin: boolean }> {
  const caller = callerClient(req);
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) throw new HttpError(401, 'invalid session');

  const { data: ctx } = await caller.rpc('get_my_staff_context');
  const staff = (ctx as { role_key: string }[] | null)?.[0];
  if (!staff) throw new HttpError(403, 'forbidden');

  const { data: perms, error } = await caller.rpc('get_my_permissions');
  if (error) throw new HttpError(500, error.message);
  const ok = (perms as { module: string; action: string }[]).some((p) => p.module === module && p.action === action);
  if (!ok) throw new HttpError(403, 'forbidden');
  return { userId: userData.user.id, isSuperAdmin: staff.role_key === 'super_admin' };
}

export async function handle(req: Request, fn: (req: Request) => Promise<Response>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    return await fn(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'internal error' }, 500);
  }
}

/** Readable temporary password: 3 groups, letters + digits, no ambiguous characters. */
export function tempPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join('');
  return `${pick(letters, 3)}${pick(digits, 2)}-${pick(letters + digits, 4)}`;
}
