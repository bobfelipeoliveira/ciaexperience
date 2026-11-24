/**
 * Gráficos simples e acessíveis (série única, cor institucional).
 * - Tooltip ao passar o mouse/tocar.
 * - Botão "Ver tabela" com os números exatos.
 * - Sempre mostram o denominador e os registros sem informação.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface Datum { label: string; value: number; hint?: string }

function Tip({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  if (!tip) return null;
  return <div className="chart-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>;
}

function DataTable({ data, valueLabel }: { data: Datum[]; valueLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Categoria</th><th className="num">{valueLabel}</th><th className="num">%</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><td>{d.label}</td><td className="num">{d.value}</td><td className="num">{total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({ title, subtitle, children, footnote, data, valueLabel = 'Quantidade' }: {
  title: string; subtitle?: ReactNode; children: ReactNode; footnote?: ReactNode; data?: Datum[]; valueLabel?: string;
}) {
  const [table, setTable] = useState(false);
  return (
    <section className="card">
      <div className="card-head">
        <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
        {data && data.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setTable((t) => !t)}>
            <Icon name={table ? 'chart' : 'table'} size={16} /> {table ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </div>
      {table && data ? <DataTable data={data} valueLabel={valueLabel} /> : children}
      {footnote && <p className="muted small" style={{ marginTop: 10 }}>{footnote}</p>}
    </section>
  );
}

/** Barras horizontais ordenadas (comparação de categorias). */
export function HBarChart({ data, max = 12, unit = '' }: { data: Datum[]; max?: number; unit?: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  if (!data.length) return <p className="muted small">Sem dados para o filtro selecionado.</p>;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (rest.length) shown.push({ label: `Outros (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0) });
  const top = Math.max(...shown.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="hbar" role="img" aria-label={shown.map((d) => `${d.label}: ${d.value}${unit}`).join('; ')}>
      {shown.map((d) => (
        <div className="hbar-row" key={d.label}
          onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${d.label}: ${d.value}${unit} (${total ? ((d.value / total) * 100).toFixed(1) : 0}%)${d.hint ? ' · ' + d.hint : ''}` })}
          onMouseLeave={() => setTip(null)}>
          <span className="hbar-label" title={d.label}>{d.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(d.value / top) * 100}%` }} /></span>
          <span className="hbar-value">{d.value}{unit}</span>
        </div>
      ))}
      <Tip tip={tip} />
    </div>
  );
}

/** Colunas verticais em ordem temporal (meses / trimestres). */
export function VBarChart({ data, unit = '' }: { data: Datum[]; unit?: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  if (!data.length) return <p className="muted small">Sem dados para o período.</p>;
  const top = Math.max(...data.map((d) => d.value), 1);
  const labelEvery = data.length > 8 ? Math.ceil(data.length / 8) : 1;
  return (
    <div role="img" aria-label={data.map((d) => `${d.label}: ${d.value}${unit}`).join('; ')}>
      <div className="vbars">
        {data.map((d, i) => (
          <div className="vbar-col" key={d.label}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${d.label}: ${d.value}${unit}${d.hint ? ' · ' + d.hint : ''}` })}
            onMouseLeave={() => setTip(null)}>
            {(i === data.length - 1 || d.value === top) && <span className="vbar-val">{d.value}{unit}</span>}
            <div className="vbar" style={{ height: `${(d.value / top) * 85}%` }} />
          </div>
        ))}
      </div>
      <div className="vbar-labels">{data.map((d, i) => <span key={d.label}>{i % labelEvery === 0 ? d.label : ''}</span>)}</div>
      <Tip tip={tip} />
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="stack-sm">
      <div className="row-between small"><span>{label}</span><b>{max ? pct.toFixed(1) : '—'}%</b></div>
      <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}><span style={{ width: `${pct}%` }} /></div>
      <span className="muted small">{value} de {max}</span>
    </div>
  );
}
