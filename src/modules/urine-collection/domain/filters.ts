import { normalize, onlyDigits } from '../../../core/lib/text.ts';
import type { UrineRequest } from './types.ts';

export interface UrineFilters {
  q: string;
  dateField: 'scheduled_date' | 'received_date' | 'collected_date' | 'created_at';
  from: string;
  to: string;
  shift: string;
  origin: string;
  priority: string;
  method: string;
  neighborhood: string;
  city: string;
  scheduler: string;
  nurse: string;
  status: string;
  material: string;
}

export const emptyFilters = (): UrineFilters => ({
  q: '', dateField: 'scheduled_date', from: '', to: '', shift: '', origin: '', priority: '', method: '',
  neighborhood: '', city: '', scheduler: '', nurse: '', status: '', material: '',
});

/** Busca por paciente, telefone ou endereço. */
export function matchesSearch(r: UrineRequest, q: string): boolean {
  if (!q.trim()) return true;
  const n = normalize(q);
  const digits = onlyDigits(q);
  if (digits.length >= 4 && (r.contact_phone ?? '').replace(/\D/g, '').includes(digits)) return true;
  const hay = normalize([r.patient_name, r.address_raw, r.address_street, r.neighborhood, r.city, r.family_contact_name, r.health_plan].filter(Boolean).join(' | '));
  return n.split(' ').every((w) => hay.includes(w));
}

export function applyFilters(rows: UrineRequest[], f: UrineFilters): UrineRequest[] {
  return rows.filter((r) => {
    if (!matchesSearch(r, f.q)) return false;
    const d = f.dateField === 'created_at' ? r.created_at?.slice(0, 10) : (r[f.dateField] as string | null);
    if ((f.from || f.to) && !d) return false;
    if (f.from && d! < f.from) return false;
    if (f.to && d! > f.to) return false;
    if (f.shift && (r.receipt_shift ?? '_') !== f.shift) return false;
    if (f.origin && (r.origin ?? '_') !== f.origin) return false;
    if (f.priority && (r.priority ?? '_') !== f.priority) return false;
    if (f.method && (r.collection_method ?? '_') !== f.method) return false;
    if (f.material && (r.material_available ?? '_') !== f.material) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.neighborhood && normalize(r.neighborhood) !== normalize(f.neighborhood)) return false;
    if (f.city && normalize(r.city) !== normalize(f.city)) return false;
    if (f.scheduler && normalize(r.scheduler_name) !== normalize(f.scheduler)) return false;
    if (f.nurse && normalize(r.nurse_name ?? r.assigned_nurse_name) !== normalize(f.nurse)) return false;
    return true;
  });
}

export function distinctValues(rows: UrineRequest[], pick: (r: UrineRequest) => string | null | undefined): string[] {
  const m = new Map<string, string>();
  for (const r of rows) {
    const v = pick(r)?.trim();
    if (v) m.set(normalize(v), m.get(normalize(v)) ?? v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function activeFilterCount(f: UrineFilters): number {
  return (Object.keys(f) as (keyof UrineFilters)[]).filter((k) => k !== 'dateField' && f[k]).length;
}
