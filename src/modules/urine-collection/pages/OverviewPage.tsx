import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertBox, ErrorBox, PageLoading, StatCard } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { useAuth } from '../../../core/auth/AuthProvider';
import { addDaysISO, fmtDateTime, todayISO, WEEKDAYS_LONG, weekdayOf, fmtDate } from '../../../core/lib/dates';
import { useUrineData } from '../hooks/UrineData';
import { applyFilters, emptyFilters } from '../domain/filters';
import { VIEWS } from '../domain/views';
import { FiltersBar } from '../components/FiltersBar';
import { RequestTable } from '../components/RequestTable';
import { AlertList } from '../components/AlertList';

export default function OverviewPage() {
  const { access, hasRole } = useAuth();
  const isCoord = hasRole('urine_collection', ['coordenacao']);
  const { rows, alerts, loading, error, reload, lastUpdated } = useUrineData();
  const nav = useNavigate();
  const [filters, setFilters] = useState(emptyFilters());
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const count = (k: string) => filtered.filter((r) => VIEWS[k].test(r, today, tomorrow)).length;
  const firstName = access?.profile?.full_name?.split(' ')[0] ?? '';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  if (loading) return <PageLoading />;
  const go = (view: string) => nav(`/coletas?view=${view}`);

  const todayRows = rows.filter((r) => VIEWS.hoje.test(r, today, tomorrow));
  const tomorrowRows = rows.filter((r) => VIEWS.amanha.test(r, today, tomorrow));
  const mine = rows.filter((r) => r.created_by === access?.profile?.id).slice(0, 6);

  return (
    <div className="stack">
      <div className="hero-cta">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="small" style={{ opacity: 0.85 }}>{greet}{firstName ? `, ${firstName}` : ''} · {WEEKDAYS_LONG[weekdayOf(today)]}, {fmtDate(today)}</span>
          <h2>Registrar uma nova coleta</h2>
          <p>Cole a mensagem recebida por WhatsApp, telefone ou e-mail. O CIA organiza, identifica pendências e pergunta o que falta.</p>
        </div>
        <Link to="/coletas/nova" className="btn btn-lg" style={{ position: 'relative', zIndex: 1 }}><Icon name="plus" /> Nova coleta</Link>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {alerts.length > 0 && (
        <section className="card">
          <div className="card-head"><div><h2>Atenção agora</h2><p>Alertas operacionais calculados em tempo real.</p></div><Link className="btn btn-ghost btn-sm" to="/alertas">Ver central de alertas</Link></div>
          <AlertList alerts={alerts.filter((a) => a.severity !== 'info').slice(0, 4)} compact />
        </section>
      )}

      {isCoord ? (
        <>
          <FiltersBar rows={rows} value={filters} onChange={setFilters} compact />
          <div className="grid-stats">
            <StatCard label="Solicitações recebidas" value={filtered.length} icon="list" onClick={() => nav('/coletas')} />
            <StatCard label="Coletas agendadas" value={count('agendadas')} icon="calendar" foot="em aberto, com data" onClick={() => go('agendadas')} />
            <StatCard label="Para hoje" value={count('hoje')} icon="clock" accent="var(--solar-pink-500)" onClick={() => go('hoje')} />
            <StatCard label="Para amanhã" value={count('amanha')} icon="calendar" accent="var(--solar-purple-600)" onClick={() => go('amanha')} />
            <StatCard label="Realizadas" value={count('realizadas')} icon="check" accent="var(--ok-700)" onClick={() => go('realizadas')} />
            <StatCard label="Pendentes" value={count('pendentes')} icon="alert" accent="var(--warn-700)" foot="aguardando info/material/confirm." onClick={() => go('pendentes')} />
            <StatCard label="Reagendadas" value={count('reagendadas')} icon="refresh" accent="var(--warn-700)" onClick={() => go('reagendadas')} />
            <StatCard label="Canceladas" value={count('canceladas')} icon="x" accent="var(--ink-500)" onClick={() => go('canceladas')} />
            <StatCard label="Emergenciais" value={count('emergenciais')} icon="alert" accent="var(--crit-700)" onClick={() => go('emergenciais')} />
            <StatCard label="Sem material" value={count('sem_material')} icon="package" accent="var(--crit-700)" onClick={() => go('sem_material')} />
          </div>
          <p className="muted small">Indicadores calculados sobre {filtered.length} de {rows.length} solicitações (filtros aplicados) · atualizado {lastUpdated ? fmtDateTime(lastUpdated.toISOString()) : '—'} · tempo real.</p>
        </>
      ) : (
        <div className="grid-stats">
          <StatCard label="Para hoje" value={todayRows.length} icon="clock" accent="var(--solar-pink-500)" onClick={() => go('hoje')} />
          <StatCard label="Para amanhã" value={tomorrowRows.length} icon="calendar" accent="var(--solar-purple-600)" onClick={() => go('amanha')} />
          <StatCard label="Pendentes" value={rows.filter((r) => VIEWS.pendentes.test(r, today, tomorrow)).length} icon="alert" accent="var(--warn-700)" onClick={() => go('pendentes')} />
          <StatCard label="Emergenciais em aberto" value={rows.filter((r) => r.priority === 'EMERGENCIAL' && VIEWS.agendadas.test(r, today, tomorrow)).length} icon="alert" accent="var(--crit-700)" onClick={() => go('emergenciais')} />
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Hoje · {fmtDate(today)}</h2><Link className="btn btn-ghost btn-sm" to="/agenda">Agenda</Link></div>
          <RequestTable rows={todayRows} emptyText="Nenhuma coleta agendada para hoje." />
        </section>
        <section className="card">
          <div className="card-head"><h2>Amanhã · {fmtDate(tomorrow)}</h2><Link className="btn btn-ghost btn-sm" to="/mapa">Ver no mapa</Link></div>
          <RequestTable rows={tomorrowRows} emptyText="Nenhuma coleta agendada para amanhã." />
        </section>
      </div>

      {!isCoord && (
        <section className="card">
          <div className="card-head"><h2>Minhas últimas solicitações</h2><Link className="btn btn-ghost btn-sm" to="/coletas">Ver todas</Link></div>
          <RequestTable rows={mine} emptyText="Você ainda não registrou solicitações." />
        </section>
      )}
      {rows.length === 0 && !error && (
        <AlertBox kind="info" title="Nenhuma solicitação cadastrada ainda">Comece por "Nova coleta". Administradores podem importar a planilha atual em Configurações → Importar planilha.</AlertBox>
      )}
    </div>
  );
}
