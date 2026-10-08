import type { Session } from '@supabase/supabase-js';
import { toPermissionMap, type PermissionGrant, type PermissionScope } from '@sso/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export interface StaffContext {
  employee_id: string;
  employee_no: string | null;
  full_name: string;
  email: string | null;
  locale: string;
  must_change_password: boolean;
  role_key: string;
  role_name_ar: string;
  role_name_en: string | null;
  department_id: string | null;
  department_name_ar: string | null;
}

interface AuthState {
  session: Session | null;
  sessionLoading: boolean;
  staff: StaffContext | null;
  staffLoading: boolean;
  permissions: Map<string, PermissionScope>;
  can: (module: string, action: string) => boolean;
  scopeOf: (module: string, action: string) => PermissionScope | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      qc.removeQueries({ queryKey: ['me'] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id;

  const staffQuery = useQuery({
    queryKey: ['me', 'staff', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_staff_context');
      if (error) throw error;
      return ((data as StaffContext[] | null) ?? [])[0] ?? null;
    },
  });

  const permQuery = useQuery({
    queryKey: ['me', 'permissions', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_permissions');
      if (error) throw error;
      return toPermissionMap((data as PermissionGrant[] | null) ?? []);
    },
  });

  const value = useMemo<AuthState>(() => {
    const permissions = permQuery.data ?? new Map<string, PermissionScope>();
    return {
      session,
      sessionLoading,
      staff: staffQuery.data ?? null,
      staffLoading: !!userId && (staffQuery.isLoading || permQuery.isLoading),
      permissions,
      // UI-only convenience: the database enforces the real rules through RLS.
      can: (m, a) => permissions.has(`${m}.${a}`),
      scopeOf: (m, a) => permissions.get(`${m}.${a}`) ?? null,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ['me'] });
      },
      signOut: async () => {
        await supabase.auth.signOut();
        qc.clear();
      },
    };
  }, [session, sessionLoading, staffQuery.data, staffQuery.isLoading, permQuery.data, permQuery.isLoading, userId, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
