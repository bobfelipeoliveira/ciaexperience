import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, PageLoading, Tabs, Badge } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { addDaysISO, endOfMonthISO, fmtDate, monthLabel, startOfMonthISO, startOfWeekISO, todayISO, WEEKDAYS, WEEKDAYS_LONG, weekdayOf } from '../../../core/lib/dates';
import { useUrineData, settingNumber } from '../hooks/UrineData';
import { applyFilters, emptyFilters } from '../domain/filters';
import { isActiveStatus, label, PERIODS, PRIORITY_COLOR } from '../domain/constants';
import type { UrineRequest } from '../domain/types';
import { FiltersBar } from '../components/FiltersBar';
import { PriorityBadge, StatusBadge } from '../components/Badges';

type ViewMode = 'dia' | 'semana' | 'mes';
const PERIOD_ORDER: Record<string, number> = { MANHA: 0, HORARIO: 1, TARDE: 2, NOITE: 3, QUALQUER: 4 };

function Slot({ r }: { r: UrineRequest }) {
  const nav = useNavigate();
  return (
    <button className="slot-card" style={{ ['--ev-accent' as string]: r.priority ? PRIORITY_COLOR[r.priority] : undefined }} onClick={() => nav(`/coletas/${r.id}`)}>
      <b style={{ overflowWrap: 'anywhere' }}>{r.patient_name}</b>
      <span className="muted">{r.scheduled_period ? label(PERIODS, r.scheduled_period) : 'Período N/I'}{r.scheduled_time ? ` · ${r.scheduled_time.slice(0, 5)}` : ''} · {r.collection_method ?? 'forma N/I'}</span>
      <span className="muted">{[r.neighborhood, r.city].filter(Boolean).join(', ') || 'Endereço N/I'}</span>
      <span className="row" style={{ gap: 4 }}><StatusBadge status={r.status} />{r.priority === 'URGENTE' && <PriorityBadge priority={r.priority} />}</span>
    </button>
  );
}

export default function AgendaPage() {
  const { rows, loading, settings } = useUrineData();
  const nav = useNavigate();
  const [mode, setMode] = useState<ViewMode>('semana');
  const [anchor, setAnchor] = useState(todayISO());
  const [filters, setFilters] = useState(emptyFilters());
  const [showClosed, setShowClosed] = useState(false);
  const today = todayISO();
  const threshold = settingNumber(settings, 'urine.volume_alert_threshold', 3);

  const byDate = useMemo(() => {
    const m = new Map<string, UrineRequest[]>();
    for (const r of applyFilters(rows, { ...filters, from: '', to: '' })) {
      if (!r.scheduled_date) continue;
      if (!showClosed && !isActiveStatus(r.status)) continue;
      m.set(r.scheduled_date, [...(m.get(r.scheduled_date) ?? []), r]);
    }
    for (const list of m.values()) list.sort((a, b) => (PERIOD_ORDER[a.scheduled_period ?? 'QUALQUER'] ?? 5) - (PERIOD_ORDER[b.scheduled_period ?? 'QUALQUER'] ?? 5) || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));
    return m;
  }, [rows, filters, showClosed]);
  const day = (iso: string) => byDate.get(iso) ?? [];
  const activeCount = (iso: string) => day(iso).filter((r) => isActiveStatus(r.status)).length;
  const noDate = rows.filter((r) => !r.scheduled_date && isActiveStatus(r.status)).length;

  const step = (dir: number) => setAnchor((a) => mode === 'dia' ? addDaysISO(a, dir) : mode === 'semana' ? addDaysISO(a, 7 * dir) : addDaysISO(startOfMonthISO(a), dir > 0 ? 32 : -1).slice(0, 8) + '01');
  if (loading) return <PageLoading />;

  const weekStart = startOfWeekISO(anchor);
  const title = mode === 'dia' ? `${WEEKDAYS_LONG[weekdayOf(anchor)]}, ${fmtDate(anchor)}` : mode === 'semana' ? `${fmtDate(weekStart)} a ${fmtDate(addDaysISO(weekStart, 6))}` : monthLabel(anchor);

  return (
    <div className="stack">
      <PageHeader title="Agenda de coletas" subtitle={`Dias com mais de ${threshold} coletas ficam destacados.${noDate ? ` ${noDate} solicitação(ões) em aberto ainda sem data.` : ''}`}
        actions={<button className="btn btn-primary" onClick={() => nav('/coletas/nova')}><Icon name="plus" size={18} /> Nova coleta</button>} />
      <FiltersBar rows={rows} value={filters} onChange={setFilters} compact />
      <div className="row-between">
        <Tabs<ViewMode> value={mode} onChange={setMode} tabs={[{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]} />
        <div className="row">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Anterior"><Icon name="chevronLeft" /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(today)}>Hoje</button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Próximo"><Icon name="chevronRight" /></button>
          <b style={{ textTransform: 'capitalize' }}>{title}</b>
        </div>
        <label className="row small"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 20, height: 20 }} /> Mostrar realizadas/canceladas</label>
      </div>

      {mode === 'dia' && (
        <section className="card">
          <div className="card-head"><h2>{day(anchor).length} coleta(s)</h2>{activeCount(anchor) > threshold && <Badge tone="b-crit">Volume acima do limite</Badge>}</div>
          {day(anchor).length === 0 ? <p className="muted">Nenhuma coleta neste dia.</p> : (
            <div className="grid-3">{day(anchor).map((r) => <Slot key={r.id} r={r} />)}</div>
          )}
        </section>
      )}

      {mode === 'semana' && (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)).map((d) => (
            <div key={d} className={`week-col${d === today ? ' today' : ''}`} style={activeCount(d) > threshold ? { background: '#fff7f8', borderColor: '#f3b4bd' } : undefined}>
              <div className="row-between"><b>{WEEKDAYS[weekdayOf(d)]} {d.slice(8, 10)}</b>{day(d).length > 0 && <Badge tone={activeCount(d) > threshold ? 'b-crit' : 'b-wine'} dot={false}>{day(d).length}</Badge>}</div>
              {day(d).map((r) => <Slot key={r.id} r={r} />)}
            </div>
          ))}
        </div>
      )}

      {mode === 'mes' && (() => {
        const first = startOfMonthISO(anchor);
        const gridStart = startOfWeekISO(first);
        const last = endOfMonthISO(anchor);
        const weeks = Math.ceil((weekdayOf(first) + +last.slice(8, 10)) / 7);
        return (
          <div className="cal">
            {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
            {Array.from({ length: weeks * 7 }, (_, i) => addDaysISO(gridStart, i)).map((d) => {
              const list = day(d);
              const over = activeCount(d) > threshold;
              return (
                <div key={d} className={`cal-cell${d.slice(0, 7) !== anchor.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}${over ? ' overload' : ''}`}>
                  <div className="cal-day"><span>{+d.slice(8, 10)}</span>{list.length > 0 && <span className="cal-count">{list.length}</span>}{over && <Icon name="alert" size={14} className="muted" />}</div>
                  {list.slice(0, 3).map((r) => (
                    <button key={r.id} className="cal-ev" style={{ ['--ev-accent' as string]: r.priority ? PRIORITY_COLOR[r.priority] : undefined }} onClick={() => nav(`/coletas/${r.id}`)} title={r.patient_name}>{r.patient_name}</button>
                  ))}
                  {list.length > 3 && <button className="cal-more" onClick={() => { setAnchor(d); setMode('dia'); }}>+{list.length - 3} mais</button>}
                  {list.length > 0 && <button className="cal-more show-mobile" onClick={() => { setAnchor(d); setMode('dia'); }}>ver</button>}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
