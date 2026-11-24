/** Recortes rápidos usados pelos cartões do painel (cada cartão abre a lista já filtrada). */
import type { UrineRequest } from './types.ts';
import { isActiveStatus } from './constants.ts';

export const PENDING_STATUSES = ['RECEBIDA', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_MATERIAL', 'PENDENTE_INFORMACAO'];

export const VIEWS: Record<string, { label: string; test: (r: UrineRequest, today: string, tomorrow: string) => boolean }> = {
  agendadas: { label: 'Coletas agendadas (em aberto)', test: (r) => !!r.scheduled_date && isActiveStatus(r.status) },
  hoje: { label: 'Coletas para hoje', test: (r, t) => r.scheduled_date === t && isActiveStatus(r.status) },
  amanha: { label: 'Coletas para amanhã', test: (r, _t, tm) => r.scheduled_date === tm && isActiveStatus(r.status) },
  realizadas: { label: 'Coletas realizadas', test: (r) => r.status === 'REALIZADA' },
  pendentes: { label: 'Coletas pendentes', test: (r) => PENDING_STATUSES.includes(r.status) },
  reagendadas: { label: 'Coletas reagendadas', test: (r) => r.status === 'REAGENDADA' || (r.reschedule_count ?? 0) > 0 },
  canceladas: { label: 'Coletas canceladas', test: (r) => r.status === 'CANCELADA' },
  emergenciais: { label: 'Solicitações emergenciais', test: (r) => r.priority === 'EMERGENCIAL' },
  sem_material: { label: 'Sem material na residência', test: (r) => r.material_available === 'NAO' },
  atrasadas: { label: 'Coletas atrasadas', test: (r, t) => !!r.scheduled_date && r.scheduled_date < t && isActiveStatus(r.status) },
};
