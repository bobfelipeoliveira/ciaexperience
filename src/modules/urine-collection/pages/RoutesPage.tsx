import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertBox, Badge, ConfirmDialog, ErrorBox, PageHeader, PageLoading, useToast } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { useAuth } from '../../../core/auth/AuthProvider';
import { friendlyError } from '../../../core/lib/errors';
import { addDaysISO, fmtDate, fmtDateShort, fmtDateTime, todayISO, WEEKDAYS, weekdayOf } from '../../../core/lib/dates';
import { formatPhone } from '../../../core/lib/text';
import { supabase } from '../../../core/supabase';
import { useUrineData, settingNumber } from '../hooks/UrineData';
import { isActiveStatus, label, MATERIAL, METHODS, PERIODS } from '../domain/constants';
import type { UrineRequest } from '../domain/types';
import { findCity, findNeighborhood, regionOf } from '../geo/gazetteer';
import { AFTERNOON, isMorning, orderStops, planRoutes, territoryMatrix, timeline, toMin, type RouteParams, type RoutePoint } from '../geo/routing';
import { listRoutes, saveRoute, setRouteStatus, staffNames, type SavedRoute } from '../services/routes';
import { StatusBadge } from '../components/Badges';

const ROUTE_COLORS = ['#7a1e3a', '#6b3fa0', '#0f766e', '#b45309', '#be185d', '#4d7c0f', '#475569', '#9a3412'];

interface EditRoute {
  key: string;
  id: string | null;
  status: 'NOVA' | 'RASCUNHO' | 'VALIDADA';
  name: string;
  region: string;
  nurse: string;
  start: string;
  notes: string;
  stopIds: string[];
  dirty: boolean;
  validatedBy: string | null;
  validatedAt: string | null;
}

function coords(r: UrineRequest): { lat: number; lng: number } | null {
  if (r.latitude !== null && r.longitude !== null) return { lat: Number(r.latitude), lng: Number(r.longitude) };
  const p = findNeighborhood(r.neighborhood, r.city) ?? findCity(r.city);
  return p ? { lat: p.lat, lng: p.lng } : null;
}
function toPoint(r: UrineRequest): RoutePoint | null {
  const c = coords(r);
  if (!c) return null;
  return {
    id: r.id, lat: c.lat, lng: c.lng, region: regionOf(r.neighborhood, r.city), neighborhood: r.neighborhood, city: r.city,
    urgent: r.priority === 'URGENTE', period: r.scheduled_period, time: r.scheduled_time?.slice(0, 5) ?? null,
  };
}
function addressLine(r: UrineRequest): string {
  const street = [r.address_street, r.address_number].filter(Boolean).join(', ');
  return [street || null, r.address_complement, r.neighborhood, r.city].filter(Boolean).join(' — ') || r.address_raw || 'Endereço não informado';
}
function navAddress(r: UrineRequest): string {
  const street = [r.address_street, r.address_number].filter(Boolean).join(', ');
  if (street && (r.neighborhood || r.city)) return [street, r.neighborhood, r.city, r.state ?? 'RJ'].filter(Boolean).join(', ');
  const c = coords(r);
  return c ? `${c.lat},${c.lng}` : [r.neighborhood, r.city].filter(Boolean).join(', ');
}

export default function RoutesPage() {
  const { rows, loading, settings, byId } = useUrineData();
  const { hasRole } = useAuth();
  const canEdit = hasRole('urine_collection', ['coordenacao']);
  const toast = useToast();
  const nav = useNavigate();
  const today = todayISO();
  const [date, setDate] = useState(addDaysISO(today, 1));
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [routes, setRoutes] = useState<EditRoute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [staff, setStaff] = useState<string[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<EditRoute | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const base = (settings['urine.route_base'] ?? null) as { label: string; lat: number; lng: number } | null;
  const params: RouteParams = useMemo(() => ({
    base: base && Number.isFinite(base.lat) && Number.isFinite(base.lng) ? base : null,
    maxStops: settingNumber(settings, 'urine.route_max_stops', 4),
    startTime: String(settings['urine.route_start_time'] ?? '07:30'),
    deadline: String(settings['urine.route_deadline'] ?? '11:00'),
    serviceMin: settingNumber(settings, 'urine.service_minutes', 30),
    speedKmh: settingNumber(settings, 'urine.avg_speed_kmh', 22),
    proximityKm: settingNumber(settings, 'urine.proximity_km', 6),
  }), [settings, base]);

  const loadSaved = useCallback(async () => {
    try { setSaved(await listRoutes(today, addDaysISO(today, 13))); setError(null); }
    catch (e) { setError(friendlyError(e)); }
  }, [today]);
  useEffect(() => { void loadSaved(); void staffNames().then(setStaff); }, [loadSaved]);
  useEffect(() => {
    const ch = supabase.channel('urine-routes').on('postgres_changes', { event: '*', schema: 'public', table: 'urine_collection_routes' }, () => void loadSaved()).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadSaved]);

  // rotas salvas do dia → modo de edição (preserva sugestões novas ainda não salvas)
  useEffect(() => {
    setRoutes((cur) => {
      const fromDb: EditRoute[] = saved.filter((s) => s.route_date === date).map((s) => ({
        key: s.id, id: s.id, status: s.status === 'VALIDADA' ? 'VALIDADA' : 'RASCUNHO', name: s.name, region: s.region ?? '',
        nurse: s.nurse_name ?? '', start: s.start_time?.slice(0, 5) ?? params.startTime, notes: s.notes ?? '',
        stopIds: s.urine_collection_route_stops.map((x) => x.request_id), dirty: false,
        validatedBy: s.validated_by_name, validatedAt: s.validated_at,
      }));
      const used = new Set(fromDb.flatMap((r) => r.stopIds));
      const keep = cur.filter((r) => r.id === null && r.key.startsWith(date) && r.stopIds.every((id) => !used.has(id)));
      return [...fromDb, ...keep];
    });
  }, [saved, date, params.startTime]);

  const dayRows = useMemo(() => rows.filter((r) => r.scheduled_date === date && isActiveStatus(r.status) && !r.archived_at), [rows, date]);
  const inRoutes = new Set(routes.flatMap((r) => r.stopIds));
  const unrouted = dayRows.filter((r) => !inRoutes.has(r.id));
  const noLocation = unrouted.filter((r) => !coords(r));
  const notMorning = unrouted.filter((r) => coords(r) && !isMorning({ period: r.scheduled_period, time: r.scheduled_time?.slice(0, 5) ?? null }));
  const available = unrouted.filter((r) => coords(r) && isMorning({ period: r.scheduled_period, time: r.scheduled_time?.slice(0, 5) ?? null }));

  const calc = useCallback((r: EditRoute) => {
    const pts = r.stopIds.map((id) => byId(id)).filter(Boolean).map((x) => toPoint(x!)).filter(Boolean) as RoutePoint[];
    const start = r.start || params.startTime;
    return timeline(pts, { ...params, startTime: start, deadline: deadlineFor(start) });
  }, [byId, params]); // eslint-disable-line react-hooks/exhaustive-deps
  function deadlineFor(start: string) { return toMin(start) >= 12 * 60 ? AFTERNOON.deadline : params.deadline; }

  // ---------------- análise territorial (14 dias) ----------------
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const territory = useMemo(() => territoryMatrix(
    rows.filter((r) => r.scheduled_date && r.scheduled_date >= today && r.scheduled_date <= days[6] && isActiveStatus(r.status) && !r.archived_at)
      .map((r) => ({ region: regionOf(r.neighborhood, r.city) ?? r.city ?? 'Não identificada', date: r.scheduled_date! })),
    days, params.maxStops), [rows, today, params.maxStops]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxCell = Math.max(1, ...territory.rows.flatMap((r) => r.counts));

  // ---------------- ações ----------------
  function suggest() {
    const morningPts = available.map(toPoint).filter(Boolean) as RoutePoint[];
    const afternoonPts = notMorning.map(toPoint).filter(Boolean) as RoutePoint[];
    if (!morningPts.length && !afternoonPts.length) { toast('info', 'Não há coletas fora das rotas para esta data.'); return; }
    const m = morningPts.length ? planRoutes(morningPts, params, 'manha').routes.map((p) => ({ p, start: params.startTime, tarde: false })) : [];
    const t = afternoonPts.length ? planRoutes(afternoonPts, { ...params, ...AFTERNOON }, 'tarde').routes.map((p) => ({ p, start: AFTERNOON.startTime, tarde: true })) : [];
    const startN = routes.length;
    setRoutes((cur) => [...cur, ...[...m, ...t].map(({ p, start, tarde }, i) => ({
      key: `${date}-${Date.now()}-${i}`, id: null, status: 'NOVA' as const, name: `Rota ${startN + i + 1} · ${p.region}${tarde ? ' (tarde)' : ''}`, region: p.region,
      nurse: '', start, notes: '', stopIds: p.stops.map((s) => s.id), dirty: true, validatedBy: null, validatedAt: null,
    }))]);
    toast('success', `${m.length} rota(s) da manhã${t.length ? ` e ${t.length} da tarde` : ''} sugerida(s). Revise, escolha o profissional e valide.`);
  }
  const update = (key: string, patch: Partial<EditRoute>) => setRoutes((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));
  function moveStop(fromKey: string, id: string, toKey: string) {
    setRoutes((cur) => cur.map((r) => {
      if (r.key === fromKey) return { ...r, stopIds: r.stopIds.filter((x) => x !== id), dirty: true };
      if (r.key === toKey) return { ...r, stopIds: [...r.stopIds, id], dirty: true };
      return r;
    }));
  }
  function shift(key: string, idx: number, dir: -1 | 1) {
    setRoutes((cur) => cur.map((r) => {
      if (r.key !== key) return r;
      const s = [...r.stopIds]; const j = idx + dir;
      if (j < 0 || j >= s.length) return r;
      [s[idx], s[j]] = [s[j], s[idx]];
      return { ...r, stopIds: s, dirty: true };
    }));
  }
  function optimize(key: string) {
    setRoutes((cur) => cur.map((r) => {
      if (r.key !== key) return r;
      const pts = r.stopIds.map((id) => byId(id)).filter(Boolean).map((x) => toPoint(x!)).filter(Boolean) as RoutePoint[];
      return { ...r, stopIds: orderStops(pts, params.base).map((p) => p.id), dirty: true };
    }));
  }
  function newEmptyRoute(withId?: string) {
    const key = `${date}-${Date.now()}`;
    setRoutes((cur) => [...cur, { key, id: null, status: 'NOVA', name: `Rota ${cur.length + 1}`, region: '', nurse: '', start: params.startTime, notes: '', stopIds: withId ? [withId] : [], dirty: true, validatedBy: null, validatedAt: null }]);
  }
  async function persist(r: EditRoute, validate: boolean) {
    if (!r.stopIds.length) { setRoutes((cur) => cur.filter((x) => x.key !== r.key)); return; }
    if (validate && !r.nurse.trim()) { toast('error', 'Escolha o(a) profissional da rota antes de validar.'); return; }
    setBusy(r.key);
    try {
      const tl = calc(r);
      const id = await saveRoute({
        id: r.id, route_date: date, name: r.name.trim() || 'Rota', region: r.region || null, nurse_name: r.nurse.trim() || null,
        start_time: r.start || null, notes: r.notes.trim() || null, est_distance_km: tl.distanceKm, est_duration_min: tl.durationMin,
        stops: tl.planned.map((p) => ({ request_id: p.id, eta: p.eta, leg_km: p.legKm })),
      });
      if (validate) await setRouteStatus(id, 'VALIDADA');
      setRoutes((cur) => cur.filter((x) => x.key !== r.key));
      await loadSaved();
      toast('success', validate ? `${r.name} validada. O profissional foi registrado nas coletas.` : `${r.name} salva como rascunho.`);
    } catch (e) { toast('error', friendlyError(e)); } finally { setBusy(null); }
  }
  async function changeStatus(r: EditRoute, status: 'RASCUNHO' | 'CANCELADA') {
    if (!r.id) { setRoutes((cur) => cur.filter((x) => x.key !== r.key)); return; }
    setBusy(r.key);
    try { await setRouteStatus(r.id, status); await loadSaved(); toast('success', status === 'RASCUNHO' ? 'Rota reaberta para ajustes.' : 'Rota cancelada. As coletas voltaram para a lista.'); }
    catch (e) { toast('error', friendlyError(e)); } finally { setBusy(null); setConfirmCancel(null); }
  }
  function mapsLink(r: EditRoute): string {
    const stops = r.stopIds.map((id) => byId(id)).filter(Boolean) as UrineRequest[];
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    if (params.base) u.searchParams.set('origin', `${params.base.lat},${params.base.lng}`);
    u.searchParams.set('destination', navAddress(stops[stops.length - 1]));
    if (stops.length > 1) u.searchParams.set('waypoints', stops.slice(0, -1).map(navAddress).join('|'));
    u.searchParams.set('travelmode', 'driving');
    return u.toString();
  }
  async function copyItinerary(r: EditRoute) {
    const tl = calc(r);
    const lines = [
      `🚗 ${r.name.toUpperCase()} — ${fmtDate(date)}`,
      `Profissional: ${r.nurse || 'a definir'} | Saída: ${r.start}${params.base ? ` (${params.base.label})` : ''} | Término previsto: ${tl.endTime}`,
      '',
      ...r.stopIds.map((id, i) => {
        const q = byId(id);
        if (!q) return '';
        const p = tl.planned[i];
        return [
          `${i + 1}) ~${p?.eta ?? '--:--'} · ${q.patient_name}${q.priority === 'URGENTE' ? ' ⚠️ URGENTE' : ''} · ${q.collection_method ?? 'forma N/I'}`,
          `   📍 ${addressLine(q)}${q.address_reference ? ` (ref.: ${q.address_reference})` : ''}`,
          `   👤 ${q.family_contact_name ?? 'familiar N/I'}${q.contact_phone ? ` · ${formatPhone(q.contact_phone)}` : ''} · Potinho: ${label(MATERIAL, q.material_available, 'N/I')}`,
          q.scheduled_period === 'HORARIO' && q.scheduled_time ? `   ⏰ Horário combinado: ${q.scheduled_time.slice(0, 5)}` : '',
          q.notes ? `   📝 ${q.notes.slice(0, 160)}` : '',
        ].filter(Boolean).join('\n');
      }),
      '',
      `Distância estimada: ~${tl.distanceKm} km (estimativa, sem trânsito).`,
    ].join('\n');
    try { await navigator.clipboard.writeText(lines); toast('success', 'Roteiro copiado. Cole no WhatsApp do profissional da rota.'); }
    catch { toast('error', 'Não foi possível copiar automaticamente neste navegador.'); }
  }

  // ---------------- mapa ----------------
  useEffect(() => {
    if (loading || !mapEl.current || map.current) return;
    map.current = L.map(mapEl.current, { center: [-22.88, -43.25], zoom: 10 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [loading]);
  useEffect(() => {
    const lg = layer.current;
    if (!lg || !map.current) return;
    lg.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    if (params.base) {
      const b: L.LatLngTuple = [params.base.lat, params.base.lng];
      bounds.push(b);
      L.marker(b, { icon: L.divIcon({ className: 'route-base', html: '<span>BASE</span>', iconSize: [46, 22] }) }).addTo(lg);
    }
    routes.forEach((r, ri) => {
      const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
      const pts = r.stopIds.map((id) => byId(id)).filter(Boolean).map((q) => ({ q: q!, c: coords(q!) })).filter((x) => x.c);
      const line: L.LatLngTuple[] = params.base ? [[params.base.lat, params.base.lng]] : [];
      pts.forEach(({ q, c }, i) => {
        const pos: L.LatLngTuple = [c!.lat + i * 0.0006, c!.lng + i * 0.0006];
        line.push(pos); bounds.push(pos);
        const m = L.marker(pos, { icon: L.divIcon({ className: 'route-pin', html: `<span style="background:${color}">${ri + 1}.${i + 1}</span>`, iconSize: [34, 22] }) });
        const box = document.createElement('div');
        const b = document.createElement('b'); b.textContent = `${r.name} · parada ${i + 1}`; box.appendChild(b);
        const t = document.createElement('div'); t.textContent = q.patient_name; box.appendChild(t);
        const t2 = document.createElement('div'); t2.textContent = [q.neighborhood, q.city].filter(Boolean).join(', '); t2.style.color = '#75666d'; box.appendChild(t2);
        m.bindPopup(box).addTo(lg);
      });
      if (line.length > 1) L.polyline(line, { color, weight: 4, opacity: 0.8, dashArray: r.status === 'VALIDADA' ? undefined : '8 6' }).addTo(lg);
    });
    available.concat(notMorning).forEach((q) => {
      const c = coords(q)!;
      bounds.push([c.lat, c.lng]);
      L.circleMarker([c.lat, c.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#9a8b92', fillOpacity: 0.9 }).bindPopup((() => { const d = document.createElement('div'); d.textContent = `${q.patient_name} — fora das rotas`; return d; })()).addTo(lg);
    });
    if (bounds.length) map.current.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 13 });
  }, [routes, available, notMorning, byId, params.base]);

  if (loading) return <PageLoading />;
  const routeOptions = routes.filter((r) => r.status !== 'VALIDADA');

  return (
    <div className="stack">
      <PageHeader title="Rotas de urina" subtitle="Análise territorial e pequenas rotas por região e bairros próximos. O sistema sugere; o(a) enfermeiro(a) líder do dia valida." />
      {error && <ErrorBox error={error} onRetry={loadSaved} />}

      <section className="card">
        <div className="card-head"><div><h2>Análise territorial · próximos 7 dias</h2><p>Coletas em aberto por região e data agendada. Clique numa data para montar as rotas.</p></div></div>
        {territory.rows.length === 0 ? <p className="muted">Nenhuma coleta agendada nos próximos 7 dias.</p> : (
          <div className="table-wrap">
            <table className="table territory">
              <thead><tr><th>Região</th>{days.map((d) => (
                <th key={d} className="num"><button className={`day-btn${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{WEEKDAYS[weekdayOf(d)]} {fmtDateShort(d)}</button></th>
              ))}<th className="num">Total</th></tr></thead>
              <tbody>
                {territory.rows.map((r) => (
                  <tr key={r.region}><td>{r.region}</td>{r.counts.map((n, i) => (
                    <td key={i} className="num heat" style={n ? { background: `color-mix(in srgb, var(--solar-wine-700) ${Math.round(12 + (n / maxCell) * 55)}%, transparent)`, color: n / maxCell > 0.55 ? '#fff' : undefined } : undefined}>{n || ''}</td>
                  ))}<td className="num"><b>{r.total}</b></td></tr>
                ))}
                <tr className="totals"><td><b>Rotas mínimas (até {params.maxStops} por rota)</b></td>{territory.perDay.map((p) => <td key={p.date} className="num"><b>{p.total ? `${p.total} → ${p.routesNeeded}` : ''}</b></td>)}<td /></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="row-between">
        <div className="row">
          {[0, 1, 2].map((i) => { const d = addDaysISO(today, i); return <button key={d} className="chip" aria-pressed={d === date} onClick={() => setDate(d)}>{i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEKDAYS[weekdayOf(d)]} · {fmtDateShort(d)}</button>; })}
          <input type="date" className="input" style={{ width: 'auto', minHeight: 44 }} value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data das rotas" />
        </div>
        {canEdit && (
          <div className="row">
            <button className="btn btn-secondary" onClick={() => newEmptyRoute()}><Icon name="plus" size={18} /> Rota vazia</button>
            <button className="btn btn-accent btn-lg" onClick={suggest} disabled={!available.length && !notMorning.filter((q) => coords(q)).length}><Icon name="route" /> Montar rotas sugeridas</button>
          </div>
        )}
      </div>

      {!params.base && <AlertBox kind="warning" title="Base de saída não configurada">As rotas são montadas, mas sem o ponto de partida os horários começam na primeira coleta. Configure em <Link to="/configuracoes">Configurações → Regras da operação</Link>.</AlertBox>}

      <div className="grid-stats">
        <div className="stat"><span className="stat-label">Coletas do dia em aberto</span><span className="stat-value">{dayRows.length}</span></div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--ok-700)' }}><span className="stat-label">Em rotas validadas</span><span className="stat-value">{routes.filter((r) => r.status === 'VALIDADA').reduce((s, r) => s + r.stopIds.length, 0)}</span></div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--warn-700)' }}><span className="stat-label">Manhã fora das rotas</span><span className="stat-value">{available.length}</span></div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--solar-purple-600)' }}><span className="stat-label">Tarde / noite</span><span className="stat-value">{notMorning.length}</span></div>
        <div className="stat" style={{ ['--stat-accent' as string]: 'var(--crit-700)' }}><span className="stat-label">Sem localização</span><span className="stat-value">{noLocation.length}</span></div>
      </div>

      <div className="map-box" ref={mapEl} role="region" aria-label="Mapa das rotas" style={{ height: 460 }} />
      <p className="muted small">Linha contínua = rota validada · tracejada = rascunho/sugestão · cinza = fora das rotas. Posições aproximadas pelo bairro. Saída {params.startTime}, limite {params.deadline}, {params.serviceMin} min por coleta, {params.speedKmh} km/h (estimativas, sem trânsito).</p>

      {routes.length === 0 && <AlertBox kind="info">Nenhuma rota para {fmtDate(date)}. {canEdit ? 'Clique em "Montar rotas sugeridas".' : 'Aguarde o(a) enfermeiro(a) líder montar e validar as rotas.'}</AlertBox>}

      <div className="grid-2">
        {routes.map((r, ri) => {
          const tl = calc(r);
          const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
          const locked = r.status === 'VALIDADA' || !canEdit;
          return (
            <section key={r.key} className="card route-card" style={{ ['--route-color' as string]: color }}>
              <div className="row-between">
                <div className="row" style={{ gap: 10 }}>
                  <span className="route-num" style={{ background: color }}>{ri + 1}</span>
                  {locked ? <h3>{r.name}</h3> : <input className="input" style={{ fontWeight: 700, minHeight: 40 }} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} aria-label="Nome da rota" />}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {r.status === 'VALIDADA' ? <Badge tone="b-ok">VALIDADA</Badge> : r.status === 'RASCUNHO' ? <Badge tone="b-warn">RASCUNHO{r.dirty ? ' · alterada' : ''}</Badge> : <Badge tone="b-info">SUGESTÃO</Badge>}
                  {r.stopIds.some((id) => byId(id)?.priority === 'URGENTE') && <Badge tone="b-crit">urgente</Badge>}
                  {tl.overDeadline && <Badge tone="b-crit">passa das {deadlineFor(r.start || params.startTime)}</Badge>}
                </div>
              </div>
              <div className="route-meta small">
                <span><Icon name="pin" size={14} /> {[...new Set(r.stopIds.map((id) => byId(id)?.neighborhood ?? byId(id)?.city).filter(Boolean))].join(', ') || '—'}</span>
                <span><Icon name="route" size={14} /> ~{tl.distanceKm} km</span>
                <span><Icon name="clock" size={14} /> {r.start} → {tl.endTime}</span>
              </div>
              <div className="grid-2">
                <label className="field"><span className="field-label small">Profissional da rota</span>
                  <input className="input" list="staff-list" value={r.nurse} disabled={locked} onChange={(e) => update(r.key, { nurse: e.target.value })} placeholder="Nome do(a) enfermeiro(a)" /></label>
                <label className="field"><span className="field-label small">Saída da base</span>
                  <input className="input" type="time" value={r.start} disabled={locked} onChange={(e) => update(r.key, { start: e.target.value })} /></label>
              </div>
              <ol className="stops">
                {r.stopIds.map((id, i) => {
                  const q = byId(id);
                  const p = tl.planned[i];
                  if (!q) return <li key={id} className="muted small">Coleta não disponível (encerrada ou arquivada).</li>;
                  return (
                    <li key={id} className="stop">
                      <div className="stop-time"><b>{p?.eta ?? '--:--'}</b><span className="muted small">{p ? `${p.legKm} km` : ''}</span></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <button className="link-btn" onClick={() => nav(`/coletas/${id}`)}>{q.patient_name}</button>
                        <div className="small muted">{addressLine(q)}</div>
                        <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                          <StatusBadge status={q.status} />
                          {q.priority === 'URGENTE' && <Badge tone="b-crit">URGENTE</Badge>}
                          <Badge tone="b-neutral" dot={false}>{label(METHODS, q.collection_method, 'forma N/I')}</Badge>
                          {q.material_available !== 'SIM' && <Badge tone="b-warn">potinho: {label(MATERIAL, q.material_available, 'N/I')}</Badge>}
                          {q.scheduled_period === 'HORARIO' && q.scheduled_time && <Badge tone={p?.lateForAgreedTime ? 'b-crit' : 'b-info'}>combinado {q.scheduled_time.slice(0, 5)}</Badge>}
                          {!q.family_contact_name && <Badge tone="b-warn">sem confirmação familiar</Badge>}
                        </div>
                      </div>
                      {!locked && (
                        <div className="stop-actions">
                          <button className="icon-btn" onClick={() => shift(r.key, i, -1)} disabled={i === 0} aria-label="Subir"><Icon name="chevronLeft" size={16} className="rot90" /></button>
                          <button className="icon-btn" onClick={() => shift(r.key, i, 1)} disabled={i === r.stopIds.length - 1} aria-label="Descer"><Icon name="chevronRight" size={16} className="rot90" /></button>
                          <select className="select" style={{ minHeight: 36, fontSize: '.8rem', width: 120 }} value="" aria-label="Mover coleta"
                            onChange={(e) => { const v = e.target.value; if (v === '__out') moveStop(r.key, id, '__none'); else if (v === '__new') { moveStop(r.key, id, '__none'); newEmptyRoute(id); } else if (v) moveStop(r.key, id, v); }}>
                            <option value="">Mover…</option>
                            {routeOptions.filter((o) => o.key !== r.key).map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                            <option value="__new">Nova rota</option>
                            <option value="__out">Tirar da rota</option>
                          </select>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {!locked && <textarea className="textarea" rows={2} placeholder="Observações da rota (ex.: passar no laboratório X às 10h)" value={r.notes} onChange={(e) => update(r.key, { notes: e.target.value })} />}
              {locked && r.notes && <p className="small">📝 {r.notes}</p>}
              {r.status === 'VALIDADA' && r.validatedBy && <p className="muted small">Validada por {r.validatedBy}{r.validatedAt ? ` em ${fmtDateTime(r.validatedAt)}` : ''}.</p>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {r.stopIds.length > 0 && <a className="btn btn-ghost btn-sm" href={mapsLink(r)} target="_blank" rel="noopener noreferrer" title="Abre a rota no Google Maps (somente endereços, sem nome do paciente)"><Icon name="map" size={16} /> Google Maps</a>}
                <button className="btn btn-ghost btn-sm" onClick={() => void copyItinerary(r)}><Icon name="file" size={16} /> Copiar roteiro</button>
                {canEdit && r.status !== 'VALIDADA' && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => optimize(r.key)}><Icon name="sparkles" size={16} /> Otimizar ordem</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => r.id ? setConfirmCancel(r) : changeStatus(r, 'CANCELADA')}><Icon name="trash" size={16} /> Descartar</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.key} onClick={() => void persist(r, false)}>Salvar rascunho</button>
                    <button className="btn btn-primary btn-sm" disabled={busy === r.key} onClick={() => void persist(r, true)}><Icon name="check" size={16} /> Validar rota</button>
                  </>
                )}
                {canEdit && r.status === 'VALIDADA' && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(r)}>Cancelar rota</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.key} onClick={() => void changeStatus(r, 'RASCUNHO')}>Reabrir para ajustes</button>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <datalist id="staff-list">{staff.map((s) => <option key={s} value={s} />)}</datalist>

      {(available.length > 0 || notMorning.length > 0 || noLocation.length > 0) && (
        <section className="card stack-sm">
          <h2>Fora das rotas · {fmtDate(date)}</h2>
          {[{ title: 'Manhã — ainda sem rota', list: available }, { title: 'Combinadas para tarde/noite — use "Montar rotas sugeridas" para criar a rota da tarde', list: notMorning }, { title: 'Sem localização — complete bairro/cidade', list: noLocation }]
            .filter((g) => g.list.length).map((g) => (
              <div key={g.title} className="stack-sm">
                <b className="small">{g.title}</b>
                {g.list.map((q) => (
                  <div key={q.id} className="row-between out-item">
                    <div style={{ minWidth: 0 }}>
                      <button className="link-btn" onClick={() => nav(`/coletas/${q.id}`)}>{q.patient_name}</button>
                      <span className="muted small"> · {[q.neighborhood, q.city].filter(Boolean).join(', ') || 'endereço N/I'} · {label(PERIODS, q.scheduled_period, 'período N/I')}{q.scheduled_time ? ` ${q.scheduled_time.slice(0, 5)}` : ''}</span>
                      {q.priority === 'URGENTE' && <Badge tone="b-crit">URGENTE</Badge>}
                    </div>
                    {canEdit && coords(q) && (
                      <select className="select" style={{ width: 'auto', minHeight: 36 }} value="" aria-label="Incluir na rota"
                        onChange={(e) => { const v = e.target.value; if (v === '__new') newEmptyRoute(q.id); else if (v) setRoutes((cur) => cur.map((r) => (r.key === v ? { ...r, stopIds: [...r.stopIds, q.id], dirty: true } : r))); }}>
                        <option value="">Incluir em…</option>
                        {routeOptions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                        <option value="__new">Nova rota</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </section>
      )}

      <AlertBox kind="info" title="Privacidade">"Google Maps" envia apenas os endereços das paradas (sem nomes) quando você clica. "Copiar roteiro" inclui nome e contato: envie somente ao profissional da rota.</AlertBox>

      {confirmCancel && (
        <ConfirmDialog danger title="Cancelar esta rota?" confirmLabel="Cancelar rota" busy={busy === confirmCancel.key}
          message={<>As {confirmCancel.stopIds.length} coleta(s) de <b>{confirmCancel.name}</b> voltam para a lista "fora das rotas". O profissional já registrado nas coletas é mantido até nova validação.</>}
          onCancel={() => setConfirmCancel(null)} onConfirm={() => void changeStatus(confirmCancel, 'CANCELADA')} />
      )}
    </div>
  );
}
