import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoutes, orderStops, timeline, territoryMatrix, type RoutePoint, type RouteParams } from '../src/modules/urine-collection/geo/routing.ts';

// Pontos FICTÍCIOS (centros aproximados de bairros)
const P = (id: string, lat: number, lng: number, region: string, neighborhood: string, extra: Partial<RoutePoint> = {}): RoutePoint =>
  ({ id, lat, lng, region, neighborhood, city: null, urgent: false, period: 'MANHA', time: null, ...extra });

const pts: RoutePoint[] = [
  P('penha', -22.841, -43.28, 'Zona Norte', 'Penha'),
  P('vpenha', -22.841, -43.311, 'Zona Norte', 'Vila da Penha'),
  P('valegre', -22.829, -43.315, 'Zona Norte', 'Vista Alegre', { urgent: true }),
  P('iraja', -22.832, -43.328, 'Zona Norte', 'Irajá'),
  P('olaria', -22.846, -43.265, 'Zona Norte', 'Olaria'),
  P('copa', -22.971, -43.182, 'Zona Sul', 'Copacabana'),
  P('icarai', -22.905, -43.11, 'Leste Fluminense', 'Icaraí'),
  P('alcantara', -22.822, -43.004, 'Leste Fluminense', 'Alcântara'),
  P('tarde', -22.925, -43.233, 'Grande Tijuca', 'Tijuca', { period: 'TARDE' }),
];
const params: RouteParams = { base: { lat: -22.925, lng: -43.233, label: 'Base (Tijuca)' }, maxStops: 4, startTime: '07:30', deadline: '11:00', serviceMin: 30, speedKmh: 22, proximityKm: 6 };

test('monta pequenas rotas por região, até 4 por rota, tarde separada', () => {
  const { routes, notMorning } = planRoutes(pts, params);
  assert.deepEqual(notMorning.map((p) => p.id), ['tarde']);
  for (const r of routes) assert.ok(r.stops.length <= 4, r.name);
  const total = routes.reduce((s, r) => s + r.stops.length, 0);
  assert.equal(total, 8);
  // os 5 da Zona Norte não ficam numa rota só (máximo 4)
  const norte = routes.filter((r) => r.region.includes('Zona Norte'));
  assert.ok(norte.length >= 2);
  // a rota com urgente vem primeiro e a urgente é a primeira parada
  assert.ok(routes[0].hasUrgent);
  assert.equal(routes[0].stops[0].id, 'valegre');
  // Vila da Penha, Vista Alegre e Irajá (vizinhos) ficam juntos
  const withUrgent = routes[0].stops.map((s) => s.id);
  assert.ok(['vpenha', 'iraja'].every((id) => withUrgent.includes(id)), withUrgent.join(','));
  // Niterói e São Gonçalo (Leste Fluminense) não se misturam com Zona Sul
  const leste = routes.find((r) => r.stops.some((s) => s.id === 'icarai'))!;
  assert.ok(!leste.stops.some((s) => s.id === 'copa'));
  for (const r of routes) console.log(`${r.name} | ${r.neighborhoods.join(', ')} | ${r.stops.map((s) => s.eta).join(' → ')} | ${r.distanceKm} km | fim ${r.endTime}${r.overDeadline ? ' ⚠' : ''}`);
});

test('horários: chegada respeita deslocamento e tempo de atendimento', () => {
  const tl = timeline(orderStops([pts[0], pts[1]], params.base), params);
  assert.equal(tl.planned.length, 2);
  assert.ok(tl.planned[0].eta > '07:30');
  assert.ok(tl.planned[1].eta >= '08:00', 'segunda parada após 30 min de atendimento');
});

test('divide a rota quando passa do horário-limite', () => {
  const tight = { ...params, deadline: '08:45', maxStops: 6 };
  const { routes } = planRoutes(pts.slice(0, 5), tight);
  assert.ok(routes.length >= 2);
  assert.ok(routes.every((r) => !r.overDeadline || r.stops.length === 1));
});

test('horário combinado: não chega antes e sinaliza atraso', () => {
  const fixed = P('fixa', -22.841, -43.28, 'Zona Norte', 'Penha', { period: 'HORARIO', time: '10:00' });
  const tl = timeline([fixed], params);
  assert.equal(tl.planned[0].eta, '10:00');
});

test('análise territorial por região e dia', () => {
  const m = territoryMatrix([{ region: 'Zona Norte', date: 'd1' }, { region: 'Zona Norte', date: 'd1' }, { region: 'Zona Sul', date: 'd2' }], ['d1', 'd2'], 4);
  assert.deepEqual(m.rows.find((r) => r.region === 'Zona Norte')!.counts, [2, 0]);
  assert.equal(m.perDay[0].routesNeeded, 1);
});

test('rotas da tarde: só coletas combinadas para depois do meio-dia', () => {
  const { routes } = planRoutes(pts, { ...params, startTime: '13:30', deadline: '17:30' }, 'tarde');
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].stops.map((s) => s.id), ['tarde']);
  assert.match(routes[0].name, /\(tarde\)/);
});
