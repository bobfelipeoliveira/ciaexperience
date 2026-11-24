import { useMemo, useState } from 'react';
import { Icon } from '../../../core/components/Icon';
import { activeFilterCount, distinctValues, emptyFilters, type UrineFilters } from '../domain/filters';
import { MATERIAL, METHODS, ORIGINS, PRIORITIES, SHIFTS, STATUSES } from '../domain/constants';
import type { UrineRequest } from '../domain/types';
import { addDaysISO, startOfMonthISO, startOfWeekISO, todayISO } from '../../../core/lib/dates';

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="field">
      <span className="field-label small">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function FiltersBar({ rows, value, onChange, compact }: { rows: UrineRequest[]; value: UrineFilters; onChange: (f: UrineFilters) => void; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const set = <K extends keyof UrineFilters>(k: K) => (v: UrineFilters[K]) => onChange({ ...value, [k]: v });
  const lists = useMemo(() => ({
    neighborhoods: distinctValues(rows, (r) => r.neighborhood).map((v) => ({ value: v, label: v })),
    cities: distinctValues(rows, (r) => r.city).map((v) => ({ value: v, label: v })),
    schedulers: distinctValues(rows, (r) => r.scheduler_name).map((v) => ({ value: v, label: v })),
    nurses: distinctValues(rows, (r) => r.nurse_name ?? r.assigned_nurse_name).map((v) => ({ value: v, label: v })),
  }), [rows]);
  const today = todayISO();
  const preset = (from: string, to: string) => onChange({ ...value, from, to });
  const n = activeFilterCount(value);

  return (
    <div className="card flat stack" style={{ padding: 14 }}>
      <div className="row">
        <div className="input-icon" style={{ flex: '1 1 260px' }}>
          <Icon name="search" size={18} />
          <input className="input" placeholder="Buscar por paciente, telefone ou endereço…" value={value.q} onChange={(e) => set('q')(e.target.value)} aria-label="Buscar" />
        </div>
        <button className="btn btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="filter" size={18} /> Filtros{n ? ` (${n})` : ''}
        </button>
        {n > 0 && <button className="btn btn-ghost" onClick={() => onChange(emptyFilters())}>Limpar</button>}
      </div>
      {open && (
        <>
          <div className="row small">
            <span className="muted">Período rápido:</span>
            <button className="chip" style={{ minHeight: 36 }} onClick={() => preset(today, today)}>Hoje</button>
            <button className="chip" style={{ minHeight: 36 }} onClick={() => preset(addDaysISO(today, 1), addDaysISO(today, 1))}>Amanhã</button>
            <button className="chip" style={{ minHeight: 36 }} onClick={() => preset(startOfWeekISO(today), addDaysISO(startOfWeekISO(today), 6))}>Esta semana</button>
            <button className="chip" style={{ minHeight: 36 }} onClick={() => preset(startOfMonthISO(today), today)}>Este mês</button>
            <button className="chip" style={{ minHeight: 36 }} onClick={() => preset(addDaysISO(today, -30), today)}>Últimos 30 dias</button>
          </div>
          <div className="filters">
            <label className="field">
              <span className="field-label small">Data considerada</span>
              <select className="select" value={value.dateField} onChange={(e) => set('dateField')(e.target.value as UrineFilters['dateField'])}>
                <option value="scheduled_date">Data agendada</option>
                <option value="received_date">Data de recebimento</option>
                <option value="collected_date">Data da coleta</option>
                <option value="created_at">Data de cadastro</option>
              </select>
            </label>
            <label className="field"><span className="field-label small">De</span><input type="date" className="input" value={value.from} onChange={(e) => set('from')(e.target.value)} /></label>
            <label className="field"><span className="field-label small">Até</span><input type="date" className="input" value={value.to} onChange={(e) => set('to')(e.target.value)} /></label>
            <Sel label="Status" value={value.status} onChange={set('status')} options={opts(STATUSES)} />
            <Sel label="Prioridade" value={value.priority} onChange={set('priority')} options={opts(PRIORITIES)} />
            <Sel label="Origem" value={value.origin} onChange={set('origin')} options={opts(ORIGINS)} />
            <Sel label="Turno de recebimento" value={value.shift} onChange={set('shift')} options={opts(SHIFTS)} />
            <Sel label="Forma de coleta" value={value.method} onChange={set('method')} options={opts(METHODS)} />
            <Sel label="Material (potinho)" value={value.material} onChange={set('material')} options={opts(MATERIAL)} />
            <Sel label="Bairro" value={value.neighborhood} onChange={set('neighborhood')} options={lists.neighborhoods} />
            <Sel label="Cidade" value={value.city} onChange={set('city')} options={lists.cities} />
            <Sel label="Técnica responsável" value={value.scheduler} onChange={set('scheduler')} options={lists.schedulers} />
            <Sel label="Enfermeiro(a)" value={value.nurse} onChange={set('nurse')} options={lists.nurses} />
          </div>
        </>
      )}
    </div>
  );
}
