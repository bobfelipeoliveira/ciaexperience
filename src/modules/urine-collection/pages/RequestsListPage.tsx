import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorBox, PageHeader, PageLoading } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { useAuth } from '../../../core/auth/AuthProvider';
import { addDaysISO, todayISO } from '../../../core/lib/dates';
import { useUrineData } from '../hooks/UrineData';
import { applyFilters, emptyFilters } from '../domain/filters';
import { VIEWS } from '../domain/views';
import { FiltersBar } from '../components/FiltersBar';
import { RequestTable } from '../components/RequestTable';

type Sort = 'recentes' | 'agendada' | 'paciente' | 'prioridade';
const PRIO_ORDER: Record<string, number> = { URGENTE: 0, ELETIVA: 1 };

export default function RequestsListPage() {
  const { rows, loading, error, reload, includeArchived, setIncludeArchived } = useUrineData();
  const { hasRole } = useAuth();
  const isCoord = hasRole('urine_collection', ['coordenacao']);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? '';
  const [filters, setFilters] = useState(() => ({ ...emptyFilters(), q: params.get('q') ?? '' }));
  const [sort, setSort] = useState<Sort>(view === 'hoje' || view === 'amanha' || view === 'agendadas' ? 'agendada' : 'recentes');
  const [limit, setLimit] = useState(100);
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const list = useMemo(() => {
    let out = applyFilters(rows, filters);
    if (view && VIEWS[view]) out = out.filter((r) => VIEWS[view].test(r, today, tomorrow));
    const s = [...out];
    if (sort === 'agendada') s.sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999'));
    if (sort === 'paciente') s.sort((a, b) => a.patient_name.localeCompare(b.patient_name, 'pt-BR'));
    if (sort === 'prioridade') s.sort((a, b) => (PRIO_ORDER[a.priority ?? ''] ?? 3) - (PRIO_ORDER[b.priority ?? ''] ?? 3));
    if (sort === 'recentes') s.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return s;
  }, [rows, filters, view, sort, today, tomorrow]);

  if (loading) return <PageLoading />;
  return (
    <div className="stack">
      <PageHeader title="Solicitações" subtitle={`${list.length} de ${rows.length} solicitações${includeArchived ? ' (incluindo arquivadas)' : ''}`}
        actions={<Link className="btn btn-primary" to="/coletas/nova"><Icon name="plus" size={18} /> Nova coleta</Link>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {view && VIEWS[view] && (
        <div className="alert info"><Icon name="filter" /><div><b>Recorte:</b> {VIEWS[view].label}</div>
          <div className="alert-actions"><button className="btn btn-secondary btn-sm" onClick={() => { params.delete('view'); setParams(params); }}>Remover recorte</button></div></div>
      )}
      <FiltersBar rows={rows} value={filters} onChange={setFilters} compact />
      <div className="row-between">
        <label className="row small">Ordenar por
          <select className="select" style={{ width: 'auto', minHeight: 40 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recentes">Mais recentes</option><option value="agendada">Data agendada</option>
            <option value="prioridade">Prioridade</option><option value="paciente">Paciente (A–Z)</option>
          </select>
        </label>
        {isCoord && <label className="row small"><input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} style={{ width: 20, height: 20 }} /> Mostrar arquivadas</label>}
      </div>
      <RequestTable rows={list.slice(0, limit)} />
      {list.length > limit && <button className="btn btn-secondary" onClick={() => setLimit((l) => l + 100)}>Mostrar mais ({list.length - limit} restantes)</button>}
    </div>
  );
}
