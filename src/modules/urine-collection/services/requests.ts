import { supabase, fetchAll } from '../../../core/supabase';
import type { Attachment, Reschedule, UrineAlert, UrineRequest, UrineRequestInput } from '../domain/types';
import type { AttachmentCategory, Period } from '../domain/constants';
import { activeGeoProvider } from '../geo/provider';

const T = 'urine_collection_requests';

export async function listRequests(includeArchived = false): Promise<UrineRequest[]> {
  return fetchAll<UrineRequest>((from, to) => {
    let q = supabase.from(T).select('*').order('created_at', { ascending: false }).range(from, to);
    if (!includeArchived) q = q.is('archived_at', null);
    return q;
  });
}

export async function getRequest(id: string): Promise<UrineRequest | null> {
  const { data, error } = await supabase.from(T).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as UrineRequest | null;
}

/** Preenche coordenadas aproximadas (bairro/município) pelo provedor local, sem envio externo. */
async function withGeo<T extends Partial<UrineRequestInput>>(input: T): Promise<T> {
  if (input.geo_precision === 'MANUAL') return input;
  if (input.neighborhood === undefined && input.city === undefined) return input;
  const g = await activeGeoProvider.locate({ neighborhood: input.neighborhood ?? null, city: input.city ?? null });
  return {
    ...input,
    latitude: g?.lat ?? null,
    longitude: g?.lng ?? null,
    geo_precision: g?.precision ?? null,
    geo_source: g?.source ?? null,
  };
}

export async function createRequest(input: UrineRequestInput, entryMode: 'TEXTO_LIVRE' | 'FORMULARIO'): Promise<UrineRequest> {
  const payload = await withGeo({ ...input, entry_mode: entryMode });
  const { data, error } = await supabase.from(T).insert(payload).select('*').single();
  if (error) throw error;
  return data as UrineRequest;
}

export async function updateRequest(id: string, patch: Partial<UrineRequest>): Promise<UrineRequest> {
  const payload = await withGeo(patch as Partial<UrineRequestInput>);
  const { data, error } = await supabase.from(T).update(payload).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Você não tem permissão para alterar esta solicitação.');
  return data as UrineRequest;
}

export async function rescheduleRequest(id: string, newDate: string, reason: string, period: Period | null, time: string | null) {
  const { error } = await supabase.rpc('urine_reschedule', {
    p_request: id, p_new_date: newDate, p_reason: reason, p_new_period: period, p_new_time: time,
  });
  if (error) throw error;
}

export async function archiveRequest(id: string, reason: string) {
  return updateRequest(id, { archived_at: new Date().toISOString(), archive_reason: reason });
}
export async function unarchiveRequest(id: string) {
  return updateRequest(id, { archived_at: null });
}
export async function deleteRequest(id: string) {
  // remove os arquivos do storage antes (a tabela de anexos é apagada em cascata)
  const atts = await listAttachments(id);
  if (atts.length) await supabase.storage.from(BUCKET).remove(atts.map((a) => a.storage_path));
  const { error, count } = await supabase.from(T).delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('Você não tem permissão para excluir esta solicitação.');
}

export async function findDuplicates(patient: string, phone: string | null, exclude?: string) {
  if (!patient.trim() && !phone) return [];
  const { data, error } = await supabase.rpc('urine_find_duplicates', { p_patient: patient, p_phone: phone, p_exclude: exclude ?? null });
  if (error) throw error;
  return (data ?? []) as { id: string; patient_name: string; scheduled_date: string | null; status: string; received_date: string | null; neighborhood: string | null; match: string }[];
}

export async function listReschedules(id: string): Promise<Reschedule[]> {
  const { data, error } = await supabase.from('urine_collection_reschedules').select('*').eq('request_id', id).order('changed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Reschedule[];
}

export interface AuditEntry { id: number; occurred_at: string; user_id: string | null; action: string; table_name: string; record_id: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }
export async function listHistory(id: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from('audit_logs').select('*').eq('record_id', id).order('occurred_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export async function fetchAlerts(): Promise<UrineAlert[]> {
  const { data, error } = await supabase.rpc('urine_alerts');
  if (error) throw error;
  return (data ?? []) as UrineAlert[];
}

/* ------------------------------ Anexos ------------------------------ */
export const BUCKET = 'urine-attachments';
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES = 10 * 1024 * 1024;

export async function listAttachments(requestId: string): Promise<Attachment[]> {
  const { data, error } = await supabase.from('urine_collection_attachments').select('*').eq('request_id', requestId).order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

function safeFileName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
  return base.slice(-80) || 'arquivo';
}

/** Confere a "assinatura" do arquivo (não confia só na extensão). */
async function sniffMime(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  return null;
}

export async function uploadAttachment(requestId: string, file: File, category: AttachmentCategory): Promise<void> {
  if (file.size > MAX_BYTES) throw new Error('Arquivo muito grande. O limite é 10 MB.');
  const mime = await sniffMime(file);
  if (!mime || !ALLOWED_MIME.includes(mime)) throw new Error('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.');
  const path = `${requestId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('urine_collection_attachments').insert({
    request_id: requestId, storage_path: path, file_name: file.name.slice(0, 200), mime_type: mime, size_bytes: file.size, category,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // não deixa arquivo órfão
    throw error;
  }
}

/** URL temporária (60 s) — nunca link público. */
export async function attachmentUrl(a: Attachment, download = false): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 60, download ? { download: a.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(a: Attachment): Promise<void> {
  const { error, count } = await supabase.from('urine_collection_attachments').delete({ count: 'exact' }).eq('id', a.id);
  if (error) throw error;
  if (!count) throw new Error('Você não tem permissão para excluir este anexo.');
  const rm = await supabase.storage.from(BUCKET).remove([a.storage_path]);
  if (rm.error) throw rm.error;
}

/* ------------------------------ Configurações ------------------------------ */
export async function fetchModuleSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('system_settings').select('key,value').like('key', 'urine.%');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
