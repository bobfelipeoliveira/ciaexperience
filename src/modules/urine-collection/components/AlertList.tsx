import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../core/components/Icon';
import type { UrineAlert } from '../domain/types';
import { useUrineData } from '../hooks/UrineData';
import { fmtDate } from '../../../core/lib/dates';
import { StatusBadge } from './Badges';

export function AlertList({ alerts, compact }: { alerts: UrineAlert[]; compact?: boolean }) {
  const { byId } = useUrineData();
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  if (!alerts.length) return <p className="muted">Nenhum alerta no momento. 👍</p>;
  return (
    <div className="stack-sm">
      {alerts.map((a) => {
        const kind = a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info';
        const isOpen = open === a.kind;
        return (
          <div key={a.kind} className={`alert ${kind}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Icon name={a.severity === 'info' ? 'info' : 'alert'} />
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="alert-title">{a.title} <span className="badge b-neutral no-dot" style={{ marginLeft: 6 }}>{a.total}</span></div>
                <div className="small">{a.message}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(isOpen ? null : a.kind)} aria-expanded={isOpen}>{isOpen ? 'Ocultar' : 'Ver solicitações'}</button>
            </div>
            {isOpen && (
              <div className="stack-sm" style={{ marginTop: 10 }}>
                {a.request_ids.slice(0, compact ? 8 : 100).map((id) => {
                  const r = byId(id);
                  return (
                    <button key={id} className="req-card" onClick={() => nav(`/coletas/${id}`)} style={{ padding: 10 }}>
                      <div className="row-between"><b>{r?.patient_name ?? 'Solicitação'}</b>{r && <StatusBadge status={r.status} />}</div>
                      {r && <span className="muted small">{r.scheduled_date ? fmtDate(r.scheduled_date) : 'sem data'} · {[r.neighborhood, r.city].filter(Boolean).join(', ') || 'endereço não informado'}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
