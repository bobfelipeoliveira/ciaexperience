/**
 * Sessão e perfil do usuário logado.
 * IMPORTANTE: estas verificações servem apenas para montar a tela. Quem
 * realmente autoriza ou bloqueia cada ação é o banco (RLS).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { appConfig } from '../config';

export type Role = 'admin' | 'coordenacao' | 'tecnica';
export interface Profile {
  id: string; full_name: string; email: string | null; phone: string | null; sector_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'blocked'; status_reason: string | null; email_confirmed_at: string | null;
}
export interface ModuleRow { key: string; name: string; active: boolean; sort_order: number }
export interface Access { profile: Profile | null; sector: string | null; roles: { role: Role; module_key: string | null }[]; modules: ModuleRow[] }

interface AuthState {
  ready: boolean;
  session: Session | null;
  access: Access | null;
  accessError: string | null;
  recoveryMode: boolean;
  clearRecovery: () => void;
  refreshAccess: () => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  hasRole: (module: string, roles: Role[]) => boolean;
  primaryRoleLabel: string;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const loggedFor = useRef<string | null>(null);

  const loadAccess = useCallback(async (s: Session | null) => {
    if (!s) { setAccess(null); return; }
    const { data, error } = await supabase.rpc('my_access');
    if (error) { setAccessError(error.message); setAccess(null); return; }
    setAccessError(null);
    setAccess(data as Access);
  }, []);

  useEffect(() => {
    if (!appConfig.isConfigured) { setReady(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadAccess(data.session);
      setReady(true);
      // limpa ?code= da URL após a troca do código (link de e-mail)
      if (/[?&](code|error)=/.test(window.location.search)) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') { setAccess(null); loggedFor.current = null; }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // fora do callback para evitar bloqueio interno do supabase-js
        setTimeout(() => loadAccess(s), 0);
        if (event === 'SIGNED_IN' && s && loggedFor.current !== s.user.id) {
          loggedFor.current = s.user.id;
          setTimeout(() => { void supabase.rpc('log_session_event', { p_action: 'LOGIN' }); }, 0);
        }
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadAccess]);

  const signOut = useCallback(async () => {
    try { await supabase.rpc('log_session_event', { p_action: 'LOGOUT' }); } catch { /* sem conexão: segue o logout */ }
    await supabase.auth.signOut();
    setAccess(null);
  }, []);

  // Logout automático após inatividade
  useEffect(() => {
    if (!session) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void signOut(); }, appConfig.idleLogoutMinutes * 60 * 1000);
    };
    const evs = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { window.clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [session, signOut]);

  const value = useMemo<AuthState>(() => {
    const roles = access?.roles ?? [];
    const approved = access?.profile?.status === 'approved';
    const isAdmin = approved && roles.some((r) => r.role === 'admin');
    const activeModules = new Set((access?.modules ?? []).filter((m) => m.active).map((m) => m.key));
    const hasRole = (module: string, rs: Role[]) =>
      isAdmin || (approved && activeModules.has(module) && roles.some((r) => r.module_key === module && rs.includes(r.role)));
    const primaryRoleLabel = isAdmin ? 'Administrador(a) master'
      : roles.some((r) => r.role === 'coordenacao') ? 'Coordenação'
      : roles.some((r) => r.role === 'tecnica') ? 'Técnica de enfermagem' : 'Sem perfil';
    return {
      ready, session, access, accessError, recoveryMode, clearRecovery: () => setRecoveryMode(false),
      refreshAccess: () => loadAccess(session), signOut, isAdmin, hasRole, primaryRoleLabel,
    };
  }, [ready, session, access, accessError, recoveryMode, loadAccess, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** URL base do site (usada nos links enviados por e-mail). */
export function siteBaseUrl(): string {
  return window.location.origin + window.location.pathname;
}
