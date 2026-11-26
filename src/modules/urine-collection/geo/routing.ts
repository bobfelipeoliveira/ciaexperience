/**
 * MONTAGEM DE PEQUENAS ROTAS DE URINA (sugestão para o(a) enfermeiro(a) líder validar).
 *
 * 1. Separa coletas da MANHÃ (rotas) das combinadas para tarde/noite.
 * 2. Agrupa por REGIÃO e BAIRROS PRÓXIMOS, respeitando o máximo de coletas por rota.
 * 3. Junta grupos pequenos de regiões vizinhas quando cabem numa mesma rota.
 * 4. Ordena a visita a partir da BASE: urgentes primeiro, depois o menor caminho
 *    (vizinho mais próximo + melhoria 2-opt).
 * 5. Estima horários de chegada; se passar do horário-limite, divide a rota.
 *
 * Distâncias são estimativas (linha reta × 1,4). Não considera trânsito.
 */
import { haversineKm } from './gazetteer.ts';

export interface RoutePoint {
  id: string;
  lat: number;
  lng: number;
  region: string | null;
  neighborhood: string | null;
  city: string | null;
  urgent: boolean;
  /** 'MANHA' | 'TARDE' | 'NOITE' | 'HORARIO' | 'QUALQUER' | null */
  period: string | null;
  /** horário combinado 'HH:MM' (quando período = HORARIO) */
  time: string | null;
}

export interface RouteParams {
  base: { lat: number; lng: number; label: string } | null;
  maxStops: number;
  startTime: string; // 'HH:MM'
  deadline: string; // 'HH:MM'
  serviceMin: number;
  speedKmh: number;
  proximityKm: number;
}

export interface PlannedStop { id: string; eta: string; legKm: number; lateForAgreedTime: boolean }
export interface PlannedRoute {
  key: string;
  name: string;
  region: string;
  stops: PlannedStop[];
  neighborhoods: string[];
  distanceKm: number;
  durationMin: number;
  endTime: string;
  overDeadline: boolean;
  hasUrgent: boolean;
}

export const ROAD_FACTOR = 1.4;

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

const roadKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineKm(a, b) * ROAD_FACTOR;

export function isMorning(p: Pick<RoutePoint, 'period' | 'time'>): boolean {
  if (p.period === 'TARDE' || p.period === 'NOITE') return false;
  if (p.period === 'HORARIO' && p.time && toMin(p.time) >= 12 * 60) return false;
  return true;
}

/** Ordena as paradas: urgentes primeiro (vizinho mais próximo), depois as demais + 2-opt. */
export function orderStops(points: RoutePoint[], base: RouteParams['base']): RoutePoint[] {
  const urgent = points.filter((p) => p.urgent);
  const rest = points.filter((p) => !p.urgent);
  const out: RoutePoint[] = [];
  let cur: { lat: number; lng: number } | null = base;
  for (const group of [urgent, rest]) {
    const pool = [...group];
    while (pool.length) {
      let bi = 0;
      if (cur) {
        let bd = Infinity;
        pool.forEach((p, i) => { const d = haversineKm(cur!, p); if (d < bd) { bd = d; bi = i; } });
      }
      const nx = pool.splice(bi, 1)[0];
      out.push(nx);
      cur = nx;
    }
  }
  // 2-opt apenas no trecho não urgente (não altera a prioridade das urgentes)
  const fixed = urgent.length;
  const pathLen = (arr: RoutePoint[]) => {
    let d = base && arr.length ? haversineKm(base, arr[0]) : 0;
    for (let i = 1; i < arr.length; i++) d += haversineKm(arr[i - 1], arr[i]);
    return d;
  };
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = fixed; i < out.length - 1; i++) {
      for (let k = i + 1; k < out.length; k++) {
        const cand = [...out.slice(0, i), ...out.slice(i, k + 1).reverse(), ...out.slice(k + 1)];
        if (pathLen(cand) + 1e-9 < pathLen(out)) { out.splice(0, out.length, ...cand); improved = true; }
      }
    }
  }
  return out;
}

/** Calcula horários estimados e distâncias de uma sequência de paradas. */
export function timeline(stops: RoutePoint[], params: RouteParams) {
  let t = toMin(params.startTime);
  let km = 0;
  let prev: { lat: number; lng: number } | null = params.base;
  const planned: PlannedStop[] = [];
  for (const s of stops) {
    const leg = prev ? roadKm(prev, s) : 0;
    km += leg;
    t += (leg / Math.max(params.speedKmh, 5)) * 60;
    // não chega antes de um horário combinado
    if (s.period === 'HORARIO' && s.time && toMin(s.time) > t) t = toMin(s.time);
    planned.push({ id: s.id, eta: toHHMM(t), legKm: Math.round(leg * 10) / 10, lateForAgreedTime: !!(s.period === 'HORARIO' && s.time && t > toMin(s.time) + 15) });
    t += params.serviceMin;
    prev = s;
  }
  const end = t;
  return { planned, distanceKm: Math.round(km * 10) / 10, durationMin: Math.round(end - toMin(params.startTime)), endTime: toHHMM(end), overDeadline: end > toMin(params.deadline) };
}

function centroid(ps: RoutePoint[]) {
  return { lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length };
}
function minDist(a: RoutePoint[], b: RoutePoint[]) {
  let d = Infinity;
  for (const x of a) for (const y of b) d = Math.min(d, haversineKm(x, y));
  return d;
}

/** Agrupa pontos de uma região em grupos compactos de até maxStops. */
function clusterRegion(points: RoutePoint[], params: RouteParams): RoutePoint[][] {
  const pool = [...points];
  const groups: RoutePoint[][] = [];
  const ref = params.base ?? centroid(points);
  // equilibra: 5 coletas com máximo 4 → rotas de 3 e 2 (evita rota de uma coleta só)
  const nRoutes = Math.ceil(points.length / Math.max(1, params.maxStops));
  const target = Math.ceil(points.length / nRoutes);
  while (pool.length) {
    // semente: urgente mais distante da base; senão, o ponto mais distante (evita "sobras" longe)
    const cands = pool.some((p) => p.urgent) ? pool.filter((p) => p.urgent) : pool;
    let seed = cands[0];
    for (const p of cands) if (haversineKm(ref, p) > haversineKm(ref, seed)) seed = p;
    pool.splice(pool.indexOf(seed), 1);
    const g = [seed];
    while (g.length < target && pool.length) {
      let best: RoutePoint | null = null;
      let bd = Infinity;
      for (const p of pool) { const d = minDist(g, [p]); if (d < bd) { bd = d; best = p; } }
      // dentro da mesma região aceita bairros um pouco mais distantes (ex.: Niterói ↔ São Gonçalo)
      if (!best || bd > params.proximityKm * 3) break;
      g.push(best);
      pool.splice(pool.indexOf(best), 1);
    }
    groups.push(g);
  }
  return groups;
}

/** Turno da tarde: saída e limite padrão (coletas combinadas com a família para depois do meio-dia). */
export const AFTERNOON = { startTime: '13:30', deadline: '17:30' };

export function planRoutes(points: RoutePoint[], params: RouteParams, session: 'manha' | 'tarde' = 'manha'): { routes: PlannedRoute[]; notMorning: RoutePoint[] } {
  const morning = points.filter((p) => (session === 'manha' ? isMorning(p) : !isMorning(p)));
  const notMorning = session === 'manha' ? points.filter((p) => !isMorning(p)) : [];

  // 1) por região
  const byRegion = new Map<string, RoutePoint[]>();
  for (const p of morning) {
    const r = p.region ?? p.city ?? 'Região não identificada';
    byRegion.set(r, [...(byRegion.get(r) ?? []), p]);
  }
  let groups: { region: string; pts: RoutePoint[] }[] = [];
  for (const [region, pts] of byRegion) for (const g of clusterRegion(pts, params)) groups.push({ region, pts: g });

  // 2) junta grupos pequenos de regiões vizinhas
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        if (a.pts.length + b.pts.length > params.maxStops) continue;
        if (minDist(a.pts, b.pts) > params.proximityKm) continue;
        groups[i] = { region: a.region === b.region ? a.region : `${a.region} + ${b.region}`, pts: [...a.pts, ...b.pts] };
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }

  // 3) ordena, calcula horários e divide se passar do limite
  const routes: PlannedRoute[] = [];
  const queue = [...groups];
  while (queue.length) {
    const g = queue.shift()!;
    let ordered = orderStops(g.pts, params.base);
    let tl = timeline(ordered, params);
    const overflow: RoutePoint[] = [];
    while (tl.overDeadline && ordered.length > 1) {
      overflow.unshift(ordered.pop()!);
      tl = timeline(ordered, params);
    }
    if (overflow.length) queue.push({ region: g.region, pts: overflow });
    routes.push({
      key: ordered.map((p) => p.id).join('|'),
      name: '',
      region: g.region,
      stops: tl.planned,
      neighborhoods: [...new Set(ordered.map((p) => p.neighborhood ?? p.city ?? 'bairro N/I'))],
      distanceKm: tl.distanceKm,
      durationMin: tl.durationMin,
      endTime: tl.endTime,
      overDeadline: tl.overDeadline,
      hasUrgent: ordered.some((p) => p.urgent),
    });
  }
  routes.sort((a, b) => Number(b.hasUrgent) - Number(a.hasUrgent) || a.region.localeCompare(b.region, 'pt-BR'));
  routes.forEach((r, i) => { r.name = `Rota ${i + 1} · ${r.region}${session === 'tarde' ? ' (tarde)' : ''}`; });
  return { routes, notMorning };
}

/** Análise territorial: coletas em aberto por região e por dia, com nº de rotas necessárias. */
export function territoryMatrix(items: { region: string; date: string }[], dates: string[], maxStops: number) {
  const regions = [...new Set(items.map((i) => i.region))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cell = (r: string, d: string) => items.filter((i) => i.region === r && i.date === d).length;
  return {
    regions,
    rows: regions.map((r) => ({ region: r, counts: dates.map((d) => cell(r, d)), total: dates.reduce((s, d) => s + cell(r, d), 0) })),
    perDay: dates.map((d) => {
      const n = items.filter((i) => i.date === d).length;
      return { date: d, total: n, routesNeeded: Math.ceil(n / Math.max(1, maxStops)) };
    }),
  };
}
