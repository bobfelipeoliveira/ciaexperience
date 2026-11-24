import { useMemo, useState } from 'react';
import { PageHeader, PageLoading, StatCard, AlertBox, Tabs } from '../../../core/components/ui';
import { ChartCard, HBarChart, Meter, VBarChart } from '../../../core/components/Charts';
import { useUrineData } from '../hooks/UrineData';
import { applyFilters, emptyFilters, type UrineFilters } from '../domain/filters';
import { computeIndicators, periodSeries, type Breakdown, type DurationStat } from '../domain/indicators';
import { label, STATUSES } from '../domain/constants';
import { FiltersBar } from '../components/FiltersBar';

const foot = (b: Breakdown) => `Base: ${b.total - b.missing} registro(s) com a informação${b.missing ? ` · ${b.missing} sem informação (não entram no gráfico)` : ''}.`;
const dur = (d: DurationStat) => (d.avg === null ? '—' : `${d.avg} dias`);

function BreakdownChart({ title, b, max }: { title: string; b: Breakdown; max?: number }) {
  return <ChartCard title={title} data={b.items} footnote={foot(b)}><HBarChart data={b.items} max={max} /></ChartCard>;
}

export default function IndicatorsPage() {
  const { rows, loading } = useUrineData();
  const [filters, setFilters] = useState<UrineFilters>(() => ({ ...emptyFilters(), dateField: 'received_date' }));
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const list = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const ind = useMemo(() => computeIndicators(list), [list]);
  const series = useMemo(() => periodSeries(list, mode), [list, mode]);
  if (loading) return <PageLoading />;

  return (
    <div className="stack">
      <PageHeader title="Indicadores gerenciais" subtitle="Painel da coordenação e administração. Percentuais mostram sempre o denominador usado." />
      <FiltersBar rows={rows} value={filters} onChange={setFilters} compact />
      <AlertBox kind="info">
        Registros incompletos <b>não</b> são tratados como confirmados: cada gráfico informa quantos registros ficaram de fora por falta de informação.
        Arquivadas não entram. Período filtrado pela <b>{filters.dateField === 'received_date' ? 'data de recebimento' : 'data selecionada'}</b>.
      </AlertBox>

      <div className="grid-stats">
        <StatCard label="Solicitações recebidas" value={ind.total} />
        <StatCard label="Com data agendada" value={ind.scheduled} />
        <StatCard label="Realizadas" value={ind.done} accent="var(--ok-700)" />
        <StatCard label="Canceladas" value={ind.canceled} accent="var(--ink-500)" />
        <StatCard label="Não realizadas" value={ind.notDone} accent="var(--crit-700)" />
        <StatCard label="Com reagendamento" value={ind.rescheduled} accent="var(--warn-700)" />
        <StatCard label="Em aberto" value={ind.open} accent="var(--solar-purple-600)" />
        <StatCard label="Sem material" value={ind.noMaterial} accent="var(--crit-700)" foot={`+ ${ind.materialUnknown} sem confirmação`} />
      </div>

      <div className="grid-3">
        <section className="card"><Meter label="% de execução" value={ind.done} max={ind.closed} />
          <p className="muted small" style={{ marginTop: 8 }}>Realizadas ÷ solicitações encerradas (realizada + cancelada + não realizada). {ind.open} em aberto não entram.</p></section>
        <section className="card"><Meter label="% de reagendamento" value={ind.rescheduled} max={ind.total} />
          <p className="muted small" style={{ marginTop: 8 }}>Solicitações com ao menos um reagendamento ÷ total.</p></section>
        <section className="card stack-sm">
          <b>Tempo médio</b>
          <div className="row-between small"><span>Recebimento → agendamento</span><b>{dur(ind.receivedToScheduled)}</b></div>
          <span className="muted small">mediana {ind.receivedToScheduled.median ?? '—'} · p90 {ind.receivedToScheduled.p90 ?? '—'} · n={ind.receivedToScheduled.n} ({ind.receivedToScheduled.excluded} sem dados/inconsistentes)</span>
          <div className="row-between small"><span>Recebimento → realização</span><b>{dur(ind.receivedToDone)}</b></div>
          <span className="muted small">mediana {ind.receivedToDone.median ?? '—'} · p90 {ind.receivedToDone.p90 ?? '—'} · n={ind.receivedToDone.n} ({ind.receivedToDone.excluded} sem dados)</span>
        </section>
      </div>

      <ChartCard title="Comparativo por período" subtitle="Solicitações recebidas (barras) — passe o mouse para ver as realizadas."
        data={series.series.map((s) => ({ label: s.label, value: s.total, hint: `${s.done} realizadas` }))}
        footnote={series.missing ? `${series.missing} registro(s) sem data de recebimento não entram nesta série.` : undefined}>
        <Tabs value={mode} onChange={setMode} tabs={[{ value: 'month', label: 'Mensal' }, { value: 'quarter', label: 'Trimestral' }]} />
        <VBarChart data={series.series.map((s) => ({ label: s.label, value: s.total, hint: `${s.done} realizadas` }))} />
      </ChartCard>

      <div className="grid-2">
        <BreakdownChart title="Volume por origem" b={ind.byOrigin} />
        <BreakdownChart title="Volume por prioridade" b={ind.byPriority} />
        <BreakdownChart title="Volume por forma de coleta (CVA/CVD)" b={ind.byMethod} />
        <BreakdownChart title="Volume por turno de recebimento" b={ind.byShift} />
        <BreakdownChart title="Volume por convênio" b={ind.byPlan} />
        <BreakdownChart title="Volume por município" b={ind.byCity} />
        <BreakdownChart title="Volume por bairro" b={ind.byNeighborhood} max={15} />
        <BreakdownChart title="Volume por região" b={ind.byRegion} />
        <BreakdownChart title="Produção por colaborador(a) do agendamento" b={ind.byScheduler} max={15} />
        <BreakdownChart title="Produção por enfermeiro(a) executor(a)" b={ind.byNurse} max={15} />
        <ChartCard title="Situação atual" data={ind.byStatus.items.map((i) => ({ ...i, label: label(STATUSES, i.label) }))}>
          <HBarChart data={ind.byStatus.items.map((i) => ({ ...i, label: label(STATUSES, i.label) }))} />
        </ChartCard>
      </div>
      <p className="muted small">Produção por enfermeiro considera somente coletas REALIZADAS ({ind.done}). Nomes são exibidos como registrados; variações de grafia aparecem separadas.</p>
    </div>
  );
}
