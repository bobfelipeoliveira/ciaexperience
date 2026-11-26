/**
 * Sugestões logísticas (NUNCA decisões): agrupa coletas da mesma data cujos
 * pontos aproximados estão a até X km (linha reta). As estimativas de tempo são
 * simples e declaradas como tal — não consideram trânsito nem rotas reais.
 */
import { haversineKm } from './gazetteer.ts';

export interface GeoPoint { id: string; lat: number; lng: number; label: string; region: string | null; priority: string | null; date: string | null; }
export interface Cluster {
  date: string | null;
  points: GeoPoint[];
  regions: string[];
  maxPairKm: number;
  pathKm: number;
  estTravelMin: number;
  estTotalMin: number;
  hasUrgent: boolean;
}

export function clusterPoints(points: GeoPoint[], maxKm: number, serviceMin: number, speedKmh: number): Cluster[] {
  const byDate = new Map<string, GeoPoint[]>();
  for (const p of points) {
    const k = p.date ?? 'sem-data';
    byDate.set(k, [...(byDate.get(k) ?? []), p]);
  }
  const clusters: Cluster[] = [];
  for (const [date, pts] of byDate) {
    // ligação simples (single-linkage) por distância
    const parent = pts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        if (haversineKm(pts[i], pts[j]) <= maxKm) parent[find(i)] = find(j);
    const groups = new Map<number, GeoPoint[]>();
    pts.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      let maxPair = 0;
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) maxPair = Math.max(maxPair, haversineKm(g[i], g[j]));
      // caminho aproximado: vizinho mais próximo a partir do primeiro ponto
      const rest = [...g.slice(1)];
      let cur = g[0];
      let path = 0;
      while (rest.length) {
        rest.sort((a, b) => haversineKm(cur, a) - haversineKm(cur, b));
        const nx = rest.shift()!;
        path += haversineKm(cur, nx);
        cur = nx;
      }
      const roadKm = path * 1.4; // fator de sinuosidade urbana (estimativa)
      const travel = Math.round((roadKm / Math.max(speedKmh, 5)) * 60);
      clusters.push({
        date: date === 'sem-data' ? null : date,
        points: g,
        regions: [...new Set(g.map((p) => p.region).filter(Boolean) as string[])],
        maxPairKm: Math.round(maxPair * 10) / 10,
        pathKm: Math.round(roadKm * 10) / 10,
        estTravelMin: travel,
        estTotalMin: travel + g.length * serviceMin,
        hasUrgent: g.some((p) => p.priority === 'URGENTE'),
      });
    }
  }
  return clusters.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.points.length - a.points.length);
}
