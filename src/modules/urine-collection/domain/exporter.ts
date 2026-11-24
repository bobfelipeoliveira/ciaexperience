/**
 * Exportação no layout da planilha ORIGINAL (18 colunas, mesma ordem) e no
 * layout AMPLIADO (originais + novos campos). Protege contra "injeção de
 * fórmula" (CWE-1236) em CSV.
 */
import type { UrineRequest } from './types.ts';
import { label, MATERIAL, METHODS, ORIGINS, PERIODS, PRIORITIES, SHIFTS, STATUSES } from './constants.ts';
import { ORIGINAL_COLUMNS } from './importer.ts';

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const yn = (b: boolean | null | undefined) => (b === true ? 'SIM' : b === false ? 'NÃO' : '');
const opt = (map: Record<string, string>, v: string | null | undefined) => (v ? label(map, v) : '');

export function originalRow(r: UrineRequest): Record<string, string> {
  const notes = [r.legacy_notes, r.notes, r.status_reason && `Motivo: ${r.status_reason}`].filter(Boolean).join(' | ');
  const v: string[] = [
    opt(SHIFTS, r.receipt_shift), br(r.received_date), opt(ORIGINS, r.origin), r.patient_name, opt(METHODS, r.collection_method),
    opt(MATERIAL, r.material_available), br(r.original_scheduled_date ?? r.scheduled_date), r.family_contact_name ?? '', r.contact_phone ?? '',
    r.scheduler_name ?? '', r.health_plan ?? '', r.neighborhood ?? '',
    yn(r.needs_reschedule ?? ((r.reschedule_count ?? 0) > 0 ? true : null)),
    r.original_scheduled_date ? br(r.scheduled_date) : '', yn(r.route_support), r.nurse_name ?? '', br(r.collected_date), notes,
  ];
  return Object.fromEntries(ORIGINAL_COLUMNS.map((c, i) => [c, v[i]]));
}

export const EXTENDED_COLUMNS = [
  'ID', 'STATUS', 'PRIORIDADE', 'JUSTIFICATIVA EMERGENCIAL', 'IDADE', 'PERÍODO PREVISTO', 'HORÁRIO PREVISTO',
  'DATA AGENDADA ATUAL', 'QTD. REAGENDAMENTOS', 'ENDEREÇO ORIGINAL', 'LOGRADOURO', 'NÚMERO', 'COMPLEMENTO', 'CIDADE', 'UF', 'CEP',
  'REFERÊNCIA', 'PROFISSIONAL PREVISTO', 'RESPONSÁVEL PELO MATERIAL', 'PRAZO DO MATERIAL', 'MOTIVO (CANCEL./NÃO REALIZ.)',
  'RESULTADO OPERACIONAL', 'FORMA DE REGISTRO', 'CRIADO EM', 'ATUALIZADO EM', 'ARQUIVADO',
] as const;

export function extendedRow(r: UrineRequest): Record<string, string> {
  const base = originalRow(r);
  const ext: string[] = [
    r.id, opt(STATUSES, r.status), opt(PRIORITIES, r.priority), r.emergency_justification ?? '', r.patient_age?.toString() ?? '',
    opt(PERIODS, r.scheduled_period), r.scheduled_time?.slice(0, 5) ?? '', br(r.scheduled_date), String(r.reschedule_count ?? 0),
    r.address_raw ?? '', r.address_street ?? '', r.address_number ?? '', r.address_complement ?? '', r.city ?? '', r.state ?? '', r.cep ?? '',
    r.address_reference ?? '', r.assigned_nurse_name ?? '', r.material_responsible ?? '', br(r.material_deadline),
    r.status_reason ?? '', r.outcome ?? '', r.entry_mode === 'TEXTO_LIVRE' ? 'Bloco inteligente' : r.entry_mode === 'IMPORTACAO' ? 'Importação planilha' : 'Formulário',
    new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    new Date(r.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), r.archived_at ? 'SIM' : 'NÃO',
  ];
  return { ...base, ...Object.fromEntries(EXTENDED_COLUMNS.map((c, i) => [c, ext[i]])) };
}

export function columnsFor(layout: 'ORIGINAL' | 'AMPLIADA'): string[] {
  return layout === 'ORIGINAL' ? [...ORIGINAL_COLUMNS] : [...ORIGINAL_COLUMNS, ...EXTENDED_COLUMNS];
}

export function rowsFor(rows: UrineRequest[], layout: 'ORIGINAL' | 'AMPLIADA') {
  return rows.map(layout === 'ORIGINAL' ? originalRow : extendedRow);
}

/** Neutraliza valores que o Excel interpretaria como fórmula. */
export function csvSafe(v: string): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: UrineRequest[], layout: 'ORIGINAL' | 'AMPLIADA'): string {
  const cols = columnsFor(layout);
  const data = rowsFor(rows, layout);
  // separador ";" + BOM UTF-8: abre corretamente no Excel em português
  return '﻿' + [cols.map(csvSafe).join(';'), ...data.map((d) => cols.map((c) => csvSafe(d[c] ?? '')).join(';'))].join('\r\n');
}
