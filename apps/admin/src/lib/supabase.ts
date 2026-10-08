import { createClient } from '@supabase/supabase-js';
import type { Database } from '@sso/shared';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy apps/admin/.env.example to .env.local');
}

// Only the public anon key is used here. Authorization is enforced by RLS in the database.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sso-admin-auth' },
});

/** Calls an Edge Function with the current user's JWT and returns its JSON or throws a readable error. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const payload = (await ctx.json()) as { error?: string };
        if (payload.error) message = payload.error;
      }
    } catch {
      /* keep original message */
    }
    throw new Error(message);
  }
  return data as T;
}
