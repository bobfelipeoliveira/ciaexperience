import { useNavigate } from 'react-router-dom';
import type { UrineRequest } from '../domain/types';
import { fmtDate } from '../../../core/lib/dates';
import { Missing } from '../../../core/components/ui';
import { label, PERIODS, PRIORITY_COLOR } from '../domain/constants';
import { MaterialBadge, PriorityBadge, StatusBadge } from './Badges';

export function RequestTable({ rows, emptyText = 'Nenhuma solicitação encontrada.' }: { rows: UrineRequest[]; emptyText?: string }) {
  const nav = useNavigate();
  if (!rows.length) return <p className="muted" style={{ padding: 16 }}>{emptyText}</p>;
  const open = (id: string) => nav(`/coletas/${id}`);
  return (
    <>
      <div className="table-wrap hide-mobile">
        <table className="table">
          <thead>
            <tr><th>Paciente</th><th>Agendada</th><th>Prioridade</th><th>Status</th><th>Forma</th><th>Material</th><th>Bairro / Cidade</th><th>Responsável</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => open(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(r.id)}>
                <td><b>{r.patient_name}</b>{r.health_plan && <div className="muted small">{r.health_plan}</div>}</td>
                <td className="nowrap">{r.scheduled_date ? <>{fmtDate(r.scheduled_date)}<div className="muted small">{r.scheduled_period ? label(PERIODS, r.scheduled_period) : ''}{r.scheduled_time ? ` ${r.scheduled_time.slice(0, 5)}` : ''}</div></> : <Missing text="SEM DATA" />}</td>
                <td><PriorityBadge priority={r.priority} /></td>
                <td><StatusBadge status={r.status} />{r.archived_at && <div className="muted small">arquivada</div>}</td>
                <td>{r.collection_method ?? <Missing text="N/I" />}</td>
                <td><MaterialBadge value={r.material_available} /></td>
                <td>{r.neighborhood ?? <Missing text="BAIRRO N/I" />}<div className="muted small">{r.city ?? ''}</div></td>
                <td className="small">{r.scheduler_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="req-cards">
        {rows.map((r) => (
          <button key={r.id} className="req-card" style={{ ['--card-accent' as string]: r.priority ? PRIORITY_COLOR[r.priority] : undefined }} onClick={() => open(r.id)}>
            <div className="row-between"><b>{r.patient_name}</b><StatusBadge status={r.status} /></div>
            <div className="row small">
              <span>{r.scheduled_date ? `📅 ${fmtDate(r.scheduled_date)}${r.scheduled_period ? ' · ' + label(PERIODS, r.scheduled_period) : ''}` : 'Sem data'}</span>
              <PriorityBadge priority={r.priority} />
            </div>
            <div className="muted small">{[r.collection_method, r.neighborhood, r.city].filter(Boolean).join(' · ') || 'Endereço não informado'}</div>
          </button>
        ))}
      </div>
    </>
  );
}
