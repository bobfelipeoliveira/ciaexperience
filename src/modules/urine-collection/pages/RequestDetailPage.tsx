import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertBox, ConfirmDialog, ErrorBox, Missing, Modal, PageHeader, PageLoading, SelectInput, Tabs, TextArea, TextInput, useToast } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { useAuth } from '../../../core/auth/AuthProvider';
import { friendlyError } from '../../../core/lib/errors';
import { fmtDate, fmtDateTime, todayISO } from '../../../core/lib/dates';
import { formatPhone } from '../../../core/lib/text';
import type { UrineRequest, UrineRequestInput, Reschedule } from '../domain/types';
import { label, MATERIAL, METHODS, ORIGINS, PERIODS, SHIFTS, STATUSES, isActiveStatus, type Period, type Status } from '../domain/constants';
import { validateInput } from '../domain/validation';
import { regionOf } from '../geo/gazetteer';
import { RequestForm, normalizeInputForSave } from '../components/RequestForm';
import { MaterialBadge, PriorityBadge, StatusBadge } from '../components/Badges';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { archiveRequest, deleteRequest, getRequest, listReschedules, rescheduleRequest, unarchiveRequest, updateRequest } from '../services/requests';

const toInput = (r: UrineRequest): UrineRequestInput => ({
  patient_name: r.patient_name, patient_age: r.patient_age, health_plan: r.health_plan, collection_method: r.collection_method,
  origin: r.origin, priority: r.priority, emergency_justification: r.emergency_justification, material_available: r.material_available,
  material_responsible: r.material_responsible, material_deadline: r.material_deadline, received_date: r.received_date,
  receipt_shift: r.receipt_shift, scheduled_date: r.scheduled_date, scheduled_period: r.scheduled_period, scheduled_time: r.scheduled_time,
  family_contact_name: r.family_contact_name, contact_phone: r.contact_phone, scheduler_name: r.scheduler_name, address_raw: r.address_raw,
  address_street: r.address_street, address_number: r.address_number, address_complement: r.address_complement, neighborhood: r.neighborhood,
  city: r.city, state: r.state, cep: r.cep, address_reference: r.address_reference, route_support: r.route_support,
  assigned_nurse_name: r.assigned_nurse_name, status: r.status, notes: r.notes, latitude: r.latitude, longitude: r.longitude,
  geo_precision: r.geo_precision, geo_source: r.geo_source,
});

function V({ v, fmt }: { v: unknown; fmt?: (x: never) => string }) {
  if (v === null || v === undefined || v === '') return <Missing />;
  return <>{fmt ? fmt(v as never) : String(v)}</>;
}

export default function RequestDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole, isAdmin, session } = useAuth();
  const isCoord = hasRole('urine_collection', ['coordenacao']);
  const [r, setR] = useState<UrineRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'dados' | 'anexos' | 'historico'>('dados');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UrineRequestInput | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'status' | 'reschedule' | 'archive' | 'delete' | 'geo'>(null);
  const [reschedules, setReschedules] = useState<Reschedule[]>([]);
  const today = todayISO();

  const load = useCallback(async () => {
    try {
      const data = await getRequest(id);
      if (!data) { setError('Solicitação não encontrada ou você não tem acesso a ela.'); return; }
      setR(data); setError(null);
      setReschedules(await listReschedules(id));
    } catch (e) { setError(friendlyError(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="stack"><Link to="/coletas" className="btn btn-ghost"><Icon name="arrowLeft" /> Voltar</Link><ErrorBox error={error} onRetry={load} /></div>;
  if (!r) return <PageLoading />;

  const canEdit = !r.archived_at && (isCoord || (hasRole('urine_collection', ['tecnica']) && r.created_by === session?.user.id));

  async function saveEdit() {
    if (!form || !r) return;
    setTouched(true);
    const errs = validateInput(form, today, { collected_date: r.collected_date, status_reason: r.status_reason });
    delete errs.collected_date; delete errs.status_reason;
    if (Object.keys(errs).length) { toast('error', 'Revise os campos destacados.'); return; }
    setBusy(true);
    try {
      const input = normalizeInputForSave(form);
      const { status: _s, ...rest } = input; void _s;
      const patch: Partial<UrineRequest> = { ...rest };
      if (r.scheduled_date) delete patch.scheduled_date; // só por reagendamento
      const saved = await updateRequest(r.id, patch);
      setR(saved); setEditing(false); setTouched(false);
      toast('success', 'Alterações salvas.');
    } catch (e) { toast('error', friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}><Icon name="arrowLeft" size={16} /> Voltar</button></div>
      <PageHeader
        title={r.patient_name}
        subtitle={<span className="row" style={{ gap: 8 }}><StatusBadge status={r.status} /><PriorityBadge priority={r.priority} /><MaterialBadge value={r.material_available} />{r.archived_at && <span className="badge b-neutral">ARQUIVADA</span>}<span className="muted small">criada em {fmtDateTime(r.created_at)}</span></span>}
        actions={canEdit && !editing ? (
          <>
            <button className="btn btn-secondary" onClick={() => { setForm(toInput(r)); setEditing(true); setTab('dados'); }}><Icon name="edit" size={18} /> Editar</button>
            <button className="btn btn-secondary" onClick={() => setDialog('reschedule')}><Icon name="calendar" size={18} /> {r.scheduled_date ? 'Reagendar' : 'Agendar'}</button>
            <button className="btn btn-primary" onClick={() => setDialog('status')}><Icon name="check" size={18} /> Atualizar situação</button>
          </>
        ) : undefined}
      />

      {r.priority === 'EMERGENCIAL' && isActiveStatus(r.status) && <AlertBox kind="critical" title="Coleta EMERGENCIAL">{r.emergency_justification}</AlertBox>}
      {r.material_available === 'NAO' && isActiveStatus(r.status) && <AlertBox kind="warning" title="Sem material na residência">Responsável: {r.material_responsible ?? 'não definido'}{r.material_deadline ? ` · prazo ${fmtDate(r.material_deadline)}` : ''}</AlertBox>}
      {r.entry_mode === 'IMPORTACAO' && <AlertBox kind="info" title="Registro importado da planilha">Os valores originais da planilha estão preservados no histórico deste registro.</AlertBox>}
      {!canEdit && !r.archived_at && <AlertBox kind="info">Você pode consultar esta solicitação. Alterações são feitas por quem a criou ou pela coordenação.</AlertBox>}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'dados', label: 'Dados' }, { value: 'anexos', label: 'Anexos' }, { value: 'historico', label: `Histórico${reschedules.length ? ` (${reschedules.length} reag.)` : ''}` }]} />

      {tab === 'dados' && editing && form && (
        <div className="stack">
          <RequestForm value={form} onChange={(p) => setForm((f) => ({ ...f!, ...p }))} errors={touched ? validateInput(form, today) : {}}
            lockScheduledDate={!!r.scheduled_date} onRescheduleClick={() => setDialog('reschedule')} />
          <div className="row" style={{ justifyContent: 'flex-end', position: 'sticky', bottom: 12 }}>
            <button className="btn btn-ghost" onClick={() => { setEditing(false); setTouched(false); }}>Cancelar</button>
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => void saveEdit()}><Icon name="check" /> {busy ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        </div>
      )}

      {tab === 'dados' && !editing && (
        <div className="grid-2">
          <section className="card">
            <div className="section-title">Identificação e solicitação</div>
            <dl className="kv">
              <dt>Paciente</dt><dd>{r.patient_name}</dd>
              <dt>Idade</dt><dd><V v={r.patient_age} fmt={(x: number) => `${x} anos`} /></dd>
              <dt>Convênio</dt><dd><V v={r.health_plan} /></dd>
              <dt>Forma de coleta</dt><dd><V v={r.collection_method} fmt={(x: string) => label(METHODS, x)} /></dd>
              <dt>Origem</dt><dd><V v={r.origin} fmt={(x: string) => label(ORIGINS, x)} /></dd>
              <dt>Prioridade</dt><dd><PriorityBadge priority={r.priority} /></dd>
              {r.emergency_justification && <><dt>Justificativa</dt><dd>{r.emergency_justification}</dd></>}
              <dt>Material (potinho)</dt><dd><V v={r.material_available} fmt={(x: string) => label(MATERIAL, x)} /></dd>
              <dt>Recebida em</dt><dd><V v={r.received_date} fmt={fmtDate} /> {r.receipt_shift && <span className="muted">· {label(SHIFTS, r.receipt_shift)}</span>}</dd>
              <dt>Responsável agendamento</dt><dd><V v={r.scheduler_name} /></dd>
            </dl>
          </section>
          <section className="card">
            <div className="section-title">Agenda e contato</div>
            <dl className="kv">
              <dt>Data agendada</dt><dd>{r.scheduled_date ? <b>{fmtDate(r.scheduled_date)}</b> : <Missing text="SEM DATA" />} {r.scheduled_period && <span className="muted">· {label(PERIODS, r.scheduled_period)}{r.scheduled_time ? ` ${r.scheduled_time.slice(0, 5)}` : ''}</span>}</dd>
              {r.original_scheduled_date && <><dt>Data original</dt><dd>{fmtDate(r.original_scheduled_date)} <span className="muted">({r.reschedule_count} reagendamento(s))</span></dd></>}
              <dt>Familiar que confirmou</dt><dd><V v={r.family_contact_name} /></dd>
              <dt>Telefone</dt><dd>{r.contact_phone ? <a href={`tel:${r.contact_phone.replace(/\D/g, '')}`}>{formatPhone(r.contact_phone)}</a> : <Missing />}</dd>
              <dt>Profissional previsto</dt><dd><V v={r.assigned_nurse_name} /></dd>
              <dt>Suporte rota</dt><dd><V v={r.route_support === null ? null : r.route_support ? 'SIM' : 'NÃO'} /></dd>
            </dl>
          </section>
          <section className="card">
            <div className="section-title">Endereço</div>
            <dl className="kv">
              <dt>Logradouro</dt><dd><V v={[r.address_street, r.address_number].filter(Boolean).join(', ') || null} /></dd>
              <dt>Complemento</dt><dd><V v={r.address_complement} /></dd>
              <dt>Bairro</dt><dd><V v={r.neighborhood} /></dd>
              <dt>Cidade / UF</dt><dd><V v={[r.city, r.state].filter(Boolean).join(' - ') || null} /></dd>
              <dt>CEP</dt><dd><V v={r.cep} /></dd>
              <dt>Referência</dt><dd><V v={r.address_reference} /></dd>
              <dt>Região</dt><dd><V v={regionOf(r.neighborhood, r.city)} /></dd>
              <dt>Localização no mapa</dt>
              <dd>{r.latitude !== null ? <span>{r.geo_precision === 'MANUAL' ? 'Definida manualmente' : `Aproximada pelo ${r.geo_precision === 'BAIRRO' ? 'bairro' : 'município'}`}</span> : <span className="muted">Localização ainda não identificada</span>}
                {isCoord && canEdit && <> · <button className="link-btn" onClick={() => setDialog('geo')}>ajustar</button></>}</dd>
              {r.address_raw && <><dt>Endereço original</dt><dd className="small muted">{r.address_raw}</dd></>}
            </dl>
          </section>
          <section className="card">
            <div className="section-title">Execução</div>
            <dl className="kv">
              <dt>Situação</dt><dd><StatusBadge status={r.status} /> <span className="muted small">desde {fmtDateTime(r.status_changed_at)}</span></dd>
              <dt>Enfermeiro(a) que realizou</dt><dd><V v={r.nurse_name} /></dd>
              <dt>Data da coleta</dt><dd><V v={r.collected_date} fmt={fmtDate} /></dd>
              {r.status_reason && <><dt>Motivo</dt><dd>{r.status_reason}</dd></>}
              <dt>Resultado operacional</dt><dd><V v={r.outcome} /></dd>
              <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}><V v={r.notes} /></dd>
              {r.legacy_notes && <><dt>Observação (planilha)</dt><dd>{r.legacy_notes}</dd></>}
            </dl>
          </section>
          {(isCoord || isAdmin) && (
            <section className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="row-between">
                <div><b>Ações administrativas</b><p className="muted small">Arquivar retira a solicitação da operação sem apagar dados. Exclusão definitiva é restrita ao administrador.</p></div>
                <div className="row">
                  {r.archived_at
                    ? <button className="btn btn-secondary" onClick={async () => { try { setR(await unarchiveRequest(r.id)); toast('success', 'Solicitação reativada.'); } catch (e) { toast('error', friendlyError(e)); } }}><Icon name="refresh" size={18} /> Desarquivar</button>
                    : <button className="btn btn-secondary" onClick={() => setDialog('archive')}><Icon name="archive" size={18} /> Arquivar</button>}
                  {isAdmin && <button className="btn btn-danger" onClick={() => setDialog('delete')}><Icon name="trash" size={18} /> Excluir</button>}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'anexos' && <AttachmentsPanel requestId={r.id} canUpload={!r.archived_at} />}
      {tab === 'historico' && <HistoryPanel requestId={r.id} reschedules={reschedules} />}

      {dialog === 'status' && <StatusDialog r={r} onClose={() => setDialog(null)} onSaved={(x) => { setR(x); setDialog(null); }} />}
      {dialog === 'reschedule' && <RescheduleDialog r={r} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await load(); setEditing(false); }} />}
      {dialog === 'geo' && <GeoDialog r={r} onClose={() => setDialog(null)} onSaved={(x) => { setR(x); setDialog(null); }} />}
      {dialog === 'archive' && <ArchiveDialog onCancel={() => setDialog(null)} onConfirm={async (reason) => { try { setR(await archiveRequest(r.id, reason)); setDialog(null); toast('success', 'Solicitação arquivada.'); } catch (e) { toast('error', friendlyError(e)); } }} />}
      {dialog === 'delete' && (
        <ConfirmDialog danger title="Excluir definitivamente?" confirmLabel="Excluir definitivamente" busy={busy}
          message={<>A solicitação de <b>{r.patient_name}</b>, seus anexos e reagendamentos serão apagados. A exclusão fica registrada na auditoria. <b>Esta ação não pode ser desfeita.</b> Prefira "Arquivar".</>}
          onCancel={() => setDialog(null)}
          onConfirm={async () => { setBusy(true); try { await deleteRequest(r.id); toast('success', 'Solicitação excluída.'); nav('/coletas', { replace: true }); } catch (e) { toast('error', friendlyError(e)); } finally { setBusy(false); } }} />
      )}
    </div>
  );
}

function StatusDialog({ r, onClose, onSaved }: { r: UrineRequest; onClose: () => void; onSaved: (r: UrineRequest) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>(r.status);
  const [nurse, setNurse] = useState(r.nurse_name ?? r.assigned_nurse_name ?? '');
  const [date, setDate] = useState(r.collected_date ?? todayISO());
  const [reason, setReason] = useState(r.status_reason ?? '');
  const [outcome, setOutcome] = useState(r.outcome ?? '');
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const err =
    status === 'REALIZADA' && !nurse.trim() ? 'Informe o(a) enfermeiro(a) que realizou a coleta.'
    : status === 'REALIZADA' && (!date || date > today) ? 'Informe uma data de coleta válida (não futura).'
    : (status === 'CANCELADA' || status === 'NAO_REALIZADA') && reason.trim().length < 3 ? 'Informe o motivo.'
    : null;
  async function save() {
    if (err) return;
    setBusy(true);
    try {
      const patch: Partial<UrineRequest> = { status, outcome: outcome.trim() || null };
      if (status === 'REALIZADA') { patch.nurse_name = nurse.trim(); patch.collected_date = date; patch.status_reason = null; }
      else if (status === 'CANCELADA' || status === 'NAO_REALIZADA') { patch.status_reason = reason.trim(); }
      else { patch.status_reason = reason.trim() || null; }
      onSaved(await updateRequest(r.id, patch));
      toast('success', `Situação atualizada para ${label(STATUSES, status)}.`);
    } catch (e) { toast('error', friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Atualizar situação" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={!!err || busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</button>
    </>}>
      <SelectInput label="Nova situação" value={status} onChange={(x) => setStatus((x || r.status) as Status)}
        options={(Object.keys(STATUSES) as Status[]).filter((s) => s !== 'REAGENDADA').map((s) => ({ value: s, label: label(STATUSES, s) }))}
        hint="Para mudar a data, use Reagendar." />
      {status === 'REALIZADA' && (
        <div className="grid-2">
          <TextInput label="Enfermeiro(a) que realizou" value={nurse} onChange={setNurse} required maxLength={150} />
          <TextInput label="Data da coleta" type="date" value={date} onChange={setDate} required max={today} />
        </div>
      )}
      {(status === 'CANCELADA' || status === 'NAO_REALIZADA' || status === 'PENDENTE_INFORMACAO') && (
        <TextArea label={status === 'PENDENTE_INFORMACAO' ? 'O que está pendente?' : 'Motivo'} required={status !== 'PENDENTE_INFORMACAO'} value={reason} onChange={setReason} rows={2} maxLength={1000} />
      )}
      <TextArea label="Resultado operacional / observação da execução" value={outcome} onChange={setOutcome} rows={2} maxLength={1000} />
      {err && <AlertBox kind="warning">{err}</AlertBox>}
    </Modal>
  );
}

function RescheduleDialog({ r, onClose, onSaved }: { r: UrineRequest; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState<string>(r.scheduled_period ?? '');
  const [time, setTime] = useState(r.scheduled_time?.slice(0, 5) ?? '');
  const [reason, setReason] = useState(r.scheduled_date ? '' : 'Primeiro agendamento');
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const err = !date ? 'Escolha a nova data.' : date < today ? 'A data não pode estar no passado.' : reason.trim().length < 3 ? 'Informe o motivo.' : period === 'HORARIO' && !time ? 'Informe o horário.' : null;
  return (
    <Modal title={r.scheduled_date ? 'Reagendar coleta' : 'Agendar coleta'} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={!!err || busy} onClick={async () => {
        setBusy(true);
        try { await rescheduleRequest(r.id, date, reason.trim(), (period || null) as Period | null, period === 'HORARIO' ? time : null); toast('success', 'Agendamento atualizado. O histórico foi preservado.'); onSaved(); }
        catch (e) { toast('error', friendlyError(e)); } finally { setBusy(false); }
      }}>{busy ? 'Salvando…' : 'Confirmar'}</button>
    </>}>
      {r.scheduled_date && <AlertBox kind="info">Data atual: <b>{fmtDate(r.scheduled_date)}</b>. Ela ficará registrada no histórico.</AlertBox>}
      <div className="grid-2">
        <TextInput label="Nova data" type="date" value={date} onChange={setDate} required min={today} />
        <SelectInput label="Período" value={period} onChange={setPeriod} options={Object.entries(PERIODS).map(([value, l]) => ({ value, label: l }))} />
      </div>
      {period === 'HORARIO' && <TextInput label="Horário" type="time" value={time} onChange={setTime} />}
      <TextArea label="Motivo" required value={reason} onChange={setReason} rows={2} maxLength={1000} placeholder="Ex.: a pedido da filha; paciente hospitalizado; sem material…" />
      {err && date && <AlertBox kind="warning">{err}</AlertBox>}
    </Modal>
  );
}

function ArchiveDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog title="Arquivar solicitação?" confirmLabel="Arquivar" onCancel={onCancel} onConfirm={() => reason.trim().length >= 3 && onConfirm(reason.trim())}
      message="A solicitação sai da agenda, dos alertas e dos indicadores operacionais, mas continua guardada e pode ser reativada.">
      <TextArea label="Motivo do arquivamento" required value={reason} onChange={setReason} rows={2} maxLength={500} />
    </ConfirmDialog>
  );
}

function GeoDialog({ r, onClose, onSaved }: { r: UrineRequest; onClose: () => void; onSaved: (r: UrineRequest) => void }) {
  const toast = useToast();
  const [lat, setLat] = useState(r.latitude?.toString() ?? '');
  const [lng, setLng] = useState(r.longitude?.toString() ?? '');
  const la = Number(lat.replace(',', '.')), lo = Number(lng.replace(',', '.'));
  const valid = lat && lng && la > -24 && la < -20 && lo > -45.5 && lo < -40.5;
  return (
    <Modal title="Ajustar localização no mapa" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={async () => { try { onSaved(await updateRequest(r.id, { geo_precision: null, neighborhood: r.neighborhood, city: r.city })); toast('success', 'Localização recalculada pelo bairro.'); } catch (e) { toast('error', friendlyError(e)); } }}>Recalcular pelo bairro</button>
      <button className="btn btn-primary" disabled={!valid} onClick={async () => { try { onSaved(await updateRequest(r.id, { latitude: la, longitude: lo, geo_precision: 'MANUAL', geo_source: 'manual' })); toast('success', 'Localização salva.'); } catch (e) { toast('error', friendlyError(e)); } }}>Salvar coordenadas</button>
    </>}>
      <p className="small muted">Por privacidade, o sistema não envia endereços de pacientes para serviços externos. Se necessário, informe as coordenadas manualmente (estado do RJ).</p>
      <div className="grid-2">
        <TextInput label="Latitude" value={lat} onChange={setLat} placeholder="-22.9068" inputMode="decimal" />
        <TextInput label="Longitude" value={lng} onChange={setLng} placeholder="-43.1729" inputMode="decimal" />
      </div>
      {lat && lng && !valid && <AlertBox kind="warning">Coordenadas fora do estado do Rio de Janeiro.</AlertBox>}
    </Modal>
  );
}
