import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import { fmtDateTime } from '../lib/dates';
import { Icon } from '../components/Icon';

export interface Notification { id: string; kind: string; severity: 'info' | 'warning' | 'critical'; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

interface Ctx { items: Notification[]; unread: number; reload: () => Promise<void>; markRead: (id?: string) => Promise<void>; remove: (id: string) => Promise<void> }
const NotifCtx = createContext<Ctx | null>(null);
export const useNotifications = () => useContext(NotifCtx)!;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const reload = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    setItems((data ?? []) as Notification[]);
  }, [session]);
  useEffect(() => {
    if (!session) return;
    void reload();
    const ch = supabase.channel('my-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => void reload())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session, reload]);
  const markRead = useCallback(async (id?: string) => {
    let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (id) q = q.eq('id', id);
    await q;
    await reload();
  }, [reload]);
  const remove = useCallback(async (id: string) => { await supabase.from('notifications').delete().eq('id', id); await reload(); }, [reload]);
  return <NotifCtx.Provider value={{ items, unread: items.filter((i) => !i.read_at).length, reload, markRead, remove }}>{children}</NotifCtx.Provider>;
}

export function NotificationsList() {
  const { items, markRead, remove, unread } = useNotifications();
  const nav = useNavigate();
  if (!items.length) return <p className="muted">Nenhuma notificação.</p>;
  return (
    <div className="stack-sm">
      {unread > 0 && <div><button className="btn btn-ghost btn-sm" onClick={() => void markRead()}><Icon name="check" size={16} /> Marcar todas como lidas</button></div>}
      {items.map((n) => (
        <div key={n.id} className={`alert ${n.severity === 'critical' ? 'critical' : n.severity === 'warning' ? 'warning' : 'info'}`} style={n.read_at ? { opacity: 0.65 } : undefined}>
          <Icon name={n.severity === 'info' ? 'bell' : 'alert'} />
          <div style={{ minWidth: 0 }}>
            <div className="alert-title">{n.title}{!n.read_at && <span className="badge b-pink no-dot" style={{ marginLeft: 8 }}>nova</span>}</div>
            {n.body && <div className="small">{n.body}</div>}
            <div className="small" style={{ opacity: 0.7 }}>{fmtDateTime(n.created_at)}</div>
          </div>
          <div className="alert-actions">
            {n.link && <button className="btn btn-secondary btn-sm" onClick={() => { void markRead(n.id); nav(n.link!); }}>Abrir</button>}
            {!n.read_at && <button className="btn btn-ghost btn-sm" onClick={() => void markRead(n.id)}>Lida</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => void remove(n.id)} aria-label="Remover"><Icon name="trash" size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
