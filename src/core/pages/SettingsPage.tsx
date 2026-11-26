import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { AlertBox, ErrorBox, PageHeader, SelectInput, Spinner, Tabs, TextInput, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { friendlyError } from '../lib/errors';
import { fmtDateTime } from '../lib/dates';
import { useAuth } from '../auth/AuthProvider';
import { findCity, findNeighborhood } from '../../modules/urine-collection/geo/gazetteer';

type Tab = 'perfil' | 'operacao' | 'setores' | 'auditoria' | 'privacidade';

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('perfil');
  const tabs: { value: Tab; label: string }[] = [{ value: 'perfil', label: 'Meu perfil' }, { value: 'operacao', label: 'Regras da operação' }];
  if (isAdmin) tabs.push({ value: 'setores', label: 'Setores' }, { value: 'auditoria', label: 'Auditoria' });
  tabs.push({ value: 'privacidade', label: 'Privacidade e segurança' });
  return (
    <div className="stack">
      <PageHeader title="Configurações" actions={isAdmin ? <Link className="btn btn-secondary" to="/importacao"><Icon name="upload" size={18} /> Importar planilha</Link> : undefined} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'perfil' && <ProfileTab />}
      {tab === 'operacao' && <OperationTab />}
      {tab === 'setores' && isAdmin && <SectorsTab />}
      {tab === 'auditoria' && isAdmin && <AuditTab />}
      {tab === 'privacidade' && <PrivacyTab />}
    </div>
  );
}

function ProfileTab() {
  const { access, refreshAccess, session, primaryRoleLabel } = useAuth();
  const toast = useToast();
  const p = access?.profile;
  const [name, setName] = useState(p?.full_name ?? '');
  const [phone, setPhone] = useState(p?.phone ?? '');
  const [sector, setSector] = useState(p?.sector_id ?? '');
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('sectors').select('id,name').eq('active', true).order('name').then(({ data }) => setSectors(data ?? [])); }, []);
  async function save() {
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null, sector_id: sector || null }).eq('id', session!.user.id);
    setBusy(false);
    if (error) toast('error', friendlyError(error)); else { toast('success', 'Perfil atualizado.'); await refreshAccess(); }
  }
  return (
    <section className="card stack" style={{ maxWidth: 720 }}>
      <AlertBox kind="info">Perfil de acesso: <b>{primaryRoleLabel}</b>. Somente a administração altera perfis e permissões.</AlertBox>
      <TextInput label="Nome completo" value={name} onChange={setName} maxLength={150} />
      <div className="grid-2">
        <TextInput label="Telefone" value={phone} onChange={setPhone} maxLength={30} inputMode="tel" />
        <SelectInput label="Setor" value={sector} onChange={setSector} options={sectors.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <TextInput label="E-mail" value={session?.user.email ?? ''} onChange={() => {}} disabled hint="Para alterar o e-mail, procure a administração." />
      <div><button className="btn btn-primary" disabled={busy || name.trim().length < 3} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
    </section>
  );
}

const SETTINGS: { key: string; label: string; hint: string; type: 'number' | 'bool' | 'email' | 'time' }[] = [
  { key: 'urine.route_max_stops', label: 'Rotas: máximo de coletas por rota', hint: 'Pequenas rotas de urina (padrão 4).', type: 'number' },
  { key: 'urine.route_start_time', label: 'Rotas: horário de saída da base', hint: 'Ex.: 07:30.', type: 'time' },
  { key: 'urine.route_deadline', label: 'Rotas: horário-limite para terminar', hint: 'Prazo de entrega no laboratório (ex.: 11:00). Rotas que passam disso são divididas.', type: 'time' },
  { key: 'urine.volume_alert_threshold', label: 'Limite do alerta de volume (coletas para amanhã)', hint: 'Alerta quando houver MAIS que este número.', type: 'number' },
  { key: 'urine.stale_hours', label: 'Horas sem atualização para alertar', hint: 'Solicitações em aberto sem nenhuma alteração.', type: 'number' },
  { key: 'urine.proximity_km', label: 'Distância para sugerir agrupamento (km)', hint: 'Linha reta entre centros de bairro.', type: 'number' },
  { key: 'urine.service_minutes', label: 'Tempo estimado por coleta (min)', hint: 'Usado nas estimativas logísticas.', type: 'number' },
  { key: 'urine.avg_speed_kmh', label: 'Velocidade média urbana (km/h)', hint: 'Usada nas estimativas de deslocamento.', type: 'number' },
  { key: 'urine.tecnica_can_edit_all', label: 'Técnicas podem editar solicitações de outras pessoas', hint: 'Desligado: cada técnica edita apenas o que registrou.', type: 'bool' },
  { key: 'admin_notification_email', label: 'E-mail para aviso de novos cadastros', hint: 'Usado pela função opcional de e-mail (ver README). O aviso dentro do sistema funciona sempre.', type: 'email' },
];

function OperationTab() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('system_settings').select('key,value');
    if (error) setError(friendlyError(error)); else setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(key: string, raw: unknown) {
    // o banco não aceita valor nulo: "vazio" é gravado como {} (base) ou "" (textos)
    const value = raw === null || raw === undefined ? (key === 'urine.route_base' ? {} : '') : raw;
    const { error, count } = await supabase.from('system_settings').update({ value }, { count: 'exact' }).eq('key', key);
    if (error || !count) toast('error', error ? friendlyError(error) : 'Sem permissão.'); else { toast('success', 'Configuração salva.'); await load(); }
  }
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!values) return <Spinner />;
  return (
    <section className="card stack" style={{ maxWidth: 820 }}>
      {!isAdmin && <AlertBox kind="info">Somente administradores alteram estas regras.</AlertBox>}
      <RouteBaseSetting value={(values['urine.route_base'] as BaseValue | null)?.lat !== undefined ? values['urine.route_base'] as BaseValue : null} disabled={!isAdmin} onSave={(v) => void save('urine.route_base', v)} />
      {SETTINGS.map((s) => <SettingRow key={s.key} def={s} value={values[s.key]} disabled={!isAdmin} onSave={(v) => void save(s.key, v)} />)}
    </section>
  );
}

type BaseValue = { label: string; lat: number; lng: number };
/** Base de saída das rotas: por bairro/cidade (base local) ou coordenadas. */
function RouteBaseSetting({ value, disabled, onSave }: { value: BaseValue | null; disabled: boolean; onSave: (v: BaseValue | null) => void }) {
  const [text, setText] = useState(value?.label ?? '');
  const [coord, setCoord] = useState(value ? `${value.lat}, ${value.lng}` : '');
  useEffect(() => { setText(value?.label ?? ''); setCoord(value ? `${value.lat}, ${value.lng}` : ''); }, [value]);
  const m = coord.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
  const manual = m ? { lat: Number(m[1].replace(',', '.')), lng: Number(m[2].replace(',', '.')) } : null;
  const parts = text.split(/[,–-]/).map((x) => x.trim()).filter(Boolean);
  const place = findNeighborhood(parts[0], parts[1]) ?? findCity(parts[parts.length - 1]);
  const result = manual && manual.lat > -24 && manual.lat < -20 && manual.lng > -45.5 && manual.lng < -40.5 ? { ...manual, src: 'coordenadas informadas' } : place ? { lat: place.lat, lng: place.lng, src: `centro aproximado de ${place.name}` } : null;
  return (
    <div className="stack-sm" style={{ borderBottom: '1px solid var(--line-200)', paddingBottom: 14 }}>
      <b>Rotas: base de saída (sede da Solar)</b>
      <div className="grid-2">
        <TextInput label="Nome / bairro da base" value={text} onChange={setText} disabled={disabled} placeholder="Ex.: Sede Solar — Tijuca, Rio de Janeiro" hint="Use o bairro e a cidade; a posição é aproximada pelo bairro." />
        <TextInput label="Coordenadas exatas (opcional)" value={coord} onChange={setCoord} disabled={disabled} placeholder="-22.9250, -43.2330" hint="Botão direito no Google Maps → copiar coordenadas." />
      </div>
      <div className="row-between small">
        <span className="muted">{result ? `Posição: ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)} (${result.src})` : value ? `Atual: ${value.label}` : 'Base ainda não configurada.'}</span>
        {!disabled && (
          <div className="row">
            {value && <button className="btn btn-ghost btn-sm" onClick={() => onSave(null)}>Remover base</button>}
            <button className="btn btn-secondary btn-sm" disabled={!result || !text.trim()} onClick={() => result && onSave({ label: text.trim().slice(0, 120), lat: Number(result.lat.toFixed(6)), lng: Number(result.lng.toFixed(6)) })}>Salvar base</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingRow({ def, value, disabled, onSave }: { def: (typeof SETTINGS)[number]; value: unknown; disabled: boolean; onSave: (v: unknown) => void }) {
  const [v, setV] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => setV(value === null || value === undefined ? '' : String(value)), [value]);
  const valid = def.type === 'time' ? /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
    : def.type === 'number' ? /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 && Number(v) < 10000
    : def.type === 'email' ? v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : true;
  const parsed = def.type === 'number' ? Number(v) : def.type === 'bool' ? v === 'true' : v === '' ? null : v.trim().toLowerCase();
  return (
    <div className="row" style={{ alignItems: 'flex-end', borderBottom: '1px solid var(--line-200)', paddingBottom: 14 }}>
      <div style={{ flex: '1 1 300px' }}>
        {def.type === 'bool' ? (
          <SelectInput label={def.label} value={v} onChange={setV} options={[{ value: 'false', label: 'Não' }, { value: 'true', label: 'Sim' }]} hint={def.hint} />
        ) : (
          <TextInput label={def.label} value={v} onChange={setV} type={def.type === 'number' ? 'number' : def.type === 'time' ? 'time' : 'email'} hint={def.hint} disabled={disabled} error={!valid ? 'Valor inválido.' : null} />
        )}
      </div>
      {!disabled && <button className="btn btn-secondary" disabled={!valid || String(parsed ?? '') === String(value ?? '')} onClick={() => onSave(parsed)}>Salvar</button>}
    </div>
  );
}

function SectorsTab() {
  const toast = useToast();
  const [rows, setRows] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [name, setName] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('sectors').select('id,name,active').order('name'); setRows(data ?? []); }, []);
  useEffect(() => { void load(); }, [load]);
  async function add() {
    const { error } = await supabase.from('sectors').insert({ name: name.trim() });
    if (error) toast('error', friendlyError(error)); else { setName(''); toast('success', 'Setor criado.'); await load(); }
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from('sectors').update({ active }).eq('id', id);
    if (error) toast('error', friendlyError(error)); else await load();
  }
  return (
    <section className="card stack" style={{ maxWidth: 720 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><TextInput label="Novo setor" value={name} onChange={setName} maxLength={80} /></div>
        <button className="btn btn-primary" disabled={name.trim().length < 2} onClick={() => void add()}>Adicionar</button>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Setor</th><th>Situação</th><th></th></tr></thead>
        <tbody>{rows.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.active ? 'Ativo' : 'Inativo'}</td><td><button className="btn btn-ghost btn-sm" onClick={() => void toggle(s.id, !s.active)}>{s.active ? 'Desativar' : 'Reativar'}</button></td></tr>)}</tbody></table></div>
      <p className="muted small">Setores inativos não aparecem na tela de cadastro. Não são apagados para preservar o histórico.</p>
    </section>
  );
}

interface AuditRow { id: number; occurred_at: string; user_id: string | null; action: string; table_name: string | null; record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }
const TABLES: Record<string, string> = {
  urine_collection_requests: 'Solicitação', urine_collection_reschedules: 'Reagendamento', urine_collection_attachments: 'Anexo',
  urine_collection_export_logs: 'Exportação', urine_collection_import_batches: 'Importação', profiles: 'Perfil', user_roles: 'Papel de acesso',
  system_settings: 'Configuração', sectors: 'Setor', auth: 'Sessão',
};
const ACTIONS: Record<string, string> = { INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão', LOGIN: 'Login', LOGOUT: 'Logout', BOOTSTRAP_ADMIN: 'Configuração do 1º admin' };

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    let q = supabase.from('audit_logs').select('*').order('occurred_at', { ascending: false }).range(page * 100, page * 100 + 99);
    if (table) q = q.eq('table_name', table);
    if (action) q = q.eq('action', action);
    const { data } = await q;
    setRows((data ?? []) as AuditRow[]);
  }, [table, action, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    supabase.rpc('admin_list_users').then(({ data }) => setNames(Object.fromEntries(((data ?? []) as { id: string; full_name: string; email: string }[]).map((u) => [u.id, `${u.full_name} (${u.email})`]))));
  }, []);
  return (
    <section className="card stack">
      <div className="row">
        <SelectInput label="Área" value={table} onChange={(v) => { setTable(v); setPage(0); }} placeholder="Todas" options={Object.entries(TABLES).map(([value, label]) => ({ value, label }))} />
        <SelectInput label="Ação" value={action} onChange={(v) => { setAction(v); setPage(0); }} placeholder="Todas" options={Object.entries(ACTIONS).map(([value, label]) => ({ value, label }))} />
      </div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Área</th><th>Detalhe</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="nowrap small">{fmtDateTime(r.occurred_at)}</td>
              <td className="small">{r.user_id ? names[r.user_id] ?? r.user_id.slice(0, 8) : 'sistema'}</td>
              <td>{ACTIONS[r.action] ?? r.action}</td>
              <td>{TABLES[r.table_name ?? ''] ?? r.table_name}</td>
              <td className="small">
                {r.action === 'UPDATE' && <span className="muted">Campos: {Object.keys(r.new_data ?? {}).join(', ')} </span>}
                {(r.old_data || r.new_data) && <button className="link-btn" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'ocultar' : 'ver valores'}</button>}
                {open === r.id && <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxWidth: 520 }}>{JSON.stringify({ antes: r.old_data, depois: r.new_data }, null, 1)}</pre>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="row">
        <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anteriores</button>
        <button className="btn btn-secondary btn-sm" disabled={!rows || rows.length < 100} onClick={() => setPage((p) => p + 1)}>Próximos</button>
      </div>
      <p className="muted small">Registros de auditoria são gravados automaticamente pelo banco e não podem ser alterados nem apagados pelo sistema.</p>
    </section>
  );
}

function PrivacyTab() {
  return (
    <section className="card stack" style={{ maxWidth: 860 }}>
      <h2>Como os dados são protegidos</h2>
      <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
        <li><b>Acesso por perfil no banco (RLS):</b> mesmo alterando o site, ninguém lê ou grava o que não tem permissão.</li>
        <li><b>Cadastro com aprovação:</b> novas contas ficam pendentes até a administração liberar.</li>
        <li><b>Anexos privados:</b> sem links públicos; cada visualização gera um link temporário de 60 segundos.</li>
        <li><b>Auditoria:</b> inclusões, alterações, exclusões, logins, importações e exportações ficam registradas.</li>
        <li><b>Bloco inteligente local:</b> o texto colado é interpretado no próprio navegador. Nenhum dado de paciente é enviado a serviços de IA.</li>
        <li><b>Mapa sem envio de endereços:</b> a localização usa uma base local de bairros. O OpenStreetMap recebe apenas a área do mapa exibida.</li>
        <li><b>Sessão:</b> encerramento automático após 60 minutos sem uso.</li>
        <li><b>Minimização (LGPD):</b> o texto original colado só é guardado se você marcar essa opção; buscas não são registradas nas exportações.</li>
      </ul>
      <AlertBox kind="warning" title="Boas práticas da equipe">Não compartilhe senhas, não exporte planilhas sem necessidade, não envie dados de pacientes por canais abertos e encerre a sessão em computadores compartilhados.</AlertBox>
    </section>
  );
}
