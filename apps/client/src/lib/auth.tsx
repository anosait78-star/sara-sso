import { normalizeEgyptianMobile } from '@sso/shared';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clientEmail, invokeFunction, supabase } from './supabase';

export interface AccountStatus {
  user_type: 'staff' | 'client';
  full_name: string;
  must_change_password: boolean;
  customer_id: string | null;
  customer_no: string | null;
  customer_status: 'self_registered' | 'pending_link' | 'active' | 'inactive' | null;
  app_access: 'none' | 'active' | 'suspended' | null;
  link_status: 'pending' | 'approved' | 'rejected' | null;
}

/** Where the signed-in user belongs. */
export type Gate = 'loading' | 'signed_out' | 'change_password' | 'ready' | 'pending' | 'rejected' | 'suspended' | 'not_client';

interface AuthState {
  session: Session | null;
  status: AccountStatus | null;
  gate: Gate;
  signIn: (phone: string, password: string) => Promise<void>;
  register: (p: { full_name: string; national_id: string; phone: string; password: string; accept_terms: boolean }) => Promise<'registered' | 'pending_link'>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const statusQuery = useQuery({
    queryKey: ['me', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_account_status');
      if (error) throw error;
      return data as unknown as AccountStatus | null;
    },
  });
  const status = statusQuery.data ?? null;

  const gate: Gate = useMemo(() => {
    if (!ready || (session && statusQuery.isLoading)) return 'loading';
    if (!session) return 'signed_out';
    if (!status) return 'loading';
    if (status.user_type !== 'client') return 'not_client';
    if (status.must_change_password) return 'change_password';
    if (status.customer_id) return status.app_access === 'active' ? 'ready' : 'suspended';
    if (status.link_status === 'rejected') return 'rejected';
    return 'pending';
  }, [ready, session, status, statusQuery.isLoading]);

  const signIn = async (phone: string, password: string) => {
    const e164 = normalizeEgyptianMobile(phone);
    if (!e164) throw new Error('invalid_phone');
    const { error } = await supabase.auth.signInWithPassword({ email: clientEmail(e164), password });
    if (error) throw new Error(error.message.toLowerCase().includes('invalid') ? 'invalid_credentials' : error.message);
  };

  const value: AuthState = {
    session,
    status,
    gate,
    signIn,
    async register(p) {
      const res = await invokeFunction<{ status: 'registered' | 'pending_link' }>('client-register', p);
      await signIn(p.phone, p.password);
      return res.status;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async refresh() {
      await statusQuery.refetch();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Maps auth / Edge Function errors to translation keys. */
export function authErrorKey(e: unknown): string {
  const m = (e as Error)?.message ?? '';
  const map: Record<string, string> = {
    invalid_name: 'errors.invalidName', invalid_national_id: 'errors.invalidNationalId', invalid_phone: 'errors.invalidPhone',
    weak_password: 'errors.weakPassword', terms_required: 'errors.termsRequired', already_registered: 'errors.alreadyRegistered',
    invalid_credentials: 'errors.invalidCredentials',
  };
  if (map[m]) return map[m];
  if (/fetch|network/i.test(m)) return 'errors.network';
  return 'errors.generic';
}
