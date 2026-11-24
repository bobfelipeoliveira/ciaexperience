/**
 * Dados do módulo compartilhados entre as telas, atualizados em TEMPO REAL:
 * qualquer inclusão/alteração/cancelamento/reagendamento recarrega a lista e os alertas.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../../core/supabase';
import { friendlyError } from '../../../core/lib/errors';
import { useAuth } from '../../../core/auth/AuthProvider';
import type { UrineAlert, UrineRequest } from '../domain/types';
import { fetchAlerts, fetchModuleSettings, listRequests } from '../services/requests';

interface UrineData {
  rows: UrineRequest[];
  alerts: UrineAlert[];
  settings: Record<string, unknown>;
  loading: boolean;
  error: string | null;
  includeArchived: boolean;
  setIncludeArchived: (v: boolean) => void;
  reload: () => Promise<void>;
  byId: (id: string) => UrineRequest | undefined;
  lastUpdated: Date | null;
}

const Ctx = createContext<UrineData | null>(null);
export const useUrineData = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUrineData fora do provedor');
  return v;
};

export function UrineDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<UrineRequest[]>([]);
  const [alerts, setAlerts] = useState<UrineAlert[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const [r, a, s] = await Promise.all([listRequests(includeArchived), fetchAlerts(), fetchModuleSettings()]);
      setRows(r); setAlerts(a); setSettings(s); setError(null); setLastUpdated(new Date());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => { if (session) void reload(); }, [session, reload]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel('urine-requests-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'urine_collection_requests' }, () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void reload(), 600);
      })
      .subscribe();
    // alertas dependem do relógio (ex.: "amanhã" muda à meia-noite) → revalida a cada 5 min
    const iv = window.setInterval(() => void reload(), 5 * 60 * 1000);
    return () => { void supabase.removeChannel(ch); window.clearInterval(iv); window.clearTimeout(timer.current); };
  }, [session, reload]);

  const byId = useCallback((id: string) => rows.find((r) => r.id === id), [rows]);

  return (
    <Ctx.Provider value={{ rows, alerts, settings, loading, error, includeArchived, setIncludeArchived, reload, byId, lastUpdated }}>
      {children}
    </Ctx.Provider>
  );
}

export function settingNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(settings[key]);
  return Number.isFinite(v) ? v : fallback;
}
