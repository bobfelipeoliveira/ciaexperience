import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertBox, Badge, PageHeader, PageLoading } from '../../../core/components/ui';
import { ChartCard, HBarChart } from '../../../core/components/Charts';
import { addDaysISO, fmtDate, todayISO } from '../../../core/lib/dates';
import { useUrineData, settingNumber } from '../hooks/UrineData';
import { applyFilters, emptyFilters } from '../domain/filters';
import { isActiveStatus, label, PERIODS, PRIORITIES, PRIORITY_COLOR, STATUSES } from '../domain/constants';
import { regionOf, findNeighborhood, findCity } from '../geo/gazetteer';
import { clusterPoints, type GeoPoint } from '../geo/cluster';
import type { UrineRequest } from '../domain/types';
import { FiltersBar } from '../components/FiltersBar';

/** Pequeno deslocamento determinístico para pontos do mesmo bairro não ficarem sobrepostos. */
function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const ang = (h % 360) * (Math.PI / 180);
  const rad = 0.0015 + ((h >> 9) % 100) / 100 * 0.003;
  return [Math.sin(ang) * rad, Math.cos(ang) * rad];
}

function coords(r: UrineRequest): { lat: number; lng: number } | null {
  if (r.latitude !== null && r.longitude !== null) return { lat: Number(r.latitude), lng: Number(r.longitude) };
  // registros antigos sem coordenadas: tenta pela base local (sem envio externo)
  const p = findNeighborhood(r.neighborhood, r.city) ?? findCity(r.city);
  return p ? { lat: p.lat, lng: p.lng } : null;
}

export default function MapPage() {
  const { rows, loading, settings } = useUrineData();
  const nav = useNavigate();
  const today = todayISO();
  const [filters, setFilters] = useState(() => ({ ...emptyFilters(), from: today, to: addDaysISO(today, 7) }));
  const [onlyActive, setOnlyActive] = useState(true);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const proximityKm = settingNumber(settings, 'urine.proximity_km', 6);
  const serviceMin = settingNumber(settings, 'urine.service_minutes', 30);
  const speed = settingNumber(settings, 'urine.avg_speed_kmh', 22);

  const list = useMemo(() => applyFilters(rows, filters).filter((r) => !onlyActive || isActiveStatus(r.status)), [rows, filters, onlyActive]);
  const located = useMemo(() => list.map((r) => ({ r, c: coords(r) })), [list]);
  const withLoc = useMemo(() => located.filter((x) => x.c), [located]);
  const withoutLoc = useMemo(() => located.filter((x) => !x.c).map((x) => x.r), [located]);

  const clusters = useMemo(() => clusterPoints(
    withLoc.filter((x) => x.r.scheduled_date && isActiveStatus(x.r.status)).map<GeoPoint>((x) => ({
      id: x.r.id, lat: x.c!.lat, lng: x.c!.lng, label: x.r.patient_name, region: regionOf(x.r.neighborhood, x.r.city),
      priority: x.r.priority, date: x.r.scheduled_date,
    })), proximityKm, serviceMin, speed), [withLoc, proximityKm, serviceMin, speed]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = L.map(mapEl.current, { center: [-22.88, -43.3], zoom: 10, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [loading]);

  useEffect(() => {
    const lg = layer.current;
    if (!lg || !map.current) return;
    lg.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    for (const { r, c } of withLoc) {
      const [dy, dx] = jitter(r.id);
      const pos: L.LatLngExpression = [c!.lat + dy, c!.lng + dx];
      bounds.push(pos);
      const color = r.priority ? PRIORITY_COLOR[r.priority] : '#75666d';
      const m = L.circleMarker(pos, { radius: r.priority === 'EMERGENCIAL' ? 10 : 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 });
      // Conteúdo do balão montado com textContent (sem HTML do usuário → sem XSS)
      const box = document.createElement('div');
      const b = document.createElement('b'); b.textContent = r.patient_name; box.appendChild(b);
      const p1 = document.createElement('div');
      p1.textContent = `${r.scheduled_date ? fmtDate(r.scheduled_date) : 'Sem data'}${r.scheduled_period ? ' · ' + label(PERIODS, r.scheduled_period) : ''} · ${label(PRIORITIES, r.priority, 'Prioridade N/I')}`;
      box.appendChild(p1);
      const p2 = document.createElement('div');
      p2.textContent = `${[r.neighborhood, r.city].filter(Boolean).join(', ')} · ${label(STATUSES, r.status)}`;
      p2.style.color = '#75666d'; box.appendChild(p2);
      const p3 = document.createElement('div');
      p3.textContent = r.geo_precision === 'MANUAL' ? 'Localização manual' : 'Posição aproximada (centro do bairro/município)';
      p3.style.fontSize = '11px'; p3.style.color = '#75666d'; box.appendChild(p3);
      const btn = document.createElement('button');
      btn.textContent = 'Abrir solicitação'; btn.className = 'btn btn-primary btn-sm'; btn.style.marginTop = '8px';
      btn.onclick = () => nav(`/coletas/${r.id}`);
      box.appendChild(btn);
      m.bindPopup(box);
      m.addTo(lg);
    }
    if (bounds.length) map.current.fitBounds(L.latLngBounds(bounds as L.LatLngTuple[]).pad(0.2), { maxZoom: 13 });
  }, [withLoc, nav]);

  if (loading) return <PageLoading />;
  const byRegion = new Map<string, number>();
  const byCity = new Map<string, number>();
  for (const r of list) {
    const reg = regionOf(r.neighborhood, r.city) ?? 'Região não identificada';
    byRegion.set(reg, (byRegion.get(reg) ?? 0) + 1);
    byCity.set(r.city ?? 'Cidade não informada', (byCity.get(r.city ?? 'Cidade não informada') ?? 0) + 1);
  }

  return (
    <div className="stack">
      <PageHeader title="Mapa operacional" subtitle="Distribuição das coletas no estado do Rio de Janeiro (região metropolitana em destaque)." />
      <AlertBox kind="info" title="Privacidade">
        As posições são aproximadas pelo <b>bairro/município</b>, usando uma base local. Nenhum endereço de paciente é enviado a serviços externos.
        O mapa de fundo (OpenStreetMap) recebe apenas a área visualizada.
      </AlertBox>
      <FiltersBar rows={rows} value={filters} onChange={setFilters} compact />
      <div className="row-between">
        <div className="row small">
          {(['ELETIVA', 'URGENTE', 'EMERGENCIAL'] as const).map((p) => (
            <span key={p} className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'inline-block' }} />{p}</span>
          ))}
          <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#75666d', display: 'inline-block' }} />Prioridade N/I</span>
        </div>
        <label className="row small"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} style={{ width: 20, height: 20 }} /> Somente em aberto</label>
      </div>
      <div className="map-box" ref={mapEl} role="region" aria-label="Mapa das coletas" />
      <p className="muted small">{withLoc.length} de {list.length} solicitação(ões) no mapa. {withoutLoc.length > 0 && `${withoutLoc.length} sem localização identificada.`}</p>

      <section className="card">
        <div className="card-head">
          <div><h2>Sugestões de agrupamento</h2><p>Coletas na mesma data a até {proximityKm} km (linha reta). São <b>sugestões para avaliação da coordenação</b> — o sistema não define quem atenderá cada paciente.</p></div>
        </div>
        {clusters.length === 0 ? <p className="muted">Nenhum agrupamento identificado para o filtro atual.</p> : (
          <div className="grid-2">
            {clusters.map((c, i) => (
              <div key={i} className="cluster-card stack-sm">
                <div className="row-between">
                  <b>{c.date ? fmtDate(c.date) : 'Sem data'} · {c.points.length} coletas próximas</b>
                  {c.hasEmergency && <Badge tone="b-crit">Inclui emergencial</Badge>}
                </div>
                <div className="small muted">Regiões: {c.regions.join(', ') || 'não identificada'}</div>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {c.points.map((p) => {
                    const r = list.find((x) => x.id === p.id);
                    return <li key={p.id}><button className="link-btn" onClick={() => nav(`/coletas/${p.id}`)}>{p.label}</button> — {[r?.neighborhood, r?.city].filter(Boolean).join(', ')}{r?.scheduled_period ? ` · ${label(PERIODS, r.scheduled_period)}` : ''}</li>;
                  })}
                </ul>
                <div className="small">
                  Maior distância entre dois pontos: <b>{c.maxPairKm} km</b> · Percurso estimado: <b>~{c.pathKm} km</b> ·
                  Deslocamento: <b>~{c.estTravelMin} min</b> · Com atendimento ({serviceMin} min/coleta): <b>~{Math.round(c.estTotalMin / 6) / 10} h</b>
                </div>
                <p className="muted small">Estimativa simples (distância × 1,4 a {speed} km/h). Não considera trânsito, horários combinados nem disponibilidade dos profissionais — confirme antes de organizar a rota.</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid-2">
        <ChartCard title="Volume por região" data={[...byRegion].map(([l, v]) => ({ label: l, value: v }))}>
          <HBarChart data={[...byRegion].map(([l, v]) => ({ label: l, value: v }))} />
        </ChartCard>
        <ChartCard title="Volume por município" data={[...byCity].map(([l, v]) => ({ label: l, value: v }))}>
          <HBarChart data={[...byCity].map(([l, v]) => ({ label: l, value: v }))} />
        </ChartCard>
      </div>

      {withoutLoc.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Localização ainda não identificada</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Bairro/cidade ausentes ou fora da base local. Complete o endereço na solicitação ou ajuste a localização manualmente.</p>
          <ul className="small">{withoutLoc.map((r) => <li key={r.id}><button className="link-btn" onClick={() => nav(`/coletas/${r.id}`)}>{r.patient_name}</button> — bairro: {r.neighborhood ?? 'N/I'} · cidade: {r.city ?? 'N/I'}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
