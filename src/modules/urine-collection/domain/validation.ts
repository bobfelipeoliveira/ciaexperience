import type { UrineRequestInput } from './types.ts';
import { isValidISODate } from '../../../core/lib/dates.ts';

export type FormErrors = Partial<Record<keyof UrineRequestInput | 'status_reason' | 'collected_date', string>>;

/** Validação da tela (o banco valida de novo — esta é só para orientar a técnica). */
export function validateInput(v: UrineRequestInput, today: string, extra?: { status_reason?: string | null; collected_date?: string | null }): FormErrors {
  const e: FormErrors = {};
  if (!v.patient_name?.trim() || v.patient_name.trim().length < 3) e.patient_name = 'Informe o nome completo do paciente.';
  if (v.patient_age !== null && (v.patient_age < 0 || v.patient_age > 130)) e.patient_age = 'Idade inválida.';
  if (!v.origin) e.origin = 'Selecione a origem.';
  if (!v.priority) e.priority = 'Selecione a prioridade.';
  for (const k of ['received_date', 'scheduled_date', 'material_deadline'] as const) {
    if (v[k] && !isValidISODate(v[k]!)) e[k] = 'Data inválida.';
  }
  if (v.received_date && v.received_date > today) e.received_date = 'A data de recebimento não pode estar no futuro.';
  if (v.scheduled_date && v.received_date && v.scheduled_date < v.received_date) e.scheduled_date = 'A data agendada é anterior ao recebimento.';
  if (v.scheduled_period === 'HORARIO' && !v.scheduled_time) e.scheduled_time = 'Informe o horário.';
  if (v.cep && !/^\d{5}-?\d{3}$/.test(v.cep.trim())) e.cep = 'CEP no formato 00000-000 (ou deixe em branco — não é obrigatório).';
  if (v.contact_phone && v.contact_phone.replace(/\D/g, '').length < 8) e.contact_phone = 'Telefone incompleto.';
  if (v.state && !/^[A-Za-z]{2}$/.test(v.state)) e.state = 'UF com 2 letras.';
  if (v.status === 'REALIZADA' && !extra?.collected_date) e.collected_date = 'Informe a data em que a coleta foi realizada.';
  if (extra?.collected_date && extra.collected_date > today) e.collected_date = 'A data da coleta não pode estar no futuro.';
  if ((v.status === 'CANCELADA' || v.status === 'NAO_REALIZADA') && (extra?.status_reason ?? '').trim().length < 3) e.status_reason = 'Informe o motivo.';
  return e;
}
