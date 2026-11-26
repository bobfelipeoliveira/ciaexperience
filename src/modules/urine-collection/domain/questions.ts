/**
 * Perguntas inteligentes: avaliam o registro ATUAL (já com as correções da técnica)
 * e pedem só o que falta. Quando a pessoa responde, a pergunta some.
 */
import type { UrineRequestInput } from './types.ts';
import { PERIODS } from './constants.ts';

export type QuestionField = keyof UrineRequestInput | 'address' | 'duplicate';
export interface SmartQuestion {
  id: string;
  field: QuestionField;
  text: string;
  severity: 'critical' | 'normal';
  options?: { label: string; value: string }[];
  /** Pergunta que pede texto livre (ex.: justificativa) */
  freeText?: boolean;
  /** Link para conferir (ex.: duplicidade) */
  link?: { label: string; to: string };
}

export interface DuplicateHit { id: string; patient_name: string; scheduled_date: string | null; status: string; }

function relDay(iso: string | null, today: string): string {
  if (!iso) return '';
  const diff = Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === 2) return 'depois de amanhã';
  return `em ${iso.split('-').reverse().join('/')}`;
}

export function buildQuestions(v: UrineRequestInput, today: string, duplicates: DuplicateHit[] = [], conflicts: string[] = []): SmartQuestion[] {
  const q: SmartQuestion[] = [];

  if (!v.patient_name?.trim()) {
    q.push({ id: 'name', field: 'patient_name', severity: 'critical', text: 'Não identifiquei o nome do paciente. Qual é o nome completo?', freeText: true });
  }
  for (const c of conflicts) {
    if (/nomes diferentes/.test(c) ) {
      q.push({ id: 'conflict-name', field: 'patient_name', severity: 'critical', text: c, freeText: true });
    }
    if (/material/i.test(c) && !v.material_available) {
      q.push({ id: 'conflict-material', field: 'material_available', severity: 'critical', text: c,
        options: [{ label: 'SIM', value: 'SIM' }, { label: 'NÃO', value: 'NAO' }, { label: 'NÃO CONFIRMADO', value: 'NAO_CONFIRMADO' }] });
    }
    if (/CVA e CVD/.test(c) && !v.collection_method) {
      q.push({ id: 'conflict-method', field: 'collection_method', severity: 'normal', text: c, options: [{ label: 'CVA', value: 'CVA' }, { label: 'CVD', value: 'CVD' }] });
    }
  }
  if (!v.collection_method && !q.some((x) => x.field === 'collection_method')) {
    q.push({ id: 'method', field: 'collection_method', severity: 'normal', text: 'Não consegui identificar se a coleta será por CVA ou CVD.', options: [{ label: 'CVA', value: 'CVA' }, { label: 'CVD', value: 'CVD' }] });
  }
  if (v.scheduled_date && !v.scheduled_period) {
    q.push({
      id: 'period', field: 'scheduled_period', severity: 'normal',
      text: `Você informou que a coleta será ${relDay(v.scheduled_date, today)}. Qual período?`,
      options: (Object.keys(PERIODS) as (keyof typeof PERIODS)[]).filter((k) => k !== 'HORARIO').map((k) => ({ label: PERIODS[k], value: k })),
    });
  }
  if (!v.scheduled_date) {
    q.push({ id: 'date', field: 'scheduled_date', severity: 'normal', text: 'Ainda não há data prevista para a coleta. Já foi combinada com a família?' });
  }
  if (!v.material_available && !q.some((x) => x.id === 'conflict-material')) {
    q.push({
      id: 'material', field: 'material_available', severity: 'normal',
      text: 'Foi confirmado se existe potinho disponível na residência?',
      options: [{ label: 'SIM', value: 'SIM' }, { label: 'NÃO', value: 'NAO' }, { label: 'NÃO CONFIRMADO', value: 'NAO_CONFIRMADO' }],
    });
  }
  if (v.material_available === 'NAO' && !v.material_responsible) {
    q.push({ id: 'mat-resp', field: 'material_responsible', severity: 'normal', text: 'Não há material na residência. Quem ficará responsável por providenciar e até quando?', freeText: true });
  }
  if (!v.priority) {
    q.push({
      id: 'priority', field: 'priority', severity: 'critical', text: 'Esta coleta é ELETIVA ou URGENTE?',
      options: [{ label: 'ELETIVA', value: 'ELETIVA' }, { label: 'URGENTE', value: 'URGENTE' }],
    });
  }
  if (!v.origin) {
    q.push({
      id: 'origin', field: 'origin', severity: 'normal', text: 'Qual a origem da solicitação?',
      options: [{ label: 'INTERCORRÊNCIA', value: 'INTERCORRENCIA' }, { label: 'TICKET ELETIVO', value: 'TICKET_ELETIVO' }, { label: 'DEMANDA EXTERNA', value: 'DEMANDA_EXTERNA' }],
    });
  }
  if (!v.address_street || !v.neighborhood || !v.city) {
    const faltam = [!v.address_street && 'logradouro', !v.neighborhood && 'bairro', !v.city && 'cidade'].filter(Boolean).join(', ');
    q.push({ id: 'address', field: 'address', severity: 'normal', text: `O endereço parece incompleto (falta: ${faltam}). Deseja complementar?` });
  }
  if (v.scheduled_date && !v.family_contact_name) {
    q.push({ id: 'family', field: 'family_contact_name', severity: 'normal', text: 'Qual familiar confirmou o agendamento?', freeText: true });
  }
  if (!v.contact_phone) {
    q.push({ id: 'phone', field: 'contact_phone', severity: 'normal', text: 'Qual o telefone de contato da família?', freeText: true });
  }
  for (const d of duplicates.slice(0, 3)) {
    q.push({
      id: `dup-${d.id}`, field: 'duplicate', severity: 'critical',
      text: `Identifiquei uma possível solicitação já cadastrada para este paciente${d.scheduled_date ? ` (agendada ${d.scheduled_date.split('-').reverse().join('/')})` : ''}. Deseja conferir?`,
      link: { label: 'Abrir solicitação existente', to: `/coletas/${d.id}` },
    });
  }
  return q;
}
