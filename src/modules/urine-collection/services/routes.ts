import { supabase } from '../../../core/supabase';

export interface SavedStop { id: string; route_id: string; request_id: string; seq: number; eta: string | null; leg_km: number | null }
export interface SavedRoute {
  id: string; route_date: string; name: string; region: string | null; status: 'RASCUNHO' | 'VALIDADA' | 'CANCELADA';
  nurse_name: string | null; start_time: string | null; notes: string | null; est_distance_km: number | null; est_duration_min: number | null;
  validated_by_name: string | null; validated_at: string | null; created_at: string; updated_at: string;
  urine_collection_route_stops: SavedStop[];
}

export async function listRoutes(from: string, to: string): Promise<SavedRoute[]> {
  const { data, error } = await supabase
    .from('urine_collection_routes')
    .select('*, urine_collection_route_stops(*)')
    .gte('route_date', from).lte('route_date', to)
    .neq('status', 'CANCELADA')
    .order('route_date').order('name');
  if (error) throw error;
  return ((data ?? []) as SavedRoute[]).map((r) => ({ ...r, urine_collection_route_stops: [...r.urine_collection_route_stops].sort((a, b) => a.seq - b.seq) }));
}

export interface RoutePayload {
  id?: string | null; route_date: string; name: string; region: string | null; nurse_name: string | null;
  start_time: string | null; notes: string | null; est_distance_km: number; est_duration_min: number;
  stops: { request_id: string; eta: string | null; leg_km: number | null }[];
}

export async function saveRoute(p: RoutePayload): Promise<string> {
  const { data, error } = await supabase.rpc('urine_route_save', { p });
  if (error) throw error;
  return data as string;
}

export async function setRouteStatus(id: string, status: 'VALIDADA' | 'RASCUNHO' | 'CANCELADA') {
  const { error } = await supabase.rpc('urine_route_set_status', { p_id: id, p_status: status });
  if (error) throw error;
}

export async function staffNames(): Promise<string[]> {
  const { data } = await supabase.rpc('list_staff', { p_module: 'urine_collection' });
  return ((data ?? []) as { full_name: string }[]).map((s) => s.full_name);
}
