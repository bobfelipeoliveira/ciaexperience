import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { AlertBox, Badge, ConfirmDialog, ErrorBox, PageHeader, PageLoading, Tabs, TextArea, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { friendlyError } from '../lib/errors';
import { fmtDateTime } from '../lib/dates';
import { formatPhone } from '../lib/text';
import { useAuth, type Role } from '../auth/AuthProvider';

interface UserRow { id: string; full_name: string; email: string | null; phone: string | null; sector: string | null; status: string; status_reason: string | null; email_confirmed_at: string | null; created_at: string; approved_at: string | null; roles: { role: Role; module_key: string | null }[] }
const STATUS_LABEL: Record<string, [string, string]> = { pending: ['Aguardando aprovação', 'b-warn'], approved: ['Ativo', 'b-ok'], rejected: ['Recusado', 'b-neutral'], blocked: ['Bloqueado', 'b-crit'] };
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador master', coordenacao: 'Coordenação', tecnica: 'Técnica' };

export default function UsersPage() {
  const toast = useToast();
  const { access, session } = useAuth();
  const modules = (access?.modules ?? []).filter((m) => m.active);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'approved' | 'other'>('pending');
  const [action, setAction] = useState<{ u: UserRow; status: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) setError(friendlyError(error)); else { setUsers(data as UserRow[]); setError(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(u: UserRow, status: string, why?: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_set_user_status', { p_user: u.id, p_status: status, p_reason: why || null });
      if (error) throw error;
      // ao aprovar sem papel, concede "Técnica" no módulo principal (pode ser alterado em seguida)
      if (status === 'approved' && u.roles.length === 0 && modules[0]) {
        const r = await supabase.rpc('admin_set_user_role', { p_user: u.id, p_role: 'tecnica', p_module: modules[0].key, p_grant: true });
        if (r.error) throw r.error;
      }
      toast('success', 'Usuário atualizado.');
      setAction(null); setReason('');
      await load();
    } catch (e) { toast('error', friendlyError(e)); } finally { setBusy(false); }
  }

  async function toggleRole(u: UserRow, role: Role, module: string | null, grant: boolean) {
    const { error } = await supabase.rpc('admin_set_user_role', { p_user: u.id, p_role: role, p_module: module, p_grant: grant });
    if (error) toast('error', friendlyError(error)); else { toast('success', grant ? 'Perfil concedido.' : 'Perfil removido.'); await load(); }
  }

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!users) return <PageLoading />;
  const list = users.filter((u) => (tab === 'pending' ? u.status === 'pending' : tab === 'approved' ? u.status === 'approved' : ['blocked', 'rejected'].includes(u.status)));
  const pendingCount = users.filter((u) => u.status === 'pending').length;

  return (
    <div className="stack">
      <PageHeader title="Usuários e acessos" subtitle="Aprove cadastros, atribua perfis e bloqueie acessos. As permissões são aplicadas pelo banco de dados." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'pending', label: `Aguardando aprovação${pendingCount ? ` (${pendingCount})` : ''}` },
        { value: 'approved', label: 'Ativos' }, { value: 'other', label: 'Bloqueados / recusados' }]} />
      {list.length === 0 && <p className="muted">Nenhum usuário nesta lista.</p>}
      <div className="stack-sm">
        {list.map((u) => {
          const [stLabel, stTone] = STATUS_LABEL[u.status] ?? [u.status, 'b-neutral'];
          const isSelf = u.id === session?.user.id;
          const has = (role: Role, m: string | null) => u.roles.some((r) => r.role === role && (r.module_key ?? null) === m);
          return (
            <section key={u.id} className="card stack-sm">
              <div className="row-between">
                <div>
                  <b>{u.full_name}</b> {isSelf && <span className="muted small">(você)</span>}
                  <div className="muted small">{u.email} · {u.phone ? formatPhone(u.phone) : 'sem telefone'} · {u.sector ?? 'sem setor'}</div>
                  <div className="muted small">Cadastro: {fmtDateTime(u.created_at)} · E-mail {u.email_confirmed_at ? 'confirmado' : <b>NÃO confirmado</b>}{u.status_reason ? ` · Motivo: ${u.status_reason}` : ''}</div>
                </div>
                <div className="row"><Badge tone={stTone}>{stLabel}</Badge>{u.roles.map((r, i) => <Badge key={i} tone="b-wine">{ROLE_LABEL[r.role]}{r.module_key ? ` · ${modules.find((m) => m.key === r.module_key)?.name ?? r.module_key}` : ''}</Badge>)}</div>
              </div>
              <div className="row">
                {u.status !== 'approved' && <button className="btn btn-primary btn-sm" disabled={!u.email_confirmed_at || busy} title={!u.email_confirmed_at ? 'Aguardando confirmação do e-mail' : ''} onClick={() => void setStatus(u, 'approved')}><Icon name="check" size={16} /> Aprovar</button>}
                {u.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => setAction({ u, status: 'rejected' })}>Recusar</button>}
                {u.status === 'approved' && !isSelf && <button className="btn btn-secondary btn-sm" onClick={() => setAction({ u, status: 'blocked' })}><Icon name="lock" size={16} /> Bloquear</button>}
              </div>
              {u.status === 'approved' && (
                <div className="row small" style={{ borderTop: '1px solid var(--line-200)', paddingTop: 10 }}>
                  <b>Perfis:</b>
                  {modules.map((m) => (['tecnica', 'coordenacao'] as Role[]).map((role) => (
                    <label key={m.key + role} className="row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={has(role, m.key)} onChange={(e) => void toggleRole(u, role, m.key, e.target.checked)} style={{ width: 20, height: 20 }} />
                      {ROLE_LABEL[role]} · {m.name}
                    </label>
                  )))}
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={has('admin', null)} disabled={isSelf} onChange={(e) => void toggleRole(u, 'admin', null, e.target.checked)} style={{ width: 20, height: 20 }} />
                    Administrador master
                  </label>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <AlertBox kind="info">Novos cadastros recebem automaticamente o perfil <b>Técnica</b> ao serem aprovados. Ajuste os perfis logo depois, se necessário.</AlertBox>
      {action && (
        <ConfirmDialog danger title={action.status === 'blocked' ? 'Bloquear acesso?' : 'Recusar cadastro?'} confirmLabel={action.status === 'blocked' ? 'Bloquear' : 'Recusar'} busy={busy}
          message={<><b>{action.u.full_name}</b> perderá o acesso imediatamente.</>} onCancel={() => setAction(null)} onConfirm={() => void setStatus(action.u, action.status, reason)}>
          <TextArea label="Motivo (opcional, visível para o usuário)" value={reason} onChange={setReason} rows={2} maxLength={500} />
        </ConfirmDialog>
      )}
    </div>
  );
}
