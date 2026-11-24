import { useEffect, useState } from 'react';
import { supabase } from '../../../core/supabase';
import { EmptyState, ErrorBox, Spinner } from '../../../core/components/ui';
import { fmtDate, fmtDateTime } from '../../../core/lib/dates';
import { friendlyError } from '../../../core/lib/errors';
import type { Reschedule } from '../domain/types';
import { listHistory, type AuditEntry } from '../services/requests';
import { label, PERIODS, STATUSES } from '../domain/constants';

const FIELD_LABELS: Record<string, string> = {
  patient_name: 'Paciente', patient_age: 'Idade', health_plan: 'Convênio', collection_method: 'Forma de coleta', origin: 'Origem',
  priority: 'Prioridade', emergency_justification: 'Justificativa', material_available: 'Material', material_responsible: 'Resp. material',
  material_deadline: 'Prazo material', received_date: 'Recebimento', receipt_shift: 'Turno', scheduled_date: 'Data agendada',
  original_scheduled_date: 'Data original', scheduled_period: 'Período', scheduled_time: 'Horário', family_contact_name: 'Familiar',
  contact_phone: 'Telefone', scheduler_name: 'Resp. agendamento', address_raw: 'Endereço original', address_street: 'Logradouro',
  address_number: 'Número', address_complement: 'Complemento', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', cep: 'CEP',
  address_reference: 'Referência', route_support: 'Suporte rota', assigned_nurse_name: 'Profissional previsto', nurse_name: 'Enfermeiro(a)',
  collected_date: 'Data da coleta', status: 'Situação', status_reason: 'Motivo', outcome: 'Resultado', notes: 'Observações',
  needs_reschedule: 'Reagendamento', reschedule_count: 'Qtd. reagendamentos', archived_at: 'Arquivada', archive_reason: 'Motivo arquivamento',
  latitude: 'Latitude', longitude: 'Longitude', geo_precision: 'Precisão do mapa',
};
const HIDDEN = new Set(['status_changed_at', 'geo_source', 'archived_by', 'legacy_data', 'id', 'created_at', 'created_by', 'import_key', 'import_batch_id', 'entry_mode', 'scheduler_user_id']);

function fmtVal(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'status') return label(STATUSES, String(v));
  if (k === 'scheduled_period') return label(PERIODS, String(v));
  if (typeof v === 'boolean') return v ? 'SIM' : 'NÃO';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  return String(v);
}

export function HistoryPanel({ requestId, reschedules }: { requestId: string; reschedules: Reschedule[] }) {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listHistory(requestId).then(setItems).catch((e) => setError(friendlyError(e)));
    supabase.rpc('list_staff').then(({ data }) => setNames(Object.fromEntries(((data ?? []) as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]))));
  }, [requestId]);

  return (
    <div className="grid-2">
      <section className="card">
        <h2 style={{ marginBottom: 14 }}>Alterações registradas</h2>
        {error && <ErrorBox error={error} />}
        {!items && !error && <Spinner />}
        {items && items.length === 0 && <EmptyState icon="history" title="Sem histórico" />}
        {items && items.length > 0 && (
          <ul className="timeline">
            {items.filter((h) => h.table_name === 'urine_collection_requests').map((h) => {
              const keys = Object.keys(h.new_data ?? h.old_data ?? {}).filter((k) => !HIDDEN.has(k) && FIELD_LABELS[k]);
              return (
                <li key={h.id}>
                  <div className="small"><b>{h.action === 'INSERT' ? 'Solicitação criada' : h.action === 'DELETE' ? 'Excluída' : 'Alteração'}</b> · {fmtDateTime(h.occurred_at)} · {h.user_id ? names[h.user_id] ?? 'usuário' : 'sistema/importação'}</div>
                  {h.action === 'UPDATE' && (
                    <div className="diff">
                      {keys.map((k) => <div key={k}><b>{FIELD_LABELS[k]}:</b> {fmtVal(k, h.old_data?.[k])} → {fmtVal(k, h.new_data?.[k])}</div>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 style={{ marginBottom: 14 }}>Reagendamentos</h2>
        {reschedules.length === 0 ? <EmptyState icon="calendar" title="Nenhum reagendamento" /> : (
          <ul className="timeline">
            {reschedules.map((x) => (
              <li key={x.id}>
                <div className="small"><b>{x.original_date ? fmtDate(x.original_date) : 'sem data'} → {x.new_date ? fmtDate(x.new_date) : '—'}</b>{x.new_period ? ` (${label(PERIODS, x.new_period)})` : ''}</div>
                <div className="diff">{x.reason}</div>
                <div className="muted small">{x.changed_by_name ?? (x.source === 'IMPORTACAO' ? 'Importação da planilha' : '—')} · {fmtDateTime(x.changed_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
