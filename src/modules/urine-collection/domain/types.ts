import type { AttachmentCategory, Material, Method, Origin, Period, Priority, Shift, Status } from './constants.ts';

/** Registro de coleta como guardado no banco (tabela urine_collection_requests). */
export interface UrineRequest {
  id: string;
  patient_name: string;
  patient_age: number | null;
  health_plan: string | null;
  collection_method: Method | null;
  origin: Origin | null;
  priority: Priority | null;
  emergency_justification: string | null;
  material_available: Material | null;
  material_responsible: string | null;
  material_deadline: string | null;
  received_date: string | null;
  receipt_shift: Shift | null;
  scheduled_date: string | null;
  original_scheduled_date: string | null;
  scheduled_period: Period | null;
  scheduled_time: string | null;
  family_contact_name: string | null;
  contact_phone: string | null;
  scheduler_name: string | null;
  scheduler_user_id: string | null;
  address_raw: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  address_reference: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: 'BAIRRO' | 'MUNICIPIO' | 'ENDERECO' | 'MANUAL' | null;
  geo_source: string | null;
  needs_reschedule: boolean | null;
  reschedule_count: number;
  route_support: boolean | null;
  assigned_nurse_name: string | null;
  nurse_name: string | null;
  collected_date: string | null;
  status: Status;
  status_reason: string | null;
  outcome: string | null;
  notes: string | null;
  legacy_notes: string | null;
  entry_mode: 'TEXTO_LIVRE' | 'FORMULARIO' | 'IMPORTACAO';
  import_key: string | null;
  legacy_data: Record<string, unknown> | null;
  archived_at: string | null;
  archive_reason: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  status_changed_at: string;
}

/** Campos editáveis (formulário e bloco inteligente geram exatamente este formato). */
export type UrineRequestInput = Pick<UrineRequest,
  | 'patient_name' | 'patient_age' | 'health_plan' | 'collection_method' | 'origin' | 'priority'
  | 'emergency_justification' | 'material_available' | 'material_responsible' | 'material_deadline'
  | 'received_date' | 'receipt_shift' | 'scheduled_date' | 'scheduled_period' | 'scheduled_time'
  | 'family_contact_name' | 'contact_phone' | 'scheduler_name' | 'address_raw' | 'address_street'
  | 'address_number' | 'address_complement' | 'neighborhood' | 'city' | 'state' | 'cep'
  | 'address_reference' | 'route_support' | 'assigned_nurse_name' | 'status' | 'notes'
  | 'latitude' | 'longitude' | 'geo_precision' | 'geo_source'
>;

export interface Reschedule {
  id: string;
  request_id: string;
  original_date: string | null;
  new_date: string | null;
  new_period: Period | null;
  reason: string;
  changed_by_name: string | null;
  changed_at: string;
  source: 'SISTEMA' | 'IMPORTACAO';
}

export interface Attachment {
  id: string;
  request_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: AttachmentCategory;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface UrineAlert {
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  request_ids: string[];
  total: number;
}

export function emptyInput(): UrineRequestInput {
  return {
    patient_name: '', patient_age: null, health_plan: null, collection_method: null, origin: null,
    priority: null, emergency_justification: null, material_available: null, material_responsible: null,
    material_deadline: null, received_date: null, receipt_shift: null, scheduled_date: null,
    scheduled_period: null, scheduled_time: null, family_contact_name: null, contact_phone: null,
    scheduler_name: null, address_raw: null, address_street: null, address_number: null,
    address_complement: null, neighborhood: null, city: null, state: null, cep: null,
    address_reference: null, route_support: null, assigned_nurse_name: null, status: 'RECEBIDA', notes: null,
    latitude: null, longitude: null, geo_precision: null, geo_source: null,
  };
}
