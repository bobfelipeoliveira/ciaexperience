/**
 * Indicadores calculados SOMENTE com dados confirmados.
 * Cada indicador informa o denominador e quantos registros ficaram de fora por falta de informação.
 */
import type { UrineRequest } from './types.ts';
import { isActiveStatus, label, ORIGINS, PRIORITIES, SHIFTS } from './constants.ts';
import { regionOf } from '../geo/gazetteer.ts';

export interface CountItem { label: string; value: number }
export interface Breakdown { items: CountItem[]; total: number; missing: number }

export function breakdown(rows: UrineRequest[], pick: (r: UrineRequest) => string | null | undefined): Breakdown {
  const m = new Map<string, number>();
  let missing = 0;
  for (const r of rows) {
    const v = pick(r)?.trim();
    if (!v) { missing++; continue; }
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return { items: [...m].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value), total: rows.length, missing };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export interface DurationStat { n: number; excluded: number; avg: number | null; median: number | null; p90: number | null }
export function durationStat(rows: UrineRequest[], from: (r: UrineRequest) => string | null, to: (r: UrineRequest) => string | null): DurationStat {
  const vals: number[] = [];
  let excluded = 0;
  for (const r of rows) {
    const a = from(r), b = to(r);
    if (!a || !b) { excluded++; continue; }
    const d = daysBetween(a, b);
    if (d < 0) { excluded++; continue; } // inconsistência de digitação não entra na média
    vals.push(d);
  }
  vals.sort((x, y) => x - y);
  const q = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))] : null);
  return { n: vals.length, excluded, avg: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null, median: q(0.5), p90: q(0.9) };
}

export interface IndicatorSet {
  total: number;
  scheduled: number;
  done: number;
  canceled: number;
  notDone: number;
  rescheduled: number;
  open: number;
  closed: number;
  executionRate: number | null;
  rescheduleRate: number | null;
  noMaterial: number;
  materialUnknown: number;
  byOrigin: Breakdown; byPriority: Breakdown; byMethod: Breakdown; byPlan: Breakdown; byNeighborhood: Breakdown;
  byCity: Breakdown; byShift: Breakdown; byScheduler: Breakdown; byNurse: Breakdown; byRegion: Breakdown; byStatus: Breakdown;
  receivedToScheduled: DurationStat;
  receivedToDone: DurationStat;
}

export function computeIndicators(rows: UrineRequest[]): IndicatorSet {
  const done = rows.filter((r) => r.status === 'REALIZADA');
  const canceled = rows.filter((r) => r.status === 'CANCELADA').length;
  const notDone = rows.filter((r) => r.status === 'NAO_REALIZADA').length;
  const closed = done.length + canceled + notDone;
  const rescheduled = rows.filter((r) => (r.reschedule_count ?? 0) > 0 || r.needs_reschedule === true).length;
  return {
    total: rows.length,
    scheduled: rows.filter((r) => !!r.scheduled_date).length,
    done: done.length,
    canceled, notDone, rescheduled,
    open: rows.filter((r) => isActiveStatus(r.status)).length,
    closed,
    // % execução = realizadas ÷ solicitações ENCERRADAS (realizada + cancelada + não realizada)
    executionRate: closed ? +((done.length / closed) * 100).toFixed(1) : null,
    rescheduleRate: rows.length ? +((rescheduled / rows.length) * 100).toFixed(1) : null,
    noMaterial: rows.filter((r) => r.material_available === 'NAO').length,
    materialUnknown: rows.filter((r) => !r.material_available || r.material_available === 'NAO_CONFIRMADO').length,
    byOrigin: breakdown(rows, (r) => r.origin && label(ORIGINS, r.origin)),
    byPriority: breakdown(rows, (r) => r.priority && label(PRIORITIES, r.priority)),
    byMethod: breakdown(rows, (r) => r.collection_method),
    byPlan: breakdown(rows, (r) => r.health_plan?.toUpperCase()),
    byNeighborhood: breakdown(rows, (r) => r.neighborhood),
    byCity: breakdown(rows, (r) => r.city),
    byShift: breakdown(rows, (r) => r.receipt_shift && label(SHIFTS, r.receipt_shift)),
    byScheduler: breakdown(rows, (r) => r.scheduler_name),
    byNurse: breakdown(done, (r) => r.nurse_name),
    byRegion: breakdown(rows, (r) => regionOf(r.neighborhood, r.city)),
    byStatus: breakdown(rows, (r) => r.status),
    receivedToScheduled: durationStat(rows, (r) => r.received_date, (r) => r.original_scheduled_date ?? r.scheduled_date),
    receivedToDone: durationStat(done, (r) => r.received_date, (r) => r.collected_date),
  };
}

/** Série mensal / trimestral por data de recebimento. */
export function periodSeries(rows: UrineRequest[], mode: 'month' | 'quarter', pick: (r: UrineRequest) => string | null = (r) => r.received_date) {
  const m = new Map<string, { total: number; done: number }>();
  let missing = 0;
  for (const r of rows) {
    const d = pick(r);
    if (!d) { missing++; continue; }
    const key = mode === 'month' ? d.slice(0, 7) : `${d.slice(0, 4)}-T${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`;
    const cur = m.get(key) ?? { total: 0, done: 0 };
    cur.total++;
    if (r.status === 'REALIZADA') cur.done++;
    m.set(key, cur);
  }
  const fmt = (k: string) => (mode === 'month' ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : `${k.slice(5)}/${k.slice(2, 4)}`);
  return { series: [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ key: k, label: fmt(k), ...v })), missing };
}
